/* ==== FULL FILE: package ocpp (ocpp.go) ==== */
package ocpp

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"github.com/Tawunchai/work-project/config"
	"github.com/Tawunchai/work-project/entity"
)

// ============================================================================
// ✅ MULTI-INSTANCE COMMAND BUS (Redis Pub/Sub)
// - API ยิงเข้า instance ไหนก็ได้
// - คำสั่งจะถูก publish ไปที่ Redis channel
// - ทุก instance subscribe
// - "เฉพาะ instance ที่ถือ WS ของ chargerID" เท่านั้นที่จะส่งคำสั่งจริง
// ============================================================================

// ✅ Channel สำหรับคำสั่ง OCPP
const ocppCmdChannel = "ocpp:commands:v1"

// ✅ คำสั่งที่วิ่งบน bus
type OcppCommand struct {
	Type        string `json:"type"` // "remote_start" | "remote_stop"
	ChargerID   string `json:"chargerId"`
	ConnectorID int    `json:"connectorId,omitempty"`
	IdTag       string `json:"idTag,omitempty"`
	TxID        int    `json:"txId,omitempty"`

	// meta
	TraceID   string `json:"traceId,omitempty"`
	FromNode  string `json:"fromNode,omitempty"`
	Timestamp string `json:"timestamp,omitempty"`
}

// ✅ node id ของ instance นี้ (ช่วย debug)
var nodeID = func() string {
	if v := strings.TrimSpace(os.Getenv("OCPP_NODE_ID")); v != "" {
		return v
	}
	// fallback: timestamp-based
	return fmt.Sprintf("node-%d", time.Now().UnixNano())
}()

var (
	redisOnce sync.Once
	redisCli  *redis.Client
)

func getRedisClient() *redis.Client {
	redisOnce.Do(func() {
		addr := strings.TrimSpace(os.Getenv("REDIS_ADDR"))
		pass := strings.TrimSpace(os.Getenv("REDIS_PASSWORD"))
		dbStr := strings.TrimSpace(os.Getenv("REDIS_DB"))

		if addr == "" {
			// ✅ default สำหรับ local/dev
			addr = "127.0.0.1:6379"
		}

		dbNum := 0
		if dbStr != "" {
			if n, err := strconv.Atoi(dbStr); err == nil {
				dbNum = n
			}
		}

		redisCli = redis.NewClient(&redis.Options{
			Addr:     addr,
			Password: pass,
			DB:       dbNum,
		})
	})
	return redisCli
}

// ✅ publish command ไปที่ Redis
func publishOcppCommand(cmd OcppCommand) error {
	cli := getRedisClient()
	if cli == nil {
		return fmt.Errorf("redis client is nil")
	}
	cmd.FromNode = nodeID
	if cmd.Timestamp == "" {
		cmd.Timestamp = nowOcppTime()
	}

	b, err := json.Marshal(cmd)
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	return cli.Publish(ctx, ocppCmdChannel, string(b)).Err()
}

// ✅ START SUBSCRIBER (ต้องเรียก 1 ครั้งตอน boot server)
// ตัวอย่างใน main.go: go ocpp.StartOcppCommandBus()
func StartOcppCommandBus() {
	go func() {
		cli := getRedisClient()
		if cli == nil {
			logln("❌ Redis client is nil -> cannot start command bus")
			return
		}

		ctx := context.Background()
		sub := cli.Subscribe(ctx, ocppCmdChannel)
		defer sub.Close()

		logf("✅ OCPP CommandBus started (node=%s channel=%s)\n", nodeID, ocppCmdChannel)

		ch := sub.Channel()

		for msg := range ch {
			if msg == nil {
				continue
			}

			var cmd OcppCommand
			if err := json.Unmarshal([]byte(msg.Payload), &cmd); err != nil {
				logln("❌ CommandBus json parse error:", err)
				continue
			}

			// ✅ ignore ถ้าคำสั่งมาจาก node ตัวเอง (กัน loop/duplicate log)
			// (จริงๆ จะปล่อยก็ได้ เพราะเราทำ local-first อยู่แล้ว)
			// แต่ปล่อยไว้ยัง OK เพราะเราจะส่งจริงแค่ instance ที่ถือ WS
			handleOcppCommandFromBus(cmd)
		}
	}()
}

// ✅ instance นี้จะส่งคำสั่งจริง "เฉพาะถ้ามี WS ของ chargerID อยู่"
func handleOcppCommandFromBus(cmd OcppCommand) {
	chargerID := strings.TrimSpace(cmd.ChargerID)
	if chargerID == "" {
		return
	}

	// ✅ เช็คว่ามี WS ไหม (local instance only)
	chargersMu.Lock()
	conn, ok := chargers[chargerID]
	chargersMu.Unlock()

	if !ok || conn == nil {
		// ไม่ใช่ instance ที่ถือ WS -> ignore
		return
	}

	// ✅ ส่งคำสั่งจริงตาม type
	switch cmd.Type {
	case "remote_start":
		connectorID := cmd.ConnectorID
		if connectorID <= 0 {
			connectorID = 1
		}
		idTag := cmd.IdTag
		if idTag == "" {
			idTag = "EV-SIM-001"
		}

		// ✅ ส่งจริงบน WS
		_ = sendRemoteStartFrameLocal(chargerID, connectorID, idTag)

	case "remote_stop":
		txID := cmd.TxID
		if txID <= 0 {
			// fallback จาก memory
			if t, ok2 := getTransactionID(chargerID); ok2 {
				txID = t
			}
		}
		if txID > 0 {
			_ = sendRemoteStopFrameLocal(chargerID, txID)
		}
	default:
	}
}

// ============================================================================
// ✅ LOG SWITCH (open/close) - ไม่กระทบ logic ระบบ
// ============================================================================
// 1 = open, 0 = close
var logEnabled uint32 = 1

func isLogEnabled() bool { return atomic.LoadUint32(&logEnabled) == 1 }

func setLogEnabled(v bool) {
	if v {
		atomic.StoreUint32(&logEnabled, 1)
	} else {
		atomic.StoreUint32(&logEnabled, 0)
	}
}

// ============================================================================
// ✅ NEW: VERBOSE LOG (เปิดเฉพาะตอน debug) — default ปิด
// - สำคัญ: โหมดปกติจะ print log เฉพาะ “จำเป็น” (ตามที่คุณต้องการ)
// ============================================================================

var logVerbose uint32 = 0 // 1 = verbose on, 0 = verbose off

func isLogVerbose() bool { return atomic.LoadUint32(&logVerbose) == 1 }

func setLogVerbose(v bool) {
	if v {
		atomic.StoreUint32(&logVerbose, 1)
	} else {
		atomic.StoreUint32(&logVerbose, 0)
	}
}

// ใช้แทน fmt.Println/Printf ทั้งหมด เพื่อ toggle ได้
// ✅ logln/logf = “จำเป็น/หลัก” (print เฉพาะที่ต้องการให้เห็นบน server)
func logln(args ...interface{}) {
	if !isLogEnabled() {
		return
	}
	fmt.Println(args...)
}

func logf(format string, args ...interface{}) {
	if !isLogEnabled() {
		return
	}
	fmt.Printf(format, args...)
}

// ✅ vlogln/vlogf = “verbose” (จะไม่ print ถ้าไม่ได้เปิด verbose)
func vlogln(args ...interface{}) {
	if !isLogEnabled() || !isLogVerbose() {
		return
	}
	fmt.Println(args...)
}

func vlogf(format string, args ...interface{}) {
	if !isLogEnabled() || !isLogVerbose() {
		return
	}
	fmt.Printf(format, args...)
}

// ใช้แทน broadcastTextToFrontendRoom สำหรับ “ข้อความ log”
func broadcastLogTextToFrontendRoom(roomID, s string) {
	if !isLogEnabled() {
		return
	}
	broadcastToFrontendRoom(roomID, []byte(s))
}

// ============================================================================
// 🔧 WebSocket Upgrader (แยก Frontend vs OCPP Charger)
// ============================================================================

// ✅ สำหรับ OCPP Charger เท่านั้น (ต้องมี subprotocol ocpp1.6)
var ocppUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
	Subprotocols: []string{"ocpp1.6"},
}

// ✅ สำหรับ Frontend ดู log (Browser จะไม่ส่ง subprotocol ocpp1.6)
var frontendUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

// ============================================================================
// 🌐 Frontend WebSocket Clients (ดู log OCPP แบบ real-time แยกตามตู้)
// ============================================================================

var (
	frontendClients   = make(map[*websocket.Conn]string) // conn -> roomID
	frontendClientsMu sync.Mutex
)

// ============================================================================
// 🔌 Charger WebSocket Connections
// ============================================================================

var (
	chargers   = make(map[string]*websocket.Conn)
	chargersMu sync.Mutex
)

// ============================================================================
// 🔢 Transaction ID Storage (ใช้สำหรับ RemoteStop)
// ============================================================================

var (
	transactionIDs    = make(map[string]int) // active session ต่อ charger
	nextTransactionID = 1                    // auto-increment
	txMu              sync.Mutex
)

// ============================================================================
// ⭐ โครงสร้างเก็บสถานะล่าสุดของแต่ละตู้
// ============================================================================

type ChargerStatus struct {
	ChargerID     string    `json:"chargerId"`
	ConnectorID   int       `json:"connectorId"`
	Status        string    `json:"status"`
	ErrorCode     string    `json:"errorCode"`
	Connected     bool      `json:"connected"`
	LastHeartbeat time.Time `json:"lastHeartbeat"`
}

var (
	chargerStatuses = make(map[string]ChargerStatus)
	statusMu        sync.Mutex
)

// ============================================================================
// ✅ NEW: เก็บ “สถานะจริงล่าสุดก่อนหลุด” เพื่อ restore ตอน reconnect
// ============================================================================

var (
	lastRealStatuses = make(map[string]ChargerStatus) // chargerID -> last real status
	lastRealMu       sync.Mutex
)

func saveLastRealStatus(chargerID string, st ChargerStatus) {
	if chargerID == "" {
		return
	}
	if st.Status == "Interruption" {
		return
	}
	lastRealMu.Lock()
	lastRealStatuses[chargerID] = st
	lastRealMu.Unlock()
}

func getLastRealStatus(chargerID string) (ChargerStatus, bool) {
	lastRealMu.Lock()
	defer lastRealMu.Unlock()
	st, ok := lastRealStatuses[chargerID]
	return st, ok
}

// ============================================================================
// ✅ NEW: SNAPSHOT (กัน state ปนกันข้าม payment/session)
// - ผูกกับ chargerId + connectorId + transactionId (ถ้ามี)
// - แนบ payment/session เป็น context (optional)
// ============================================================================

type MeterSnapshot struct {
	EnergyWh      float64 `json:"energy_wh"`
	PowerKW       float64 `json:"power_kw"` // ✅ NEW: ใช้ประกอบ StopPolicy (Power.Active.Import)
	TransactionID int     `json:"transaction_id"`
	Timestamp     string  `json:"timestamp"`
}

type SessionSnapshot struct {
	ID              uint    `json:"id"`
	Status          bool    `json:"status"`
	PaymentID       uint    `json:"payment_id"`
	StartEnergyWh   float64 `json:"start_energy_wh"`
	StartTime       string  `json:"start_time"`
	EndTime         string  `json:"end_time"`
	ExpiresAt       string  `json:"expires_at"`
	SessionEnergyWh float64 `json:"session_energy_wh"`
}

