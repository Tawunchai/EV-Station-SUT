// src/pages/user/ev/ChargingEV.tsx

import { useEffect, useMemo, useState } from "react";
import { FaBolt } from "react-icons/fa";
import { message } from "antd";
import ModalCreate from "../review/create";
import {
  GetReviewByUserID,
  GetChargingSessionByUserID,
  UpdateSessionStatusByPaymentID,
  requestEnergyUsage,
  connectHardwareSocket, // ⭐ WebSocket hardware
  GetCabinetByID, // ⭐ ดึงข้อมูลตู้ชาร์จตาม ID
} from "../../../services";
import {
  connectOcppSocket,
  remoteStartCharging,
  remoteStopCharging,
  getChargerStatus, // ⭐ สอบถามสถานะล่าสุด
} from "../../../services/ocpp";
import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";
import { useNavigate, useLocation } from "react-router-dom";

const ZERO_TIME_STR = "0001-01-01T00:00:00Z";

const ChargingEV = () => {
  const navigate = useNavigate();

  // ⭐ รับค่าจากหน้า before-payment → after-payment
  const location = useLocation();
  // @ts-ignore
  const { paymentID, cabinet_id } = location.state || {};

  console.log("🟦 PAYMENT ID:", paymentID);
  console.log("🟩 CABINET ID:", cabinet_id);

  const [charging, setCharging] = useState(false);
  const [energy, setEnergy] = useState(0); // จะใช้เก็บ "เปอร์เซ็นต์" จาก MeterValues จริง
  const [time, setTime] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);

  const [userID, setUserID] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [sessionValid, setSessionValid] = useState(false);

  const [hasStarted, setHasStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // ⭐ Modal ยืนยันยกเลิก
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

  // ⭐ เก็บสถานะจาก OCPP StatusNotification / API
  const [ocppStatus, setOcppStatus] = useState<string>("Unknown");

  // ⭐ เก็บค่าจาก hardware (เอาไว้ log + future UI)
  // @ts-ignore
  const [solarKwh, setSolarKwh] = useState<number | null>(null);
  // @ts-ignore
  const [gridKwh, setGridKwh] = useState<number | null>(null);

  // ⭐ ChargePoint ที่ได้จากตู้ (EVCabinet)
  const [chargerId, setChargerId] = useState<string | null>(null);
  const [cabinetName, setCabinetName] = useState<string>("");

  // ⭐ HardwarePoint จาก Hardware ของ Cabinet (เช่น "hardware_888")
  const [hardwarePoint, setHardwarePoint] = useState<string | null>(null);

  // ⭐ StartEnergy / FinalEnergy จาก session (หน่วย Wh)
  const [startEnergyWh, setStartEnergyWh] = useState<number | null>(null);
  const [finalEnergyWh, setFinalEnergyWh] = useState<number | null>(null);

  // ⭐ Energy ปัจจุบันจาก MeterValues (Wh)
  const [currentEnergyWh, setCurrentEnergyWh] = useState<number | null>(null);

  // ⭐ แหล่งพลังงานใน session นี้ (["Solar", "Grid"])
  const [energySources, setEnergySources] = useState<string[]>([]);

  // ⭐ เวลาเริ่มชาร์จของ session (มาจาก backend StartTime หรือจากตอนกด Start)
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);

  // ✅ ถ้าไม่มี paymentID หรือ cabinet_id → กลับหน้าแรก
  useEffect(() => {
    if (!paymentID || !cabinet_id) {
      message.error("ไม่พบข้อมูลการชำระเงิน");
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
        message.error("กรุณาเข้าสู่ระบบ");
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
          message.error("รหัสตู้ไม่ถูกต้อง");
          return;
        }

        const cabinet = await GetCabinetByID(idNum);
        console.log("cabinetById : ", cabinet);

        if (!cabinet) {
          message.error("ไม่พบข้อมูลตู้ชาร์จ");
          return;
        }

        const cp = (cabinet as any).ChargePoint as string | undefined;
        const name = (cabinet as any).Name as string | undefined;
        const hwPoint = (cabinet as any).Hardware?.HardwarePoint as
          | string
          | undefined;

        if (!cp) {
          message.error("ตู้ชาร์จนี้ยังไม่มีการตั้งค่า ChargePoint");
        } else {
          setChargerId(cp);
          console.log("✅ Loaded ChargePoint from cabinet:", cp);
        }

        if (name) {
          setCabinetName(name);
        }

        if (hwPoint) {
          setHardwarePoint(hwPoint);
          console.log("✅ Loaded HardwarePoint from cabinet:", hwPoint);
        } else {
          console.log("ℹ️ Cabinet นี้ยังไม่ได้ผูก HardwarePoint");
        }
      } catch (err) {
        console.error("❌ loadCabinet error:", err);
        message.error("ไม่สามารถโหลดข้อมูลตู้ชาร์จได้");
      }
    };

    loadCabinet();
  }, [cabinet_id]);

  // 👉 ตรวจ session ชาร์จ + เลือก session ตาม ChargePoint + log StartEnergy / Power / FinalEnergy + StartTime
  useEffect(() => {
    const checkSession = async () => {
      if (!userID) return;

      const sessions = await GetChargingSessionByUserID(userID);
      console.log("📦 All sessions from GetChargingSessionByUserID:", sessions);

      if (!sessions || sessions.length === 0) {
        message.warning("ไม่พบ Session การชาร์จที่ใช้งานอยู่");
        navigate("/user/evs-selector");
        setIsVerifying(false);
        return;
      }

      let targetSession: any | undefined;

      // ⭐ ถ้ามีหลาย session และรู้ chargerId → เลือกตัวที่ ChargePoint ตรงกับตู้ปัจจุบัน
      if (sessions.length > 2 && chargerId) {
        targetSession = sessions.find(
          (s: any) =>
            s?.Payment?.EVCabinet?.ChargePoint &&
            s.Payment.EVCabinet.ChargePoint === chargerId
        );
      }

      // ⭐ ถ้าไม่เจอจาก ChargePoint หรือจำนวน session ≤ 2 → fallback เป็น session ที่ active / ตัวแรก
      if (!targetSession) {
        targetSession =
          sessions.find(
            (s: any) => s.Status === true || s.Status === 1
          ) ?? sessions[0];
      }

      console.log("🎯 Session ที่เลือกใช้สำหรับตู้ปัจจุบัน:", targetSession);

      // ⭐ StartEnergy (จาก session ปัจจุบัน) → Wh
      const startEnergy = Number(targetSession?.StartEnergy ?? 0);
      setStartEnergyWh(startEnergy);
      console.log("⚡ StartEnergy (Wh) ของ session:", startEnergy);

      // ⭐ จัดการ StartTime → เอาไว้คำนวณ Time ตอนกลับเข้าหน้า
      const startTimeStr: string | undefined = targetSession?.StartTime;
      if (startTimeStr && startTimeStr !== ZERO_TIME_STR) {
        const d = new Date(startTimeStr);
        if (!Number.isNaN(d.getTime())) {
          setSessionStartTime(d);
          setHasStarted(true);
          setCharging(true);

          // คำนวณเวลาที่ผ่านไปแล้วตั้งแต่เริ่มชาร์จจนถึงตอนนี้
          const nowMs = Date.now();
          const diffMs = nowMs - d.getTime();
          const sec = Math.max(0, Math.floor(diffMs / 1000));
          setTime(sec);
          console.log("⏱️ Restore elapsed time from StartTime:", {
            startTimeStr,
            sec,
          });
        } else {
          setSessionStartTime(null);
          setHasStarted(false);
          setCharging(false);
          setTime(0);
        }
      } else {
        // ยังไม่เริ่มชาร์จ
        setSessionStartTime(null);
        setHasStarted(false);
        setCharging(false);
        setTime(0);
      }

      // ⭐ ดึง Power ทั้งหมดจาก EVChargingPayments แล้ว log ให้ดู
      const evPays = targetSession?.Payment?.EVChargingPayments || [];

      // ⭐⭐ ดึง EnergySource.Name → แปลงเป็น ["Solar", "Grid"] แบบ unique
      const sourceList: string[] = Array.from(
        new Set<string>(
          evPays
            .map((p: any) => p?.EVcharging?.EnergySource?.Name)
            .filter((name: any): name is string => typeof name === "string")
        )
      );

      setEnergySources(sourceList);
      console.log("🔆 Energy sources for this session:", sourceList);

      const powerList = evPays.map((p: any) => p.Power);
      const totalPowerKwh = powerList.reduce(
        (sum: number, val: any) => sum + (Number(val) || 0),
        0
      );
      const totalPowerWh = totalPowerKwh * 1000;
      const finalEnergy = startEnergy + totalPowerWh;

      setFinalEnergyWh(finalEnergy);

      console.log("🔋 Power list จาก EVChargingPayments (kWh):", powerList);
      console.log("🔋 Total Power (kWh) จาก EVChargingPayments:", totalPowerKwh);
      console.log("🔋 Total Power (Wh) จาก EVChargingPayments:", totalPowerWh);
      console.log(
        "📊 FinalEnergy (Wh) = StartEnergy + TotalPowerWh:",
        finalEnergy
      );

      const active =
        targetSession &&
        (targetSession.Status === true || targetSession.Status === 1);

      if (active) {
        setSessionValid(true);
      } else {
        message.warning("ไม่พบ Session การชาร์จที่ใช้งานอยู่");
        navigate("/user/evs-selector");
      }

      setIsVerifying(false);
    };

    checkSession();
  }, [userID, chargerId, navigate]);

  // ⭐ เรียก API ถามสถานะตู้ตอนเปิดหน้านี้ (ใช้ chargerId จากตู้)
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

  // 👉 ฟัง WebSocket OCPP จาก backend:
  // - StatusNotification → อัปเดตสถานะ
  // - MeterValues → ดึง Energy.Active.Import.Register (Wh) มาใช้คำนวณ %
  useEffect(() => {
    const ws = connectOcppSocket((data: any) => {
      try {
        if (!Array.isArray(data) || data.length < 3) {
          return;
        }

        const messageType = data[0]; // 2 = CALL
        const action = data[2];
        const payload = data[3];

        // ✅ StatusNotification
        if (messageType === 2 && action === "StatusNotification") {
          if (payload && typeof payload.status === "string") {
            setOcppStatus(payload.status);
          }
        }

        // ✅ MeterValues
        if (messageType === 2 && action === "MeterValues") {
          console.log("📥 [OCPP] Raw MeterValues message:", data);

          if (!payload) return;

          const meterValues = payload.meterValue;
          if (!Array.isArray(meterValues) || meterValues.length === 0) {
            return;
          }

          const firstMeter = meterValues[0];
          const sampled = firstMeter?.sampledValue;
          if (!Array.isArray(sampled)) return;

          // หา measurand = Energy.Active.Import.Register unit = Wh
          const energySample = sampled.find(
            (s: any) =>
              s?.measurand === "Energy.Active.Import.Register" &&
              (s?.unit === "Wh" || !s?.unit)
          );

          if (!energySample || energySample.value == null) return;

          const energyWh = Number(energySample.value);
          if (!Number.isFinite(energyWh)) return;

          setCurrentEnergyWh(energyWh);

          console.log(
            "🔎 [OCPP] MeterValues Energy.Active.Import.Register (Wh):",
            energyWh
          );
        }
      } catch (err) {
        console.error("Error parsing OCPP message:", err);
      }
    });

    return () => {
      ws.close();
    };
  }, []);

  // ⭐ ฟัง WebSocket Hardware → ดูค่าที่ hardware ส่งกลับมา
  useEffect(() => {
    // connectHardwareSocket จะเชื่อมไปที่ `${apiUrl}/hardware/frontend`
    const ws = connectHardwareSocket((data: any) => {
      console.log("🔌 [HW] Raw message from backend → frontend:", data);

      if (typeof data === "string") {
        console.log("🔹 [HW] String message:", data);
        return;
      }

      // ตอนนี้เราออกแบบให้ hardware ส่งมาแบบ:
      // { type: "remaining_energy", payload: { Solar: 10.0, Grid: 10.0 }, payment_id: "245" }
      if (data?.type === "remaining_energy" && data?.payload) {
        console.log("🔋 [HW] Remaining energy payload:", data.payload);

        const payload = data.payload as Record<string, number | undefined>;

        const solarVal = payload["Solar"];
        const gridVal = payload["Grid"];

        if (typeof solarVal === "number") {
          setSolarKwh(solarVal);
        }
        if (typeof gridVal === "number") {
          setGridKwh(gridVal);
        }

        console.log("🌞 Solar remaining =", solarVal);
        console.log("🔌 Grid remaining  =", gridVal);
      } else {
        console.log("ℹ️ [HW] Other hardware message:", data);
      }
    });

    return () => {
      ws.close();
    };
  }, []);

  // 👉 นับเวลาโดยอิงจาก sessionStartTime
  useEffect(() => {
    if (!sessionValid || !sessionStartTime) return;

    const updateElapsed = () => {
      const nowMs = Date.now();
      const diffMs = nowMs - sessionStartTime.getTime();
      const sec = Math.max(0, Math.floor(diffMs / 1000));
      setTime(sec);
    };

    updateElapsed();

    const intervalId = window.setInterval(updateElapsed, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [sessionValid, sessionStartTime]);

  // ⭐ ใช้ StartEnergy, FinalEnergy, currentEnergyWh มาคำนวณ % แล้วเก็บไว้ที่ state energy
  useEffect(() => {
    if (
      startEnergyWh == null ||
      finalEnergyWh == null ||
      currentEnergyWh == null
    ) {
      return;
    }

    const totalDeltaWh = finalEnergyWh - startEnergyWh;
    if (totalDeltaWh <= 0) {
      console.log("⚠️ totalDeltaWh <= 0, ข้ามการคำนวณเปอร์เซ็นต์", {
        startEnergyWh,
        finalEnergyWh,
      });
      return;
    }

    const currentDeltaWh = currentEnergyWh - startEnergyWh;
    const rawPercent = (currentDeltaWh / totalDeltaWh) * 100;

    // ❗ จำกัดไม่เกิน 100%
    const clampedPercent = Math.max(0, Math.min(100, rawPercent));

    // ⭐⭐ ปรับเป็น 2 ตำแหน่ง
    setEnergy(parseFloat(clampedPercent.toFixed(2)));

    console.log("📈 SoC UI percent จาก MeterValues:", {
      startEnergyWh,
      finalEnergyWh,
      currentEnergyWh,
      currentDeltaWh,
      totalDeltaWh,
      rawPercent,
      clampedPercent,
    });

    // ถ้าเกือบถึง FinalEnergy ให้ถือว่า COMPLETE
    if (currentDeltaWh >= totalDeltaWh * 0.999) {
      setIsComplete(true);
      setCharging(false);
      console.log("✅ ชาร์จครบตามแพ็กเกจ (ใกล้ FinalEnergy แล้ว)");
    }
  }, [startEnergyWh, finalEnergyWh, currentEnergyWh]);

  // 👉 ฟอร์แมทเวลา
  const formatTime = (sec: number) => {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // 👉 Energy ที่เติมไปแล้ว (kWh)
  const chargedKWh = useMemo(() => {
    if (startEnergyWh == null || currentEnergyWh == null) return "0.00";

    const deltaWh = currentEnergyWh - startEnergyWh;
    if (deltaWh <= 0) return "0.00";

    let effectiveDeltaWh = deltaWh;

    if (finalEnergyWh != null) {
      const maxDeltaWh = finalEnergyWh - startEnergyWh;
      if (maxDeltaWh > 0 && effectiveDeltaWh > maxDeltaWh) {
        effectiveDeltaWh = maxDeltaWh;
      }
    }

    const kWh = effectiveDeltaWh / 1000;
    const text = kWh.toFixed(2);

    console.log("⚡ Energy charged so far (kWh):", {
      startEnergyWh,
      currentEnergyWh,
      deltaWh,
      effectiveDeltaWh,
      finalEnergyWh,
      kWh,
    });

    return text;
  }, [startEnergyWh, currentEnergyWh, finalEnergyWh]);

  // 👉 สีแบตเตอรี่ ตาม % energy
  const batteryGradient = useMemo(() => {
    if (energy < 20) return "linear-gradient(180deg, #f87171, #ef4444)";
    if (energy < 40) return "linear-gradient(180deg, #fb923c, #f97316)";
    if (energy < 60) return "linear-gradient(180deg, #fbbf24, #f59e0b)";
    if (energy < 80) return "linear-gradient(180deg, #a3e635, #84cc16)";
    return "linear-gradient(180deg, #34d399, #22c55e)";
  }, [energy]);

  // 👉 กำหนดสี badge ตามสถานะ
  const { statusLabel, statusClass } = useMemo(() => {
    const s = ocppStatus || "Unknown";
    let cls =
      "bg-gray-100 text-gray-700 border border-gray-200"; // default เทา

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
      default:
        cls = "bg-gray-50 text-gray-700 border border-gray-200";
        break;
    }

    return {
      statusLabel: s,
      statusClass: cls,
    };
  }, [ocppStatus]);

  // ✅ helper สำหรับ redirect ไปหน้า /user หลังชาร์จจบ
  const goToSummary = () => {
    if (!paymentID) return;
    navigate("/user", {
      replace: true,
      state: {
        fromCharging: true,
        paymentID: Number(paymentID),
      },
    });
  };

  // ===========================================================
  // ⭐ ปุ่ม "ยกเลิก" → remoteStopCharging + UpdateSessionStatus + requestEnergyUsage
  //     แล้วส่งกลับไป /user พร้อมแค่ paymentID (ดีเลย์ 2 วินาที)
  // ===========================================================
  const confirmCancel = async () => {
    if (!paymentID) {
      message.error("ไม่พบ Payment ID");
      return;
    }

    if (!chargerId) {
      message.error("ไม่พบ ChargePoint ของตู้ชาร์จ");
      return;
    }

    if (!hardwarePoint) {
      message.error("ไม่พบ HardwarePoint ของตู้ชาร์จ");
      return;
    }

    try {
      await remoteStopCharging({
        chargerId: chargerId,
      });

      const ok = await UpdateSessionStatusByPaymentID(paymentID);

      if (ok) {
        try {
          const deviceIdForEnergy = hardwarePoint; // ⭐ ใช้ HardwarePoint จาก Cabinet
          await requestEnergyUsage(deviceIdForEnergy, paymentID, energySources);
          console.log(
            "✅ requestEnergyUsage sent for device:",
            deviceIdForEnergy,
            "paymentID:",
            paymentID,
            "energySources:",
            energySources
          );
        } catch (energyErr) {
          console.error("⚠️ requestEnergyUsage error:", energyErr);
        }

        message.success("ยกเลิกการชาร์จสำเร็จ");

        setCharging(false);
        setIsComplete(false);
        setEnergy(0);
        setTime(0);
        setSessionStartTime(null);
        setCancelModalOpen(false);

        // 🔁 ดีเลย์ 2 วินาที ก่อนกลับ /user
        setTimeout(goToSummary, 2000);
      } else {
        message.error("ยกเลิกไม่สำเร็จในระบบ");
      }
    } catch (err) {
      console.error(err);
      message.error("ไม่สามารถสั่งหยุดการชาร์จกับตู้ได้");
    }
  };

  // ===========================================================
  // ⭐ ปุ่ม "เริ่ม" → remoteStartCharging
  // ===========================================================
  const handleStart = async () => {
    if (hasStarted || isComplete || statusLabel !== "Preparing") {
      return;
    }

    if (!chargerId) {
      message.error("ไม่พบ ChargePoint ของตู้ชาร์จ");
      return;
    }

    try {
      await remoteStartCharging({
        chargerId: chargerId,
        connectorId: 1,
        idTag: "EV-SIM-001",
      });

      message.success("ส่งคำสั่งเริ่มชาร์จไปยังตู้แล้ว");

      const now = new Date();
      setSessionStartTime(now);
      setHasStarted(true);
      setCharging(true);
      setIsComplete(false);
      setTime(0);
    } catch (err: any) {
      console.error("🔥 RemoteStart ERROR:", err?.response?.data || err);
      message.error("ไม่สามารถส่งคำสั่งเริ่มชาร์จไปยังตู้ได้");
    }
  };

  // ===========================================================
  // ⭐ ปุ่ม "เสร็จสิ้น" → remoteStopCharging + update + รีวิว
  //     แล้วส่งกลับไป /user พร้อมแค่ paymentID (ดีเลย์ 2 วินาที)
  // ===========================================================
  const handleComplete = async () => {
    if (!paymentID) {
      message.error("ไม่พบ Payment ID");
      return;
    }

    if (!userID) {
      message.error("ไม่พบผู้ใช้");
      navigate("/login");
      return;
    }

    if (!chargerId) {
      message.error("ไม่พบ ChargePoint ของตู้ชาร์จ");
      return;
    }

    try {
      await remoteStopCharging({
        chargerId: chargerId,
      });

      const ok = await UpdateSessionStatusByPaymentID(paymentID);

      if (!ok) {
        message.error("อัปเดตสถานะไม่สำเร็จ");
        return;
      }

      setCharging(false);
      setSessionStartTime(null);

      const reviews = await GetReviewByUserID(userID);

      if (reviews && reviews.length > 0) {
        message.success("ชาร์จไฟฟ้าเสร็จสิ้น");

        // 👉 เคสเคยรีวิวแล้ว → ดีเลย์ 2 วิ ก่อนกลับ /user
        setTimeout(goToSummary, 2000);
      } else {
        // ยังไม่เคยรีวิว → เปิด modal รีวิว (ตัว onReviewCreated จะ navigate เอง)
        setShowReviewModal(true);
      }
    } catch (err) {
      console.error(err);
      message.error("ไม่สามารถสั่งหยุดการชาร์จกับตู้ได้");
    }
  };

  // 👉 Loading ตรวจสอบ session
  if (isVerifying) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-600 text-sm">
        กำลังตรวจสอบสิทธิ์...
      </div>
    );
  }

  if (!sessionValid) return null;

  // ❗ เงื่อนไขปุ่ม
  const startDisabled =
    hasStarted || isComplete || statusLabel !== "Preparing" || !chargerId;

  const cancelDisabled =
    isComplete ||
    !chargerId ||
    !(
      statusLabel === "Preparing" ||
      statusLabel === "Charging" ||
      statusLabel === "SuspendedEV" ||
      statusLabel === "Finishing"
    );

  const completeDisabled = !isComplete || !chargerId;

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
          {/* BACKDROP */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setCancelModalOpen(false)}
          />

          {/* MODAL */}
          <div
            className="
              relative w-full max-w-[400px]
              bg-white rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.12)]
              border border-gray-100
              overflow-hidden
              animate-fadeIn
            "
          >
            {/* CLOSE (X) */}
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

            {/* CONTENT */}
            <div className="px-6 py-9 text-center flex flex-col items-center">
              {/* ICON + HALO */}
              <div className="relative mb-5">
                <div className="absolute inset-0 blur-xl bg-blue-300 opacity-40 rounded-full"></div>
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
                If you confirm, charging will be stopped immediately and saved
                as a state.
              </p>
            </div>

            {/* BUTTON */}
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
            .animate-fadeIn {
              animation: fadeIn 0.25s ease-out;
            }
          `}</style>
        </div>
      )}

      {/* MAIN SCREEN */}
      <div className="min-h-screen bg-white w-full">
        {/* HEADER */}
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
                <FaBolt className="h-5 w-5 text-white" />
                <span className="text-sm md:text-base font-semibold tracking-wide">
                  EV Charging
                </span>
              </div>
              {cabinetName && (
                <span className="text-[11px] md:text-xs text-white/80 md:ml-2">
                  Cabinet: {cabinetName}
                  {chargerId ? ` • CP: ${chargerId}` : ""}
                  {hardwarePoint ? ` • HW: ${hardwarePoint}` : ""}
                </span>
              )}
            </div>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="px-4 pt-5 pb-10">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-md w-full">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-blue-900">
                <FaBolt className="text-blue-600" /> Charging
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

            {/* BATTERY + INFO */}
            <div className="w-full flex items-start justify-center gap-5">
              {/* Battery */}
              <div className="flex flex-col items-center">
                <div className="mx-auto mb-1 h-2 w-12 rounded-sm bg-gray-300" />

                <div className="relative h-[320px] w-[150px] rounded-2xl border-2 border-gray-300 p-2 bg-white overflow-hidden">
                  <div className="absolute inset-2 rounded-xl bg-gray-100 border border-gray-200" />

                  <div
                    className="absolute left-2 right-2 bottom-2 rounded-b-xl transition-all duration-500 ease-out"
                    style={{
                      height: `calc(${energy}% - 0px)`,
                      background: batteryGradient,
                    }}
                  />
                </div>
              </div>

              {/* INFO */}
              <div className="flex-1 flex flex-col items-stretch gap-3 min-w-[160px]">
                <div className="rounded-xl bg-blue-50 px-4 py-3">
                  <div className="text-[11px] text-blue-900/70">Percent</div>
                  <div className="text-3xl font-extrabold text-blue-700">
                    {energy.toFixed(2)}%
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-[11px] text-gray-500">Time</div>
                  <div className="font-semibold text-gray-800">
                    {formatTime(time)}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-[11px] text-gray-500">
                    Charging (kWh)
                  </div>
                  <div className="font-semibold text-gray-800">
                    {chargedKWh}
                  </div>
                </div>

                {/* ⭐ ช่อง สถานะ OCPP */}
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

            {/* BUTTONS */}
            <div className="mt-6 border-t border-gray-100 pt-4">
              <div className="grid grid-cols-3 gap-2">
                {/* Start */}
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

                {/* Cancel */}
                <button
                  onClick={() => {
                    if (!cancelDisabled) {
                      setCancelModalOpen(true);
                    }
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

                {/* Finish */}
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
    </>
  );
};

export default ChargingEV;
