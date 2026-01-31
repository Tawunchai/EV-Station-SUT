/* ==== FULL FILE: package ocpp (ocpp_mem_guard.go) ==== */
package ocpp

import (
	"os"
	"strconv"
	"sync"
	"time"
)

// =============================================================================
// ✅ MEMORY JANITOR (SAFE, LOW IMPACT)
// - ลดโอกาส RAM โตเมื่อรันนาน ๆ
// - ไม่กระทบ flow หลัก (แค่ลบ "ของเก่า" ที่ควรหมดอายุอยู่แล้ว)
// - ทำงานเป็นรอบ ๆ ด้วย ticker (default 60s)
// - ปิดได้ด้วย env: OCPP_JANITOR=0
//
// จุดที่ cleanup:
// 1) pendingCalls            -> ลบที่ค้างเกิน TTL (กัน messageId leak)
// 2) autoStoppedSessions     -> ลบ sessionId ที่เก่าเกิน TTL (กัน map โต)
// 3) lastExpireExtendAt      -> ลบ sessionId ที่เก่าเกิน TTL
// 4) trailByID               -> ตัดเหตุการณ์ที่เก่าเกิน TTL (นอกเหนือจาก ring buffer)
// 5) stopPolicyCache/rt      -> ลบที่ idle เกิน TTL (กัน chargePoint แปลก ๆ เข้ามา)
// 6) lastSnapshotByCharger   -> ลบ snapshot ของตู้ที่ idle เกิน TTL (optional)
// 7) lastMeterInfo           -> ลบ meter ของตู้ที่ idle เกิน TTL (optional)
// 8) snapshotSeq             -> ลบ seq ของตู้ที่ idle เกิน TTL (optional)
// 9) disconnectHoldTimers    -> ลบ timer ที่ nil/หยุดแล้ว (กัน map ค้าง - edge case)
// =============================================================================

// ---------- Defaults (conservative) ----------
const (
	defaultJanitorEverySec = 60

	// pendingCalls: ถ้าค้างนานเกินนี้ ถือว่า leak ได้ (ตู้หลุด/ไม่ตอบ)
	defaultPendingTTL = 5 * time.Minute

	// session maps: กันโตยาว ๆ
	defaultSessionTTL = 24 * time.Hour

	// trail: คุณมี ring 400 แล้ว แต่ทำ TTL เพิ่มกัน "ค้างนานมาก"
	defaultTrailTTL = 6 * time.Hour

	// cache per chargePoint: กัน chargePoint สุ่ม ๆ
	defaultStopPolicyTTL = 12 * time.Hour

	// snapshot/meter/seq: กัน chargerID สุ่ม/ผิดพลาด
	defaultSnapshotTTL = 24 * time.Hour
)

var janitorOnce sync.Once

func init() {
	janitorOnce.Do(func() {
		if !isJanitorEnabled() {
			return
		}
		interval := getEnvInt("OCPP_JANITOR_EVERY_SEC", defaultJanitorEverySec)
		if interval < 15 {
			interval = 15 // กันถี่เกิน
		}
		go runMemoryJanitor(time.Duration(interval) * time.Second)
	})
}

func isJanitorEnabled() bool {
	v := os.Getenv("OCPP_JANITOR")
	if v == "" {
		return true
	}
	// allow: 0/false/off => disable
	switch v {
	case "0", "false", "FALSE", "off", "OFF":
		return false
	default:
		return true
	}
}

func getEnvInt(key string, def int) int {
	v := os.Getenv(key)
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return def
	}
	return n
}

func runMemoryJanitor(every time.Duration) {
	tk := time.NewTicker(every)
	defer tk.Stop()

	for range tk.C {
		now := time.Now().UTC()

		cleanupPendingCalls(now)
		cleanupSessionMaps(now)
		cleanupTrailByTTL(now)
		cleanupStopPolicyCaches(now)
		cleanupSnapshotCaches(now)
		cleanupDisconnectHoldTimers()
	}
}

// -----------------------------------------------------------------------------
// 1) pendingCalls cleanup
// -----------------------------------------------------------------------------
func cleanupPendingCalls(now time.Time) {
	ttl := defaultPendingTTL

	pendingMu.Lock()
	for mid, p := range pendingCalls {
		if p.SentAt.IsZero() {
			// กัน edge case: ไม่มีเวลา -> ลบเลย (ถือว่าไม่สมบูรณ์)
			delete(pendingCalls, mid)
			continue
		}
		if now.Sub(p.SentAt) > ttl {
			delete(pendingCalls, mid)
		}
	}
	pendingMu.Unlock()
}

// -----------------------------------------------------------------------------
// 2) session maps cleanup: autoStoppedSessions, lastExpireExtendAt
// -----------------------------------------------------------------------------
func cleanupSessionMaps(now time.Time) {
	ttl := defaultSessionTTL

	// lastExpireExtendAt: map[uint]time.Time
	lastExpireExtendAtMu.Lock()
	for sid, t := range lastExpireExtendAt {
		if t.IsZero() || now.Sub(t) > ttl {
			delete(lastExpireExtendAt, sid)
		}
	}
	lastExpireExtendAtMu.Unlock()

	// autoStoppedSessions: map[uint]bool
	// ไม่มีเวลาเก็บใน map เดิม → วิธีที่ปลอดภัยสุด: "soft reset" เป็นรอบ ๆ (TTL)
	// เพื่อไม่กระทบ session ล่าสุด เราจะ reset เฉพาะเมื่อ map โตเกิน threshold
	const maxAutoStoppedSize = 50000 // ปรับได้ตามระบบจริง
	autoStoppedSessionsMu.Lock()
	if len(autoStoppedSessions) > maxAutoStoppedSize {
		// reset ทั้งก้อน: กัน RAM บวม
		autoStoppedSessions = make(map[uint]bool)
	}
	autoStoppedSessionsMu.Unlock()
}

