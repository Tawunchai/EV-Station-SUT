import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FiClock,
  FiBatteryCharging,
  FiPower,
  FiWifi,
  FiArrowDown,
  FiRefreshCw, // ⭐ ปุ่มรีเฟรช
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
  soc: number; // battery %
  isPluggedIn: boolean;
  isLocked: boolean;
  powerKw: number;
  energyKWh: number; // พลังงานที่ชาร์จไปแล้ว (kWh)
  startedAt: number | null;
  transactionId: number | null;
  meterWh: number;
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

// แปลงเป็น number แบบปลอดภัย
const toNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && !isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v);
    if (!isNaN(n)) return n;
  }
  return undefined;
};

// ฟอร์แมตเวลาเป็น HH:MM:SS
const formatTime = (sec: number) => {
  const h = String(Math.floor(sec / 3600)).padStart(2, "0");
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
  const s = String(sec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
};

const EVCalibet: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const cabinet =
    (location.state as { cabinet?: CabinetType } | null)?.cabinet || null;

  /** ---------- WebSocket Monitor State ---------- */
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // เก็บ message ล่าสุดจาก OCPP (เพื่อโชว์ทุก field)
  const [lastRawMessage, setLastRawMessage] = useState<string | null>(null);
  const [lastJsonMessage, setLastJsonMessage] = useState<any | null>(null);

  /** ---------- Connector State (Port 1) ---------- */
  const [connector, setConnector] =
    useState<ConnectorState>(initialConnectorState);
  const connectorRef = useRef<ConnectorState>(initialConnectorState);

  /** ---------- Session Monitor จาก GetChargingSessionMonitor ---------- */
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionEndTime, setSessionEndTime] = useState<Date | null>(null); // ⭐ ใช้คำนวณเวลาตอนรีเฟรช
  const [elapsedSec, setElapsedSec] = useState(0);

  // ⭐ Start / Final / Current Energy (Wh)
  const [startEnergyWh, setStartEnergyWh] = useState<number | null>(null);
  const [finalEnergyWh, setFinalEnergyWh] = useState<number | null>(null);
  const [currentEnergyWh, setCurrentEnergyWh] = useState<number | null>(null);

  // ⭐ SoC ที่ใช้แสดงในวงกลม (%)
  const [socPercent, setSocPercent] = useState<number>(0);

  // ⭐ พลังงานที่ “ซื้อทั้งหมด” จาก EVChargingPayments (หน่วย kWh)
  const [totalPurchasedKwh, setTotalPurchasedKwh] = useState<number>(0);

  /** ---------- Helpers ---------- */
  const appendLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => {
      const next = [...prev, `${time} ${msg}`];
      if (next.length > 150) next.shift();
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

        // เดาว่าถ้าอยู่สถานะเหล่านี้คือเสียบปลั๊กอยู่
        next.isPluggedIn = [
          "Preparing",
          "Charging",
          "SuspendedEV",
          "Finishing",
        ].includes(statusStr);
      }

      // 🧹 ถ้าได้รับสถานะจบการชาร์จ → รีเซ็ต Energy / Power + เวลา + state session
      if (statusStr === "Finishing" || statusStr === "Finish") {
        next.energyKWh = 0;
        next.meterWh = 0;
        next.powerKw = 0;
        next.soc = 0;

        // ⭐ รีเซ็ต timer + session energy ให้หมด เหมือนจบ session
        setSessionStartTime(null);
        setSessionEndTime(null);
        setElapsedSec(0);
        setStartEnergyWh(null);
        setFinalEnergyWh(null);
        setCurrentEnergyWh(null);

        // ⭐⭐ รีเซ็ต Energy Use (kWh) ที่แสดงในกล่อง Energy Use ด้วย
        setTotalPurchasedKwh(0);
        setSocPercent(0);

        appendLog("[SYSTEM] Status = Finish → reset energy, timer & SoC");
      }

      return next;
    });
  };

  /** ---------- Apply MeterValues (SoC / Power / Energy) ---------- */
  const applyMeterValues = (payload: any) => {
    if (!payload || typeof payload !== "object") return;

    const meterValues = payload.meterValue;
    if (!Array.isArray(meterValues) || meterValues.length === 0) return;

    const firstMeter = meterValues[0];
    const sampled = firstMeter?.sampledValue;
    if (!Array.isArray(sampled)) return;

    updateConnector((prev) => {
      const next: ConnectorState = { ...prev };

      // SoC (Percent) จาก measurand ตรง ๆ (ใช้เป็น fallback ถ้าไม่มี start/final)
      const socSample = sampled.find(
        (s: any) => s?.measurand === "SoC" && s?.unit === "Percent"
      );
      if (socSample && socSample.value != null) {
        const socVal = toNumber(socSample.value);
        if (socVal !== undefined) {
          const rawSoc = Math.max(0, Math.min(100, socVal));
          next.soc = rawSoc;
          setSocPercent(parseFloat(rawSoc.toFixed(2)));
        }
      }

      // Power.Active.Import (kW)
      const powerSample = sampled.find(
        (s: any) => s?.measurand === "Power.Active.Import"
      );
      if (powerSample && powerSample.value != null) {
        const pVal = toNumber(powerSample.value);
        if (pVal !== undefined) {
          if (powerSample.unit === "W") {
            next.powerKw = pVal / 1000;
          } else {
            next.powerKw = pVal;
          }
        }
      }

      // Energy.Active.Import.Register (Wh)
      const energySample = sampled.find(
        (s: any) => s?.measurand === "Energy.Active.Import.Register"
      );
      if (energySample && energySample.value != null) {
        const eValWh = toNumber(energySample.value);
        if (eValWh !== undefined) {
          next.meterWh = eValWh; // หน่วย Wh
          // ไม่เซ็ต energyKWh ตรง ๆ ให้ไปคำนวณจาก StartEnergy อีกที
          setCurrentEnergyWh(eValWh);
        }
      }

      // transactionId
      if (
        typeof payload.transactionId === "number" ||
        payload.transactionId === null
      ) {
        next.transactionId = payload.transactionId;
      }

      // startedAt จาก timestamp ของ meterValue แรก (optional)
      const tsStr: string | undefined = firstMeter?.timestamp;
      if (tsStr) {
        const ts = Date.parse(tsStr);
        if (!isNaN(ts)) {
          next.startedAt = ts;
        }
      }

      return next;
    });
  };

  /** ---------- คำนวณ SoC (%) + Energy จาก Start/Final/Current Energy ---------- */
  useEffect(() => {
    if (startEnergyWh == null || finalEnergyWh == null) {
      return;
    }

    // ถ้ามี currentEnergyWh → ใช้อันนี้
    // แต่ถ้า session จบแล้ว (มี EndTime) และไม่มี current → ใช้ finalEnergyWh แทน (กรณีรีเฟรช)
    const effectiveCurrentWh =
      currentEnergyWh != null
        ? currentEnergyWh
        : sessionEndTime && finalEnergyWh != null
        ? finalEnergyWh
        : null;

    if (effectiveCurrentWh == null) {
      return;
    }

    const totalDeltaWh = finalEnergyWh - startEnergyWh;
    if (totalDeltaWh <= 0) {
      return;
    }

    const currentDeltaWh = effectiveCurrentWh - startEnergyWh;
    const rawPercent = (currentDeltaWh / totalDeltaWh) * 100;

    // จำกัด 0–100%
    const clampedPercent = Math.max(0, Math.min(100, rawPercent));
    const percent2 = parseFloat(clampedPercent.toFixed(2));
    setSocPercent(percent2);

    // อัปเดตเข้า connector.soc ด้วย (เผื่อไปใช้ที่อื่นในอนาคต)
    updateConnector((prev) => ({
      ...prev,
      soc: percent2,
    }));

    // ⭐ คำนวณ Energy delivered (kWh) จาก deltaWh
    let deltaWh = currentDeltaWh;
    if (totalPurchasedKwh != null && totalPurchasedKwh > 0) {
      const maxWh = totalPurchasedKwh * 1000;
      if (deltaWh > maxWh) deltaWh = maxWh;
    }
    const kWh = deltaWh > 0 ? deltaWh / 1000 : 0;

    updateConnector((prev) => ({
      ...prev,
      energyKWh: kWh, // ใช้ตรงนี้เป็น source ของ Energy delivered
    }));
  }, [
    startEnergyWh,
    finalEnergyWh,
    currentEnergyWh,
    sessionEndTime,
    totalPurchasedKwh,
  ]);

  /** ---------- Handle OCPP frame ---------- */
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

    if (!Array.isArray(frame) || frame.length < 3) return;

    const messageType = frame[0]; // 2 = CALL
    const action = frame[2];
    const payload = frame[3];

    if (messageType !== 2) return;

    if (action === "StatusNotification") {
      applyStatusNotification(payload);
    }

    if (action === "MeterValues") {
      applyMeterValues(payload);
    }
  };

  /** ---------- Connect OCPP monitor socket ---------- */ //
  useEffect(() => {
    appendLog("[SYSTEM] Connecting to OCPP monitor socket ...");

    const ws = connectOcppSocket((data: any) => {
      handleOcppFrame(data);
    });

    return () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ---------- ถามสถานะล่าสุดจาก getChargerStatus ตอนเข้าแรก ---------- */
  useEffect(() => {
    const fetchInitialStatus = async () => {
      try {
        if (!cabinet?.ChargePoint) return;

        appendLog(
          `[SYSTEM] Fetch initial charger status for ${cabinet.ChargePoint} ...`
        );

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

          next.isPluggedIn = [
            "Preparing",
            "Charging",
            "SuspendedEV",
            "Finishing",
          ].includes(statusStr);

          return next;
        });

        appendLog(
          `[SYSTEM] getChargerStatus: ${
            typeof res === "object" ? JSON.stringify(res) : String(res)
          }`
        );
      } catch (err: any) {
        console.error("getChargerStatus error:", err);
        appendLog(`[ERROR] getChargerStatus: ${String(err)}`);
      }
    };

    fetchInitialStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinet?.ChargePoint]);

  /** ---------- โหลด Session จาก GetChargingSessionMonitor เพื่อ Time + Energy Use ---------- */
  useEffect(() => {
    const fetchSession = async () => {
      try {
        if (!cabinet?.ChargePoint) return;

        appendLog(
          `[SYSTEM] Fetch session monitor for ChargePoint=${cabinet.ChargePoint} ...`
        );

        const res: any = await GetChargingSessionMonitor(cabinet.ChargePoint);

        // ให้รองรับหลายรูปแบบ response
        let sessions: any[] = [];

        if (Array.isArray(res)) {
          sessions = res;
        } else if (res && Array.isArray(res.data)) {
          sessions = res.data;
        } else if (res && Array.isArray(res.Data)) {
          sessions = res.Data;
        } else if (res && Array.isArray(res.data?.data)) {
          sessions = res.data.data;
        }

        if (!sessions || sessions.length === 0) {
          appendLog("[SYSTEM] No sessions from GetChargingSessionMonitor");
          return;
        }

        // เลือก session ที่ Status = true ถ้ามี ไม่งั้นเอาตัวแรก
        const session =
          sessions.find(
            (s: any) => s?.Status === true || s?.Status === 1
          ) ?? sessions[0];

        // StartTime / EndTime → ไว้คำนวณ Time ตอนเข้าใหม่
        const startTimeStr: string | undefined = session?.StartTime;
        const endTimeStr: string | undefined = session?.EndTime;

        if (startTimeStr && startTimeStr !== ZERO_TIME_STR) {
          const d = new Date(startTimeStr);
          if (!Number.isNaN(d.getTime())) {
            setSessionStartTime(d);

            // ถ้ายังไม่มี EndTime → ใช้เวลาปัจจุบัน
            if (!endTimeStr || endTimeStr === ZERO_TIME_STR) {
              const nowMs = Date.now();
              const diffMs = nowMs - d.getTime();
              const sec = Math.max(0, Math.floor(diffMs / 1000));
              setElapsedSec(sec);

              appendLog(
                `[SYSTEM] Restore session StartTime=${startTimeStr}, elapsed(now)=${sec}s`
              );
            }
          }
        }

        if (endTimeStr && endTimeStr !== ZERO_TIME_STR) {
          const e = new Date(endTimeStr);
          if (!Number.isNaN(e.getTime()) && sessionStartTime) {
            setSessionEndTime(e);

            const diffMs = e.getTime() - sessionStartTime.getTime();
            const sec = Math.max(0, Math.floor(diffMs / 1000));
            setElapsedSec(sec);

            appendLog(
              `[SYSTEM] Restore session EndTime=${endTimeStr}, elapsed=${sec}s`
            );
          } else if (!Number.isNaN(e.getTime())) {
            setSessionEndTime(e);
          }
        }

        // StartEnergy (Wh)
        const startEnergy = Number(session?.StartEnergy ?? 0);
        if (!Number.isNaN(startEnergy)) {
          setStartEnergyWh(startEnergy);
        }

        // Power จาก EVChargingPayments (หน่วย kWh) → ใช้รวมกันทั้ง Solar + Grid
        const evPays = session?.Payment?.EVChargingPayments ?? [];
        const totalPowerKwh = evPays.reduce(
          (sum: number, p: any) => sum + (Number(p?.Power) || 0),
          0
        );

        // ⭐ เก็บค่าพลังงานที่ “ซื้อทั้งหมด” ไว้แสดงตรง Energy Use
        setTotalPurchasedKwh(totalPowerKwh);

        // finalEnergyWh = StartEnergy(Wh) + ∑Power(kWh)*1000
        const finalWh = startEnergy + totalPowerKwh * 1000;
        if (!Number.isNaN(finalWh)) {
          setFinalEnergyWh(finalWh);
        }

        appendLog(
          `[SYSTEM] Session StartEnergy=${startEnergy} Wh, TotalPower=${totalPowerKwh} kWh, FinalEnergyWh=${finalWh}`
        );
      } catch (err: any) {
        console.error("GetChargingSessionMonitor error:", err);
        appendLog(`[ERROR] GetChargingSessionMonitor: ${String(err)}`);
      }
    };

    fetchSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cabinet?.ChargePoint]);

  /** ---------- นับเวลา Time ----------
   *  - ถ้ามี EndTime → ใช้ EndTime - StartTime ตายตัว (ไม่เดินต่อ)
   *  - ถ้าไม่มี EndTime แต่สถานะ = SuspendedEV → แช่เวลาตอนนั้น (ไม่เดินต่อ)
   *  - ถ้าไม่มีทั้งคู่ → นับเวลาปกติแบบ real-time
   ----------------------------------- */
  useEffect(() => {
    if (!sessionStartTime) return;

    const startMs = sessionStartTime.getTime();

    // เคสมี EndTime แล้ว → ใช้เวลาตายตัว
    if (sessionEndTime) {
      const diffMs = sessionEndTime.getTime() - startMs;
      const sec = Math.max(0, Math.floor(diffMs / 1000));
      setElapsedSec(sec);
      return;
    }

    // ถ้าสถานะ SuspendedEV → แช่เวลา ณ ตอนที่เข้ามา/เปลี่ยนเป็น SuspendedEV
    if (connector.status === "SuspendedEV") {
      const nowMs = Date.now();
      const diffMs = nowMs - startMs;
      const sec = Math.max(0, Math.floor(diffMs / 1000));
      setElapsedSec(sec);
      return;
    }

    // ปกติ: เดินเวลาตามปกติ
    const updateElapsed = () => {
      const nowMs = Date.now();
      const diffMs = nowMs - startMs;
      const sec = Math.max(0, Math.floor(diffMs / 1000));
      setElapsedSec(sec);
    };

    updateElapsed();
    const id = window.setInterval(updateElapsed, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [sessionStartTime, sessionEndTime, connector.status]);

  /** ---------- Energy Use = พลังงานทั้งหมดที่ “ซื้อ” จาก EVChargingPayments (kWh) ---------- */
  const energyUseKWh = useMemo(() => {
    if (!Number.isFinite(totalPurchasedKwh)) return "0.00";
    return totalPurchasedKwh.toFixed(2);
  }, [totalPurchasedKwh]);

  /** ---------- Output Power (kW) = Energy delivered (kWh) / Time(h) ---------- */
  const energyDeliveredKWh = connector.energyKWh; //@ts-ignore
  const outputPowerKw = useMemo(() => {
    if (!Number.isFinite(energyDeliveredKWh) || energyDeliveredKWh <= 0) {
      return 0;
    }
    if (elapsedSec <= 0) return 0;

    const hours = elapsedSec / 3600;
    if (hours <= 0) return 0;

    const kw = energyDeliveredKWh / hours;
    return parseFloat(kw.toFixed(2));
  }, [energyDeliveredKWh, elapsedSec]);

  // วงกลมสองชั้น: Grid (วงนอก) / Solar (วงใน)
  const outerRadius = 80;
  const innerRadius = 66;
  const outerCircumference = 2 * Math.PI * outerRadius;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const outerOffset =
    outerCircumference - (socPercent / 100) * outerCircumference || 0;
  const innerOffset =
    innerCircumference - (socPercent / 100) * innerCircumference || 0;

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

  // ใช้ flag ง่าย ๆ ว่ามี message เข้ามาแล้วหรือยัง
  const hasData = lastRawMessage !== null || lastJsonMessage !== null;

  // ถ้าไม่มี cabinet (เข้าหน้านี้ตรง ๆ)
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

  /** ---------- Render ---------- */
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

          {/* ขวา: สถานะ + ปุ่ม Refresh */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs text-blue-50">
              <FiWifi
                className={hasData ? "text-emerald-300" : "text-blue-200"}
              />
              {hasData ? "Receiving OCPP data" : "Waiting OCPP data"}
            </span>

            {/* ⭐ Refresh Button */}
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

      {/* Main */}
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
                    {/* Grid Gradient (วงนอก) */}
                    <linearGradient id="gridGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#0ea5e9" />
                      <stop offset="50%" stopColor="#0284c7" />
                      <stop offset="100%" stopColor="#0369a1" />
                    </linearGradient>
                    {/* Solar Gradient (วงใน) */}
                    <linearGradient id="solarGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#fdba74" />
                      <stop offset="50%" stopColor="#fb923c" />
                      <stop offset="100%" stopColor="#f97316" />
                    </linearGradient>
                  </defs>

                  {/* วงกลมพื้นหลังตรงกลาง */}
                  <circle cx="100" cy="100" r={48} fill="#F8FAFC" />

                  {/* ตัวเลข % ตรงกลาง */}
                  <text
                    x="50%"
                    y="50%"
                    dominantBaseline="middle"
                    textAnchor="middle"
                    className="text-3xl sm:text-4xl font-extrabold"
                    fill="#0f172a"
                  >
                    {socPercent.toFixed(2).toString().padStart(2, "0")}%
                  </text>
                </svg>
              </div>

              {/* Energy */}
              <p className="mt-2 text-xs text-slate-500">
                Energy delivered:{" "}
                <span className="font-semibold text-black">
                  {energyDeliveredKWh.toFixed(2)} kWh
                </span>
              </p>
            </div>

            {/* Right Status */}
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

              {/* Power + Time + Energy Use */}
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 text-xs sm:text-sm">
                {/* Output Power (เฉลี่ยจาก Energy / Time) */}
                <div className="rounded-xl border border-sky-50 bg-sky-50 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500">Output Power</p>
                    <p className="font-semibold text-sky-700">
                      {energyDeliveredKWh.toFixed(2)} kWh
                    </p>
                  </div>
                  <FiBatteryCharging className="text-sky-500 text-lg" />
                </div>

                {/* Time จาก StartTime / EndTime ของ Session */}
                <div className="rounded-xl border border-sky-50 bg-sky-50 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500">Time</p>
                    <p className="font-semibold text-sky-700">
                      {sessionStartTime ? formatTime(elapsedSec) : "-"}
                    </p>
                  </div>
                  <FiClock className="text-slate-400 text-lg" />
                </div>

                {/* Energy Use (kWh) = ∑ Power ของทุก EVChargingPayment (kWh) */}
                <div className="rounded-xl border border-sky-50 bg-sky-50 px-3 py-2 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] text-slate-500">Energy Use</p>
                    <p className="font-semibold text-sky-700">
                      {energyUseKWh} kWh
                    </p>
                  </div>
                  <FiBatteryCharging className="text-sky-500 text-lg" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Socket Data (แสดงทุก field จาก message ล่าสุด) */}
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
              {/* Raw string */}
              <div>
                <p className="text-[11px] text-slate-500 mb-1">
                  Raw frame (array)
                </p>
                <div className="h-32 sm:h-40 overflow-auto rounded-lg bg-slate-900 text-[11px] sm:text-xs text-slate-100 px-3 py-2 font-mono">
                  {lastRawMessage}
                </div>
              </div>

              {/* Parsed JSON */}
              <div>
                <p className="text-[11px] text-slate-500 mb-1">
                  Parsed (pretty JSON)
                </p>
                <div className="h-32 sm:h-40 overflow-auto rounded-lg bg-slate-900 text-[11px] sm:text-xs text-slate-100 px-3 py-2 font-mono">
                  {lastJsonMessage ? (
                    <pre>{JSON.stringify(lastJsonMessage, null, 2)}</pre>
                  ) : (
                    <span className="text-slate-400">
                      ข้อมูลล่าสุดไม่สามารถ parse เป็น JSON ได้
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
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
                ...waiting for OCPP events from backend
              </p>
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

export default EVCalibet;
