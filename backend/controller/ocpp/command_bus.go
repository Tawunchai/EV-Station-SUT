/* ==== FULL FILE: package ocpp (command_bus.go) ==== */
package ocpp

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/redis/go-redis/v9"
)

// ============================================================================
// ✅ MULTI-INSTANCE COMMAND BUS (Redis Pub/Sub) — SAFE MODE
// - ไม่กระทบระบบเดิม ถ้าไม่ได้ตั้งค่า Redis
// - ถ้าตั้งค่า Redis แล้ว: HTTP ไป instance ไหนก็ได้ แต่คำสั่งจะถูกส่งไป instance ที่ถือ WS
// ============================================================================

// Channel สำหรับคำสั่ง OCPP
const ocppCmdChannel = "ocpp:commands:v1"

type OcppCommand struct {
	Type        string `json:"type"` // "remote_start" | "remote_stop"
	ChargerID   string `json:"chargerId"`
	ConnectorID int    `json:"connectorId,omitempty"`
	IdTag       string `json:"idTag,omitempty"`
	TxID        int    `json:"txId,omitempty"`
	RequestID   string `json:"requestId,omitempty"`
	Timestamp   string `json:"timestamp"`
}

var (
	busOnce sync.Once

	busClient   *redis.Client
	busSub      *redis.PubSub
	busEnabled  bool
	busInstance string

	busStarted uint32 // 1 = started (ready), 0 = not ready

	busErrMu  sync.Mutex
	lastBusErr string
)

// ✅ Auto-start แบบ safe: ถ้าไม่ได้ตั้ง OCPP_REDIS_ADDR -> ไม่ทำอะไรเลย
func init() {
	StartOcppCommandBusSafe()
}

// ----------------------------------------------------------------------------
// ENV helpers
// ----------------------------------------------------------------------------

// - OCPP_REDIS_ADDR=host:6379  (ถ้าไม่ตั้ง = ปิด bus)
// - OCPP_REDIS_PASSWORD=...    (optional)
// - OCPP_REDIS_DB=0            (optional)
// - OCPP_REDIS_TLS=true/1      (optional)
// - OCPP_BUS_INSTANCE=api-1    (optional)

func isBusEnabled() bool {
	addr := strings.TrimSpace(os.Getenv("OCPP_REDIS_ADDR"))
	return addr != ""
}

func getBusInstanceName() string {
	v := strings.TrimSpace(os.Getenv("OCPP_BUS_INSTANCE"))
	if v == "" {
		return fmt.Sprintf("instance-%d", os.Getpid())
	}
	return v
}

func getRedisAddr() string { return strings.TrimSpace(os.Getenv("OCPP_REDIS_ADDR")) }

func getRedisPassword() string { return strings.TrimSpace(os.Getenv("OCPP_REDIS_PASSWORD")) }

func getRedisDB() int {
	v := strings.TrimSpace(os.Getenv("OCPP_REDIS_DB"))
	if v == "" {
		return 0
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		return 0
	}
	return n
}

func getRedisTLS() bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv("OCPP_REDIS_TLS")))
	return v == "1" || v == "true" || v == "yes" || v == "on"
}

func setBusErr(err error) {
	busErrMu.Lock()
	defer busErrMu.Unlock()
	if err == nil {
		lastBusErr = ""
		return
	}
	lastBusErr = err.Error()
}

func getBusErr() string {
	busErrMu.Lock()
	defer busErrMu.Unlock()
	return lastBusErr
}

func initBusClient() *redis.Client {
	addr := getRedisAddr()
	if addr == "" {
		return nil
	}

	opt := &redis.Options{
		Addr:     addr,
		Password: getRedisPassword(),
		DB:       getRedisDB(),
	}

	if getRedisTLS() {
		opt.TLSConfig = &tls.Config{MinVersion: tls.VersionTLS12}
	}

	return redis.NewClient(opt)
}

// ----------------------------------------------------------------------------
// Public helpers
// ----------------------------------------------------------------------------

func BusInstance() string {
	if busInstance == "" {
		busInstance = getBusInstanceName()
	}
	return busInstance
}

// IsBusReady: ให้ handler เช็คได้
func IsBusReady() bool {
	return busEnabled && busClient != nil && atomic.LoadUint32(&busStarted) == 1
}

func BusLastError() string { return getBusErr() }

// ----------------------------------------------------------------------------
// Start bus
// ----------------------------------------------------------------------------