type PaymentSnapshot struct {
	ID              uint    `json:"id"`
	Amount          float64 `json:"amount"`
	ReferenceNumber string  `json:"referenceNumber"`
	EVCabinetID     uint    `json:"ev_cabinet_id"`
}

type CabinetSnapshot struct {
	ID          uint   `json:"id"`
	ChargePoint string `json:"chargePoint"`
	Name        string `json:"name"`
}

type ChargerSnapshot struct {
	Type        string `json:"type"`
	ChargerID   string `json:"chargerId"`
	ConnectorID int    `json:"connectorId"`
	Seq         uint64 `json:"seq"`
	Timestamp   string `json:"timestamp"`
	Reason      string `json:"reason"`

	// สถานะตู้
	Status        string `json:"status"`
	ErrorCode     string `json:"errorCode"`
	Connected     bool   `json:"connected"`
	LastHeartbeat string `json:"lastHeartbeat"`

	// tx / meter
	ActiveTransactionID int           `json:"active_transaction_id"`
	Meter               MeterSnapshot `json:"meter"`

	// context ฝั่ง DB
	ChargingSession *SessionSnapshot `json:"charging_session,omitempty"`
	Payment         *PaymentSnapshot `json:"payment,omitempty"`
	EVCabinet       *CabinetSnapshot `json:"ev_cabinet,omitempty"`
}

var (
	lastMeterMu   sync.Mutex
	lastMeterInfo = make(map[string]MeterSnapshot) // chargerID -> last meter snapshot

	snapshotMu            sync.Mutex
	lastSnapshotByCharger = make(map[string]ChargerSnapshot) // chargerID -> snapshot ล่าสุด
	snapshotSeq           = make(map[string]uint64)          // chargerID -> seq เพิ่มขึ้นเรื่อยๆ
)

func nextSnapshotSeq(chargerID string) uint64 {
	snapshotMu.Lock()
	defer snapshotMu.Unlock()
	snapshotSeq[chargerID]++
	return snapshotSeq[chargerID]
}

func setLastMeter(chargerID string, m MeterSnapshot) {
	if chargerID == "" {
		return
	}
	lastMeterMu.Lock()
	lastMeterInfo[chargerID] = m
	lastMeterMu.Unlock()
}

func getLastMeter(chargerID string) (MeterSnapshot, bool) {
	lastMeterMu.Lock()
	defer lastMeterMu.Unlock()
	m, ok := lastMeterInfo[chargerID]
	return m, ok
}

func cacheSnapshot(chargerID string, snap ChargerSnapshot) {
	if chargerID == "" {
		return
	}
	snapshotMu.Lock()
	lastSnapshotByCharger[chargerID] = snap
	snapshotMu.Unlock()
}

func getCachedSnapshot(chargerID string) (ChargerSnapshot, bool) {
	snapshotMu.Lock()
	defer snapshotMu.Unlock()
	s, ok := lastSnapshotByCharger[chargerID]
	return s, ok
}

func broadcastSnapshotToRoom(chargerID string, snap ChargerSnapshot) {
	b, err := json.Marshal(snap)
	if err != nil {
		logln("❌ marshal snapshot failed:", err)
		return
	}
	cacheSnapshot(chargerID, snap)
	broadcastToFrontendRoom(chargerID, b)
}

func sendSnapshotToConn(conn *websocket.Conn, snap ChargerSnapshot) {
	if conn == nil {
		return
	}
	b, err := json.Marshal(snap)
	if err != nil {
		return
	}
	_ = conn.WriteMessage(websocket.TextMessage, b)
}

func buildSnapshot(db *gorm.DB, chargerID string, reason string) ChargerSnapshot {
	seq := nextSnapshotSeq(chargerID)

	// 1) status (memory)
	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	statusMu.Unlock()
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}

	// 2) tx (memory)
	txID, _ := getTransactionID(chargerID)

	// 3) meter (memory)
	meter, hasMeter := getLastMeter(chargerID)
	if !hasMeter {
		meter = MeterSnapshot{EnergyWh: 0, PowerKW: 0, TransactionID: 0, Timestamp: ""}
	}

	// ปรับ meter.tx ให้สอดคล้องกับ tx ล่าสุดถ้ามี
	if txID > 0 {
		meter.TransactionID = txID
	}

	snap := ChargerSnapshot{
		Type:        "charger_snapshot",
		ChargerID:   chargerID,
		ConnectorID: st.ConnectorID,
		Seq:         seq,
		Timestamp:   nowOcppTime(),
		Reason:      reason,

		Status:        st.Status,
		ErrorCode:     st.ErrorCode,
		Connected:     st.Connected,
		LastHeartbeat: st.LastHeartbeat.UTC().Format(time.RFC3339),

		ActiveTransactionID: txID,
		Meter:               meter,
	}

	// 4) DB context (optional)
	if db == nil {
		db = config.DB()
	}

	// หา active session ที่ “ตรงกับ chargePoint” จริงๆ
	sess, okSess, err := findActiveSessionByChargePoint(db, chargerID)
	if err == nil && okSess {
		ss := &SessionSnapshot{
			ID:              sess.ID,
			Status:          sess.Status,
			PaymentID:       sess.PaymentID,
			StartEnergyWh:   sess.StartEnergy,
			SessionEnergyWh: 0,
			StartTime:       "",
			EndTime:         "",
			ExpiresAt:       "",
		}
		if !sess.StartTime.IsZero() {
			ss.StartTime = sess.StartTime.Format(time.RFC3339)
		}
		if !sess.EndTime.IsZero() {
			ss.EndTime = sess.EndTime.Format(time.RFC3339)
		}
		if !sess.ExpiresAt.IsZero() {
			ss.ExpiresAt = sess.ExpiresAt.Format(time.RFC3339)
		}
		// sessionEnergyWh = meterNow - startEnergy
		if meter.EnergyWh > 0 && sess.StartEnergy > 0 {
			delta := meter.EnergyWh - sess.StartEnergy
			if delta < 0 {
				delta = 0
			}
			ss.SessionEnergyWh = math.Round(delta*100) / 100
		}
		snap.ChargingSession = ss

		// โหลด Payment + Cabinet เพื่อแนบ context
		if sess.PaymentID > 0 {
			var pay entity.Payment
			if err := db.Preload("EVChargingPayments").First(&pay, sess.PaymentID).Error; err == nil {
				ps := &PaymentSnapshot{
					ID:              pay.ID,
					Amount:          pay.Amount,
					ReferenceNumber: pay.ReferenceNumber,
				}
				if pay.EVCabinetID != nil {
					ps.EVCabinetID = *pay.EVCabinetID
					snap.Payment = ps

					// cabinet
					var cab entity.EVCabinet
					if err := db.First(&cab, *pay.EVCabinetID).Error; err == nil {
						cs := &CabinetSnapshot{
							ID:          cab.ID,
							ChargePoint: cab.ChargePoint,
							Name:        cab.Name,
						}
						snap.EVCabinet = cs

						// ถ้า connector ยังไม่รู้ ให้ fallback จาก status เดิม
						if snap.ConnectorID == 0 && st.ConnectorID != 0 {
							snap.ConnectorID = st.ConnectorID
						}
					}
				} else {
					snap.Payment = ps
				}
			}
		}
	}

	return snap
}

func buildAndBroadcastSnapshot(chargerID string, reason string) {
	snap := buildSnapshot(config.DB(), chargerID, reason)
	broadcastSnapshotToRoom(chargerID, snap)
}

// ============================================================================
// 🧾 Pending Calls (สำหรับจับคู่ CALLRESULT / CALLERROR จากตู้)
// ============================================================================

type PendingCall struct {
	ChargerID string
	Action    string
	SentAt    time.Time
}

var (
	pendingCalls = make(map[string]PendingCall) // messageId -> PendingCall
	pendingMu    sync.Mutex
)

// ============================================================================
// 🛑 Guard: กัน AutoStop ยิงซ้ำต่อ session
// ============================================================================

var (
	autoStoppedSessions   = make(map[uint]bool) // sessionID -> true
	autoStoppedSessionsMu sync.Mutex
)

func markAutoStopped(sessionID uint) bool {
	autoStoppedSessionsMu.Lock()
	defer autoStoppedSessionsMu.Unlock()

	if sessionID == 0 {
		return false
	}
	if autoStoppedSessions[sessionID] {
		return false
	}
	autoStoppedSessions[sessionID] = true
	return true
}

// ============================================================================
// ✅ NEW: HOLD DISCONNECT 10 นาที
// ============================================================================

const disconnectHoldDuration = 10 * time.Minute

var (
	disconnectHoldTimers   = make(map[string]*time.Timer) // chargerID -> timer
	disconnectHoldTimersMu sync.Mutex
)

func cancelDisconnectHold(chargerID string) {
	disconnectHoldTimersMu.Lock()
	t, ok := disconnectHoldTimers[chargerID]
	if ok && t != nil {
		stopped := t.Stop()
		if !stopped {
			select {
			case <-t.C:
			default:
			}
		}
		delete(disconnectHoldTimers, chargerID)
	}
	disconnectHoldTimersMu.Unlock()
}

func scheduleDisconnectHold(chargerID string) {
	if chargerID == "" {
		return
	}

	cancelDisconnectHold(chargerID)

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}
	saveLastRealStatus(chargerID, st)

	st.Connected = false
	st.Status = "Interruption"
	st.ErrorCode = "Interruption"
	st.LastHeartbeat = time.Now().UTC()
	chargerStatuses[chargerID] = st
	statusMu.Unlock()

	dataMsg := map[string]interface{}{
		"type":      "charger_connection_hold",
		"chargerId": chargerID,
		"connected": false,
		"hold_sec":  int(disconnectHoldDuration.Seconds()),
		"status":    "Interruption",
		"errorCode": "Interruption",
		"timestamp": nowOcppTime(),
	}

	statusMsg := map[string]interface{}{
		"type":      "charger_status_update",
		"chargerId": chargerID,
		"status":    "Interruption",
		"errorCode": "Interruption",
		"connected": false,
		"timestamp": nowOcppTime(),
	}
	if b2, err := json.Marshal(statusMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b2)
	}
	if b, err := json.Marshal(dataMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b)
	}

	// ✅ SNAPSHOT
	buildAndBroadcastSnapshot(chargerID, "disconnect_hold")

	t := time.NewTimer(disconnectHoldDuration)

	disconnectHoldTimersMu.Lock()
	disconnectHoldTimers[chargerID] = t
	disconnectHoldTimersMu.Unlock()

	go func(id string, timer *time.Timer) {
		<-timer.C

		disconnectHoldTimersMu.Lock()
		if cur, ok := disconnectHoldTimers[id]; ok && cur == timer {
			delete(disconnectHoldTimers, id)
		}
		disconnectHoldTimersMu.Unlock()

		chargersMu.Lock()
		_, connected := chargers[id]
		chargersMu.Unlock()
		if connected {
			return
		}

		handleDisconnectAsInterruption(id)
	}(chargerID, t)

	// ✅ log สำคัญ
	logf("[HOLD] charger=%s disconnected -> send status=Interruption + hold %d minutes; if reconnect within hold, session will NOT be closed and status will be restored\n",
		chargerID, int(disconnectHoldDuration.Minutes()),
	)
}

// ============================================================================
// 🧮 Helper: สร้าง transaction id ไม่ซ้ำ
// ============================================================================

func generateTransactionID() int {
	txMu.Lock()
	defer txMu.Unlock()

	id := nextTransactionID
	nextTransactionID++
	return id
}

