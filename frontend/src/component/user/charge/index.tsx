// src/pages/user/ev/ChargingEV.tsx

import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { FaBolt } from "react-icons/fa";
import { message } from "antd";
import ModalCreate from "../review/create";
import {
  GetReviewByUserID,
  GetChargingSessionByUserID,
  connectHardwareSocket, // ⭐ WebSocket hardware //
  GetCabinetByID, // ⭐ ดึงข้อมูลตู้ชาร์จตาม ID
  CancelSessionSolarGrid,
  UpdateSessionStatusByPaymentID,
} from "../../../services";
import {
  connectOcppSocket,
  remoteStartCharging,
  remoteStopCharging,
  getChargerStatus, // ⭐ สอบถามสถานะล่าสุด
} from "../../../services/ocpp";
import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";
import { useNavigate, useLocation } from "react-router-dom";
import Loader from "../../../component/third-patry/Loader";

const ZERO_TIME_STR = "0001-01-01T00:00:00Z";
const STORAGE_KEY_PREFIX = "ev_charging_state_";

type SourceName = "Solar" | "Grid" | string;

type EvChargingAlloc = {
  evcharging_id: number;
  sourceName: SourceName;
  purchased_kwh: number; // สัดส่วนที่ซื้อของ source นี้
};

type CancelSolarGridPayload = {
  items: Array<{
    evcharging_id: number;
    remaining_power: number; // kWh
  }>;
};

