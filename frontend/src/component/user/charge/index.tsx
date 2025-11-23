import { useEffect, useMemo, useState } from "react";
import { FaBolt } from "react-icons/fa";
import { message } from "antd";
import ModalCreate from "../review/create";
import {
  GetReviewByUserID,
  GetChargingSessionByUserID,
  UpdateSessionStatusByPaymentID,
} from "../../../services";
import {
  connectOcppSocket,
  remoteStartCharging,
  remoteStopCharging,
  getChargerStatus, // ⭐ NEW
} from "../../../services/ocpp";
import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";
import { useNavigate, useLocation } from "react-router-dom";

const ChargingEV = () => {
  const navigate = useNavigate();

  // ⭐ รับค่าจากหน้า before-payment → after-payment
  const location = useLocation();
  // @ts-ignore
  const { paymentID, cabinet_id } = location.state || {};

  console.log("🟦 PAYMENT ID:", paymentID);
  console.log("🟩 CABINET ID:", cabinet_id);

  const [charging, setCharging] = useState(false);
  const [energy, setEnergy] = useState(0);
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

  // 👉 ตรวจ session ชาร์จ
  useEffect(() => {
    const checkSession = async () => {
      if (!userID) return;

      const sessions = await GetChargingSessionByUserID(userID);

      const active = sessions?.some(
        (s: any) => s.Status === true || s.Status === 1
      );

      if (active) {
        setSessionValid(true);
      } else {
        message.warning("ไม่พบ Session การชาร์จที่ใช้งานอยู่");
        navigate("/user/evs-selector");
      }

      setIsVerifying(false);
    };

    checkSession();
  }, [userID, navigate]);

  // ⭐ NEW: เรียก API ถามสถานะตู้ครั้งแรกตอนเปิดหน้านี้เท่านั้น
  useEffect(() => {
    const fetchInitialStatus = async () => {
      try {
        // ตอนนี้ fix ที่ CP_1 ให้เหมือน remoteStart/Stop
        const status = await getChargerStatus("CP_1");
        if (status && typeof status.status === "string") {
          setOcppStatus(status.status);
        }
      } catch (err) {
        console.error("❌ getChargerStatus error:", err);
        // ถ้า error ก็ปล่อยให้เป็น "Unknown" ไป
      }
    };

    fetchInitialStatus();
  }, []);

  // 👉 ฟัง WebSocket OCPP จาก /frontend เอา status จาก StatusNotification มาเก็บใน state
  useEffect(() => {
    const ws = connectOcppSocket((data: any) => {
      try {
        // รูปแบบ message:
        // [ 2, "uuid", "StatusNotification", { "status": "Available", ... } ]
        if (Array.isArray(data) && data[0] === 2 && data[2] === "StatusNotification") {
          const payload = data[3];
          if (payload && typeof payload.status === "string") {
            setOcppStatus(payload.status);
          }
        }
      } catch (err) {
        console.error("Error parsing OCPP message:", err);
      }
    });

    return () => {
      ws.close();
    };
  }, []);

  // 👉 จำลองการชาร์จบน UI
  useEffect(() => {
    if (!sessionValid) return;

    let intervalId: number | undefined;

    if (charging) {
      setEnergy(0);
      setTime(0);
      setIsComplete(false);

      let sec = 0;

      intervalId = window.setInterval(() => {
        sec++;
        setTime(sec);
        setEnergy((prev) => {
          const next = Math.min(prev + 1, 100);
          if (next >= 100) {
            setIsComplete(true);
            setCharging(false);
            window.clearInterval(intervalId);
          }
          return next;
        });
      }, 1000);
    }

    return () => {
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [charging, sessionValid]);

  // 👉 ฟอร์แมทเวลา
  const formatTime = (sec: number) => {
    const h = String(Math.floor(sec / 3600)).padStart(2, "0");
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const s = String(sec % 60).padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // 👉 คำนวณ kW
  const estKW = useMemo(() => {
    const base = 7.2;
    const step = energy / 100;
    const value = Math.max(3, Math.min(base + step * 2, 11));
    return value.toFixed(1);
  }, [energy]);

  // 👉 สีแบตเตอรี่
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

  // ===========================================================
  // ⭐ ปุ่ม "ยกเลิก" → Modal → remoteStopCharging + UpdateSessionStatus
  // ===========================================================
  const confirmCancel = async () => {
    if (!paymentID) {
      message.error("ไม่พบ Payment ID");
      return;
    }

    try {
      // 1) สั่งตู้ให้หยุดชาร์จผ่าน OCPP
      await remoteStopCharging({
        chargerId: "CP_1", // ตอนนี้ fix ที่ CP_1 ก่อน
      });

      // 2) อัปเดตสถานะ Session ฝั่งระบบของคุณ
      const ok = await UpdateSessionStatusByPaymentID(paymentID);

      if (ok) {
        message.success("ยกเลิกการชาร์จสำเร็จ");
        setCharging(false);
        setIsComplete(false);
        setEnergy(0);
        setTime(0);
        setCancelModalOpen(false);

        setTimeout(() => {
          navigate("/");
        }, 2000);
      } else {
        message.error("ยกเลิกไม่สำเร็จในระบบ");
      }
    } catch (err) {
      console.error(err);
      message.error("ไม่สามารถสั่งหยุดการชาร์จกับตู้ได้");
    }
  };

  // ===========================================================
  // ⭐ ปุ่ม "เริ่ม" → remoteStartCharging + เริ่มจำลองชาร์จ
  // ===========================================================
  const handleStart = async () => {
    if (hasStarted || charging || isComplete || statusLabel !== "Preparing") {
      return;
    }

    try {
      await remoteStartCharging({
        chargerId: "CP_1", // 🔹 fix ให้เริ่มจาก CP_1 ก่อน
        connectorId: 1,
        idTag: "EV-SIM-001",
      });

      message.success("ส่งคำสั่งเริ่มชาร์จไปยังตู้แล้ว");
      setHasStarted(true);
      setCharging(true);
    } catch (err) {
      console.error(err);
      message.error("ไม่สามารถส่งคำสั่งเริ่มชาร์จไปยังตู้ได้");
    }
  };

  // ===========================================================
  // ⭐ ปุ่ม "เสร็จสิ้น" → remoteStopCharging เช่นเดียวกับยกเลิก + update + รีวิว
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

    try {
      // 1) สั่งหยุดการชาร์จกับตู้เหมือนปุ่ม "ยกเลิก"
      await remoteStopCharging({
        chargerId: "CP_1",
      });

      // 2) อัปเดตสถานะ session ฝั่งระบบ
      const ok = await UpdateSessionStatusByPaymentID(paymentID);

      if (!ok) {
        message.error("อัปเดตสถานะไม่สำเร็จ");
        return;
      }

      // 3) หยุด state การชาร์จใน UI ด้วย
      setCharging(false);

      // 4) เช็กว่ามีรีวิวอยู่แล้วไหม
      const reviews = await GetReviewByUserID(userID);

      if (reviews && reviews.length > 0) {
        message.success("ชาร์จไฟฟ้าเสร็จสิ้น");
        setTimeout(() => navigate("/"), 2000);
      } else {
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

  // ❗ เงื่อนไขใหม่: ต้องเป็น Preparing เท่านั้นถึงจะเริ่มได้
  const startDisabled =
    hasStarted || charging || isComplete || statusLabel !== "Preparing";

  const cancelDisabled = !hasStarted || isComplete;
  const completeDisabled = !isComplete;

  return (
    <>
      {/* ⭐ Modal รีวิว */}
      <ModalCreate
        open={showReviewModal}
        onClose={() => setShowReviewModal(false)}
        UserID={userID!}
        onReviewCreated={() => navigate("/")}
      />

      {/* ⭐ EV Premium Cancel Modal — 1 Button + X Close */}
      {cancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* BACKDROP (Dim + Blur) */}
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
                ต้องการยกเลิกการชาร์จ?
              </h3>

              <p className="text-sm text-gray-600 mt-2 leading-relaxed max-w-[280px]">
                หากคุณยืนยัน การชาร์จจะถูกหยุดทันที และบันทึกเป็นสถานะ
                <span className="text-blue-600 font-semibold"> ยกเลิก</span>
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
                ยืนยันการยกเลิก
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

            <div className="flex items-center gap-2">
              <FaBolt className="h-5 w-5 text-white" />
              <span className="text-sm md:text-base font-semibold tracking-wide">
                EV Charging
              </span>
            </div>
          </div>
        </header>

        {/* MAIN CONTENT */}
        <main className="px-4 pt-5 pb-10">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-md w-full">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-semibold text-blue-900">
                <FaBolt className="text-blue-600" /> กำลังชาร์จ EV
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
                  <div className="text-[11px] text-blue-900/70">เปอร์เซ็นต์</div>
                  <div className="text-3xl font-extrabold text-blue-700">
                    {energy}%
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-[11px] text-gray-500">เวลา</div>
                  <div className="font-semibold text-gray-800">
                    {formatTime(time)}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-[11px] text-gray-500">
                    กำลังชาร์จ (kW)
                  </div>
                  <div className="font-semibold text-gray-800">{estKW}</div>
                </div>

                {/* ⭐ ช่อง สถานะ เพิ่มใหม่ พร้อมสีตาม OCPP */}
                <div className="rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-[11px] text-gray-500">สถานะ</div>
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
                {/* เริ่ม */}
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
                  เริ่ม
                </button>

                {/* ยกเลิก */}
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
                  ยกเลิก
                </button>

                {/* เสร็จสิ้น */}
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
                  เสร็จสิ้น
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