func saveTransactionID(chargerID string, tx int) {
	txMu.Lock()
	transactionIDs[chargerID] = tx
	txMu.Unlock()
}

func getTransactionID(chargerID string) (int, bool) {
	txMu.Lock()
	defer txMu.Unlock()
	tx, ok := transactionIDs[chargerID]
	return tx, ok
}

func clearTransactionID(chargerID string) {
	txMu.Lock()
	delete(transactionIDs, chargerID)
	txMu.Unlock()
}

// ============================================================================
// 🧰 Helper: เวลาแบบ RFC3339 UTC (ตามสเปก OCPP)
// ============================================================================

func nowOcppTime() string {
	return time.Now().UTC().Format(time.RFC3339)
}

// ============================================================================
// 📡 Broadcast log / msg ไป frontend (room-based)
// ============================================================================

func broadcastToFrontendRoom(roomID string, msg []byte) {
	frontendClientsMu.Lock()
	defer frontendClientsMu.Unlock()

	for conn, r := range frontendClients {
		if roomID == "*" || r == "*" || r == roomID {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				conn.Close()
				delete(frontendClients, conn)
			}
		}
	}
}

var _ = broadcastTextToFrontendRoom

func broadcastTextToFrontendRoom(roomID, s string) {
	broadcastToFrontendRoom(roomID, []byte(s))
}

// ============================================================================
// ✅ NEW: StopPolicy Cache + Runtime (Power.Active.Import)
// ============================================================================

type StopPolicyCache struct {
	CabinetID   uint
	ChargePoint string
	StopPolicy  float64
	LoadedAt    time.Time
}

type StopPolicyRuntime struct {
	Started     bool
	LowCount    int
	WatchRemain int
	LastEventAt time.Time
}

var (
	stopPolicyCacheMu sync.Mutex
	stopPolicyCache   = make(map[string]StopPolicyCache)

	stopPolicyRtMu sync.Mutex
	stopPolicyRt   = make(map[string]StopPolicyRuntime)
)

func resetStopPolicyRuntime(chargePoint string) {
	if chargePoint == "" {
		return
	}
	stopPolicyRtMu.Lock()
	delete(stopPolicyRt, chargePoint)
	stopPolicyRtMu.Unlock()
}

func getStopPolicyRuntime(chargePoint string) StopPolicyRuntime {
	stopPolicyRtMu.Lock()
	defer stopPolicyRtMu.Unlock()
	return stopPolicyRt[chargePoint]
}

func setStopPolicyRuntime(chargePoint string, rt StopPolicyRuntime) {
	stopPolicyRtMu.Lock()
	stopPolicyRt[chargePoint] = rt
	stopPolicyRtMu.Unlock()
}

func clearStopPolicyCache(chargePoint string) {
	if chargePoint == "" {
		return
	}
	stopPolicyCacheMu.Lock()
	delete(stopPolicyCache, chargePoint)
	stopPolicyCacheMu.Unlock()
}

func cacheStopPolicyForChargePoint(chargePoint string, cabID uint, policy float64) {
	if chargePoint == "" {
		return
	}
	stopPolicyCacheMu.Lock()
	stopPolicyCache[chargePoint] = StopPolicyCache{
		CabinetID:   cabID,
		ChargePoint: chargePoint,
		StopPolicy:  policy,
		LoadedAt:    time.Now().UTC(),
	}
	stopPolicyCacheMu.Unlock()
}

func getCachedStopPolicy(chargePoint string) (StopPolicyCache, bool) {
	stopPolicyCacheMu.Lock()
	defer stopPolicyCacheMu.Unlock()
	c, ok := stopPolicyCache[chargePoint]
	return c, ok
}

// ============================================================================
// 🔹 FRONTEND WebSocket (ดู log OCPP real-time) + ✅ command open/close/verbose
// ============================================================================

func HandleFrontend(c *gin.Context) {
	conn, err := frontendUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logln("❌ Upgrade frontend error:", err)
		return
	}
	defer conn.Close()

	roomID := c.Param("chargerID")
	if roomID == "" || roomID == "all" {
		roomID = "*"
	}

	frontendClientsMu.Lock()
	frontendClients[conn] = roomID
	frontendClientsMu.Unlock()

	logln("🌐 Frontend connected, room =", roomID)

	// ✅ ส่ง snapshot ล่าสุดทันที (ถ้าดูตู้เดียว)
	if roomID != "*" {
		if snap, ok := getCachedSnapshot(roomID); ok {
			sendSnapshotToConn(conn, snap)
		} else {
			snap := buildSnapshot(config.DB(), roomID, "frontend_connected")
			sendSnapshotToConn(conn, snap)
			cacheSnapshot(roomID, snap)
		}
	}

	if isLogEnabled() {
		_ = conn.WriteMessage(websocket.TextMessage,
			[]byte("[SYSTEM] Frontend connected to room "+roomID+"\n"))
	}

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			frontendClientsMu.Lock()
			delete(frontendClients, conn)
			frontendClientsMu.Unlock()
			logln("❌ Frontend disconnected from room:", roomID)
			break
		}

		cmd := strings.ToLower(strings.TrimSpace(string(msg)))
		switch cmd {
		case "open":
			setLogEnabled(true)
			_ = conn.WriteMessage(websocket.TextMessage, []byte("[LOG] open\n"))
			continue
		case "close":
			setLogEnabled(false)
			continue
		case "verbose_on":
			setLogVerbose(true)
			_ = conn.WriteMessage(websocket.TextMessage, []byte("[LOG] verbose_on\n"))
			continue
		case "verbose_off":
			setLogVerbose(false)
			_ = conn.WriteMessage(websocket.TextMessage, []byte("[LOG] verbose_off\n"))
			continue
		case "snapshot":
			if roomID != "*" {
				snap := buildSnapshot(config.DB(), roomID, "frontend_command_snapshot")
				sendSnapshotToConn(conn, snap)
				cacheSnapshot(roomID, snap)
			}
			continue
		default:
		}
	}
}

// ============================================================================
// 🔹 CHARGER OCPP WebSocket (ตัวหลักคุยกับตู้จริง OCPP 1.6J)
// ============================================================================

func handleDisconnectAsInterruption(chargerID string) {
	chargersMu.Lock()
	_, connected := chargers[chargerID]
	chargersMu.Unlock()
	if connected {
		return
	}

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}
	st.Status = "Interruption"
	st.ErrorCode = "Interruption"
	st.Connected = false
	st.LastHeartbeat = time.Now().UTC()
	chargerStatuses[chargerID] = st
	statusMu.Unlock()

	dataMsg := map[string]interface{}{
		"type":      "charger_status_update",
		"chargerId": chargerID,
		"status":    "Interruption",
		"errorCode": "Interruption",
		"connected": false,
		"timestamp": nowOcppTime(),
	}
	if b, err := json.Marshal(dataMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b)
	}

	dbConn := config.DB()
	if err := updateEndTimeAndCloseOnFinishingByChargePoint(dbConn, chargerID); err != nil {
		logln("❌ disconnect->Interruption updateEndTimeAndCloseOnFinishingByChargePoint error:", err)
	} else {
		logln("✅ disconnect->Interruption -> session closed for", chargerID)
		broadcastLogTextToFrontendRoom(
			chargerID,
			"[SESSION-CLOSED] status=Interruption -> EndTime updated & status=false\n",
		)
	}

	clearTransactionID(chargerID)

	resetStopPolicyRuntime(chargerID)
	clearStopPolicyCache(chargerID)

	buildAndBroadcastSnapshot(chargerID, "disconnect_timeout_interruption")
}

// HandleOCPP: ws://host/ocpp/:chargerID
func HandleOCPP(c *gin.Context) {
	conn, err := ocppUpgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logln("❌ Upgrade OCPP error:", err)
		return
	}
	defer conn.Close()

	chargerID := c.Param("chargerID")
	if chargerID == "" {
		logln("❌ missing chargerID in URL")
		return
	}

	if conn.Subprotocol() != "ocpp1.6" {
		logln("⚠️ Subprotocol mismatch, expected ocpp1.6, got:", conn.Subprotocol(), "chargerID:", chargerID)
	}

	cancelDisconnectHold(chargerID)

	chargersMu.Lock()
	chargers[chargerID] = conn
	chargersMu.Unlock()

	logln("🚗 Charger connected:", chargerID, "subprotocol =", conn.Subprotocol())
	broadcastLogTextToFrontendRoom(chargerID, "[SYSTEM] Charger connected: "+chargerID+"\n")

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}

	if last, hasLast := getLastRealStatus(chargerID); hasLast {
		st.ConnectorID = last.ConnectorID
		st.Status = last.Status
		st.ErrorCode = last.ErrorCode
	}

	st.Connected = true
	st.LastHeartbeat = time.Now().UTC()
	chargerStatuses[chargerID] = st
	statusMu.Unlock()

	connectedMsg := map[string]interface{}{
		"type":      "charger_connection_update",
		"chargerId": chargerID,
		"connected": true,
		"status":    st.Status,
		"errorCode": st.ErrorCode,
		"timestamp": nowOcppTime(),
	}
	if b, err := json.Marshal(connectedMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b)
	}

	statusMsg := map[string]interface{}{
		"type":      "charger_status_update",
		"chargerId": chargerID,
		"status":    st.Status,
		"errorCode": st.ErrorCode,
		"connected": true,
		"timestamp": nowOcppTime(),
	}
	if b, err := json.Marshal(statusMsg); err == nil {
		broadcastToFrontendRoom(chargerID, b)
	}

	buildAndBroadcastSnapshot(chargerID, "ocpp_connected")

	defer func() {
		chargersMu.Lock()
		delete(chargers, chargerID)
		chargersMu.Unlock()

		logln("⚠️ Charger disconnected:", chargerID)
		broadcastLogTextToFrontendRoom(chargerID, "[SYSTEM] Charger disconnected: "+chargerID+"\n")

		scheduleDisconnectHold(chargerID)
	}()

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			logln("❌ OCPP read error:", err)
			break
		}

		if isLogEnabled() {
			broadcastToFrontendRoom(chargerID, msg)
		}

		var frame []interface{}
		if err := json.Unmarshal(msg, &frame); err != nil {
			logln("❌ JSON parse error:", err)
			continue
		}

		if len(frame) < 3 {
			logln("⚠️ Invalid OCPP frame length:", len(frame))
			continue
		}

		messageTypeFloat, ok := frame[0].(float64)
		if !ok {
			logln("⚠️ messageType is not number")
			continue
		}
		messageType := int(messageTypeFloat)

		messageID, ok := frame[1].(string)
		if !ok {
			logln("⚠️ messageId is not string")
			continue
		}

		switch messageType {
		case 2:
			handleCallFromCharger(chargerID, conn, frame, messageID)
		case 3:
			handleCallResultFromCharger(chargerID, frame, messageID)
		case 4:
			handleCallErrorFromCharger(chargerID, frame, messageID)
		default:
			logln("⚠️ Unknown messageType:", messageType)
		}
	}
}

// ============================================================================
// 🧠 Handlers: CALL / CALLRESULT / CALLERROR
// ============================================================================