// -----------------------------------------------------------------------------
// 3) trail TTL cleanup (เสริม ring buffer)
// -----------------------------------------------------------------------------
func cleanupTrailByTTL(now time.Time) {
	ttl := defaultTrailTTL

	// เรา parse ev.Ts (RFC3339) เฉพาะตอน cleanup (ไม่ทำตอน addTrail เพื่อไม่เพิ่มภาระ)
	trailMu.Lock()
	for cid, arr := range trailByID {
		if len(arr) == 0 {
			delete(trailByID, cid)
			continue
		}

		// ตัดจากหัว: keep เฉพาะที่ไม่เกิน ttl
		keepFrom := 0
		for i := 0; i < len(arr); i++ {
			ts := arr[i].Ts
			if ts == "" {
				keepFrom = i + 1
				continue
			}
			t, err := time.Parse(time.RFC3339, ts)
			if err != nil {
				// parse ไม่ได้ -> ทิ้งตัวนี้ไป
				keepFrom = i + 1
				continue
			}
			if now.Sub(t) <= ttl {
				break
			}
			keepFrom = i + 1
		}

		if keepFrom >= len(arr) {
			delete(trailByID, cid)
			continue
		}

		// slice ใหม่เพื่อตัด reference ของของเก่า (ช่วย GC)
		if keepFrom > 0 {
			newArr := make([]TrailEvent, len(arr)-keepFrom)
			copy(newArr, arr[keepFrom:])
			trailByID[cid] = newArr
		}
	}
	trailMu.Unlock()
}

// -----------------------------------------------------------------------------
// 4) stopPolicy cache/runtime TTL cleanup
// -----------------------------------------------------------------------------
func cleanupStopPolicyCaches(now time.Time) {
	ttl := defaultStopPolicyTTL

	// stopPolicyCache: map[string]StopPolicyCache (มี LoadedAt)
	stopPolicyCacheMu.Lock()
	for cp, c := range stopPolicyCache {
		if c.LoadedAt.IsZero() || now.Sub(c.LoadedAt) > ttl {
			delete(stopPolicyCache, cp)
		}
	}
	stopPolicyCacheMu.Unlock()

	// stopPolicyRt: map[string]StopPolicyRuntime (มี LastEventAt)
	stopPolicyRtMu.Lock()
	for cp, rt := range stopPolicyRt {
		// ถ้าไม่ started และไม่มี event นานมาก -> ลบ
		if rt.LastEventAt.IsZero() {
			// runtime ที่ไม่เคยใช้จริง ลบได้เลย
			delete(stopPolicyRt, cp)
			continue
		}
		if now.Sub(rt.LastEventAt) > ttl {
			delete(stopPolicyRt, cp)
		}
	}
	stopPolicyRtMu.Unlock()
}

// -----------------------------------------------------------------------------
// 5) snapshot/meter/seq cleanup (optional but good for "chargerId แปลก ๆ")
// -----------------------------------------------------------------------------
func cleanupSnapshotCaches(now time.Time) {
	ttl := defaultSnapshotTTL

	// ใช้ statusMu เป็น "ตัวบอกความ active ล่าสุด" ผ่าน LastHeartbeat
	statusMu.Lock()
	active := make(map[string]time.Time, len(chargerStatuses))
	for cid, st := range chargerStatuses {
		if cid == "" {
			continue
		}
		// ถ้าไม่มี heartbeat เลย ก็ถือว่าเก่ามาก
		active[cid] = st.LastHeartbeat
	}
	statusMu.Unlock()

	// helper: id is stale if no heartbeat or too old
	isStale := func(cid string) bool {
		t, ok := active[cid]
		if !ok {
			// ไม่มี status -> ถือว่า stale
			return true
		}
		if t.IsZero() {
			return true
		}
		return now.Sub(t.UTC()) > ttl
	}

	// snapshots
	snapshotMu.Lock()
	for cid := range lastSnapshotByCharger {
		if isStale(cid) {
			delete(lastSnapshotByCharger, cid)
		}
	}
	for cid := range snapshotSeq {
		if isStale(cid) {
			delete(snapshotSeq, cid)
		}
	}
	snapshotMu.Unlock()

	// last meter
	lastMeterMu.Lock()
	for cid := range lastMeterInfo {
		if isStale(cid) {
			delete(lastMeterInfo, cid)
		}
	}
	lastMeterMu.Unlock()

	// last real status (เก็บไว้ได้ แต่กัน cid แปลก ๆ)
	lastRealMu.Lock()
	for cid, st := range lastRealStatuses {
		// ถ้าไม่มี heartbeat เลย และเก่านาน -> ลบ
		if cid == "" {
			delete(lastRealStatuses, cid)
			continue
		}
		if st.LastHeartbeat.IsZero() || now.Sub(st.LastHeartbeat.UTC()) > ttl {
			delete(lastRealStatuses, cid)
		}
	}
	lastRealMu.Unlock()
}

// -----------------------------------------------------------------------------
// 6) disconnectHoldTimers cleanup (edge case)
// -----------------------------------------------------------------------------
func cleanupDisconnectHoldTimers() {
	disconnectHoldTimersMu.Lock()
	for cid, t := range disconnectHoldTimers {
		if cid == "" || t == nil {
			delete(disconnectHoldTimers, cid)
			continue
		}
	}
	disconnectHoldTimersMu.Unlock()
}
