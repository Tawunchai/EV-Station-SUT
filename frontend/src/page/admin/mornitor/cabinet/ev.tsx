import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FiClock,
  FiBatteryCharging,
  FiPower,
  FiWifi,
  FiArrowDown,
  FiRefreshCw,
} from "react-icons/fi";
import { BsLightningChargeFill } from "react-icons/bs";
import { useLocation, useNavigate } from "react-router-dom";
import { connectOcppSocket, getChargerStatus } from "../../../../services/ocpp";
import { GetChargingSessionMonitor } from "../../../../services";

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
  soc: number; // fallback SoC from MeterValues (0..100)
  isPluggedIn: boolean;
  isLocked: boolean;
  powerKw: number; // instant power
  energyKWh: number; // delivered energy (computed)
  startedAt: number | null; // from MeterValues timestamp
  transactionId: number | null;
  meterWh: number; // current meter reading (Wh)
};

type CabinetType = {
  ID: number;
  Name: string;
  Location: string;
  Status: string;
  Image: string;
  Description?: string;
  Latitude?: number;
  Longitude?: number;
  EmployeeID?: number | null;
  UrlWebsocket?: string | null;
  ChargePoint?: string | null;
};

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

const ZERO_TIME_STR = "0001-01-01T00:00:00Z";

// ------------------ utils ------------------
const toNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
};