func handleCallFromCharger(chargerID string, conn *websocket.Conn, frame []interface{}, messageID string) {
	action := ""
	if a, ok := frame[2].(string); ok {
		action = a
	}

	var payload map[string]interface{}
	if len(frame) >= 4 {
		if p, ok := frame[3].(map[string]interface{}); ok {
			payload = p
		}
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}

	if action == "MeterValues" {
		logf("📥 CALL from %s: action=%s payload=%v\n", chargerID, action, payload)
	} else {
		vlogf("📥 CALL from %s: action=%s payload=%v\n", chargerID, action, payload)
	}

	switch action {
	case "BootNotification":
		vendor, _ := payload["chargePointVendor"].(string)
		model, _ := payload["chargePointModel"].(string)
		logf("🔌 BootNotification from %s | Vendor=%s Model=%s\n", chargerID, vendor, model)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"status":      "Accepted",
				"currentTime": nowOcppTime(),
				"interval":    int(30),
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send BootNotification conf:", err)
		} else {
			logln("✅ BootNotification Accepted for", chargerID)
			broadcastLogTextToFrontendRoom(chargerID, "[SENT] BootNotification.conf to "+chargerID+"\n")
		}

	case "Heartbeat":
		statusMu.Lock()
		st, ok := chargerStatuses[chargerID]
		if !ok {
			st = ChargerStatus{ChargerID: chargerID}
		}
		st.LastHeartbeat = time.Now().UTC()
		st.Connected = true
		chargerStatuses[chargerID] = st
		statusMu.Unlock()

		response := []interface{}{3, messageID, map[string]interface{}{"currentTime": nowOcppTime()}}

		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send Heartbeat conf:", err)
		} else {
			logf("💓 Heartbeat Answered for %s\n", chargerID)
		}

	case "Authorize":
		idTag, _ := payload["idTag"].(string)
		logln("🔐 Authorize request from", chargerID, "idTag =", idTag)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status":     "Accepted",
					"expiryDate": nowOcppTime(),
				},
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send Authorize conf:", err)
		} else {
			logln("✅ Authorize Accepted for", chargerID)
		}

	case "StatusNotification":
		var connectorID int
		var statusStr, errorCode string

		if cid, ok := payload["connectorId"].(float64); ok {
			connectorID = int(cid)
		}
		if s, ok := payload["status"].(string); ok {
			statusStr = s
		}
		if e, ok := payload["errorCode"].(string); ok {
			errorCode = e
		}

		statusMu.Lock()
		old := chargerStatuses[chargerID]
		newSt := ChargerStatus{
			ChargerID:     chargerID,
			ConnectorID:   connectorID,
			Status:        statusStr,
			ErrorCode:     errorCode,
			Connected:     true,
			LastHeartbeat: time.Now().UTC(),
		}
		if old.ChargerID != "" && newSt.ConnectorID == 0 {
			newSt.ConnectorID = old.ConnectorID
		}
		chargerStatuses[chargerID] = newSt
		statusMu.Unlock()

		saveLastRealStatus(chargerID, newSt)

		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send StatusNotification conf:", err)
		} else {
			logf("✅ StatusNotification stored: %+v\n", newSt)
		}

		statusMsg := map[string]interface{}{
			"type":      "charger_status_update",
			"chargerId": chargerID,
			"status":    newSt.Status,
			"errorCode": newSt.ErrorCode,
			"connected": true,
			"timestamp": nowOcppTime(),
		}
		if b, err := json.Marshal(statusMsg); err == nil {
			broadcastToFrontendRoom(chargerID, b)
		}

		buildAndBroadcastSnapshot(chargerID, "status_notification")

		if statusStr == "SuspendedEV" {
			dbConn := config.DB()
			if err := updateEndTimeOnSuspendedEVByChargePoint(dbConn, chargerID); err != nil {
				logln("❌ updateEndTimeOnSuspendedEVByChargePoint error:", err)
			}
		}

		if statusStr == "Finishing" || statusStr == "Faulted" {
			dbConn := config.DB()
			if err := updateEndTimeAndCloseOnFinishingByChargePoint(dbConn, chargerID); err != nil {
				logln("❌ updateEndTimeAndCloseOnFinishingByChargePoint error:", err)
			} else {
				logln("✅", statusStr, "-> session closed for", chargerID)
				broadcastLogTextToFrontendRoom(
					chargerID,
					fmt.Sprintf("[SESSION-CLOSED] status=%s -> EndTime updated & status=false\n", statusStr),
				)
			}

			clearTransactionID(chargerID)

			resetStopPolicyRuntime(chargerID)
			clearStopPolicyCache(chargerID)

			buildAndBroadcastSnapshot(chargerID, "status_finishing_or_faulted_closed")
		}

	case "StartTransaction":
		logln("🚗 StartTransaction received from", chargerID)

		transactionID := generateTransactionID()
		saveTransactionID(chargerID, transactionID)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status":     "Accepted",
					"expiryDate": nowOcppTime(),
				},
				"transactionId": transactionID,
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send StartTransaction conf:", err)
		} else {
			logln("🎉 StartTransaction Accepted → transactionId =", transactionID)
		}

		buildAndBroadcastSnapshot(chargerID, "start_transaction")

	case "StopTransaction":
		logln("🛑 StopTransaction received — ending session for", chargerID)

		clearTransactionID(chargerID)
		resetStopPolicyRuntime(chargerID)
		clearStopPolicyCache(chargerID)

		response := []interface{}{
			3,
			messageID,
			map[string]interface{}{
				"idTagInfo": map[string]interface{}{
					"status":     "Accepted",
					"expiryDate": nowOcppTime(),
				},
			},
		}

		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send StopTransaction conf:", err)
		} else {
			logln("🧹 Transaction cleared for", chargerID)
		}

		buildAndBroadcastSnapshot(chargerID, "stop_transaction")

	case "MeterValues":
		energyWh := extractEnergyActiveImportRegister(payload)
		txFromPayload := extractTransactionIDFromMeterValues(payload)
		tsFromPayload := extractTimestampFromMeterValues(payload)

		powerKW, _ := extractPowerActiveImport(payload)

		logf("🟨 [METERVALUES] chargePoint=%s energyWh=%.2f powerKW=%.4f tx=%d ts=%s\n",
			chargerID,
			energyWh,
			powerKW,
			txFromPayload,
			tsFromPayload,
		)

		setLastMeter(chargerID, MeterSnapshot{
			EnergyWh:      energyWh,
			PowerKW:       powerKW,
			TransactionID: txFromPayload,
			Timestamp:     tsFromPayload,
		})

		if energyWh > 0 {
			dbConn := config.DB()

			if err := updateStartEnergyByChargePoint(dbConn, chargerID, energyWh); err != nil {
				logln("❌ updateStartEnergyByChargePoint error:", err)
			}

			if err := broadcastPaymentPowerByChargePointOnMeterValues(dbConn, chargerID, payload, energyWh); err != nil {
				logln("❌ broadcastPaymentPowerByChargePointOnMeterValues error:", err)
			}
		} else {
			vlogf("⚠️ [METERVALUES] energyWh=0 -> skip db/broadcast (chargePoint=%s)\n", chargerID)
		}

		buildAndBroadcastSnapshot(chargerID, "meter_values")

		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send MeterValues conf:", err)
		}

	case "DiagnosticsStatusNotification", "FirmwareStatusNotification", "DataTransfer":
		vlogf("📥 %s from %s payload=%v\n", action, chargerID, payload)
		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			logf("❌ Failed to send %s conf: %v\n", action, err)
		} else {
			vlogf("✅ %s Acknowledged\n", action)
		}

	default:
		vlogf("⚠️ Unhandled CALL action=%s from %s payload=%v\n", action, chargerID, payload)
		response := []interface{}{3, messageID, map[string]interface{}{}}
		if err := conn.WriteJSON(response); err != nil {
			logln("❌ Failed to send generic CALLRESULT:", err)
		}
	}
}

func handleCallResultFromCharger(chargerID string, frame []interface{}, messageID string) {
	var payload map[string]interface{}
	if len(frame) >= 3 {
		if p, ok := frame[2].(map[string]interface{}); ok {
			payload = p
		}
	}
	if payload == nil {
		payload = map[string]interface{}{}
	}

	pendingMu.Lock()
	pending, ok := pendingCalls[messageID]
	if ok {
		delete(pendingCalls, messageID)
	}
	pendingMu.Unlock()

	if ok {
		vlogf("📥 CALLRESULT for %s from %s: action=%s payload=%v\n", messageID, chargerID, pending.Action, payload)
	} else {
		vlogf("📥 CALLRESULT (unknown messageId=%s) from %s payload=%v\n", messageID, chargerID, payload)
	}
}

func handleCallErrorFromCharger(chargerID string, frame []interface{}, messageID string) {
	errorCode := ""
	errorDescription := ""
	var details map[string]interface{}

	if len(frame) >= 3 {
		if s, ok := frame[2].(string); ok {
			errorCode = s
		}
	}
	if len(frame) >= 4 {
		if s, ok := frame[3].(string); ok {
			errorDescription = s
		}
	}
	if len(frame) >= 5 {
		if d, ok := frame[4].(map[string]interface{}); ok {
			details = d
		}
	}
	if details == nil {
		details = map[string]interface{}{}
	}

	pendingMu.Lock()
	pending, ok := pendingCalls[messageID]
	if ok {
		delete(pendingCalls, messageID)
	}
	pendingMu.Unlock()

	if ok {
		logf("❌ CALLERROR for %s from %s: action=%s code=%s desc=%s details=%v\n",
			messageID, chargerID, pending.Action, errorCode, errorDescription, details)
	} else {
		logf("❌ CALLERROR (unknown messageId=%s) from %s code=%s desc=%s details=%v\n",
			messageID, chargerID, errorCode, errorDescription, details)
	}
}

// ============================================================================
// 🚀 RemoteStart/Stop: LOCAL SEND HELPERS
// - ใช้ส่งจริงบน WS ของ instance นี้เท่านั้น
// ============================================================================

func sendRemoteStartFrameLocal(chargerID string, connectorID int, idTag string) error {
	chargersMu.Lock()
	conn, ok := chargers[chargerID]
	chargersMu.Unlock()

	if !ok || conn == nil {
		return fmt.Errorf("charger %s not connected (local)", chargerID)
	}

	if connectorID <= 0 {
		connectorID = 1
	}
	if idTag == "" {
		idTag = "EV-SIM-001"
	}

	// ✅ เริ่ม session ใหม่: reset runtime
	resetStopPolicyRuntime(chargerID)

	// preload/refresh StopPolicy
	_, _ = refreshStopPolicyCacheIfNeeded(config.DB(), chargerID, true)

	messageID := fmt.Sprintf("remote-start-%s-%d", chargerID, time.Now().UnixNano())

	frame := []interface{}{
		2,
		messageID,
		"RemoteStartTransaction",
		map[string]interface{}{
			"connectorId":     connectorID,
			"idTag":           idTag,
			"chargingProfile": nil,
		},
	}

	pendingMu.Lock()
	pendingCalls[messageID] = PendingCall{
		ChargerID: chargerID,
		Action:    "RemoteStartTransaction",
		SentAt:    time.Now().UTC(),
	}
	pendingMu.Unlock()

	if err := conn.WriteJSON(frame); err != nil {
		logln("❌ Failed to send RemoteStartTransaction:", err)
		return err
	}

	logln("➡️ RemoteStartTransaction sent (LOCAL) to", chargerID, "connectorId =", connectorID, "idTag =", idTag)
	broadcastLogTextToFrontendRoom(chargerID, "[SENT] RemoteStartTransaction to "+chargerID+"\n")
	buildAndBroadcastSnapshot(chargerID, "remote_start_sent_local")

	return nil
}