const ChargingEV = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // @ts-ignore
  const { paymentID, cabinet_id } = location.state || {};

  console.log("🟦 PAYMENT ID:", paymentID);
  console.log("🟩 CABINET ID:", cabinet_id);

  const [charging, setCharging] = useState(false);
  const [energy, setEnergy] = useState(0); // % จาก MeterValues จริง
  const [time, setTime] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const [userID, setUserID] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);

  const [hasStarted, setHasStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  const [ocppStatus, setOcppStatus] = useState<string>("Unknown");

  // @ts-ignore
  const [solarKwh, setSolarKwh] = useState<number | null>(null);
  // @ts-ignore
  const [gridKwh, setGridKwh] = useState<number | null>(null);

  const [chargerId, setChargerId] = useState<string | null>(null);
  const [cabinetName, setCabinetName] = useState<string>("");

  const [hardwarePoint, setHardwarePoint] = useState<string | null>(null);

  const [startEnergyWh, setStartEnergyWh] = useState<number | null>(null);
  // @ts-ignore
  const [finalEnergyWh, setFinalEnergyWh] = useState<number | null>(null);

  const [currentEnergyWh, setCurrentEnergyWh] = useState<number | null>(null);

  const [totalPurchasedKwh, setTotalPurchasedKwh] = useState<number | null>(null);

  const [energySources, setEnergySources] = useState<string[]>([]);

  const [evChargingAllocs, setEvChargingAllocs] = useState<EvChargingAlloc[]>([]);

  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionEndTime, setSessionEndTime] = useState<Date | null>(null);

  const [chargedKwhVal, setChargedKwhVal] = useState<number>(0);

  const firstMeterRef = useRef(false);

  // ✅ FREEZE เฉพาะกรณี Interruption (สำคัญมาก)
  // - เมื่อเข้า Interruption: "ห้าม" ตรวจ session/payload แล้ว navigate ออก
  // - ให้ค้างหน้านี้ไว้จน user กด Refresh เอง (refresh แล้วค่อยตรวจใหม่ตามปกติ)
  const [freezeInterruption, setFreezeInterruption] = useState(false);
  const freezeInterruptionRef = useRef(false);

  const storageKey =
    typeof paymentID !== "undefined" && paymentID !== null
      ? `${STORAGE_KEY_PREFIX}${paymentID}`
      : null;

  const fmt2 = useCallback((v: any) => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return "0.00";
    return n.toFixed(2);
  }, []);

  const purchasedText = useMemo(() => fmt2(totalPurchasedKwh ?? 0), [totalPurchasedKwh, fmt2]);
  const usedText = useMemo(() => fmt2(chargedKwhVal ?? 0), [chargedKwhVal, fmt2]);

  const sourcesInline = useMemo(() => {
    return energySources?.length ? energySources.join(", ") : "";
  }, [energySources]);

  // ✅ clamp % ให้ชัวร์ ๆ (กันกรณีแสดงผลทะลุ 100)
  const energyClamped = useMemo(() => {
    const n = Number(energy);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }, [energy]);

  // ✅ ถ้าไม่มี paymentID หรือ cabinet_id → กลับหน้าแรก
  // ❗ แต่ถ้าอยู่ในสถานะ Interruption (freeze) → "ห้ามตรวจ" และ "ห้ามเด้งออก"
  useEffect(() => {
    if (freezeInterruptionRef.current) return;

    if (!paymentID || !cabinet_id) {
      message.error("Payment information not found");
      navigate("/");
    }
  }, [paymentID, cabinet_id, navigate]);

  // 👉 โหลด User จาก JWT
  useEffect(() => {
    const fetchUser = async () => {
      let current = getCurrentUser();
      if (!current) current = await initUserProfile();
      if (current?.id) {
        setUserID(current.id);
      } else {
        message.error("Please log in");
        navigate("/login");
      }
    };
    fetchUser();
  }, [navigate]);

  // ⭐ โหลดข้อมูลตู้จาก cabinet_id → เอา ChargePoint + HardwarePoint มาใช้
  useEffect(() => {
    const loadCabinet = async () => {
      if (!cabinet_id) return;

      try {
        const idNum = Number(cabinet_id);
        if (Number.isNaN(idNum)) {
          message.error("Invalid cabinet code");
          return;
        }

        const cabinet = await GetCabinetByID(idNum);
        console.log("cabinetById : ", cabinet);

        if (!cabinet) {
          message.error("Charging cabinet information not found");
          return;
        }

        const cp = (cabinet as any).ChargePoint as string | undefined;
        const name = (cabinet as any).Name as string | undefined;
        const hwPoint = (cabinet as any).Hardware?.HardwarePoint as string | undefined;

        if (!cp) {
          message.error("ChargePoint not set");
        } else {
          setChargerId(cp);
          console.log("✅ Loaded ChargePoint from cabinet:", cp);
        }

        if (name) setCabinetName(name);

        if (hwPoint) {
          setHardwarePoint(hwPoint);
          console.log("✅ Loaded HardwarePoint from cabinet:", hwPoint);
        } else {
          console.log("ℹ️ Cabinet This is not yet tied to a HardwarePoint.");
        }
      } catch (err) {
        console.error("❌ loadCabinet error:", err);
        message.error("Unable to load charging cabinet data");
      }
    };

    loadCabinet();
  }, [cabinet_id]);

  // ===========================================================
  // ⭐ ฟังก์ชันโหลด Session (ดึง StartEnergy, StartTime, EndTime, EVChargingPayments)
  // ===========================================================
  const checkSession = useCallback(async () => {
    // ✅ ถ้าอยู่ในโหมด freeze (Interruption) → ห้ามเช็ค session และห้าม navigate
    if (freezeInterruptionRef.current) {
      console.log("🧊 checkSession skipped เพราะอยู่ในสถานะ Interruption (freeze)");
      setIsVerifying(false);
      return;
    }

    if (!userID) return;

    const sessions = await GetChargingSessionByUserID(userID);
    console.log("📦 All sessions from GetChargingSessionByUserID:", sessions);

    if (!sessions || sessions.length === 0) {
      navigate("/user");
      setIsVerifying(false);
      return;
    }

    let targetSession: any | undefined;

    if (sessions.length > 2 && chargerId) {
      targetSession = sessions.find(
        (s: any) =>
          s?.Payment?.EVCabinet?.ChargePoint && s.Payment.EVCabinet.ChargePoint === chargerId
      );
    }

    if (!targetSession) {
      targetSession = sessions.find((s: any) => Boolean(s?.Status)) ?? sessions[0];
    }

    console.log("🎯 Session ที่เลือกใช้สำหรับตู้ปัจจุบัน:", targetSession);

    const rawStartEnergy = targetSession?.StartEnergy;
    const startEnergy = Number(rawStartEnergy ?? 0);

    if (startEnergy > 0) {
      setStartEnergyWh(startEnergy);
      console.log("⚡ StartEnergy (Wh) ของ session:", startEnergy);
    } else {
      console.log("⚠️ StartEnergy จาก backend = 0 → รอ socket อัปเดต", rawStartEnergy);
    }

    const startTimeStr: string | undefined = targetSession?.StartTime;
    const endTimeStr: string | undefined = targetSession?.EndTime;

    let startDate: Date | null = null;
    let endDate: Date | null = null;

    if (startTimeStr && startTimeStr !== ZERO_TIME_STR) {
      const d = new Date(startTimeStr);
      if (!Number.isNaN(d.getTime())) startDate = d;
      else console.log("⚠️ Invalid StartTime:", startTimeStr);
    }

    if (endTimeStr && endTimeStr !== ZERO_TIME_STR) {
      const e = new Date(endTimeStr);
      if (!Number.isNaN(e.getTime())) endDate = e;
      else console.log("⚠️ Invalid EndTime:", endTimeStr);
    }

    setSessionStartTime(startDate);
    setSessionEndTime(endDate);

    if (startDate && endDate) {
      const sec = Math.max(0, Math.floor((endDate.getTime() - startDate.getTime()) / 1000));
      setTime(sec);
      setHasStarted(true);
      setCharging(false);
    } else if (startDate && !endDate) {
      setHasStarted(true);
      setCharging(true);
      const sec = Math.max(0, Math.floor((Date.now() - startDate.getTime()) / 1000));
      setTime(sec);
    } else {
      setHasStarted(false);
      setCharging(false);
      setTime(0);
    }

    const evPays = targetSession?.Payment?.EVChargingPayments || [];

    const sourceList: string[] = Array.from(
      new Set<string>(
        evPays
          .map((p: any) => p?.EVcharging?.EnergySource?.Name)
          .filter((name: any): name is string => typeof name === "string")
      )
    );
    setEnergySources(sourceList);
    console.log("🔆 Energy sources for this session:", sourceList);

    const allocsRaw: EvChargingAlloc[] = evPays
      .map((p: any) => {
        const id = Number(p?.EVchargingID ?? p?.evcharging_id ?? p?.ev_charging_id ?? 0);
        const purchased = Number(p?.Power ?? 0); // kWh
        const srcName = (p?.EVcharging?.EnergySource?.Name ?? "") as SourceName;

        return {
          evcharging_id: id,
          purchased_kwh: Number.isFinite(purchased) ? purchased : 0,
          sourceName: srcName || "Unknown",
        };
      })
      .filter(
        (x: any) => Number.isFinite(x.evcharging_id) && x.evcharging_id > 0 && x.purchased_kwh > 0
      );

    const mergedMap = new Map<number, EvChargingAlloc>();
    for (const a of allocsRaw) {
      const prev = mergedMap.get(a.evcharging_id);
      if (!prev) mergedMap.set(a.evcharging_id, { ...a });
      else
        mergedMap.set(a.evcharging_id, {
          ...prev,
          purchased_kwh: (prev.purchased_kwh || 0) + (a.purchased_kwh || 0),
          sourceName: prev.sourceName || a.sourceName,
        });
    }

    const allocs = Array.from(mergedMap.values());
    setEvChargingAllocs(allocs);

    console.log("🧮 EVCharging allocs (ตามที่ซื้อ):", allocs);

    const totalPowerKwh = allocs.reduce((sum, a) => sum + (Number(a.purchased_kwh) || 0), 0);
    setTotalPurchasedKwh(totalPowerKwh);

    const totalPowerWh = totalPowerKwh * 1000;
    const finalEnergy = startEnergy + totalPowerWh;
    setFinalEnergyWh(finalEnergy);

    console.log("🔋 Total Purchased (kWh):", totalPowerKwh);
    console.log("📊 FinalEnergy(Wh)=StartEnergy+TotalPowerWh:", finalEnergy);

    const active = Boolean(targetSession?.Status);

    // ✅ ปกติ: ถ้า active=false ให้เด้งออก
    // ❗ แต่ถ้าเกิด Interruption เราจะไม่มาถึงตรงนี้เพราะถูก freeze ไว้แล้ว (checkSession ถูก skip)
    if (active) setSessionValid(true);
    else navigate("/user");

    setIsVerifying(false);
  }, [userID, chargerId, navigate]);

  useEffect(() => {
    if (!userID) return;
    if (freezeInterruptionRef.current) return; // ✅ freeze แล้วห้ามตรวจ
    checkSession();
  }, [userID, checkSession]);

  // ⭐ เรียก API ถามสถานะตู้ตอนเปิดหน้านี้
  useEffect(() => {
    const fetchInitialStatus = async () => {
      try {
        if (!chargerId) return;
        const status = await getChargerStatus(chargerId);
        if (status && typeof status.status === "string") {
          setOcppStatus(status.status);
        }
      } catch (err) {
        console.error("❌ getChargerStatus error:", err);
      }
    };
    fetchInitialStatus();
  }, [chargerId]);

  // 👉 ฟัง WebSocket OCPP
  useEffect(() => {
    if (!chargerId) {
      console.log("ℹ️ OCPP WS: chargerId ยังไม่มา → ยังไม่ต่อ WebSocket");
      return;
    }

    const enterFreezeInterruption = (reason: string) => {
      // ✅ เข้าสถานะ Interruption แล้ว “ค้างหน้าเดิม”
      console.warn("⚠️ [OCPP] Interruption:", reason);

      freezeInterruptionRef.current = true;
      setFreezeInterruption(true);

      setOcppStatus("Interruption");
      setCharging(false);

      // ✅ ทำให้เวลาหยุดนิ่ง (ค้างค่าเดิม) แต่ไม่เด้งออก
      if (!sessionEndTime) setSessionEndTime(new Date());
      setIsVerifying(false);

      // ❌ ห้าม checkSession / ห้าม navigate ในจุดนี้ (ตามที่ขอ)
    };

    const ws = connectOcppSocket(
      (data: any) => {
        try {
          // ✅ รองรับ "DATA JSON" จาก backend (ไม่ใช่ OCPP frame)
          if (data && typeof data === "object" && !Array.isArray(data)) {
            // 1) start_energy_updated (ของเดิม)
            if (data.type === "start_energy_updated") {
              // ✅ ถ้า freeze แล้วไม่ต้องทำอะไร
              if (freezeInterruptionRef.current) return;

              if (!firstMeterRef.current) {
                firstMeterRef.current = true;
                console.log("🔥 [OCPP] start_energy_updated → reload session in 2s");
                setTimeout(() => {
                  if (!freezeInterruptionRef.current) checkSession();
                }, 2000);
              }
              return;
            }

            // 2) ✅ charger_status_update (ของใหม่จาก backend ตอน disconnect->Interruption)
            if (data.type === "charger_status_update") {
              const st = String((data as any).status || "");
              if (st) setOcppStatus(st);

              if (st === "Interruption") {
                // ✅ เข้าสู่ freeze ทันที
                enterFreezeInterruption("charger_status_update");
              }
              return;
            }

            return;
          }

          // ✅ OCPP frame แบบ array
          if (!Array.isArray(data) || data.length < 3) return;

          const messageType = data[0];
          const action = data[2];
          const payload = data[3];

          if (messageType === 2 && action === "StatusNotification") {
            if (payload && typeof payload.status === "string") {
              const newStatus = payload.status as string;
              setOcppStatus(newStatus);

              // ✅ ถ้าเป็น SuspendedEV อาจอยาก reload session (แต่ต้องไม่ใช่ตอน freeze)
              if (newStatus === "SuspendedEV") {
                if (!freezeInterruptionRef.current) {
                  setTimeout(() => checkSession(), 1000);
                }
              }
            }
          }

          if (messageType === 2 && action === "MeterValues") {
            if (!payload) return;

            const meterValues = payload.meterValue;
            if (!Array.isArray(meterValues) || meterValues.length === 0) return;

            const firstMeter = meterValues[0];
            const sampled = firstMeter?.sampledValue;
            if (!Array.isArray(sampled)) return;

            const energySample = sampled.find(
              (s: any) =>
                s?.measurand === "Energy.Active.Import.Register" && (s?.unit === "Wh" || !s?.unit)
            );

            if (!energySample || energySample.value == null) return;

            const energyWh = Number(energySample.value);
            if (!Number.isFinite(energyWh)) return;

            setCurrentEnergyWh(energyWh);
          }
        } catch (err) {
          console.error("Error parsing OCPP message:", err);
        }
      },
      chargerId
    );

    // ✅ ดักกรณี WS หลุด/พัง → เข้า Interruption และ freeze ทันที
    const onClose = () => enterFreezeInterruption("websocket closed");
    const onError = () => enterFreezeInterruption("websocket error");

    ws.addEventListener("close", onClose);
    ws.addEventListener("error", onError);

    return () => {
      ws.removeEventListener("close", onClose);
      ws.removeEventListener("error", onError);
      ws.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chargerId, checkSession, sessionEndTime]);

  // ⭐ ฟัง WebSocket Hardware
  useEffect(() => {
    if (!hardwarePoint) {
      console.log("ℹ️ HW WS: hardwarePoint ยังไม่มา → ยังไม่ต่อ WebSocket hardware");
      return;
    }

    const ws = connectHardwareSocket(
      (data: any) => {
        if (typeof data === "string") return;

        if (data?.type === "remaining_energy" && data?.payload) {
          const payload = data.payload as Record<string, number | undefined>;
          const solarVal = payload["Solar"];
          const gridVal = payload["Grid"];
          if (typeof solarVal === "number") setSolarKwh(solarVal);
          if (typeof gridVal === "number") setGridKwh(gridVal);
        }
      },
      hardwarePoint
    );

    return () => ws.close();
  }, [hardwarePoint]);

  // 👉 นับเวลาโดยอิงจาก sessionStartTime + สถานะ OCPP
  useEffect(() => {
    if (!sessionValid || !sessionStartTime) return;

    // ✅ ถ้า freeze แล้วให้ค้างเวลา (ไม่ต้อง setInterval)
    if (freezeInterruptionRef.current) {
      if (sessionEndTime) {
        const sec = Math.max(
          0,
          Math.floor((sessionEndTime.getTime() - sessionStartTime.getTime()) / 1000)
        );
        setTime(sec);
      }
      return;
    }

    if (ocppStatus === "SuspendedEV") {
      if (sessionEndTime) {
        const sec = Math.max(
          0,
          Math.floor((sessionEndTime.getTime() - sessionStartTime.getTime()) / 1000)
        );
        setTime(sec);
      }
      return;
    }

    if (ocppStatus === "Charging") {
      const updateElapsed = () => {
        const sec = Math.max(0, Math.floor((Date.now() - sessionStartTime.getTime()) / 1000));
        setTime(sec);
      };

      updateElapsed();
      const intervalId = window.setInterval(updateElapsed, 1000);
      return () => window.clearInterval(intervalId);
    }

    if (sessionEndTime) {
      const sec = Math.max(
        0,
        Math.floor((sessionEndTime.getTime() - sessionStartTime.getTime()) / 1000)
      );
      setTime(sec);
      return;
    }

    const updateElapsed = () => {
      const sec = Math.max(0, Math.floor((Date.now() - sessionStartTime.getTime()) / 1000));
      setTime(sec);
    };

    updateElapsed();
    const intervalId = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(intervalId);
  }, [sessionValid, sessionStartTime, sessionEndTime, ocppStatus]);

  // ⭐ คำนวณ % จาก MeterValues
  useEffect(() => {
    if (startEnergyWh == null || totalPurchasedKwh == null || currentEnergyWh == null) return;

    const totalDeltaWh = totalPurchasedKwh * 1000;
    if (totalDeltaWh <= 0) return;

    const currentDeltaWh = currentEnergyWh - startEnergyWh;
    const rawPercent = (currentDeltaWh / totalDeltaWh) * 100;

    const clampedPercent = Math.max(0, Math.min(100, rawPercent));
    const percent2 = parseFloat(clampedPercent.toFixed(2));
    setEnergy(percent2);

    if (currentDeltaWh >= totalDeltaWh * 0.999) {
      setIsComplete(true);
      setCharging(false);
    }
  }, [startEnergyWh, totalPurchasedKwh, currentEnergyWh]);

  // ⭐ คำนวณ used (kWh)
  useEffect(() => {
    if (startEnergyWh == null || currentEnergyWh == null) return;

    const deltaWh = currentEnergyWh - startEnergyWh;
    if (deltaWh <= 0) {
      setChargedKwhVal(0);
      return;
    }

    let effectiveDeltaWh = deltaWh;

    if (totalPurchasedKwh != null) {
      const maxDeltaWh = totalPurchasedKwh * 1000;
      if (maxDeltaWh > 0 && effectiveDeltaWh > maxDeltaWh) {
        effectiveDeltaWh = maxDeltaWh;
      }
    }

    const kWh = effectiveDeltaWh / 1000;
    setChargedKwhVal(kWh);
  }, [startEnergyWh, currentEnergyWh, totalPurchasedKwh]);

  // ⭐ restore localStorage
  useEffect(() => {
    if (!storageKey) return;
    if (typeof window === "undefined") return;

    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        energyPercent?: number;
        chargedKwh?: number;
        isComplete?: boolean;
      };

      if (typeof parsed.energyPercent === "number") setEnergy(parsed.energyPercent);
      if (typeof parsed.chargedKwh === "number") setChargedKwhVal(parsed.chargedKwh);
      if (typeof parsed.isComplete === "boolean") setIsComplete(parsed.isComplete);

      console.log("🔁 Restore from localStorage:", parsed);
    } catch (err) {
      console.error("❌ Cannot parse charging state from localStorage:", err);
    }
  }, [storageKey]);

  // ⭐ save localStorage
  useEffect(() => {
    if (!storageKey) return;
    if (typeof window === "undefined") return;

    try {
      const payload = {
        energyPercent: energyClamped,
        chargedKwh: chargedKwhVal,
        isComplete,
      };
      localStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (err) {
      console.error("❌ Cannot save charging state from localStorage:", err);
    }
  }, [storageKey, energyClamped, chargedKwhVal, isComplete]);

  // ✅ สีแบตเตอรี่ ตาม % energy
  const batteryGradient = useMemo(() => {
    if (energyClamped < 20) return "linear-gradient(180deg, #f87171, #ef4444)";
    if (energyClamped < 40) return "linear-gradient(180deg, #fb923c, #f97316)";
    if (energyClamped < 60) return "linear-gradient(180deg, #fbbf24, #f59e0b)";
    if (energyClamped < 80) return "linear-gradient(180deg, #a3e635, #84cc16)";
    return "linear-gradient(180deg, #34d399, #22c55e)";
  }, [energyClamped]);

  // ✅ UI STATUS OVERRIDE
  const uiOcppStatus = useMemo(() => {
    if (ocppStatus === "Interruption") return "Interruption";
    if (ocppStatus === "SuspendedEV") return "SuspendedEV";
    if (isComplete) return "Finishing";
    return ocppStatus || "Unknown";
  }, [ocppStatus, isComplete]);

  const { statusLabel, statusClass } = useMemo(() => {
    const s = uiOcppStatus || "Unknown";
    let cls = "bg-gray-100 text-gray-700 border border-gray-200";

    switch (s) {
      case "Available":
        cls = "bg-green-50 text-green-700 border border-green-200";
        break;
      case "Preparing":
        cls = "bg-amber-50 text-amber-700 border border-amber-200";
        break;
      case "Charging":
        cls = "bg-sky-50 text-sky-700 border border-sky-200";
        break;
      case "Unavailable":
      case "Faulted":
        cls = "bg-red-50 text-red-700 border border-red-200";
        break;
      case "Finishing":
        cls = "bg-purple-50 text-purple-700 border border-purple-200";
        break;
      case "SuspendedEV":
        cls = "bg-gray-50 text-gray-800 border border-gray-200";
        break;
      case "Interruption":
        cls = "bg-orange-900/5 text-orange-500 border border-orange-400";
        break;
      default:
        cls = "bg-gray-50 text-gray-700 border border-gray-200";
        break;
    }

    return { statusLabel: s, statusClass: cls };
  }, [uiOcppStatus]);

  const showBubbles = statusLabel === "Charging";
  const isChargingAnim = statusLabel === "Charging";

  const clearLocalStorageState = () => {
    if (!storageKey) return;
    if (typeof window === "undefined") return;
    try {
      localStorage.removeItem(storageKey);
      console.log("🧹 Clear charging state from localStorage:", storageKey);
    } catch (err) {
      console.error("❌ Cannot clear charging state from localStorage:", err);
    }
  };

  const goToSummary = () => {
    if (!paymentID) return;

    setTimeout(() => {
      navigate("/user", {
        replace: true,
        state: { fromCharging: true, paymentID: Number(paymentID) },
      });
    }, 750);
  };

  // ===========================================================
  // ✅ คำนวณ remaining_power จริงตามสัดส่วนที่ "ซื้อ" (ใช้ตอน Cancel เท่านั้น)
  // ===========================================================
  const buildCancelSolarGridPayload = (): CancelSolarGridPayload | null => {
    const allocs = (evChargingAllocs || []).filter(
      (a) => a.evcharging_id > 0 && Number.isFinite(a.purchased_kwh) && a.purchased_kwh > 0
    );

    if (allocs.length < 1) {
      console.log("❌ buildPayload: allocs < 1", allocs);
      return null;
    }

    const total = Number(totalPurchasedKwh ?? 0);
    const used = Number(chargedKwhVal ?? 0);

    if (!Number.isFinite(total) || total <= 0) {
      console.log("❌ buildPayload: totalPurchasedKwh invalid", totalPurchasedKwh);
      return null;
    }

    const remainingTotal = Math.max(0, total - Math.max(0, used));

    const allocTotal = allocs.reduce((sum, a) => sum + (Number(a.purchased_kwh) || 0), 0);
    const denom = allocTotal > 0 ? allocTotal : total;

    let running = 0;

    const items = allocs.map((a, idx) => {
      const ratio = (Number(a.purchased_kwh) || 0) / denom;

      let remaining = remainingTotal * ratio;
      remaining = Math.max(0, parseFloat(remaining.toFixed(2)));

      if (idx === allocs.length - 1) {
        const last = Math.max(0, parseFloat((remainingTotal - running).toFixed(2)));
        remaining = last;
      } else {
        running = parseFloat((running + remaining).toFixed(2));
      }

      return {
        evcharging_id: a.evcharging_id,
        remaining_power: remaining,
      };
    });

    const payload: CancelSolarGridPayload = { items };

    console.log("🧾 [CancelSessionSolarGrid] CALC DEBUG:", {
      totalPurchasedKwh: total,
      usedKwh: used,
      remainingTotalKwh: remainingTotal,
      allocs,
      allocTotal,
      payload,
    });

    return payload;
  };

  // ===========================================================
  // ⭐ Cancel (ใช้ CancelSessionSolarGrid)
  // ===========================================================
  const confirmCancel = async () => {
    // ✅ ถ้า freeze อยู่ (Interruption) → ไม่ให้ทำอะไร
    if (freezeInterruptionRef.current) return;

    if (!paymentID) {
      message.error("Payment ID not found");
      return;
    }

    if (!chargerId) {
      message.error("ChargePoint not found in charging cabinet");
      return;
    }

    const payload = buildCancelSolarGridPayload();
    if (!payload) {
      message.error("ไม่พบข้อมูล Solar+Grid เพียงพอ (evcharging_id / purchased_kwh)");
      return;
    }

    try {
      await remoteStopCharging({ chargerId });

      await CancelSessionSolarGrid(Number(paymentID), payload);

      message.success("Canceled successfully");

      setCharging(false);
      setIsComplete(false);
      setEnergy(0);
      setTime(0);
      setSessionStartTime(null);
      setCancelModalOpen(false);

      clearLocalStorageState();
      setTimeout(goToSummary, 1000);
    } catch (err: any) {
      console.error("❌ Cancel error:", err?.response?.data || err);
    }
  };

  // ===========================================================
  // ⭐ Start
  // ===========================================================
  const handleStart = async () => {
    // ✅ ถ้า freeze อยู่ (Interruption) → ไม่ให้ start
    if (freezeInterruptionRef.current) return;

    if (hasStarted || isComplete || statusLabel !== "Preparing") return;

    if (!chargerId) {
      message.error("ChargePoint not found in charging cabinet");
      return;
    }

    try {
      await remoteStartCharging({
        chargerId,
        connectorId: 1,
        idTag: "EV-SIM-001",
      });

      message.success("Charging started");

      const now = new Date();
      setSessionStartTime(now);
      setSessionEndTime(null);
      setHasStarted(true);
      setCharging(true);
      setIsComplete(false);
      setTime(0);
    } catch (err: any) {
      console.error("🔥 RemoteStart ERROR:", err?.response?.data || err);
      message.error("Unable to send charging start command to cabinet");
    }
  };

  // ===========================================================
  // ⭐ Finish (❌ ไม่เรียก CancelSessionSolarGrid)
  // ===========================================================
  const handleComplete = async () => {
    // ✅ ถ้า freeze อยู่ (Interruption) → ไม่ให้ finish
    if (freezeInterruptionRef.current) return;

    if (!paymentID) {
      message.error("No Payment ID");
      return;
    }

    if (!userID) {
      message.error("User not found");
      navigate("/login");
      return;
    }

    if (!isComplete) {
      message.error("You can complete only when charging reaches 100%");
      return;
    }

    if (!chargerId) {
      message.error("ChargePoint not found in charging cabinet");
      return;
    }

    try {
      // ✅ จบชาร์จ: สั่งหยุดตู้พอ (ไม่ต้องคำนวณ remaining)
      // ✅ ต้องการเก็บไว้ แต่ถ้า error "ห้ามขึ้น error และห้ามหยุด flow"
      await remoteStopCharging({ chargerId }).catch((err: any) => {
        console.warn("⚠️ remoteStopCharging failed (ignored):", err?.response?.data || err);
      });

      const ok = await UpdateSessionStatusByPaymentID(paymentID);

      if (!ok) {
        message.error("Status update failed");
        return;
      }

      setCharging(false);
      setSessionStartTime(null);
      setSessionEndTime(null);

      clearLocalStorageState();

      const reviews = await GetReviewByUserID(userID);

      if (reviews && reviews.length > 0) {
        message.success("Charging completed");
        setTimeout(goToSummary, 1000);
      } else {
        setShowReviewModal(true);
      }
    } catch (err: any) {
      console.error("❌ Finish error:", err?.response?.data || err);
      const msg =
        err?.response?.data?.error || err?.response?.data?.message || "Unable to complete charging";
      message.error(msg);
    }
  };

  // 👉 Loading
  if (isVerifying) return <Loader />;

  // ✅ ถ้า sessionValid=false ปกติจะ return null
  // ❗ แต่ถ้า Interruption (freeze) ให้ “ค้างหน้าเดิม” ไว้ (ห้ามเด้ง/ห้ามหาย)
  if (!sessionValid && !freezeInterruption) return null;

  // ===========================================================
  // ✅ เงื่อนไขปุ่ม
  // ===========================================================
  const startDisabled =
    freezeInterruption || isComplete || statusLabel !== "Preparing" || !chargerId;

  const canCancelBase =
    !freezeInterruption &&
    !!chargerId &&
    !isComplete &&
    (statusLabel === "Charging" || statusLabel === "SuspendedEV");

  const canCompleteBase = !freezeInterruption && !!hasStarted && !!isComplete;

  const canCancel = canCancelBase && !canCompleteBase;
  const canComplete = canCompleteBase && !canCancelBase;

  const cancelDisabled = !canCancel;
  const completeDisabled = !canComplete;

  // ✅ ตอนใกล้เต็มมาก ๆ ให้ขอบมนบนด้วย
  const fillRoundedClass = energyClamped >= 99.5 ? "rounded-xl" : "rounded-b-xl";

  return (
    <>
      {/* ⭐ Modal รีวิว */}
      <ModalCreate
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        UserID={userID!}
        onReviewCreated={() =>
          navigate("/user", {
            replace: true,
            state: {
              fromCharging: true,
              paymentID: Number(paymentID),
            },
          })
        }
      />

      {/* ⭐ EV Premium Cancel Modal */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setCancelModalOpen(false)}
          />

          <div
            className="
              relative w-full max-w-[400px]
              bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.12)]
              border border-gray-100
              overflow-hidden
              animate-fadeIn
            "
          >
            <button
              onClick={() => setCancelModalOpen(false)}
              className="
                absolute top-3 right-3
                p-2 rounded-full
                hover:bg-gray-100
                active:scale-90 transition
              "
            >
              <svg
                className="w-5 h-5 text-gray-500"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 L6 18" strokeLinecap="round" />
                <path d="M6 6 L18 18" strokeLinecap="round" />
              </svg>
            </button>

            <div className="px-6 py-9 text-center flex flex-col items-center">
              <div className="relative mb-5">
                <div className="absolute inset-0 blur-xl bg-blue-300 opacity-40 rounded-full" />
                <div
                  className="
                    relative z-10
                    w-16 h-16
                    flex items-center justify-center
                    rounded-full
                    bg-gradient-to-b from-blue-50 to-blue-100
                    shadow-inner border border-blue-200
                  "
                >
                  <svg
                    className="w-7 h-7 text-blue-600 drop-shadow-md"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path
                      d="M13 2 L6 14 H12 L11 22 L18 10 H12 Z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>

              <h3 className="text-xl font-bold text-gray-900 tracking-tight">
                Want to cancel charging?
              </h3>

              <p className="text-sm text-gray-600 mt-2 leading-relaxed max-w-[280px]">
                If you confirm, charging will be stopped immediately and the remaining power will be
                calculated &amp; saved Power
              </p>
            </div>

            <div className="px-6 pb-7">
              <button
                onClick={confirmCancel}
                className="
                  w-full py-3.5 rounded-xl font-semibold text-white
                  bg-gradient-to-r from-blue-600 to-sky-500
                  shadow-[0_4px_15px_rgba(56,132,255,0.45)]
                  hover:shadow-[0_6px_20px_rgba(56,132,255,0.55)]
                  active:scale-[0.97]
                  transition-all
                "
              >
                Confirm cancellation
              </button>
            </div>
          </div>

          <style>{`
            @keyframes fadeIn {
              from { opacity: 0; transform: translateY(14px) scale(0.96); }
              to   { opacity: 1; transform: translateY(0px) scale(1); }
            }
            .animate-fadeIn { animation: fadeIn 0.25s ease-out; }
          `}</style>
        </div>
      )}

      {/* MAIN SCREEN */}
      <div className="min-h-screen bg-white w-full">
        <header className="sticky top-0 z-20 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md overflow-hidden">
          <div className="w-full px-4 py-3 flex items-center gap-2 justify-start">
            <button
              onClick={() => window.history.back()}
              aria-label="ย้อนกลับ"
              className="h-9 w-9 flex items-center justify-center rounded-xl active:bg-white/15"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                stroke="currentColor"
                fill="none"
                strokeWidth="2"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <div className="flex flex-col md:flex-row md:items-center md:gap-2">
              <div className="flex items-center gap-2">
                <FaBolt className="h-5 w-5 text.white" />
                <span className="text-sm md:text-base font-semibold tracking-wide">EV Charging</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {cabinetName && (
                  <span className="text-[11px] md:text-xs text-white/80 md:ml-2">
                    Cabinet : {cabinetName}
                  </span>
                )}

                {sourcesInline && (
                  <span className="text-[11px] md:text-xs text-white/85 md:ml-2">
                    • Sources : {sourcesInline}
                  </span>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="px-4 pt-5 pb-10">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-md w-full">
            <div className="mb-4 flex items-center justify-between">
              <h2
                className={`flex items-center gap-2 text-base font-semibold text-blue-900 ${
                  isChargingAnim ? "charging-title" : ""
                }`}
                style={
                  isChargingAnim
                    ? ({
                        ["--titleGlow" as any]: batteryGradient,
                      } as React.CSSProperties)
                    : undefined
                }
              >
                <FaBolt className={`text-blue-600 ${isChargingAnim ? "bolt-pulse" : ""}`} /> Charging
              </h2>

              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  charging
                    ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                    : isComplete
                    ? "bg-green-50 text-green-700 ring-1 ring-green-200"
                    : "bg-gray-50 text-gray-600 ring-1 ring-gray-200"
                }`}
              >
                {charging ? "CHARGING" : isComplete ? "COMPLETE" : "IDLE"}
              </span>
            </div>

            <div className="w-full flex items-start justify-center gap-5">
              <div className="flex flex-col items-center">
                <div className="mx-auto mb-1 h-2 w-12 rounded-sm bg-gray-300" />

                {/* ✅ BATTERY */}
                <div className="relative h-[320px] w-[150px] rounded-2xl border-2 border-gray-300 p-2 bg-white overflow-hidden">
                  <div className="absolute inset-2 rounded-xl overflow-hidden border border-gray-200 bg-gray-100">
                    <div
                      className={`absolute left-0 right-0 bottom-0 transition-all duration-500 ease-out ${fillRoundedClass}`}
                      style={{
                        height: `${energyClamped}%`,
                        background: batteryGradient,
                      }}
                    />

                    {showBubbles && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={
                          {
                            ["--bubbleGradient" as any]: batteryGradient,
                          } as React.CSSProperties
                        }
                      >
                        <span className="bubble bubble-1" />
                        <span className="bubble bubble-2" />
                        <span className="bubble bubble-3" />
                        <span className="bubble bubble-4" />
                        <span className="bubble bubble-5" />
                        <span className="bubble bubble-6" />
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-stretch gap-3 min-w-[160px]">
                <div className="rounded-xl bg-blue-50 px-4 py-3">
                  <div className="text-[11px] text-blue-900/70">Percent</div>
                  <div className="text-3xl font-extrabold text-blue-700">
                    {energyClamped.toFixed(2)}%
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-[11px] text-gray-500">Time</div>
                  <div className="font-semibold text-gray-800">
                    {(() => {
                      const h = String(Math.floor(time / 3600)).padStart(2, "0");
                      const m = String(Math.floor((time % 3600) / 60)).padStart(2, "0");
                      const s = String(time % 60).padStart(2, "0");
                      return `${h}:${m}:${s}`;
                    })()}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-[11px] text-gray-500">Used (kWh)</div>
                  <div className="font-semibold text-gray-800">
                    {usedText} <span className="text-gray-400">/</span> {purchasedText}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-1">used / purchased</div>
                </div>

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-[11px] text-gray-500">status</div>
                  <div className="mt-1">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold ${statusClass}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-4">
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={handleStart}
                  disabled={startDisabled}
                  className={`w-full rounded-xl px-3 py-3 text-sm font-semibold text-white
                    ${
                      startDisabled
                        ? "bg-blue-300 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-700"
                    }`}
                >
                  Start
                </button>

                <button
                  onClick={() => {
                    if (!cancelDisabled) setCancelModalOpen(true);
                  }}
                  disabled={cancelDisabled}
                  className={`w-full rounded-xl px-3 py-3 text-sm font-semibold
                    ${
                      cancelDisabled
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-red-500 text-white hover:bg-red-600"
                    }`}
                >
                  Cancel
                </button>

                <button
                  disabled={completeDisabled}
                  onClick={handleComplete}
                  className={`w-full rounded-xl px-3 py-3 text-sm font-semibold
                    ${
                      completeDisabled
                        ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                        : "bg-green-600 text-white hover:bg-green-700"
                    }`}
                >
                  Finish
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* ✅ Bubble CSS + Title Animation CSS */}
      <style>{`
        /* =========================
          Charging Title Animation
        ========================== */
        .charging-title {
          position: relative;
          transform-origin: left center;
          animation: titleFloat 1.6s ease-in-out infinite;
          text-shadow: 0 1px 0 rgba(255,255,255,0.25);
        }

        .charging-title::after {
          content: "";
          position: absolute;
          inset: -10px -14px;
          border-radius: 14px;
          background: var(--titleGlow);
          opacity: 0.18;
          filter: blur(14px);
          z-index: -1;
          animation: titleGlow 1.2s ease-in-out infinite;
        }

        @keyframes titleFloat {
          0%   { transform: translateY(0px); }
          50%  { transform: translateY(-2px); }
          100% { transform: translateY(0px); }
        }

        @keyframes titleGlow {
          0%   { opacity: 0.12; filter: blur(14px); }
          50%  { opacity: 0.22; filter: blur(18px); }
          100% { opacity: 0.12; filter: blur(14px); }
        }

        .bolt-pulse {
          animation: boltPulse 0.9s ease-in-out infinite;
          transform-origin: center;
        }

        @keyframes boltPulse {
          0%   { transform: scale(1); filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
          50%  { transform: scale(1.12); filter: drop-shadow(0 8px 12px rgba(0,0,0,0.12)); }
          100% { transform: scale(1); filter: drop-shadow(0 0 0 rgba(0,0,0,0)); }
        }

        /* =========================
          Bubble Animation
        ========================== */
        .bubble {
          position: absolute;
          bottom: -14px;
          border-radius: 9999px;
          background: var(--bubbleGradient);

          opacity: 0;
          filter: blur(0.15px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.10);
          border: 1px solid rgba(255,255,255,0.28);

          mix-blend-mode: screen;

          animation-name: bubbleUp;
          animation-timing-function: ease-in;
          animation-iteration-count: infinite;
        }

        @keyframes bubbleUp {
          0%   { transform: translateY(0) scale(0.85); opacity: 0; }
          12%  { opacity: 0.55; }
          100% { transform: translateY(-340px) scale(1.15); opacity: 0; }
        }

        .bubble-1 { left: 18%; width: 10px; height: 10px; animation-duration: 1.7s; animation-delay: 0.0s; }
        .bubble-2 { left: 42%; width: 7px;  height: 7px;  animation-duration: 1.3s; animation-delay: 0.2s; }
        .bubble-3 { left: 65%; width: 12px; height: 12px; animation-duration: 1.9s; animation-delay: 0.4s; }
        .bubble-4 { left: 30%; width: 6px;  height: 6px;  animation-duration: 1.1s; animation-delay: 0.6s; }
        .bubble-5 { left: 78%; width: 8px;  height: 8px;  animation-duration: 1.5s; animation-delay: 0.1s; }
        .bubble-6 { left: 54%; width: 5px;  height: 5px;  animation-duration: 1.0s; animation-delay: 0.35s; }
      `}</style>
    </>
  );
};

export default ChargingEV;