const formatTime = (sec: number) => {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const parseDateFlexible = (v: any): Date | null => {
  if (!v) return null;
  if (typeof v === "string") {
    if (v === ZERO_TIME_STR) return null;
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
    return null;
  }
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  return null;
};

const pickFirst = <T,>(...values: T[]): T | undefined => {
  for (const v of values) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
};

// ------------------ component ------------------
const EVCalibet: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const cabinet =
    (location.state as { cabinet?: CabinetType } | null)?.cabinet || null;

  /** ---------- WebSocket Monitor State ---------- */
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const [lastRawMessage, setLastRawMessage] = useState<string | null>(null);
  const [lastJsonMessage, setLastJsonMessage] = useState<any | null>(null);

  /** ---------- Connector State ---------- */
  const [connector, setConnector] = useState<ConnectorState>(initialConnectorState);
  const connectorRef = useRef<ConnectorState>(initialConnectorState);

  /** ---------- Session Monitor ---------- */
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionEndTime, setSessionEndTime] = useState<Date | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // energy bases
  const [startEnergyWh, setStartEnergyWh] = useState<number | null>(null);
  const [finalEnergyWh, setFinalEnergyWh] = useState<number | null>(null);
  const [currentEnergyWh, setCurrentEnergyWh] = useState<number | null>(null);

  // display SoC
  const [socPercent, setSocPercent] = useState<number>(0);

  // purchased energy (kWh)
  const [totalPurchasedKwh, setTotalPurchasedKwh] = useState<number>(0);

  /** ---------- Helpers ---------- */
  const appendLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => {
      const next = [...prev, `${time} ${msg}`];
      if (next.length > 200) next.shift();
      return next;
    });
  };

  const updateConnector = (updater: (prev: ConnectorState) => ConnectorState) => {
    setConnector((prev) => {
      const next = updater(prev);
      connectorRef.current = next;
      return next;
    });
  };

  const setSessionStartIfMissing = (d: Date) => {
    setSessionStartTime((prev) => (prev ? prev : d));
  };

  const setStartEnergyIfMissing = (wh: number) => {
    setStartEnergyWh((prev) => (prev == null ? wh : prev));
  };

  /** ---------- Apply StatusNotification ---------- */
  const applyStatusNotification = (payload: any) => {
    if (!payload || typeof payload !== "object") return;

    const statusStr = payload.status as string | undefined;

    updateConnector((prev) => {
      const next: ConnectorState = { ...prev };

      if (statusStr && typeof statusStr === "string") {
        const validStatuses: ConnectorStatus[] = [
          "Available",
          "Preparing",
          "Charging",
          "SuspendedEV",
          "Finishing",
          "Faulted",
          "Unavailable",
        ];

        if (validStatuses.includes(statusStr as ConnectorStatus)) {
          next.status = statusStr as ConnectorStatus;
        }

        next.isPluggedIn = ["Preparing", "Charging", "SuspendedEV", "Finishing"].includes(
          statusStr
        );
      }

      // ถ้าเริ่ม Charging/Preparing แล้ว sessionStartTime ยังไม่มี → set now
      if (
        (statusStr === "Preparing" || statusStr === "Charging") &&
        !sessionStartTime
      ) {
        const now = new Date();
        setSessionStartIfMissing(now);
        appendLog(`[SYSTEM] Auto set sessionStartTime = now (${now.toISOString()})`);
      }

      // reset เมื่อจบ
      if (statusStr === "Finishing" || statusStr === "Finish") {
        next.energyKWh = 0;
        next.meterWh = 0;
        next.powerKw = 0;
        next.soc = 0;

        setSessionStartTime(null);
        setSessionEndTime(null);
        setElapsedSec(0);

        setStartEnergyWh(null);
        setFinalEnergyWh(null);
        setCurrentEnergyWh(null);

        setTotalPurchasedKwh(0);
        setSocPercent(0);

        appendLog("[SYSTEM] Status = Finish → reset energy, timer & SoC");
      }

      return next;
    });
  };

  /** ---------- Apply MeterValues ---------- */
  const applyMeterValues = (payload: any) => {
    if (!payload || typeof payload !== "object") return;

    // บาง backend ส่ง meterValue / meterValues
    const meterValues = payload.meterValue ?? payload.meterValues;
    if (!Array.isArray(meterValues) || meterValues.length === 0) return;

    const firstMeter = meterValues[0];
    const sampled = firstMeter?.sampledValue ?? firstMeter?.sampledValues;
    if (!Array.isArray(sampled)) return;

    // timestamp ของ meter values
    const tsStr: string | undefined = firstMeter?.timestamp;
    if (tsStr) {
      const ts = Date.parse(tsStr);
      if (!Number.isNaN(ts)) {
        setSessionStartIfMissing(new Date(ts));
      }
    }

    updateConnector((prev) => {
      const next: ConnectorState = { ...prev };

      // SoC: unit อาจเป็น Percent หรือ "%" หรือไม่มี unit
      const socSample = sampled.find((s: any) => s?.measurand === "SoC");
      if (socSample && socSample.value != null) {
        const socVal = toNumber(socSample.value);
        if (socVal !== undefined) {
          const rawSoc = Math.max(0, Math.min(100, socVal));
          next.soc = rawSoc;
          // ไม่ set socPercent ทับถ้าเราคำนวณแบบซื้อทั้งหมดได้แล้ว (กันแกว่ง)
          // แต่ถ้า socPercent ยัง 0 อยู่ ให้โชว์จาก SoC ก่อน
          setSocPercent((p) => (p > 0 ? p : parseFloat(rawSoc.toFixed(2))));
        }
      }

      // Power.Active.Import: unit อาจเป็น W/kW หรือไม่มี unit
      const powerSample = sampled.find((s: any) => s?.measurand === "Power.Active.Import");
      if (powerSample && powerSample.value != null) {
        const pVal = toNumber(powerSample.value);
        if (pVal !== undefined) {
          const unit = (powerSample.unit ?? "").toString();
          if (unit === "W") next.powerKw = pVal / 1000;
          else next.powerKw = pVal; // assume kW
        }
      }

      // Energy.Active.Import.Register: unit อาจเป็น Wh / kWh
      const energySample = sampled.find(
        (s: any) => s?.measurand === "Energy.Active.Import.Register"
      );
      if (energySample && energySample.value != null) {
        const eVal = toNumber(energySample.value);
        if (eVal !== undefined) {
          const unit = (energySample.unit ?? "Wh").toString();
          const wh = unit === "kWh" ? eVal * 1000 : eVal;
          next.meterWh = wh;
          setCurrentEnergyWh(wh);

          // ถ้า startEnergyWh ยังไม่มี ให้ set จาก meterWh ตัวแรกเลย
          setStartEnergyIfMissing(wh);
        }
      }

      // transactionId
      if (typeof payload.transactionId === "number" || payload.transactionId === null) {
        next.transactionId = payload.transactionId;
      }

      // startedAt
      if (tsStr) {
        const ts = Date.parse(tsStr);
        if (!Number.isNaN(ts)) next.startedAt = ts;
      }

      return next;
    });
  };

  /** ---------- คำนวณ SoC (%) + Energy Delivered จาก Start/Final/Current ---------- */
  useEffect(() => {
    // ถ้าเรารู้ totalPurchasedKwh แล้ว แต่ finalEnergyWh ยังไม่รู้ และ startEnergyWh มาแล้ว → สร้าง finalWh
    if (startEnergyWh != null && totalPurchasedKwh > 0 && finalEnergyWh == null) {
      const fw = startEnergyWh + totalPurchasedKwh * 1000;
      setFinalEnergyWh(fw);
      appendLog(`[SYSTEM] Auto set finalEnergyWh = ${fw} (start + purchased)`);
    }

    // ===== 1) ถ้ามี start & final & current → คำนวณแบบ “ซื้อทั้งหมด” =====
    if (startEnergyWh != null && finalEnergyWh != null) {
      const effectiveCurrentWh =
        currentEnergyWh != null
          ? currentEnergyWh
          : sessionEndTime && finalEnergyWh != null
          ? finalEnergyWh
          : null;

      if (effectiveCurrentWh != null) {
        const totalDeltaWh = finalEnergyWh - startEnergyWh;
        if (totalDeltaWh > 0) {
          const currentDeltaWh = effectiveCurrentWh - startEnergyWh;

          const rawPercent = (currentDeltaWh / totalDeltaWh) * 100;
          const clampedPercent = Math.max(0, Math.min(100, rawPercent));
          const percent2 = parseFloat(clampedPercent.toFixed(2));
          setSocPercent(percent2);

          // energy delivered (kWh) clamp ไม่เกินที่ซื้อ
          let deltaWh = currentDeltaWh;
          const maxWh = totalPurchasedKwh > 0 ? totalPurchasedKwh * 1000 : undefined;
          if (maxWh != null && deltaWh > maxWh) deltaWh = maxWh;

          const kWh = deltaWh > 0 ? deltaWh / 1000 : 0;
          updateConnector((prev) => ({ ...prev, energyKWh: kWh, soc: percent2 }));
          return;
        }
      }
    }

    // ===== 2) fallback: ถ้ามี energyDelivered & totalPurchased → คิด % =====
    if (totalPurchasedKwh > 0 && connectorRef.current.energyKWh > 0) {
      const rawPercent = (connectorRef.current.energyKWh / totalPurchasedKwh) * 100;
      const percent2 = parseFloat(Math.max(0, Math.min(100, rawPercent)).toFixed(2));
      setSocPercent((p) => (p > 0 ? p : percent2));
    }
    // ===== 3) fallback สุดท้าย: SoC จาก MeterValues อยู่ใน connector.soc แล้ว =====
  }, [
    startEnergyWh,
    finalEnergyWh,
    currentEnergyWh,
    sessionEndTime,
    totalPurchasedKwh,
  ]);

  /** ---------- Handle OCPP payload (string/object/array) ---------- */
  const handleIncoming = (data: any) => {
    // 1) string
    if (typeof data === "string") {
      setLastRawMessage(data);
      setLastJsonMessage(null);
      appendLog(data.trim());
      return;
    }

    // 2) object wrapper (เช่น {type, status} หรือ {frame:[...]} )
    if (data && typeof data === "object" && !Array.isArray(data)) {
      setLastRawMessage(JSON.stringify(data));
      setLastJsonMessage(data);
      appendLog(`[SYSTEM] ${JSON.stringify(data)}`);

      if (data.type === "charger_status_update" && data.status) {
        applyStatusNotification({ status: data.status });
      }

      if (Array.isArray(data.frame)) {
        handleOcppFrame(data.frame);
      }
      return;
    }

    // 3) OCPP frame array
    handleOcppFrame(data);
  };

  /** ---------- Handle OCPP frame array ---------- */
  const handleOcppFrame = (frame: any) => {
    let raw = "";
    try {
      raw = JSON.stringify(frame);
    } catch {
      raw = String(frame);
    }

    setLastRawMessage(raw);
    setLastJsonMessage(frame);
    appendLog(`[OCPP] ${raw}`);

    if (!Array.isArray(frame) || frame.length < 4) return;

    // OCPP 1.6: [2, uniqueId, action, payload]  CALL
    const messageType = frame[0];
    const action = frame[2];
    const payload = frame[3];

    if (messageType !== 2) return;

    if (action === "StatusNotification") applyStatusNotification(payload);
    if (action === "MeterValues") applyMeterValues(payload);
  };

  /** ---------- Connect OCPP monitor socket ---------- */
  useEffect(() => {
    if (!cabinet?.ChargePoint) return;

    appendLog(`[SYSTEM] Connecting to OCPP monitor room=${cabinet.ChargePoint} ...`);

    const ws = connectOcppSocket((data: any) => {
      handleIncoming(data);
    }, cabinet.ChargePoint);

    return () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinet?.ChargePoint]);

  /** ---------- getChargerStatus initial ---------- */
  useEffect(() => {
    const fetchInitialStatus = async () => {
      try {
        if (!cabinet?.ChargePoint) return;

        appendLog(`[SYSTEM] Fetch initial charger status for ${cabinet.ChargePoint} ...`);

        const res = await getChargerStatus(cabinet.ChargePoint);
        const statusStr = (res as any)?.status as string | undefined;

        if (!statusStr) return;

        updateConnector((prev) => {
          const next: ConnectorState = { ...prev };

          const validStatuses: ConnectorStatus[] = [
            "Available",
            "Preparing",
            "Charging",
            "SuspendedEV",
            "Finishing",
            "Faulted",
            "Unavailable",
          ];

          if (validStatuses.includes(statusStr as ConnectorStatus)) {
            next.status = statusStr as ConnectorStatus;
          }

          next.isPluggedIn = ["Preparing", "Charging", "SuspendedEV", "Finishing"].includes(
            statusStr
          );

          return next;
        });

        appendLog(
          `[SYSTEM] getChargerStatus: ${typeof res === "object" ? JSON.stringify(res) : String(res)}`
        );

        // ถ้าเข้ามาแล้วสถานะเป็น Charging/Preparing ให้ set sessionStartTime เลย (กัน Time = "-")
        if ((statusStr === "Charging" || statusStr === "Preparing") && !sessionStartTime) {
          const now = new Date();
          setSessionStartIfMissing(now);
          appendLog(`[SYSTEM] Auto set sessionStartTime from getChargerStatus (${now.toISOString()})`);
        }
      } catch (err: any) {
        console.error("getChargerStatus error:", err);
        appendLog(`[ERROR] getChargerStatus: ${String(err)}`);
      }
    };

    fetchInitialStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinet?.ChargePoint]);

  /** ---------- GetChargingSessionMonitor ---------- */
  useEffect(() => {
    const fetchSession = async () => {
      try {
        if (!cabinet?.ChargePoint) return;

        appendLog(`[SYSTEM] Fetch session monitor for ChargePoint=${cabinet.ChargePoint} ...`);

        const res: any = await GetChargingSessionMonitor(cabinet.ChargePoint);

        // normalize sessions array
        let sessions: any[] = [];
        if (Array.isArray(res)) sessions = res;
        else if (res && Array.isArray(res.data)) sessions = res.data;
        else if (res && Array.isArray(res.Data)) sessions = res.Data;
        else if (res && Array.isArray(res.data?.data)) sessions = res.data.data;
        else if (res && Array.isArray(res?.data?.Data)) sessions = res.data.Data;

        if (!sessions || sessions.length === 0) {
          appendLog("[SYSTEM] No sessions from GetChargingSessionMonitor");
          return;
        }

        const session =
          sessions.find((s: any) => s?.Status === true || s?.Status === 1) ?? sessions[0];

        // flexible keys
        const startTimeRaw = pickFirst(session?.StartTime, session?.start_time, session?.startTime);
        const endTimeRaw = pickFirst(session?.EndTime, session?.end_time, session?.endTime);
        const startEnergyRaw = pickFirst(session?.StartEnergy, session?.start_energy, session?.StartEnergyWh);

        const localStart = parseDateFlexible(startTimeRaw);
        const localEnd = parseDateFlexible(endTimeRaw);

        if (localStart) {
          setSessionStartTime(localStart);

          // set elapsed ณ ตอน fetch (ถ้ายังไม่จบ)
          if (!localEnd) {
            const nowMs = Date.now();
            const sec = Math.max(0, Math.floor((nowMs - localStart.getTime()) / 1000));
            setElapsedSec(sec);
            appendLog(`[SYSTEM] Restore StartTime=${String(startTimeRaw)}, elapsed(now)=${sec}s`);
          }
        }

        if (localEnd) {
          setSessionEndTime(localEnd);
          if (localStart) {
            const sec = Math.max(0, Math.floor((localEnd.getTime() - localStart.getTime()) / 1000));
            setElapsedSec(sec);
            appendLog(`[SYSTEM] Restore EndTime=${String(endTimeRaw)}, elapsed=${sec}s`);
          }
        }

        // start energy (Wh)
        const startEnergy = Number(startEnergyRaw ?? 0);
        if (!Number.isNaN(startEnergy) && startEnergy > 0) {
          setStartEnergyWh(startEnergy);
          appendLog(`[SYSTEM] StartEnergyWh=${startEnergy}`);
        }

        // EVChargingPayments (power kWh) flexible
        const payment = session?.Payment ?? session?.payment;
        const evPays =
          payment?.EVChargingPayments ??
          payment?.evChargingPayments ??
          payment?.ev_charging_payments ??
          session?.EVChargingPayments ??
          session?.evChargingPayments ??
          [];

        const totalPowerKwh = Array.isArray(evPays)
          ? evPays.reduce((sum: number, p: any) => sum + (Number(p?.Power ?? p?.power) || 0), 0)
          : 0;

        setTotalPurchasedKwh(totalPowerKwh);

        // final energy = start + purchased
        if (startEnergyWh != null || startEnergy > 0) {
          const base = startEnergyWh != null ? startEnergyWh : startEnergy;
          const finalWh = base + totalPowerKwh * 1000;
          if (!Number.isNaN(finalWh) && finalWh > 0) setFinalEnergyWh(finalWh);
          appendLog(
            `[SYSTEM] TotalPurchased=${totalPowerKwh} kWh, FinalEnergyWh=${base + totalPowerKwh * 1000}`
          );
        } else {
          appendLog(
            `[SYSTEM] TotalPurchased=${totalPowerKwh} kWh (waiting StartEnergyWh from MeterValues...)`
          );
        }
      } catch (err: any) {
        console.error("GetChargingSessionMonitor error:", err);
        appendLog(`[ERROR] GetChargingSessionMonitor: ${String(err)}`);
      }
    };

    fetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinet?.ChargePoint]);

  /** ---------- Timer ---------- */
  useEffect(() => {
    // fallback: ถ้า sessionStartTime ไม่มี แต่ connector.startedAt มี → ใช้อันนั้น
    const fallbackStart = connector.startedAt ? new Date(connector.startedAt) : null;

    const start = sessionStartTime ?? fallbackStart;
    if (!start) return;

    const startMs = start.getTime();

    // มี EndTime → คงที่
    if (sessionEndTime) {
      const sec = Math.max(0, Math.floor((sessionEndTime.getTime() - startMs) / 1000));
      setElapsedSec(sec);
      return;
    }

    // SuspendedEV → แช่เวลา (คงที่ ณ ตอนนี้)
    if (connector.status === "SuspendedEV") {
      const sec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setElapsedSec(sec);
      return;
    }

    const updateElapsed = () => {
      const sec = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      setElapsedSec(sec);
    };

    updateElapsed();
    const id = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(id);
  }, [sessionStartTime, sessionEndTime, connector.status, connector.startedAt]);

  /** ---------- UI computed ---------- */
  const energyUseKWh = useMemo(() => {
    if (!Number.isFinite(totalPurchasedKwh) || totalPurchasedKwh <= 0) return "0.00";
    return totalPurchasedKwh.toFixed(2);
  }, [totalPurchasedKwh]);

  const energyDeliveredKWh = connector.energyKWh;

  // Avg Power = delivered / time
  const avgPowerKw = useMemo(() => {
    if (!Number.isFinite(energyDeliveredKWh) || energyDeliveredKWh <= 0) return 0;
    if (elapsedSec <= 0) return 0;
    const hours = elapsedSec / 3600;
    if (hours <= 0) return 0;
    return parseFloat((energyDeliveredKWh / hours).toFixed(2));
  }, [energyDeliveredKWh, elapsedSec]);

  // Output power: prefer instant power (MeterValues) else avg
  const outputPowerKw = useMemo(() => {
    if (connector.powerKw > 0) return parseFloat(connector.powerKw.toFixed(2));
    return avgPowerKw;
  }, [connector.powerKw, avgPowerKw]);

  // gauge
  const outerRadius = 80;
  const innerRadius = 66;
  const outerCircumference = 2 * Math.PI * outerRadius;
  const innerCircumference = 2 * Math.PI * innerRadius;

  const safeSoc = Number.isFinite(socPercent) ? socPercent : 0;
  const outerOffset = outerCircumference - (safeSoc / 100) * outerCircumference || 0;
  const innerOffset = innerCircumference - (safeSoc / 100) * innerCircumference || 0;

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

  const hasData = lastRawMessage !== null || lastJsonMessage !== null;

  if (!cabinet) {
    return (
      <div className="min-h-screen w-full bg-white mt-14 sm:mt-0">
        <div className="sticky top-0 z-10 bg-blue-600 text-white shadow-sm">
          <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center">
            <h1 className="text-sm sm:text-base font-semibold tracking-wide">
              Monitor Cabinet EV
            </h1>
          </div>
        </div>

        <div className="max-w-screen-xl mx-auto px-4 py-8">
          <p className="text-slate-600 mb-4">
            ไม่พบข้อมูลตู้ชาร์จ (cabinet) ที่ส่งมาจากหน้าก่อนหน้า
          </p>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            กลับไปหน้าเลือก Cabinet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-sky-50 via-white to-sky-100 text-slate-900 mt-14 sm:mt-0">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center rounded-lg bg-white/95 px-3 py-1.5 text-xs sm:text-sm font-semibold text-blue-600 shadow-sm hover:bg-white"
            >
              ← Back
            </button>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide opacity-90">
                Monitor Cabinet EV
              </span>
              <span className="text-xs sm:text-sm font-semibold">
                {cabinet.Name}
                {cabinet.ChargePoint ? ` • ${cabinet.ChargePoint}` : ""}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-blue-50">
              <FiWifi className={hasData ? "text-emerald-300" : "text-blue-200"} />
              {hasData ? "Receiving OCPP data" : "Waiting OCPP data"}
            </span>

            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] sm:text-xs font-medium text-white hover:bg-white/20 active:scale-[0.97] transition"
            >
              <FiRefreshCw className="text-xs" />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-20 space-y-5">
        {/* SoC + EV Status Panel */}
        <section>
          <div className="rounded-2xl bg-white shadow-sm border border-sky-100 p-5 sm:p-6 flex flex-col lg:flex-row gap-5">
            {/* Gauge */}
            <div className="flex-1 flex flex-col items-center justify-center">
              <p className="text-xs sm:text-sm text-slate-500 mb-1">
                SoC Status <span className="text-[11px]">(สถานะแบตเตอรี่)</span>
              </p>

              <div className="relative w-40 h-40 sm:w-52 sm:h-52">
                <svg viewBox="0 0 200 200" className="w-full h-full" aria-label="State of Charge">
                  <circle cx="100" cy="100" r={outerRadius} fill="none" stroke="#E2E8F0" strokeWidth="10" />
                  <circle cx="100" cy="100" r={innerRadius} fill="none" stroke="#E2E8F0" strokeWidth="10" />

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
                    <linearGradient id="gridGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#0ea5e9" />
                      <stop offset="50%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#0369a1" />
                    </linearGradient>

                    <linearGradient id="solarGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#fdba74" />
                      <stop offset="50%" stopColor="#fb923c" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                  </defs>

                  <circle cx="100" cy="100" r={48} fill="#F8FAFC" />

                  <text
                    x="50%"
                    y="50%"
                    dominantBaseline="middle"
                    textAnchor="middle"
                    className="text-3xl sm:text-4xl font-extrabold"
                    fill="#0f172a"
                  >
                    {safeSoc.toFixed(2).toString().padStart(2, "0")}%
                  </text>
                </svg>
              </div>

              <p className="mt-2 text-xs text-slate-500">
                Energy delivered:{" "}
                <span className="font-semibold text-black">
                  {Number.isFinite(energyDeliveredKWh) ? energyDeliveredKWh.toFixed(2) : "0.00"} kWh
                </span>
              </p>
            </div>

            {/* Right Status */}
            <div className="flex-1 flex flex-col gap-4 justify-between">
              <div>
                <p className="text-xs sm:text-sm text-slate-500 mb-1">EVSE Status</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center">
                    <BsLightningChargeFill className="text-sky-600 text-xl" />
                  </div>
                  <div>
                    <p className={`text-sm sm:text-base font-semibold ${evseStatusColor}`}>
                      {connector.status}
                    </p>
                    <p className="text-[11px] text-slate-500">{thaiStatusMap[connector.status]}</p>
                  </div>
                </div>
              </div>

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
                        {connector.isPluggedIn ? "เสียบปลั๊กแล้ว" : "ยังไม่เสียบปลั๊ก"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-50 bg-emerald-50 px-3 py-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-white border border-emerald-100 flex items-center justify-center">
                      <FiPower className={connector.isLocked ? "text-rose-500" : "text-emerald-500"} />
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

              {/* Power + Time + Energy Use */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs sm:text-sm">
                <div className="rounded-xl border border-sky-50 bg-sky-50 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500">Output Power</p>
                    <p className="font-semibold text-sky-700">{outputPowerKw.toFixed(2)} kW</p>
                    <p className="text-[10px] text-slate-400">
                      {connector.powerKw > 0 ? "Instant" : "Avg"}
                    </p>
                  </div>
                  <FiBatteryCharging className="text-sky-500 text-lg" />
                </div>

                <div className="rounded-xl border border-sky-50 bg-sky-50 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500">Time</p>
                    <p className="font-semibold text-sky-700">
                      {(sessionStartTime || connector.startedAt) ? formatTime(elapsedSec) : "-"}
                    </p>
                  </div>
                  <FiClock className="text-slate-400 text-lg" />
                </div>

                <div className="rounded-xl border border-sky-50 bg-sky-50 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500">Energy Use</p>
                    <p className="font-semibold text-sky-700">{energyUseKWh} kWh</p>
                  </div>
                  <FiBatteryCharging className="text-sky-500 text-lg" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Socket Data */}
        <section className="rounded-2xl bg-white shadow-sm border border-sky-100 p-4 sm:p-5">
          <p className="text-xs sm:text-sm font-semibold text-slate-700 mb-2">
            Socket Data (Latest OCPP Message)
          </p>

          {!lastRawMessage ? (
            <p className="text-[11px] sm:text-xs text-slate-400">
              ยังไม่มีข้อมูลจาก OCPP WebSocket (รอให้ตู้ส่ง Status / MeterValues)
            </p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] text-slate-500 mb-1">Raw</p>
                <div className="h-32 sm:h-40 overflow-auto rounded-lg bg-slate-900 text-[11px] sm:text-xs text-slate-100 px-3 py-2 font-mono">
                  {lastRawMessage}
                </div>
              </div>

              <div>
                <p className="text-[11px] text-slate-500 mb-1">Parsed (pretty JSON)</p>
                <div className="h-32 sm:h-40 overflow-auto rounded-lg bg-slate-900 text-[11px] sm:text-xs text-slate-100 px-3 py-2 font-mono">
                  {lastJsonMessage ? (
                    <pre>{JSON.stringify(lastJsonMessage, null, 2)}</pre>
                  ) : (
                    <span className="text-slate-400">ข้อมูลล่าสุดไม่สามารถ parse เป็น JSON ได้</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Event Log */}
        <section className="rounded-2xl bg-white shadow-sm border border-sky-100 p-4 sm:p-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs sm:text-sm font-semibold text-slate-700">Event Log</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => logsEndRef.current?.scrollIntoView({ behavior: "smooth" })}
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
              <p className="text-slate-400">...waiting for OCPP events from backend</p>
            ) : (
              <>
                {logs.map((line, idx) => {
                  const isSystem = line.includes("[SYSTEM]");
                  const isError = line.includes("[ERROR]");
                  const isOcpp = line.includes("[OCPP]");
                  const colorClass = isError
                    ? "text-rose-600"
                    : isSystem
                    ? "text-amber-600"
                    : isOcpp
                    ? "text-sky-700"
                    : "";

                  return (
                    <p key={idx} className={`whitespace-pre-wrap ${colorClass}`}>
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

export default EVCalibet;