func sendRemoteStopFrameLocal(chargerID string, txID int) error {
	chargersMu.Lock()
	conn, ok := chargers[chargerID]
	chargersMu.Unlock()

	if !ok || conn == nil {
		return fmt.Errorf("charger %s not connected (local)", chargerID)
	}

	if txID <= 0 {
		return fmt.Errorf("invalid txID")
	}

	messageID := fmt.Sprintf("remote-stop-%s-%d", chargerID, time.Now().UnixNano())

	frame := []interface{}{
		2,
		messageID,
		"RemoteStopTransaction",
		map[string]interface{}{
			"transactionId": txID,
		},
	}

	pendingMu.Lock()
	pendingCalls[messageID] = PendingCall{
		ChargerID: chargerID,
		Action:    "RemoteStopTransaction",
		SentAt:    time.Now().UTC(),
	}
	pendingMu.Unlock()

	if err := conn.WriteJSON(frame); err != nil {
		logln("❌ Failed to send RemoteStopTransaction:", err)
		return err
	}

	logln("➡️ RemoteStopTransaction sent (LOCAL) to", chargerID, "txID =", txID)
	broadcastLogTextToFrontendRoom(chargerID, "[SENT] RemoteStopTransaction to "+chargerID+"\n")
	buildAndBroadcastSnapshot(chargerID, "remote_stop_sent_local")

	return nil
}

// ============================================================================
// 🚀 ส่ง RemoteStartTransaction (API จะ local-first, ถ้าไม่ใช่ WS-holder -> publish bus)
// ============================================================================

func SendRemoteStartTransaction(chargerID string, connectorID int, idTag string) error {
	// ✅ local-first (ถ้า instance นี้ถือ WS ก็ส่งเลย)
	if err := sendRemoteStartFrameLocal(chargerID, connectorID, idTag); err == nil {
		return nil
	}

	// ✅ ถ้าไม่ถือ WS -> publish ไป bus
	cmd := OcppCommand{
		Type:        "remote_start",
		ChargerID:   chargerID,
		ConnectorID: connectorID,
		IdTag:       idTag,
		TraceID:     fmt.Sprintf("trace-%d", time.Now().UnixNano()),
	}
	if err := publishOcppCommand(cmd); err != nil {
		logln("❌ publish remote_start failed:", err)
		return err
	}

	logf("📡 RemoteStart published to CommandBus (charger=%s connector=%d) from %s\n", chargerID, connectorID, nodeID)
	return nil
}

// ============================================================================
// ⛔ ส่ง RemoteStopTransaction (API จะ local-first, ถ้าไม่ใช่ WS-holder -> publish bus)
// ============================================================================

func SendRemoteStopTransaction(chargerID string, txID int) error {
	// ✅ local-first
	if err := sendRemoteStopFrameLocal(chargerID, txID); err == nil {
		return nil
	}

	// ✅ publish ไป bus
	cmd := OcppCommand{
		Type:      "remote_stop",
		ChargerID: chargerID,
		TxID:      txID,
		TraceID:   fmt.Sprintf("trace-%d", time.Now().UnixNano()),
	}
	if err := publishOcppCommand(cmd); err != nil {
		logln("❌ publish remote_stop failed:", err)
		return err
	}

	logf("📡 RemoteStop published to CommandBus (charger=%s tx=%d) from %s\n", chargerID, txID, nodeID)
	return nil
}

// ============================================================================
// ▶ API: RemoteStart (POST /ocpp/remote-start)
// ============================================================================

type RemoteStartRequest struct {
	ChargerID   string `json:"chargerId"`
	ConnectorID int    `json:"connectorId"`
	IdTag       string `json:"idTag"`
}

func RemoteStartHandler(c *gin.Context) {
	var req RemoteStartRequest

	if err := c.ShouldBindJSON(&req); err != nil {
		logln("❌ RemoteStart invalid body:", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "invalid body",
			"detail": err.Error(),
		})
		return
	}

	logf("🟦 RemoteStartHandler request: %+v\n", req)

	if req.ChargerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "chargerId is required"})
		return
	}

	if req.ConnectorID <= 0 {
		req.ConnectorID = 1
	}
	if req.IdTag == "" {
		req.IdTag = "EV-SIM-001"
	}

	statusMu.Lock()
	st, ok := chargerStatuses[req.ChargerID]
	statusMu.Unlock()
	if !ok {
		logln("❌ RemoteStart: no status for charger:", req.ChargerID)
		c.JSON(http.StatusBadRequest, gin.H{"error": "no status for this charger"})
		return
	}

	if st.Status != "Preparing" && st.Status != "Available" {
		logf("❌ RemoteStart: charger %s status is %s (need Preparing/Available)\n", req.ChargerID, st.Status)
		c.JSON(http.StatusBadRequest, gin.H{
			"error":  "charger must be in Preparing or Available state to start",
			"status": st.Status,
		})
		return
	}

	// ✅ Multi-instance: ส่งได้แม้ API instance ไม่ถือ WS
	if err := SendRemoteStartTransaction(req.ChargerID, req.ConnectorID, req.IdTag); err != nil {
		logln("❌ RemoteStart error:", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "RemoteStartTransaction sent (multi-instance supported)",
	})
}

// ============================================================================
// ▶ API: RemoteStop (POST /ocpp/remote-stop)
// ============================================================================

type RemoteStopRequest struct {
	ChargerID string `json:"chargerId"`
}

func RemoteStopHandler(c *gin.Context) {
	var req RemoteStopRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		logln("❌ RemoteStop invalid body:", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}

	if req.ChargerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "chargerId is required"})
		return
	}

	txID, ok := getTransactionID(req.ChargerID)
	if !ok {
		// allow stop even if API not holding tx in this instance
		txID = 0
	}

	if err := SendRemoteStopTransaction(req.ChargerID, txID); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "RemoteStopTransaction sent (multi-instance supported)",
	})
}

// ============================================================================
// ▶ API: Get Current Status (GET /ocpp/status/:chargerID)
// ============================================================================

func GetChargerStatusHandler(c *gin.Context) {
	chargerID := c.Param("chargerID")

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	statusMu.Unlock()

	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "no status for this charger"})
		return
	}

	chargersMu.Lock()
	_, connected := chargers[chargerID]
	chargersMu.Unlock()
	st.Connected = connected

	snap := buildSnapshot(config.DB(), chargerID, "http_get_status")

	c.JSON(http.StatusOK, gin.H{
		"data":     st,
		"snapshot": snap,
	})
}

// ============================================================================
// 🧩 Helper: ดึงค่า Energy.Active.Import.Register (Wh) จาก MeterValues payload
// ============================================================================

func extractEnergyActiveImportRegister(payload map[string]interface{}) float64 {
	meterValuesRaw, ok := payload["meterValue"].([]interface{})
	if !ok || len(meterValuesRaw) == 0 {
		return 0
	}

	mv0, ok := meterValuesRaw[0].(map[string]interface{})
	if !ok {
		return 0
	}

	sampledValuesRaw, ok := mv0["sampledValue"].([]interface{})
	if !ok || len(sampledValuesRaw) == 0 {
		return 0
	}

	for _, sv := range sampledValuesRaw {
		m, ok := sv.(map[string]interface{})
		if !ok {
			continue
		}

		measurand, _ := m["measurand"].(string)
		if measurand != "Energy.Active.Import.Register" {
			continue
		}

		if valStr, ok := m["value"].(string); ok && valStr != "" {
			f, err := strconv.ParseFloat(valStr, 64)
			if err != nil {
				logln("⚠️ parse Energy.Active.Import.Register (string) failed:", err)
				return 0
			}
			return f
		}

		if valNum, ok := m["value"].(float64); ok {
			return valNum
		}
	}

	return 0
}

// ============================================================================
// ✅ NEW: ดึงค่า Power.Active.Import (kW) จาก MeterValues payload
// ============================================================================

func extractPowerActiveImport(payload map[string]interface{}) (float64, bool) {
	meterValuesRaw, ok := payload["meterValue"].([]interface{})
	if !ok || len(meterValuesRaw) == 0 {
		return 0, false
	}

	mv0, ok := meterValuesRaw[0].(map[string]interface{})
	if !ok {
		return 0, false
	}

	sampledValuesRaw, ok := mv0["sampledValue"].([]interface{})
	if !ok || len(sampledValuesRaw) == 0 {
		return 0, false
	}

	for _, sv := range sampledValuesRaw {
		m, ok := sv.(map[string]interface{})
		if !ok {
			continue
		}

		measurand, _ := m["measurand"].(string)
		if measurand != "Power.Active.Import" {
			continue
		}

		if valStr, ok := m["value"].(string); ok && strings.TrimSpace(valStr) != "" {
			f, err := strconv.ParseFloat(strings.TrimSpace(valStr), 64)
			if err != nil {
				logln("⚠️ parse Power.Active.Import (string) failed:", err)
				return 0, false
			}
			return f, true
		}

		if valNum, ok := m["value"].(float64); ok {
			return valNum, true
		}
	}

	return 0, false
}