// StartOcppCommandBusSafe:
// ✅ เรียกครั้งเดียวตอน start server
// - ถ้าไม่ได้ตั้ง OCPP_REDIS_ADDR -> ไม่ทำอะไร (ไม่กระทบระบบเดิม)
func StartOcppCommandBusSafe() {
	busOnce.Do(func() {
		busEnabled = isBusEnabled()
		busInstance = getBusInstanceName()

		if !busEnabled {
			logln("🚌 [CMD-BUS] disabled (OCPP_REDIS_ADDR not set) -> fallback to single-instance behavior")
			setBusErr(nil)
			return
		}

		cli := initBusClient()
		if cli == nil {
			logln("🚌 [CMD-BUS] disabled (redis client nil) -> fallback")
			setBusErr(fmt.Errorf("redis client nil"))
			return
		}

		// ping ตรวจเบื้องต้น
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		if err := cli.Ping(ctx).Err(); err != nil {
			logln("🚌 [CMD-BUS] disabled (redis ping failed):", err)
			setBusErr(err)
			return
		}

		// subscribe
		sub := cli.Subscribe(context.Background(), ocppCmdChannel)
		// wait for subscribe ack (กัน subscribe เงียบ)
		ctx2, cancel2 := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel2()
		if _, err := sub.Receive(ctx2); err != nil {
			logln("🚌 [CMD-BUS] disabled (redis subscribe failed):", err)
			setBusErr(err)
			_ = sub.Close()
			return
		}

		busClient = cli
		busSub = sub
		atomic.StoreUint32(&busStarted, 1)
		setBusErr(nil)

		logf("🚌 [CMD-BUS] started instance=%s redis=%s db=%d tls=%v channel=%s\n",
			busInstance, getRedisAddr(), getRedisDB(), getRedisTLS(), ocppCmdChannel)

		go func() {
			ch := busSub.Channel()

			for m := range ch {
				var cmd OcppCommand
				if err := json.Unmarshal([]byte(m.Payload), &cmd); err != nil {
					logln("🚌 [CMD-BUS] unmarshal error:", err)
					continue
				}

				// ✅ เฉพาะ instance ที่ "ถือ WS ของ chargerId" เท่านั้นที่จะทำงานจริง
				chargersMu.Lock()
				_, ok := chargers[cmd.ChargerID]
				chargersMu.Unlock()
				if !ok {
					continue
				}

				switch cmd.Type {
				case "remote_start":
					if cmd.ConnectorID <= 0 {
						cmd.ConnectorID = 1
					}
					if strings.TrimSpace(cmd.IdTag) == "" {
						cmd.IdTag = "EV-SIM-001"
					}

					err := SendRemoteStartTransaction(cmd.ChargerID, cmd.ConnectorID, cmd.IdTag)
					if err != nil {
						logf("🚌 [CMD-BUS] remote_start FAILED instance=%s charger=%s req=%s err=%v\n",
							busInstance, cmd.ChargerID, cmd.RequestID, err)
					} else {
						logf("🚌 [CMD-BUS] remote_start OK instance=%s charger=%s req=%s\n",
							busInstance, cmd.ChargerID, cmd.RequestID)
					}

				case "remote_stop":
					if cmd.TxID <= 0 {
						logf("🚌 [CMD-BUS] remote_stop SKIP instance=%s charger=%s req=%s reason=txId<=0\n",
							busInstance, cmd.ChargerID, cmd.RequestID)
						continue
					}

					err := SendRemoteStopTransaction(cmd.ChargerID, cmd.TxID)
					if err != nil {
						logf("🚌 [CMD-BUS] remote_stop FAILED instance=%s charger=%s req=%s err=%v\n",
							busInstance, cmd.ChargerID, cmd.RequestID, err)
					} else {
						logf("🚌 [CMD-BUS] remote_stop OK instance=%s charger=%s req=%s\n",
							busInstance, cmd.ChargerID, cmd.RequestID)
					}

				default:
					// ignore unknown
				}
			}

			// ถ้าออกจาก loop แปลว่า sub ปิด/หลุด
			atomic.StoreUint32(&busStarted, 0)
			setBusErr(fmt.Errorf("bus subscription closed"))
			logln("🚌 [CMD-BUS] subscription closed -> bus not ready")
		}()
	})
}

// BusPublish:
// ✅ ส่งคำสั่งเข้า Redis เพื่อให้ instance ที่ถือ WS ไปยิง OCPP ให้แทน
// - ถ้า bus ไม่พร้อม -> return error เพื่อ handler fallback เป็น behavior เดิม
func BusPublish(cmd OcppCommand) error {
	if !IsBusReady() {
		if e := BusLastError(); e != "" {
			return fmt.Errorf("cmd-bus not ready: %s", e)
		}
		return fmt.Errorf("cmd-bus disabled or not ready")
	}
	if strings.TrimSpace(cmd.ChargerID) == "" {
		return fmt.Errorf("chargerId is required")
	}
	if strings.TrimSpace(cmd.Type) == "" {
		return fmt.Errorf("type is required")
	}
	if cmd.Timestamp == "" {
		cmd.Timestamp = nowOcppTime()
	}
	if cmd.RequestID == "" {
		cmd.RequestID = fmt.Sprintf("cmd-%d", time.Now().UnixNano())
	}

	b, _ := json.Marshal(cmd)
	return busClient.Publish(context.Background(), ocppCmdChannel, b).Err()
}
