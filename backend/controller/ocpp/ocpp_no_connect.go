package ocpp

import (
	"sync"
	"time"
)

// ============================================================================
// ✅ OCPP NO CONNECT (Queue RemoteStart when charger offline)
// - ถ้า user กด Start ตอนตู้หลุด connect -> ไม่ error
// - ระบบจะ "queue" คำสั่ง start ไว้
// - พอตู้ reconnect -> ยิง RemoteStart ให้อัตโนมัติ
// ============================================================================

type PendingRemoteStart struct {
	ChargerID   string
	ConnectorID int
	IdTag       string
	QueuedAt    time.Time
}

const pendingStartTTL = 10 * time.Minute

var (
	pendingStartMu sync.Mutex
	pendingStart   = make(map[string]PendingRemoteStart) // chargerID -> pending start
)

// ✅ ใช้เช็คว่าตู้ connected ไหม (ดูจาก map chargers ของ instance นี้)
func IsChargerConnected(chargerID string) bool {
	if chargerID == "" {
		return false
	}

	chargersMu.Lock()
	conn, ok := chargers[chargerID]
	chargersMu.Unlock()

	return ok && conn != nil
}

// ✅ queue start ไว้ตอน offline
func QueueRemoteStartWhenOffline(chargerID string, connectorID int, idTag string) {
	if chargerID == "" {
		return
	}
	if connectorID <= 0 {
		connectorID = 1
	}
	if idTag == "" {
		idTag = "EV-SIM-001"
	}

	pendingStartMu.Lock()
	pendingStart[chargerID] = PendingRemoteStart{
		ChargerID:   chargerID,
		ConnectorID: connectorID,
		IdTag:       idTag,
		QueuedAt:    time.Now().UTC(),
	}
	pendingStartMu.Unlock()

	// ✅ แจ้ง frontend/log
	logf("🟧 [OFFLINE-QUEUE] charger=%s offline -> queued RemoteStart (connector=%d idTag=%s) ttl=%d sec\n",
		chargerID, connectorID, idTag, int(pendingStartTTL.Seconds()),
	)

	broadcastLogTextToFrontendRoom(chargerID,
		"[OFFLINE-QUEUE] charger offline -> queued RemoteStart, will auto-start on reconnect\n",
	)

	// ✅ snapshot (optional)
	buildAndBroadcastSnapshot(chargerID, "remote_start_queued_offline")
}

// ✅ ดึง pending start ถ้ายังไม่หมดอายุ (consume)
func consumePendingRemoteStartIfValid(chargerID string) (PendingRemoteStart, bool) {
	if chargerID == "" {
		return PendingRemoteStart{}, false
	}

	pendingStartMu.Lock()
	defer pendingStartMu.Unlock()

	p, ok := pendingStart[chargerID]
	if !ok {
		return PendingRemoteStart{}, false
	}

	// TTL หมดอายุ -> ลบทิ้ง
	if time.Since(p.QueuedAt) > pendingStartTTL {
		delete(pendingStart, chargerID)

		logf("🟫 [OFFLINE-QUEUE] charger=%s pending start expired -> dropped\n", chargerID)
		broadcastLogTextToFrontendRoom(chargerID,
			"[OFFLINE-QUEUE] pending RemoteStart expired -> dropped\n",
		)

		return PendingRemoteStart{}, false
	}

	// consume
	delete(pendingStart, chargerID)
	return p, true
}

// ✅ เรียกตอนตู้ reconnect สำเร็จ -> ถ้ามี pending start -> ยิงให้
func ApplyQueuedRemoteStartOnReconnect(chargerID string) {
	if chargerID == "" {
		return
	}

	// ต้อง connected ก่อน
	if !IsChargerConnected(chargerID) {
		return
	}

	p, ok := consumePendingRemoteStartIfValid(chargerID)
	if !ok {
		return
	}

	logf("🟩 [OFFLINE-QUEUE] charger=%s reconnected -> sending queued RemoteStart now (connector=%d idTag=%s)\n",
		chargerID, p.ConnectorID, p.IdTag,
	)

	broadcastLogTextToFrontendRoom(chargerID,
		"[OFFLINE-QUEUE] charger reconnected -> sending queued RemoteStart now\n",
	)

	// ✅ ยิง start จริง (ผ่าน flow เดิม)
	if err := SendRemoteStartTransaction(chargerID, p.ConnectorID, p.IdTag); err != nil {
		logf("❌ [OFFLINE-QUEUE] charger=%s failed to send queued RemoteStart: %v\n", chargerID, err)
		broadcastLogTextToFrontendRoom(chargerID,
			"[OFFLINE-QUEUE] failed to send queued RemoteStart\n",
		)
	} else {
		buildAndBroadcastSnapshot(chargerID, "remote_start_sent_from_offline_queue")
	}
}

// ✅ (optional) clear ถ้าต้องการล้างเอง
func ClearQueuedRemoteStart(chargerID string) {
	if chargerID == "" {
		return
	}
	pendingStartMu.Lock()
	delete(pendingStart, chargerID)
	pendingStartMu.Unlock()
}