// ✅ NEW SIGNATURE: เพิ่ม currentEnergyWh
func applyStopPolicyAutoStopIfNeeded(db *gorm.DB, chargePoint string, sess entity.ChargingSession, meterPayload map[string]interface{}, currentEnergyWh float64) {
	if db == nil {
		db = config.DB()
	}
	if chargePoint == "" || sess.ID == 0 {
		return
	}
	if !sess.Status {
		return
	}

	powerKW, hasPower := extractPowerActiveImport(meterPayload)
	if !hasPower {
		return
	}

	cache, ok := refreshStopPolicyCacheIfNeeded(db, chargePoint, false)
	if !ok {
		return
	}
	stopPolicy := cache.StopPolicy
	if stopPolicy <= 0 {
		return
	}

	isLow := powerKW < stopPolicy
	if isLow {
		if fresh, ok2 := refreshStopPolicyCacheIfNeeded(db, chargePoint, true); ok2 {
			stopPolicy = fresh.StopPolicy
		}
		if stopPolicy <= 0 {
			return
		}
		isLow = powerKW < stopPolicy
	}

	prefix := fmt.Sprintf("🛑 [STOP-POLICY] (%s) ", chargePoint)
	rt := getStopPolicyRuntime(chargePoint)

	if !rt.Started {
		if isLow {
			rt.Started = true
			rt.LowCount = 1
			rt.WatchRemain = 0
			rt.LastEventAt = time.Now()

			logf("%sSTART power=%.4fkW < policy=%.4fkW -> count=%d/5\n", prefix, powerKW, stopPolicy, rt.LowCount)
			setStopPolicyRuntime(chargePoint, rt)
		}
		return
	}

	if rt.WatchRemain > 0 {
		if isLow {
			rt.WatchRemain = 0
			if rt.LowCount < 5 {
				rt.LowCount++
			}
			rt.LastEventAt = time.Now()

			logf("%sWATCH-RECOVER power=%.4fkW < policy=%.4fkW -> count=%d/5\n", prefix, powerKW, stopPolicy, rt.LowCount)
			setStopPolicyRuntime(chargePoint, rt)
		} else {
			rt.WatchRemain--
			rt.LastEventAt = time.Now()

			logf("%sWATCH power=%.4fkW >= policy=%.4fkW -> remain=%d\n", prefix, powerKW, stopPolicy, rt.WatchRemain)

			if rt.WatchRemain == 0 {
				logf("%sRESET (watch failed) power still >= policy after 2 checks -> reset counter (was %d/5)\n",
					prefix, rt.LowCount,
				)
				resetStopPolicyRuntime(chargePoint)
				return
			}
			setStopPolicyRuntime(chargePoint, rt)
		}
	} else {
		if isLow {
			if rt.LowCount < 5 {
				rt.LowCount++
			}
			rt.LastEventAt = time.Now()

			logf("%sLOW power=%.4fkW < policy=%.4fkW -> count=%d/5\n", prefix, powerKW, stopPolicy, rt.LowCount)
			setStopPolicyRuntime(chargePoint, rt)
		} else {
			rt.WatchRemain = 2
			rt.LastEventAt = time.Now()

			logf("%sSPIKE power=%.4fkW >= policy=%.4fkW at count=%d/5 -> watch next 2 values\n",
				prefix, powerKW, stopPolicy, rt.LowCount,
			)
			setStopPolicyRuntime(chargePoint, rt)
			return
		}
	}

	rt = getStopPolicyRuntime(chargePoint)
	if !rt.Started || rt.LowCount < 5 {
		return
	}

	if !markAutoStopped(sess.ID) {
		return
	}

	txID, hasTx := getTransactionID(chargePoint)
	if !hasTx || txID <= 0 {
		txID = extractTransactionIDFromMeterValues(meterPayload)
	}

	logf("%sTRIGGER ✅ count=5/5 -> will REFUND + SAVE remaining BEFORE RemoteStop (sessionID=%d paymentID=%d txID=%d policy=%.4fkW)\n",
		prefix, sess.ID, sess.PaymentID, txID, stopPolicy,
	)

	refRes, refundErr := RefundAndSaveRemainingOnStopPolicy(db, chargePoint, sess, currentEnergyWh)
	if refundErr != nil {
		logln(prefix+"❌ RefundAndSaveRemainingOnStopPolicy failed:", refundErr)
	} else {
		logf("%sREFUND ✅ paymentID=%d userID=%d sessionID=%d purchased=%.2fkWh used=%.2fkWh remainingTotal=%.2fkWh refund=%.2f coin: %.2f -> %.2f\n",
			prefix,
			refRes.PaymentID, refRes.UserID, refRes.SessionID,
			refRes.TotalPurchasedKwh, refRes.UsedKwh, refRes.RemainingTotalKwh,
			refRes.RefundAmount, refRes.CoinBefore, refRes.CoinAfter,
		)
		for _, it := range refRes.Items {
			logf("%sREFUND-ITEM evcharging_id=%d weight=%.2f%% remaining=%.2fkWh price=%.2f refund=%.2f (old=%.2f delta=%.2f)\n",
				prefix,
				it.EVchargingID, it.WeightPercent, it.RemainingKwh, it.PricePerKwh, it.RefundThisItem,
				it.OldRemainingKwh, it.DeltaKwh,
			)
		}

		broadcastLogTextToFrontendRoom(chargePoint, fmt.Sprintf(
			"[STOP-POLICY-REFUND] paymentID=%d userID=%d sessionID=%d remainingTotal=%.2fkWh refund=%.2f coin: %.2f -> %.2f\n",
			refRes.PaymentID, refRes.UserID, refRes.SessionID, refRes.RemainingTotalKwh, refRes.RefundAmount, refRes.CoinBefore, refRes.CoinAfter,
		))
		for _, it := range refRes.Items {
			broadcastLogTextToFrontendRoom(chargePoint, fmt.Sprintf(
				"[STOP-POLICY-REFUND-ITEM] evcharging_id=%d weight=%.2f%% remaining=%.2fkWh price=%.2f refund=%.2f (old=%.2f delta=%.2f)\n",
				it.EVchargingID, it.WeightPercent, it.RemainingKwh, it.PricePerKwh, it.RefundThisItem, it.OldRemainingKwh, it.DeltaKwh,
			))
		}

		buildAndBroadcastSnapshot(chargePoint, "stop_policy_refund_saved_before_remote_stop")
	}

	if txID > 0 {
		if err := SendRemoteStopTransaction(chargePoint, txID); err != nil {
			logln(prefix+"❌ RemoteStop failed:", err)
		} else {
			broadcastLogTextToFrontendRoom(chargePoint, fmt.Sprintf(
				"[AUTO-STOP-POLICY] chargePoint=%s sessionID=%d txID=%d policy=%.4fkW -> sent RemoteStop\n",
				chargePoint, sess.ID, txID, stopPolicy,
			))
		}
	} else {
		logln(prefix + "⚠️ txID not found -> cannot send RemoteStop")
	}

	clearTransactionID(chargePoint)
	resetStopPolicyRuntime(chargePoint)

	buildAndBroadcastSnapshot(chargePoint, "auto_stop_policy_triggered_after_refund")
}

// ============================================================================
// ✅ IMPROVE: ลด “DB Query ซ้ำ” ตอนเช็ค ExpiresAt
// ============================================================================

const expireExtendMinInterval = 30 * time.Second

var (
	lastExpireExtendAt   = make(map[uint]time.Time)
	lastExpireExtendAtMu sync.Mutex
)

func allowExpireExtend(sessionID uint) bool {
	if sessionID == 0 {
		return false
	}
	now := time.Now()
	lastExpireExtendAtMu.Lock()
	defer lastExpireExtendAtMu.Unlock()

	if t, ok := lastExpireExtendAt[sessionID]; ok {
		if now.Sub(t) < expireExtendMinInterval {
			return false
		}
	}
	lastExpireExtendAt[sessionID] = now
	return true
}

func extendSessionExpiresAtIfNeeded(db *gorm.DB, sess *entity.ChargingSession, chargePointForLog string) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if sess == nil || sess.ID == 0 {
		return nil
	}
	if !sess.Status {
		return nil
	}

	now := time.Now()

	if sess.ExpiresAt.IsZero() {
		if !allowExpireExtend(sess.ID) {
			return nil
		}

		old := sess.ExpiresAt
		newExp := now.Add(2 * time.Hour)

		if err := db.Model(&entity.ChargingSession{}).
			Where("id = ? AND status = ?", sess.ID, true).
			Update("expires_at", newExp).Error; err != nil {
			return fmt.Errorf("update ExpiresAt (zero->now+2h) failed: %w", err)
		}

		sess.ExpiresAt = newExp

		logf("⏳ [SESSION-EXPIRE] (%s) paymentID=%d sessionID=%d ExpiresAt was ZERO (%v) -> set to %s\n",
			chargePointForLog, sess.PaymentID, sess.ID, old, sess.ExpiresAt.Format(time.RFC3339))
		return nil
	}

	remain := time.Until(sess.ExpiresAt)

	if remain <= 1*time.Hour {
		if !allowExpireExtend(sess.ID) {
			return nil
		}

		old := sess.ExpiresAt
		newExp := sess.ExpiresAt.Add(2 * time.Hour)

		if err := db.Model(&entity.ChargingSession{}).
			Where("id = ? AND status = ?", sess.ID, true).
			Update("expires_at", newExp).Error; err != nil {
			return fmt.Errorf("extend ExpiresAt +2h failed: %w", err)
		}

		sess.ExpiresAt = newExp

		vlogf("⏳ [SESSION-EXPIRE] (%s) paymentID=%d sessionID=%d remain=%s -> extend ExpiresAt: %s -> %s\n",
			chargePointForLog, sess.PaymentID, sess.ID, remain.Round(time.Second).String(),
			old.Format(time.RFC3339), sess.ExpiresAt.Format(time.RFC3339))
	}

	return nil
}

// ============================================================================
// 🧩 Logic: Update StartEnergy โดยใช้ ChargePoint (chargerID)
// ============================================================================

func updateStartEnergyByChargePoint(db *gorm.DB, chargePoint string, startEnergy float64) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		return fmt.Errorf("chargePoint is required")
	}
	if startEnergy <= 0 {
		return nil
	}

	var sessions []entity.ChargingSession
	if err := db.
		Where("status = ? AND start_energy = 0", true).
		Find(&sessions).Error; err != nil {
		return fmt.Errorf("query active charging sessions failed: %w", err)
	}

	if len(sessions) == 0 {
		return nil
	}

	for _, s := range sessions {
		if s.PaymentID == 0 {
			continue
		}

		if err := db.Preload("Payment").First(&s, s.ID).Error; err != nil {
			vlogf("⚠️ preload Payment failed (sessionID=%d): %v\n", s.ID, err)
			continue
		}

		if s.Payment.EVCabinetID == nil {
			continue
		}

		var cab entity.EVCabinet
		if err := db.First(&cab, *s.Payment.EVCabinetID).Error; err != nil {
			vlogf("⚠️ find EVCabinet failed (paymentID=%d): %v\n", s.PaymentID, err)
			continue
		}

		if cab.ChargePoint != chargePoint {
			continue
		}

		s.StartEnergy = startEnergy
		if s.StartTime.IsZero() {
			s.StartTime = time.Now()
		}

		if err := db.Save(&s).Error; err != nil {
			return fmt.Errorf("update StartEnergy/StartTime failed for sessionID=%d: %w", s.ID, err)
		}

		vlogf("✅ Update StartEnergy & StartTime sessionID=%d chargePoint=%s startEnergy=%.2f StartTime=%s\n",
			s.ID, chargePoint, startEnergy, s.StartTime.Format(time.RFC3339))

		startEnergyMsg := map[string]interface{}{
			"type":         "start_energy_updated",
			"chargePoint":  chargePoint,
			"session_id":   s.ID,
			"start_energy": s.StartEnergy,
			"start_time":   s.StartTime.Format(time.RFC3339),
		}

		if b, err := json.Marshal(startEnergyMsg); err != nil {
			logln("❌ marshal startEnergyMsg failed:", err)
		} else {
			broadcastToFrontendRoom(chargePoint, b)
		}

		buildAndBroadcastSnapshot(chargePoint, "start_energy_updated")

		return nil
	}

	return nil
}

// ============================================================================
// 🧩 SuspendedEV -> Update EndTime
// ============================================================================

func updateEndTimeOnSuspendedEVByChargePoint(db *gorm.DB, chargePoint string) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		return fmt.Errorf("chargePoint is required")
	}

	var cab entity.EVCabinet
	if err := db.Where("charge_point = ?", chargePoint).First(&cab).Error; err != nil {
		return fmt.Errorf("find EVCabinet by charge_point failed: %w", err)
	}

	var pay entity.Payment
	if err := db.
		Where("ev_cabinet_id = ?", cab.ID).
		Order("created_at DESC").
		First(&pay).Error; err != nil {
		return fmt.Errorf("find latest Payment by EVCabinetID failed: %w", err)
	}

	var session entity.ChargingSession
	if err := db.
		Where("payment_id = ? AND status = ?", pay.ID, true).
		Order("created_at DESC").
		First(&session).Error; err != nil {
		return fmt.Errorf("find active ChargingSession by PaymentID failed: %w", err)
	}

	session.EndTime = time.Now()

	if err := db.Save(&session).Error; err != nil {
		return fmt.Errorf("update EndTime for ChargingSessionID=%d failed: %w", session.ID, err)
	}

	vlogf("✅ Update EndTime on SuspendedEV: sessionID=%d paymentID=%d cabinetID=%d chargePoint=%s EndTime=%s\n",
		session.ID, pay.ID, cab.ID, chargePoint, session.EndTime.Format(time.RFC3339))

	buildAndBroadcastSnapshot(chargePoint, "suspended_ev_endtime_updated")

	return nil
}

// ============================================================================
// ✅ Finishing/Faulted -> Update EndTime + session.status=false
// ============================================================================

