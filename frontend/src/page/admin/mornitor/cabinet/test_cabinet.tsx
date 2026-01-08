import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FiClock,
  FiBatteryCharging,
  FiPower,
  FiWifi,
  FiArrowDown,
} from "react-icons/fi";
import { BsLightningChargeFill } from "react-icons/bs";
import { useNavigate } from "react-router-dom";

type ConnectorStatus =
  | "Available"
  | "Preparing"
  | "Charging"
  | "SuspendedEV"
  | "Finishing"
  | "Faulted"
  | "Unavailable";

type ConnectorState = {
  status: ConnectorStatus;
  soc: number; // battery %
  isPluggedIn: boolean;
  isLocked: boolean;
  powerKw: number;
  energyKWh: number;
  startedAt: number | null;
  transactionId: number | null;
  meterWh: number;
};

type OcppRawMessage = [number, string, ...any[]];

const initialConnectorState: ConnectorState = {
  status: "Available",
  soc: 0,
  isPluggedIn: false,
  isLocked: false,
  powerKw: 0,
  energyKWh: 0,
  startedAt: null,
  transactionId: null,
  meterWh: 0,
};

const TestCabinet: React.FC = () => {
  const navigate = useNavigate();

  /** ---------- WebSocket State ---------- */
  const [wsUrl, setWsUrl] = useState<string>(""); // ✅ ให้ user ใส่เอง 100%
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  /** ---------- Connector State (Port 1) ---------- */
  const [connector, setConnector] =
    useState<ConnectorState>(initialConnectorState);
  const connectorRef = useRef<ConnectorState>(initialConnectorState);

  // heartbeat & meter loop
  const heartbeatIntervalRef = useRef<number | null>(null);
  const meterIntervalRef = useRef<number | null>(null);

  // ref สำหรับ scroll ไป log ล่าสุด
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  /** ---------- Helpers ---------- */
  const appendLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => {
      const next = [...prev, `${time} ${msg}`];
      if (next.length > 150) next.shift();
      return next;
    });
  };

  const generateUUID = () => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  };

  const updateConnector = (updater: (prev: ConnectorState) => ConnectorState) => {
    setConnector((prev) => {
      const next = updater(prev);
      connectorRef.current = next;
      return next;
    });
  };

  const sendOcppMessage = (payload: any[]) => {
    const ws = socketRef.current;
    const json = JSON.stringify(payload);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(json);
      appendLog(`[SENT] ${json}`);
    } else {
      appendLog("[ERROR] WebSocket not connected");
    }
  };

  /** ---------- OCPP Basic Messages ---------- */
  const sendBootNotification = () => {
    const msg: OcppRawMessage = [
      2,
      generateUUID(),
      "BootNotification",
      {
        chargePointModel: "EV-Dashboard-01",
        chargePointVendor: "EVStation",
      },
    ];
    appendLog("[SYSTEM] Sending BootNotification");
    sendOcppMessage(msg);
  };

  const sendHeartbeat = () => {
    const msg: OcppRawMessage = [2, generateUUID(), "Heartbeat", {}];
    sendOcppMessage(msg);
  };

  const sendStatusNotification = (
    status: ConnectorStatus,
    errorCode: string = "NoError"
  ) => {
    const msg: OcppRawMessage = [
      2,
      generateUUID(),
      "StatusNotification",
      {
        connectorId: 1,
        errorCode,
        status,
        timestamp: new Date().toISOString(),
      },
    ];
    appendLog(`[SYSTEM] StatusNotification → ${status}`);
    sendOcppMessage(msg);
    updateConnector((prev) => ({ ...prev, status }));
  };

  /** ---------- Meter Values Loop ---------- */
  const stopMeterLoop = () => {
    if (meterIntervalRef.current !== null) {
      window.clearInterval(meterIntervalRef.current);
      meterIntervalRef.current = null;
      appendLog("[SYSTEM] MeterValues loop stopped");
    }
  };

  const sendMeterValues = () => {
    const state = connectorRef.current;

    if (!state.transactionId) {
      appendLog(
        "[SYSTEM] No active transaction. Stopping MeterValues loop."
      );
      stopMeterLoop();
      return;
    }

    if (state.status === "Charging" && state.soc < 100) {
      const nextSoc = Math.min(100, state.soc + 2); // +2% / รอบ
      const nextMeterWh = state.meterWh + 100; // +100Wh / รอบ
      const nextEnergyKWh = state.energyKWh + 0.1; // สมมุติ 0.1kWh / รอบ

      updateConnector((prev) => ({
        ...prev,
        soc: nextSoc,
        meterWh: nextMeterWh,
        energyKWh: nextEnergyKWh,
        powerKw: nextEnergyKWh, // ผูก Output Power = Energy
      }));

      if (nextSoc < 100) {
        const msg: OcppRawMessage = [
          2,
          generateUUID(),
          "MeterValues",
          {
            connectorId: 1,
            transactionId: state.transactionId,
            meterValue: [
              {
                timestamp: new Date().toISOString(),
                sampledValue: [
                  {
                    value: nextMeterWh,
                    context: "Sample.Periodic",
                    measurand: "Energy.Active.Import.Register",
                    unit: "Wh",
                  },
                ],
              },
            ],
          },
        ];
        sendOcppMessage(msg);
      }
    } else if (state.soc >= 100 && state.status === "Charging") {
      appendLog(
        "[SYSTEM] Battery full (100%), simulating transition to SuspendedEV."
      );
      sendStatusNotification("SuspendedEV");
      return;
    } else if (state.status !== "Charging") {
      appendLog(
        "[SYSTEM] Status changed from Charging. Stopping MeterValues loop."
      );
      stopMeterLoop();
      return;
    }
  };

  const startMeterLoop = () => {
    stopMeterLoop();
    appendLog(
      "[SYSTEM] MeterValues loop started (simulate SoC & energy every 2s)"
    );

    meterIntervalRef.current = window.setInterval(() => {
      sendMeterValues();
    }, 15000);
  };

  /** ---------- Connect / Disconnect ---------- */
  const clearAllIntervals = () => {
    if (heartbeatIntervalRef.current !== null) {
      window.clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    stopMeterLoop();
  };

  const handleConnect = () => {
    if (!wsUrl) {
      appendLog("[ERROR] WebSocket URL is empty");
      return;
    }

    try {
      if (socketRef.current) {
        socketRef.current.close();
      }

      const ws = new WebSocket(wsUrl, "ocpp1.6");
      socketRef.current = ws;
      appendLog(`[SYSTEM] Connecting to ${wsUrl} ...`);

      ws.onopen = () => {
        setIsConnected(true);
        appendLog("[SYSTEM] WebSocket connected");
        sendBootNotification();
      };

      ws.onclose = () => {
        setIsConnected(false);
        appendLog("[SYSTEM] WebSocket disconnected");
        clearAllIntervals();
        updateConnector(() => ({
          ...initialConnectorState,
        }));
      };

      ws.onerror = () => {
        appendLog("[ERROR] WebSocket error");
      };

      ws.onmessage = (event) => {
        appendLog(`[RECV] ${event.data}`);

        let msg: any;
        try {
          msg = JSON.parse(event.data);
        } catch {
          // ถ้าเป็นข้อความธรรมดา (เช่น "ready") ก็ข้าม
          return;
        }

        if (!Array.isArray(msg) || msg.length < 3) return;

        const [messageTypeId] = msg;

        if (messageTypeId === 3) {
          const [, , payload] = msg as OcppRawMessage;
          handleCallResult(payload);
        } else if (messageTypeId === 2) {
          const [, messageId, action, payload] = msg as OcppRawMessage;
          handleCall(messageId, action as string, payload);
        }
      };
    } catch (err) {
      console.error(err);
      appendLog("[ERROR] Failed to open WebSocket");
    }
  };

  const handleDisconnect = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  };

  /** ---------- CALLRESULT Handler ---------- */
  const handleCallResult = (payload: any) => {
    if (!payload || typeof payload !== "object") return;

    // BootNotification.conf
    if ("status" in payload && "interval" in payload) {
      if (payload.status === "Accepted") {
        const intervalSec = payload.interval || 300;
        appendLog(
          `[SYSTEM] BootNotification accepted. Start Heartbeat every ${intervalSec}s`
        );

        if (heartbeatIntervalRef.current !== null) {
          window.clearInterval(heartbeatIntervalRef.current);
        }
        heartbeatIntervalRef.current = window.setInterval(
          sendHeartbeat,
          intervalSec * 1000
        );

        setTimeout(() => sendStatusNotification("Available"), 500);
      } else {
        appendLog(
          "[SYSTEM] BootNotification rejected. Please check configuration."
        );
      }
    }

    // StartTransaction.conf
    if ("transactionId" in payload) {
      const txId = payload.transactionId as number;
      appendLog(
        `[SYSTEM] StartTransaction accepted. Tx ID = ${txId} (Connector 1)`
      );

      updateConnector((prev) => {
        const baseSoc =
          prev.soc > 0 ? prev.soc : Math.floor(Math.random() * 10) + 20;
        const next: ConnectorState = {
          ...prev,
          transactionId: txId,
          status: "Charging",
          powerKw: 0,
          energyKWh: 0,
          soc: baseSoc,
          startedAt: Date.now(),
        };
        return next;
      });

      sendStatusNotification("Charging");
      startMeterLoop();
    }

    // StopTransaction.conf → ใช้ตอน status เป็น Finishing
    if ("idTagInfo" in payload) {
      const current = connectorRef.current;
      if (current.status !== "Finishing") {
        appendLog(
          "[SYSTEM] StopTransaction.conf received but status is not Finishing → ignore"
        );
        return;
      }

      appendLog("[SYSTEM] StopTransaction confirmed.");

      updateConnector((prev) => {
        const nextStatus = prev.isPluggedIn ? "Preparing" : "Available";
        const next: ConnectorState = {
          ...prev,
          status: nextStatus,
          transactionId: null,
          powerKw: 0,
          soc: 0,
          energyKWh: 0,
          meterWh: 0,
          startedAt: null,
        };
        return next;
      });

      stopMeterLoop();
      const latest = connectorRef.current;
      sendStatusNotification(latest.isPluggedIn ? "Preparing" : "Available");
    }
  };

  /** ---------- CALL Handler ---------- */
  const handleCall = (messageId: string, action: string, payload: any) => {
    appendLog(
      `[SYSTEM] Received CALL from Server: ${action} / ได้รับ CALL จากเซิร์ฟเวอร์: ${action}`
    );

    let responsePayload: any = {};

    switch (action) {
      case "RemoteStartTransaction": {
        const connectorId = payload?.connectorId ?? 1;
        appendLog(
          `[SYSTEM] RemoteStartTransaction requested for Connector ${connectorId}.`
        );

        if (connectorId === 1) {
          responsePayload = { status: "Accepted" };

          setTimeout(() => {
            updateConnector((prev) => ({
              ...prev,
              isPluggedIn: true,
            }));
            appendLog("[SYSTEM] EV plugged in (simulated by RemoteStart).");
            sendStatusNotification("Preparing");
            setTimeout(() => {
              sendStartTransaction();
            }, 1000);
          }, 500);
        } else {
          responsePayload = { status: "Rejected" };
        }
        break;
      }

      case "RemoteStopTransaction": {
        const txId = payload?.transactionId;
        appendLog(
          `[SYSTEM] RemoteStopTransaction requested for TxID ${txId}.`
        );
        if (connectorRef.current.transactionId === txId) {
          responsePayload = { status: "Accepted" };

          stopMeterLoop();
          setTimeout(() => {
            sendStatusNotification("Finishing");
            setTimeout(() => sendStopTransaction(), 800);
          }, 400);
        } else {
          responsePayload = { status: "Rejected" };
        }
        break;
      }

      case "ChangeAvailability": {
        const type = payload?.type;
        const connectorId = payload?.connectorId ?? 1;
        appendLog(
          `[SYSTEM] ChangeAvailability for Connector ${connectorId} to ${type}.`
        );
        responsePayload = { status: "Accepted" };
        setTimeout(() => {
          const newStatus: ConnectorStatus =
            type === "Operative" ? "Available" : "Unavailable";
          sendStatusNotification(newStatus);
        }, 500);
        break;
      }

      case "GetConfiguration": {
        responsePayload = { configurationKey: [], unknownKey: [] };
        break;
      }

      default: {
        appendLog(`[SYSTEM] Unsupported Action: ${action}`);
        responsePayload = { status: "NotImplemented" };
      }
    }

    const responseMsg: OcppRawMessage = [3, messageId, responsePayload];
    sendOcppMessage(responseMsg);
  };

  /** ---------- Local Start/Stop Transaction (Buttons) ---------- */
  const sendStartTransaction = () => {
    const state = connectorRef.current;
    if (state.transactionId) {
      appendLog("[ERROR] StartTransaction: already active");
      return;
    }
    const msg: OcppRawMessage = [
      2,
      generateUUID(),
      "StartTransaction",
      {
        connectorId: 1,
        idTag: "EV-SIM-001",
        meterStart: state.meterWh,
        timestamp: new Date().toISOString(),
      },
    ];
    sendOcppMessage(msg);
    appendLog("[SYSTEM] Request StartTransaction (local)");
  };

  const sendStopTransaction = () => {
    const state = connectorRef.current;
    if (!state.transactionId) {
      appendLog("[ERROR] No active transaction to stop");
      return;
    }

    stopMeterLoop();

    const msg: OcppRawMessage = [
      2,
      generateUUID(),
      "StopTransaction",
      {
        transactionId: state.transactionId,
        meterStop: state.meterWh,
        timestamp: new Date().toISOString(),
      },
    ];
    sendOcppMessage(msg);
    appendLog("[SYSTEM] Request StopTransaction (local)");
  };

  /** ---------- Button Handlers (UI) ---------- */
  const handleTogglePlug = () => {
    const state = connectorRef.current;
    const plugIn = !state.isPluggedIn;

    if (plugIn) {
      appendLog("[SYSTEM] EV: Plugged in / เสียบปลั๊กเชื่อมต่อแล้ว");
      updateConnector((prev) => ({
        ...prev,
        isPluggedIn: true,
      }));
      if (state.status === "Available") {
        sendStatusNotification("Preparing");
      }
    } else {
      appendLog("[SYSTEM] EV: Unplugged / ดึงปลั๊กออกแล้ว");

      if (state.transactionId) {
        appendLog(
          "[SYSTEM] Unplug while charging, forcing StopTransaction (Finishing)."
        );
        stopMeterLoop();
        sendStatusNotification("Finishing");
        setTimeout(() => sendStopTransaction(), 500);
      } else {
        sendStatusNotification("Available");
      }

      updateConnector((prev) => ({
        ...prev,
        isPluggedIn: false,
        transactionId: null,
        powerKw: 0,
        soc: 0,
        energyKWh: 0,
        meterWh: 0,
        startedAt: null,
        status: "Available",
      }));
    }
  };

  const handleToggleLock = () => {
    updateConnector((prev) => {
      const locked = !prev.isLocked;
      appendLog(
        locked
          ? "[SYSTEM] EV: Locked / ล็อกรถแล้ว"
          : "[SYSTEM] EV: Unlocked / ปลดล็อกรถแล้ว"
      );
      return { ...prev, isLocked: locked };
    });
  };

  const handleRequestStart = () => {
    const state = connectorRef.current;
    if (!state.isPluggedIn) {
      appendLog("[ERROR] Cannot start: EV not plugged in");
      return;
    }
    if (state.isLocked) {
      appendLog("[ERROR] Cannot start: EV is locked");
      return;
    }
    if (state.transactionId) {
      appendLog("[ERROR] Session already active");
      return;
    }

    appendLog("[SYSTEM] Requesting StartTransaction from local button");
    sendStartTransaction();
  };

  const handleRequestStop = () => {
    const state = connectorRef.current;
    if (!state.transactionId) {
      appendLog("[ERROR] No active transaction to stop");
      return;
    }
    appendLog("[SYSTEM] Requesting StopTransaction from local button");
    sendStatusNotification("Finishing");
    stopMeterLoop();
    setTimeout(() => sendStopTransaction(), 500);

    updateConnector((prev) => ({
      ...prev,
      powerKw: 0,
    }));
  };

  const canStart =
    connector.isPluggedIn &&
    !connector.isLocked &&
    !connector.transactionId &&
    (connector.status === "Preparing" || connector.status === "Available");

  const canStop =
    !!connector.transactionId &&
    (connector.status === "Charging" ||
      connector.status === "SuspendedEV" ||
      connector.status === "Finishing");

  /** ---------- Derived UI Values ---------- */
  const durationMinutes = useMemo(() => {
    if (!connector.startedAt || !connector.transactionId) return 0;
    const now = Date.now();
    return Math.max(0, Math.floor((now - connector.startedAt) / 60000));
  }, [connector.startedAt, connector.transactionId, connector.soc]);

  const outerRadius = 76;
  const innerRadius = 62;
  const outerCircumference = 2 * Math.PI * outerRadius;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const outerOffset =
    outerCircumference - (connector.soc / 100) * outerCircumference || 0;
  const innerOffset =
    innerCircumference - (connector.soc / 100) * innerCircumference || 0;

  const evseStatusColor =
    connector.status === "Charging"
      ? "text-emerald-500"
      : connector.status === "Available"
        ? "text-sky-600"
        : connector.status === "SuspendedEV"
          ? "text-orange-500"
          : connector.status === "Faulted"
            ? "text-red-500"
            : "text-slate-600";

  const thaiStatusMap: Record<ConnectorStatus, string> = {
    Available: "พร้อมใช้งาน",
    Preparing: "กำลังเตรียม",
    Charging: "กำลังชาร์จ",
    SuspendedEV: "ระงับโดย EV",
    Finishing: "กำลังเสร็จสิ้น",
    Faulted: "มีข้อผิดพลาด",
    Unavailable: "ไม่พร้อมใช้งาน",
  };

  const totalEnergyDisplay = connector.energyKWh;
  const solarEnergyDisplay = totalEnergyDisplay * 0.4;
  const gridEnergyDisplay = totalEnergyDisplay * 0.6;

  /** ---------- Cleanup ---------- */
  useEffect(() => {
    return () => {
      clearAllIntervals();
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ---------- Render ---------- */
  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-900 mt-14 sm:mt-0">
      {/* Header แถบฟ้าเล็ก + ปุ่ม Back + ชื่อหน้า TEST OCPP */}
      <header className="sticky top-0 z-20 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center rounded-lg bg-white/95 px-3 py-1.5 text-xs sm:text-sm font-semibold text-blue-600 shadow-sm hover:bg-white"
            >
              ← Back
            </button>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide opacity-90">
                TEST OCPP Cabinet
              </span>
              <span className="text-xs sm:text-sm font-semibold">
                Manual WebSocket Tester
              </span>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-blue-50">
            <FiWifi
              className={isConnected ? "text-emerald-300" : "text-blue-200"}
            />
            {isConnected ? "Connected" : "Not connected"}
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-20 space-y-5">
        {/* Connection Bar */}
        <section className="rounded-2xl bg-white shadow-sm border border-sky-100 p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex-1">
              <p className="text-xs sm:text-sm text-slate-500 mb-1">
                WebSocket URL
              </p>
              <input
                value={wsUrl}
                onChange={(e) => setWsUrl(e.target.value)}
                className="w-full text-xs sm:text-sm rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400"
                placeholder="ws://192.168.x.x:8000/ocpp/CP_1 หรือ wss://your-domain/ocpp/CP_1"
              />
              <p className="mt-1 text-[11px] text-slate-400">
                ใส่ WebSocket URL ของ OCPP Server ที่ต้องการทดสอบเองได้เลย
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleConnect}
                disabled={isConnected}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold flex items-center gap-2 ${isConnected
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-sky-600 hover:bg-sky-500 text-white shadow-sm"
                  }`}
              >
                <FiWifi />
                Connect
              </button>
              <button
                onClick={handleDisconnect}
                disabled={!isConnected}
                className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold ${!isConnected
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-rose-500 hover:bg-rose-400 text-white shadow-sm"
                  }`}
              >
                Disconnect
              </button>
            </div>
          </div>
        </section>

        {/* SoC + EV Status Panel */}
        <section>
          <div className="rounded-2xl bg-white shadow-sm border border-sky-100 p-5 sm:p-6 flex flex-col lg:flex-row gap-5">
            {/* Gauge */}
            <div className="flex-1 flex flex-col items-center justify-center">
              <p className="text-xs sm:text-sm text-slate-500 mb-1">
                SoC Status <span className="text-[11px]">(สถานะแบตเตอรี่)</span>
              </p>
              <div className="relative w-40 h-40 sm:w-52 sm:h-52">
                <svg
                  viewBox="0 0 200 200"
                  className="w-full h-full"
                  aria-label="State of Charge"
                >
                  {/* Track วงนอก (Grid) */}
                  <circle
                    cx="100"
                    cy="100"
                    r={outerRadius}
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth="10"
                  />
                  {/* Track วงใน (Solar) */}
                  <circle
                    cx="100"
                    cy="100"
                    r={innerRadius}
                    fill="none"
                    stroke="#E2E8F0"
                    strokeWidth="10"
                  />

                  {/* วงนอก Grid */}
                  <circle
                    cx="100"
                    cy="100"
                    r={outerRadius}
                    fill="none"
                    stroke="url(#gridGrad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={outerCircumference}
                    strokeDashoffset={outerOffset}
                    transform="rotate(-90 100 100)"
                    className="transition-all duration-500"
                  />

                  {/* วงใน Solar */}
                  <circle
                    cx="100"
                    cy="100"
                    r={innerRadius}
                    fill="none"
                    stroke="url(#solarGrad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={innerCircumference}
                    strokeDashoffset={innerOffset}
                    transform="rotate(-90 100 100)"
                    className="transition-all duration-500"
                  />

                  <defs>
                    <linearGradient
                      id="gridGrad"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      <stop offset="0%" stopColor="#0ea5e9" />
                      <stop offset="50%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#0369a1" />
                    </linearGradient>
                    <linearGradient
                      id="solarGrad"
                      x1="0"
                      y1="0"
                      x2="1"
                      y2="0"
                    >
                      {/* ส้มอ่อน → ส้มกลาง → ส้มเข้ม */}
                      <stop offset="0%" stopColor="#fed7aa" />   {/* orange-200 */}
                      <stop offset="50%" stopColor="#fb923c" />  {/* orange-400 */}
                      <stop offset="100%" stopColor="#ea580c" /> {/* orange-600 */}
                    </linearGradient>
                  </defs>

                  {/* วงกลมพื้นกลาง */}
                  <circle cx="100" cy="100" r={48} fill="#F8FAFC" />

                  {/* ตัวเลข % */}
                  <text
                    x="50%"
                    y="50%"
                    dominantBaseline="middle"
                    textAnchor="middle"
                    className="text-3xl sm:text-4xl font-extrabold"
                    fill="#0f172a"
                  >
                    {connector.soc.toString().padStart(2, "0")}%
                  </text>
                </svg>
              </div>

              {/* Energy Info */}
              <p className="mt-2 text-xs text-slate-500">
                Energy delivered:{" "}
                <span className="font-semibold text-black">
                  {connector.energyKWh.toFixed(1)} kWh
                </span>
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                Solar:{" "}
                <span className="font-semibold text-emerald-600">
                  {solarEnergyDisplay.toFixed(1)} kWh
                </span>{" "}
                · Grid:{" "}
                <span className="font-semibold text-sky-700">
                  {gridEnergyDisplay.toFixed(1)} kWh
                </span>
              </p>
            </div>

            {/* Right Status + Buttons */}
            <div className="flex-1 flex flex-col gap-4 justify-between">
              {/* EVSE Status */}
              <div>
                <p className="text-xs sm:text-sm text-slate-500 mb-1">
                  EVSE Status
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center">
                    <BsLightningChargeFill className="text-sky-600 text-xl" />
                  </div>
                  <div>
                    <p
                      className={`text-sm sm:text-base font-semibold ${evseStatusColor}`}
                    >
                      {connector.status}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {thaiStatusMap[connector.status]}
                    </p>
                  </div>
                </div>
              </div>

              {/* Plug + Lock */}
              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="rounded-xl border border-sky-50 bg-sky-50 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-white border border-sky-100 flex items-center justify-center">
                      <FiBatteryCharging className="text-sky-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {connector.isPluggedIn ? "Plugged In" : "Not plugged"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {connector.isPluggedIn
                          ? "เสียบปลั๊กแล้ว"
                          : "ยังไม่เสียบปลั๊ก"}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-50 bg-emerald-50 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-white border border-emerald-100 flex items-center justify-center">
                      <FiPower
                        className={
                          connector.isLocked ? "text-rose-500" : "text-emerald-500"
                        }
                      />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">
                        {connector.isLocked ? "Locked" : "Unlocked"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {connector.isLocked ? "ล็อกรถ" : "ปลดล็อกรถ"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Power + Duration */}
              <div className="grid grid-cols-2 gap-3 text-xs sm:text-sm">
                <div className="rounded-xl border border-sky-50 bg-sky-50 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500">Output Power</p>
                    <p className="font-semibold text-sky-700">
                      {connector.powerKw.toFixed(1)} kW
                    </p>
                  </div>
                  <FiBatteryCharging className="text-sky-500 text-lg" />
                </div>
                <div className="rounded-xl border border-sky-50 bg-sky-50 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500">Duration</p>
                    <p className="font-semibold text-sky-700">
                      {connector.transactionId && durationMinutes > 0
                        ? `${durationMinutes} min`
                        : connector.transactionId
                          ? "< 1 min"
                          : "-"}
                    </p>
                  </div>
                  <FiClock className="text-slate-400 text-lg" />
                </div>
              </div>

              {/* Control Buttons */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <button
                  onClick={handleTogglePlug}
                  className="rounded-xl bg-sky-600 text-white text-xs sm:text-sm font-semibold py-2.5 hover:bg-sky-500 flex items-center justify-center gap-2 shadow-sm"
                >
                  {connector.isPluggedIn ? "Unplug EV" : "Plug In EV"}
                </button>
                <button
                  onClick={handleToggleLock}
                  className="rounded-xl bg-sky-50 text-sky-800 text-xs sm:text-sm font-semibold py-2.5 hover:bg-sky-100 flex items-center justify-center gap-2 border border-sky-100"
                >
                  {connector.isLocked ? "Lock → Unlock" : "Unlock → Lock"}
                </button>
                <button
                  onClick={handleRequestStart}
                  disabled={!canStart}
                  className={`rounded-xl text-xs sm:text-sm font-semibold py-2.5 col-span-1 ${canStart
                      ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-sm"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    }`}
                >
                  Request Start
                </button>
                <button
                  onClick={handleRequestStop}
                  disabled={!canStop}
                  className={`rounded-xl text-xs sm:text-sm font-semibold py-2.5 col-span-1 ${canStop
                      ? "bg-rose-500 hover:bg-rose-400 text-white shadow-sm"
                      : "bg-slate-100 text-slate-400 cursor-not-allowed"
                    }`}
                >
                  Request Stop
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Event Log */}
        <section className="rounded-2xl bg-white shadow-sm border border-sky-100 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold text-slate-700">
              Event Log
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (logsEndRef.current) {
                    logsEndRef.current.scrollIntoView({ behavior: "smooth" });
                  }
                }}
                className="inline-flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-800"
              >
                <FiArrowDown className="text-xs" />
                Latest
              </button>
              <button
                onClick={() => setLogs([])}
                className="text-[11px] text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="h-32 sm:h-40 overflow-y-auto rounded-lg bg-sky-50 text-[11px] sm:text-xs text-slate-700 px-3 py-2 border border-sky-100">
            {logs.length === 0 ? (
              <p className="text-slate-400">
                ...waiting for events (BootNotification / Heartbeat / etc.)
              </p>
            ) : (
              <>
                {logs.map((line, idx) => {
                  const isSystem = line.includes("[SYSTEM]");
                  const isRecv = line.includes("[RECV]");
                  const colorClass = isSystem
                    ? "text-amber-600"
                    : isRecv
                      ? "text-sky-700"
                      : "";

                  return (
                    <p
                      key={idx}
                      className={`whitespace-pre-wrap ${colorClass}`}
                    >
                      {line}
                    </p>
                  );
                })}
                <div ref={logsEndRef} />
              </>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

export default TestCabinet;