func updateEndTimeAndCloseOnFinishingByChargePoint(db *gorm.DB, chargePoint string) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		return fmt.Errorf("chargePoint is required")
	}

	var cab entity.EVCabinet
	if err := db.Where("charge_point = ?", chargePoint).First(&cab).Error; err != nil {
		return fmt.Errorf("find EVCabinet by charge_point failed: %w", err)
	}

	var pay entity.Payment
	if err := db.
		Where("ev_cabinet_id = ?", cab.ID).
		Order("created_at DESC").
		First(&pay).Error; err != nil {
		return fmt.Errorf("find latest Payment by EVCabinetID failed: %w", err)
	}

	var session entity.ChargingSession
	if err := db.
		Where("payment_id = ? AND status = ?", pay.ID, true).
		Order("created_at DESC").
		First(&session).Error; err != nil {
		return fmt.Errorf("find active ChargingSession by PaymentID failed: %w", err)
	}

	session.EndTime = time.Now()
	session.Status = false

	if err := db.Save(&session).Error; err != nil {
		return fmt.Errorf("close session on Finishing failed for ChargingSessionID=%d: %w", session.ID, err)
	}

	vlogf("✅ Finishing/Faulted -> session closed: sessionID=%d paymentID=%d cabinetID=%d chargePoint=%s EndTime=%s status=%v\n",
		session.ID, pay.ID, cab.ID, chargePoint, session.EndTime.Format(time.RFC3339), session.Status)

	buildAndBroadcastSnapshot(chargePoint, "session_closed_finishing_faulted")

	return nil
}

// ============================================================================
// ✅ Helper: หา active session (status=true) ที่ "ตรงกับ chargePoint" จริง ๆ
// ============================================================================

func findActiveSessionByChargePoint(db *gorm.DB, chargePoint string) (entity.ChargingSession, bool, error) {
	if db == nil {
		return entity.ChargingSession{}, false, fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		return entity.ChargingSession{}, false, fmt.Errorf("chargePoint is required")
	}

	now := time.Now()

	var sessions []entity.ChargingSession
	if err := db.
		Where(
			"status = ? AND (expires_at IS NULL OR expires_at = ? OR expires_at > ?)",
			true,
			time.Time{},
			now,
		).
		Order("created_at DESC").
		Limit(50).
		Find(&sessions).Error; err != nil {
		return entity.ChargingSession{}, false, err
	}

	if len(sessions) == 0 {
		return entity.ChargingSession{}, false, gorm.ErrRecordNotFound
	}

	for _, s := range sessions {
		if s.PaymentID == 0 {
			continue
		}

		if err := db.Preload("Payment").First(&s, s.ID).Error; err != nil {
			continue
		}
		if s.Payment.EVCabinetID == nil {
			continue
		}

		var cab entity.EVCabinet
		if err := db.First(&cab, *s.Payment.EVCabinetID).Error; err != nil {
			continue
		}
		if cab.ChargePoint != chargePoint {
			continue
		}

		return s, true, nil
	}

	return entity.ChargingSession{}, false, gorm.ErrRecordNotFound
}

// ============================================================================
// ✅ Helper: Update session.EndTime + status=false (ปิด session)
// ============================================================================

func closeSessionByID(db *gorm.DB, sessionID uint) error {
	if db == nil {
		return fmt.Errorf("db is nil")
	}
	if sessionID == 0 {
		return fmt.Errorf("invalid sessionID")
	}

	var sess entity.ChargingSession
	if err := db.First(&sess, sessionID).Error; err != nil {
		return err
	}

	if !sess.EndTime.IsZero() && !sess.Status {
		return nil
	}

	sess.EndTime = time.Now()
	sess.Status = false

	if err := db.Save(&sess).Error; err != nil {
		return err
	}
	return nil
}

// ============================================================================
// ✅ SAFETY AUTO STOP: session มีอยู่ แต่ Payment หาไม่เจอ -> สั่งหยุดทันที
// ============================================================================

func safetyAutoStopWhenPaymentMissing(db *gorm.DB, chargePoint string, sessID uint, meterPayload map[string]interface{}, reason string) {
	if chargePoint == "" || sessID == 0 {
		return
	}

	if !markAutoStopped(sessID) {
		return
	}

	debugPrefix := fmt.Sprintf("🛑 [SAFETY-AUTO-STOP] (%s) ", chargePoint)
	logf("%sreason=%s sessID=%d -> send RemoteStop immediately (payment missing)\n", debugPrefix, reason, sessID)

	txID, hasTx := getTransactionID(chargePoint)
	if !hasTx || txID <= 0 {
		txID = extractTransactionIDFromMeterValues(meterPayload)
	}

	if txID > 0 {
		if err := SendRemoteStopTransaction(chargePoint, txID); err != nil {
			logln(debugPrefix+"❌ RemoteStop failed:", err)
		} else {
			broadcastLogTextToFrontendRoom(chargePoint, fmt.Sprintf(
				"[SAFETY-AUTO-STOP] chargePoint=%s sessID=%d txID=%d reason=%s\n",
				chargePoint, sessID, txID, reason,
			))
		}
	} else {
		logln(debugPrefix + "⚠️ txID not found -> cannot send RemoteStop")
	}

	if db != nil {
		if err := closeSessionByID(db, sessID); err != nil {
			logln(debugPrefix+"❌ closeSessionByID error:", err)
		}
	}

	clearTransactionID(chargePoint)
	resetStopPolicyRuntime(chargePoint)
	clearStopPolicyCache(chargePoint)

	buildAndBroadcastSnapshot(chargePoint, "safety_auto_stop_payment_missing")
}

// ============================================================================
// ✅ MeterValues -> รวม power -> คิด % -> auto stop
// ============================================================================

func broadcastPaymentPowerByChargePointOnMeterValues(db *gorm.DB, chargePoint string, meterPayload map[string]interface{}, energyWh float64) error {
	debugPrefix := fmt.Sprintf("🧾 [METER->PAYMENT] (%s) ", chargePoint)

	if db == nil {
		logln("❌", debugPrefix+"db is nil")
		return fmt.Errorf("db is nil")
	}
	if chargePoint == "" {
		logln("❌", debugPrefix+"chargePoint is empty")
		return fmt.Errorf("chargePoint is required")
	}

	vlogf("%sSTART energyWh=%.2f tx=%d ts=%s\n",
		debugPrefix,
		energyWh,
		extractTransactionIDFromMeterValues(meterPayload),
		extractTimestampFromMeterValues(meterPayload),
	)

	sess, ok, err := findActiveSessionByChargePoint(db, chargePoint)
	if err != nil || !ok {
		if err == gorm.ErrRecordNotFound {
			vlogln(debugPrefix + "NO ChargingSession(status=true) matched this chargePoint -> skip broadcast")
			return nil
		}
		logln(debugPrefix+"findActiveSessionByChargePoint error:", err)
		return fmt.Errorf("findActiveSessionByChargePoint failed: %w", err)
	}

	vlogf("%sFOUND sessionID=%d status=%v paymentID=%d startEnergy=%.2fWh\n",
		debugPrefix, sess.ID, sess.Status, sess.PaymentID, sess.StartEnergy)

	if sess.PaymentID == 0 {
		safetyAutoStopWhenPaymentMissing(db, chargePoint, sess.ID, meterPayload, "session.payment_id=0")
		return nil
	}

	applyStopPolicyAutoStopIfNeeded(db, chargePoint, sess, meterPayload, energyWh)

	if err := extendSessionExpiresAtIfNeeded(db, &sess, chargePoint); err != nil {
		vlogln(debugPrefix+"❌ extendSessionExpiresAtIfNeeded error:", err)
	}

	var cab entity.EVCabinet
	if err := db.Where("charge_point = ?", chargePoint).First(&cab).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			vlogln(debugPrefix + "NO EVCabinet with this charge_point -> skip")
			return nil
		}
		logln(debugPrefix+"find EVCabinet error:", err)
		return fmt.Errorf("find EVCabinet by charge_point failed: %w", err)
	}
	vlogf("%sFOUND cabinetID=%d name=%s chargePoint=%s\n",
		debugPrefix, cab.ID, cab.Name, cab.ChargePoint)

	var pay entity.Payment
	if err := db.Preload("EVChargingPayments").First(&pay, sess.PaymentID).Error; err != nil {
		safetyAutoStopWhenPaymentMissing(db, chargePoint, sess.ID, meterPayload, "payment_not_found_or_query_error")
		return nil
	}

	if pay.EVCabinetID == nil {
		vlogln(debugPrefix + "Payment.EVCabinetID is nil -> skip")
		return nil
	}

	logf("%sFOUND paymentID=%d amount=%.2f ref=%s ev_cabinet_id=%d evChargingPayments=%d\n",
		debugPrefix, pay.ID, pay.Amount, pay.ReferenceNumber, *pay.EVCabinetID, len(pay.EVChargingPayments))

	if *pay.EVCabinetID != cab.ID {
		vlogf("%sPayment cabinet mismatch -> payment.ev_cabinet_id=%d แต่ cabinet.id=%d -> SKIP\n",
			debugPrefix, *pay.EVCabinetID, cab.ID)
		return nil
	}

	type PowerItem struct {
		EVchargingID   uint    `json:"evcharging_id"`
		Name           string  `json:"name"`
		PowerKwh       float64 `json:"power_kwh"`
		PowerKwhString string  `json:"power_kwh_str"`
		Price          float64 `json:"price"`
		Percent        float64 `json:"percent"`
		RemainingPower float64 `json:"remaining_power"`
	}

	items := make([]PowerItem, 0, len(pay.EVChargingPayments))

	var totalPowerKwh float64
	for _, it := range pay.EVChargingPayments {
		name := getEVchargingNameByID(db, it.EVchargingID)
		if name == "" {
			name = fmt.Sprintf("EVcharging-%d", it.EVchargingID)
		}

		powerStr := fmt.Sprintf("%.2f", it.Power)
		remStr := fmt.Sprintf("%.2f", it.RemainingPower)
		priceStr := fmt.Sprintf("%.2f", it.Price)
		percentStr := fmt.Sprintf("%.2f", it.Percent)

		powerFloat, _ := strconv.ParseFloat(powerStr, 64)
		remFloat, _ := strconv.ParseFloat(remStr, 64)
		priceFloat, _ := strconv.ParseFloat(priceStr, 64)
		percentFloat, _ := strconv.ParseFloat(percentStr, 64)

		totalPowerKwh += powerFloat

		logf("%sITEM evchargingID=%d name=%s power=%s kWh remaining=%s kWh\n",
			debugPrefix, it.EVchargingID, name, powerStr, remStr)

		items = append(items, PowerItem{
			EVchargingID:   it.EVchargingID,
			Name:           name,
			PowerKwh:       powerFloat,
			PowerKwhString: powerStr,
			Price:          priceFloat,
			Percent:        percentFloat,
			RemainingPower: remFloat,
		})
	}

	startEnergyWh := sess.StartEnergy
	totalPowerWh := totalPowerKwh * 1000.0
	endEnergyWh := startEnergyWh + totalPowerWh

	usedWh := energyWh - startEnergyWh
	if usedWh < 0 {
		usedWh = 0
	}

	var usedPercent float64
	var remainingWh float64
	var remainingPercent float64
	var rawUsedPercent float64

	if totalPowerWh > 0 && startEnergyWh > 0 {
		rawUsedPercent = (usedWh / totalPowerWh) * 100.0

		usedPercent = rawUsedPercent
		if usedPercent < 0 {
			usedPercent = 0
		}
		if usedPercent > 100 {
			usedPercent = 100
		}

		remainingWh = totalPowerWh - usedWh
		if remainingWh < 0 {
			remainingWh = 0
		}

		remainingPercent = 100.0 - usedPercent
		if remainingPercent < 0 {
			remainingPercent = 0
		}
		if remainingPercent > 100 {
			remainingPercent = 100
		}

		usedPercent = math.Round(usedPercent*100) / 100
		remainingPercent = math.Round(remainingPercent*100) / 100
		usedWh = math.Round(usedWh*100) / 100
		totalPowerWh = math.Round(totalPowerWh*100) / 100
		endEnergyWh = math.Round(endEnergyWh*100) / 100
		startEnergyWh = math.Round(startEnergyWh*100) / 100
		remainingWh = math.Round(remainingWh*100) / 100
		totalPowerKwh = math.Round(totalPowerKwh*100) / 100
	} else {
		vlogf("%s⚠️ cannot calculate percent (startEnergyWh=%.2f totalPowerWh=%.2f)\n",
			debugPrefix, startEnergyWh, totalPowerWh)
	}

	logf("%sCALC startEnergyWh=%.2f totalPowerKwh=%.2f(totalWh=%.2f) endEnergyWh=%.2f currentWh=%.2f usedWh=%.2f used%%=%.2f remainingWh=%.2f remaining%%=%.2f\n",
		debugPrefix, startEnergyWh, totalPowerKwh, totalPowerWh, endEnergyWh, energyWh, usedWh, usedPercent, remainingWh, remainingPercent)

	if totalPowerWh > 0 && startEnergyWh > 0 && rawUsedPercent >= 100.0 {
		if markAutoStopped(sess.ID) {
			vlogf("%s🛑 AUTO STOP TRIGGERED (sessionID=%d usedRaw=%.4f%%)\n", debugPrefix, sess.ID, rawUsedPercent)

			txID, hasTx := getTransactionID(chargePoint)
			if !hasTx || txID <= 0 {
				txID = extractTransactionIDFromMeterValues(meterPayload)
			}

			if txID > 0 {
				if err := SendRemoteStopTransaction(chargePoint, txID); err != nil {
					logln(debugPrefix+"❌ AUTO RemoteStop failed:", err)
				} else {
					vlogf("%s✅ AUTO RemoteStop sent (txID=%d)\n", debugPrefix, txID)
					broadcastLogTextToFrontendRoom(chargePoint, fmt.Sprintf(
						"[AUTO-STOP] chargePoint=%s sessionID=%d txID=%d used=%.2f%% -> sent RemoteStop\n",
						chargePoint, sess.ID, txID, usedPercent,
					))
				}
			} else {
				vlogln(debugPrefix + "⚠️ AUTO STOP: txID not found -> skip SendRemoteStopTransaction")
			}

			if err := closeSessionByID(db, sess.ID); err != nil {
				logln(debugPrefix+"❌ closeSessionByID error:", err)
			} else {
				vlogf("%s✅ session closed (EndTime set + status=false) sessionID=%d\n", debugPrefix, sess.ID)
				broadcastLogTextToFrontendRoom(chargePoint, fmt.Sprintf(
					"[SESSION-CLOSED] chargePoint=%s sessionID=%d -> EndTime updated & status=false\n",
					chargePoint, sess.ID,
				))
			}

			resetStopPolicyRuntime(chargePoint)
			clearStopPolicyCache(chargePoint)

			buildAndBroadcastSnapshot(chargePoint, "auto_stop_closed")
		}
	}

	msg := map[string]interface{}{
		"type":        "meter_values_payment_info",
		"chargePoint": chargePoint,

		"meter_values": map[string]interface{}{
			"energy_wh":      energyWh,
			"power_kw":       func() float64 { v, _ := extractPowerActiveImport(meterPayload); return v }(),
			"transaction_id": extractTransactionIDFromMeterValues(meterPayload),
			"timestamp":      extractTimestampFromMeterValues(meterPayload),
		},

		"charging_session": map[string]interface{}{
			"id":           sess.ID,
			"status":       sess.Status,
			"payment_id":   sess.PaymentID,
			"start_energy": startEnergyWh,
		},

		"ev_cabinet": map[string]interface{}{
			"id":          cab.ID,
			"chargePoint": cab.ChargePoint,
			"name":        cab.Name,
		},

		"payment": map[string]interface{}{
			"id":              pay.ID,
			"amount":          pay.Amount,
			"referenceNumber": pay.ReferenceNumber,
			"ev_cabinet_id":   *pay.EVCabinetID,
		},

		"ev_charging_payments": items,

		"calculation": map[string]interface{}{
			"start_energy_wh":   startEnergyWh,
			"total_power_kwh":   totalPowerKwh,
			"total_power_wh":    totalPowerWh,
			"end_energy_wh":     endEnergyWh,
			"current_energy_wh": energyWh,
			"used_wh":           usedWh,
			"used_percent":      usedPercent,
			"remaining_wh":      remainingWh,
			"remaining_percent": remainingPercent,
		},
	}

	b, err := json.Marshal(msg)
	if err != nil {
		logln(debugPrefix+"marshal error:", err)
		return fmt.Errorf("marshal meter_values_payment_info failed: %w", err)
	}

	logf("%sBROADCAST -> room=%s bytes=%d items=%d\n", debugPrefix, chargePoint, len(b), len(items))

	broadcastToFrontendRoom(chargePoint, b)

	vlogf("%s[PERCENT] chargePoint=%s start=%.2fWh total=%.2fWh end=%.2fWh now=%.2fWh used=%.2fWh (%.2f%%) remaining=%.2fWh (%.2f%%)\n",
		debugPrefix, chargePoint, startEnergyWh, totalPowerWh, endEnergyWh, energyWh, usedWh, usedPercent, remainingWh, remainingPercent)

	return nil
}

// ============================================================================
// ✅ Helper: ดึงชื่อ EVcharging (เช่น Solar / Grid)
// ============================================================================

func getEVchargingNameByID(db *gorm.DB, evchargingID uint) string {
	if db == nil || evchargingID == 0 {
		return ""
	}
	type row struct {
		Name string `gorm:"column:name"`
	}
	var r row

	if err := db.Model(&entity.EVcharging{}).
		Select("name").
		Where("id = ?", evchargingID).
		Scan(&r).Error; err != nil {
		return ""
	}
	return r.Name
}

func extractTransactionIDFromMeterValues(payload map[string]interface{}) int {
	if payload == nil {
		return 0
	}
	if v, ok := payload["transactionId"].(float64); ok {
		return int(v)
	}
	if v, ok := payload["transactionId"].(int); ok {
		return v
	}
	return 0
}

func extractTimestampFromMeterValues(payload map[string]interface{}) string {
	meterValuesRaw, ok := payload["meterValue"].([]interface{})
	if !ok || len(meterValuesRaw) == 0 {
		return ""
	}
	mv0, ok := meterValuesRaw[0].(map[string]interface{})
	if !ok {
		return ""
	}
	if ts, ok := mv0["timestamp"].(string); ok {
		return ts
	}
	return ""
}

// ============================================================================
// ✅ API: List Snapshots (GET /ocpp/snapshots)
// ============================================================================

func ListChargerSnapshotsHandler(c *gin.Context) {
	refresh := c.Query("refresh") == "1" || strings.ToLower(c.Query("refresh")) == "true"
	includeDB := c.Query("include_db") == "1" || strings.ToLower(c.Query("include_db")) == "true"

	statusMu.Lock()
	ids := make([]string, 0, len(chargerStatuses))
	for id := range chargerStatuses {
		if id != "" {
			ids = append(ids, id)
		}
	}
	statusMu.Unlock()

	result := make(map[string]ChargerSnapshot, len(ids))

	for _, chargerID := range ids {
		if !refresh {
			if snap, ok := getCachedSnapshot(chargerID); ok {
				result[chargerID] = snap
				continue
			}
		}

		var snap ChargerSnapshot
		if includeDB {
			snap = buildSnapshot(config.DB(), chargerID, "http_list_snapshots")
		} else {
			snap = buildSnapshotMemoryOnly(chargerID, "http_list_snapshots_memory_only")
		}

		cacheSnapshot(chargerID, snap)
		result[chargerID] = snap
	}

	c.JSON(http.StatusOK, gin.H{
		"count":     len(result),
		"snapshots": result,
	})
}

// ============================================================================
// ✅ API: Get Snapshot (GET /ocpp/snapshot/:chargerID)
// ============================================================================

func GetChargerSnapshotHandler(c *gin.Context) {
	chargerID := c.Param("chargerID")
	if chargerID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "chargerID is required"})
		return
	}

	refresh := c.Query("refresh") == "1" || strings.ToLower(c.Query("refresh")) == "true"
	includeDB := c.Query("include_db") == "1" || strings.ToLower(c.Query("include_db")) == "true"

	if !refresh {
		if snap, ok := getCachedSnapshot(chargerID); ok {
			c.JSON(http.StatusOK, gin.H{
				"source":   "cache",
				"snapshot": snap,
			})
			return
		}
	}

	var snap ChargerSnapshot
	if includeDB {
		snap = buildSnapshot(config.DB(), chargerID, "http_get_snapshot")
	} else {
		snap = buildSnapshotMemoryOnly(chargerID, "http_get_snapshot_memory_only")
	}

	cacheSnapshot(chargerID, snap)

	c.JSON(http.StatusOK, gin.H{
		"source":   "fresh",
		"snapshot": snap,
	})
}

// ============================================================================
// ✅ NEW: SNAPSHOT (MEMORY-ONLY) — ไม่แตะ DB เลย
// ============================================================================

func buildSnapshotMemoryOnly(chargerID string, reason string) ChargerSnapshot {
	seq := nextSnapshotSeq(chargerID)

	statusMu.Lock()
	st, ok := chargerStatuses[chargerID]
	statusMu.Unlock()
	if !ok {
		st = ChargerStatus{ChargerID: chargerID}
	}

	txID, _ := getTransactionID(chargerID)

	meter, hasMeter := getLastMeter(chargerID)
	if !hasMeter {
		meter = MeterSnapshot{EnergyWh: 0, PowerKW: 0, TransactionID: 0, Timestamp: ""}
	}
	if txID > 0 {
		meter.TransactionID = txID
	}

	snap := ChargerSnapshot{
		Type:        "charger_snapshot",
		ChargerID:   chargerID,
		ConnectorID: st.ConnectorID,
		Seq:         seq,
		Timestamp:   nowOcppTime(),
		Reason:      reason,

		Status:        st.Status,
		ErrorCode:     st.ErrorCode,
		Connected:     st.Connected,
		LastHeartbeat: st.LastHeartbeat.UTC().Format(time.RFC3339),

		ActiveTransactionID: txID,
		Meter:               meter,
	}

	return snap
}

func refreshStopPolicyCacheIfNeeded(db *gorm.DB, chargePoint string, force bool) (StopPolicyCache, bool) {
	if db == nil {
		db = config.DB()
	}
	if chargePoint == "" {
		return StopPolicyCache{}, false
	}

	if !force {
		if c, ok := getCachedStopPolicy(chargePoint); ok {
			return c, true
		}
	}

	var cab entity.EVCabinet
	if err := db.Select("id", "charge_point", "stop_policy").
		Where("charge_point = ?", chargePoint).
		First(&cab).Error; err != nil {
		return StopPolicyCache{}, false
	}

	cacheStopPolicyForChargePoint(chargePoint, cab.ID, cab.StopPolicy)

	c, _ := getCachedStopPolicy(chargePoint)
	return c, true
}
