// src/component/user/payment/index.tsx

import React, { useEffect, useState, memo, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import qrpayment from "../../../assets/PromptPay-logo.png";
import { Divider, message } from "antd";
import {
  getUserByID,
  UpdateCoin,
  ListMethods,
  CreatePayment,
  CreateEVChargingPayment,
  apiUrlPicture,
  CreateChargingToken,
  GetCabinetByID, // ⭐ ดึงข้อมูลตู้ชาร์จเพื่อนำ HardwarePoint มาใช้
  connectHardwareSocket,
  sendHardwareCommand,
} from "../../../services";
import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";
import { UsersInterface } from "../../../interface/IUser";
import { MethodInterface } from "../../../interface/IMethod";

const STORAGE_KEY_PREFIX = "ev_charging_state_";

// ================== UI helpers ==================
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h2 className="text-base font-semibold text-gray-900">{children}</h2>
);
const SmallNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-xs text-gray-500">{children}</p>
);

// ⚡ EV Icon
const BoltIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z" fill="currentColor" />
  </svg>
);

// ================== Radio ==================
interface PaymentRadioProps {
  id: string;
  name: string;
  checked: boolean;
  onChange: () => void;
  label: React.ReactNode;
}
const PaymentRadio = memo(
  ({ id, name, checked, onChange, label }: PaymentRadioProps) => (
    <label
      htmlFor={id}
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 cursor-pointer transition
    ${checked
          ? "border-blue-500 ring-1 ring-blue-500/50 bg-blue-50"
          : "border-gray-200 hover:border-gray-300"
        }`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-4 w-4 items-center justify-center rounded-full border 
        ${checked ? "border-blue-600" : "border-gray-300"}`}
        >
          <span
            className={`h-2 w-2 rounded-full ${checked ? "bg-blue-600" : "bg-transparent"
              }`}
          />
        </span>
        <div className="text-sm">{label}</div>
      </div>
      <input
        type="radio"
        id={id}
        name={name}
        checked={checked}
        onChange={onChange}
        className="sr-only"
      />
    </label>
  )
);

// ================== Page ==================
const Index: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // ⭐⭐⭐ รับค่า cabinet_id
  const { chargers, cabinet_id } =
    (location.state as { chargers: any[]; cabinet_id: number | null }) || {
      chargers: [],
      cabinet_id: null,
    };
  console.log("🟦 CABINET ID:", cabinet_id);
  console.log("🟩 Chargers:", chargers);

  const [paymentMethod, setPaymentMethod] = useState<"qr" | "card">("qr");
  const [user, setUser] = useState<UsersInterface | null>(null);
  const [qrMethod, setQRMethod] = useState<MethodInterface | null>(null);
  const [coinMethod, setCoinMethod] = useState<MethodInterface | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoadingMethod, setIsLoadingMethod] = useState(true);

  // ⭐ HardwarePoint จาก Hardware ของ Cabinet (เช่น "hardware_888")
  const [hardwarePoint, setHardwarePoint] = useState<string | null>(null);

  // ✅ กันกดปุ่มซ้ำแบบชัวร์ (แม้กดรัว ๆ ก่อน state จะอัปเดต)
  const paymentLockRef = useRef(false);

  const totalAmount = chargers.reduce(
    (sum: number, item: any) => sum + (item?.total || 0),
    0
  );

  // โหลดข้อมูลผู้ใช้ + Method
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        let current = getCurrentUser();
        if (!current) current = await initUserProfile();

        const userID = current?.id;
        if (!userID) {
          message.error("User information not found. Please log in again");
          navigate("/login");
          return;
        }

        const userRes = await getUserByID(userID);
        if (userRes) setUser(userRes);

        const methodRes = await ListMethods();
        if (methodRes) {
          const qr = methodRes.find((m: MethodInterface) =>
            m.Medthod?.toLowerCase().includes("qr")
          );
          const coin = methodRes.find((m: MethodInterface) =>
            m.Medthod?.toLowerCase().includes("coin")
          );
          setQRMethod(qr || null);
          setCoinMethod(coin || null);
          setPaymentMethod(qr ? "qr" : "card");
        }
      } catch (err) {
        console.error("Error loading payment data:", err);
        message.error("Data loading failed");
      } finally {
        setIsLoadingMethod(false);
      }
    };

    fetchUserData();
  }, [navigate]);

  // ⭐ โหลดข้อมูล Cabinet โดยใช้ cabinet_id เพื่อดึง HardwarePoint มาใช้แทน "hardware_001"
  useEffect(() => {
    const loadCabinetHardware = async () => {
      if (!cabinet_id) return;

      try {
        const idNum = Number(cabinet_id);
        if (Number.isNaN(idNum)) {
          console.warn("⚠️ cabinet_id ไม่ถูกต้อง:", cabinet_id);
          return;
        }

        const cabinet = await GetCabinetByID(idNum);
        console.log("🔍 Cabinet in payment page:", cabinet);

        const hwPoint = (cabinet as any)?.Hardware?.HardwarePoint as
          | string
          | undefined;

        if (hwPoint) {
          setHardwarePoint(hwPoint);
          console.log("✅ Loaded HardwarePoint from cabinet:", hwPoint);
        } else {
          console.log("ℹ️ Cabinet นี้ยังไม่ได้ผูก HardwarePoint");
        }
      } catch (err) {
        console.error("❌ loadCabinetHardware error:", err);
      }
    };

    loadCabinetHardware();
  }, [cabinet_id]);

  // ฟังก์ชันส่งข้อมูลไป Hardware (ส่ง kWh + เปอร์เซ็นต์)
  const sendToHardware = useCallback(
    (
      solar_kwh: number,
      grid_kwh: number,
      solar_percent: number,
      grid_percent: number
    ) => {
      try {
        // 💡 ต้องมี hardwarePoint ก่อนถึงจะส่งคำสั่งได้
        if (!hardwarePoint) {
          console.warn(
            "⚠️ ไม่มี HardwarePoint จาก Cabinet, ยกเลิกการส่งคำสั่งไป hardware"
          );
          return;
        }

        // 🔗 ส่ง hardwarePoint ไปให้ connectHardwareSocket → /hardware/frontend?deviceID=hardware_001
        const ws = connectHardwareSocket(() => { }, hardwarePoint);

        ws.onopen = () => {
          console.log(
            "Connected to Hardware WebSocket for device:",
            hardwarePoint
          );

          const command = {
            solar_kwh,
            grid_kwh,
            solar_percent,
            grid_percent,
          };

          // ⭐ ใช้ HardwarePoint จาก Cabinet แทน "hardware_001"
          sendHardwareCommand(ws, hardwarePoint, command);

          // ✅ ปิดหลังส่ง (กันค้าง connection)
          setTimeout(() => {
            try {
              ws.close();
            } catch (_) { }
          }, 300);
        };

        ws.onclose = () =>
          console.warn(
            "Hardware WebSocket disconnected for device:",
            hardwarePoint
          );
        ws.onerror = (err) =>
          console.error(
            "Hardware WebSocket error for device:",
            hardwarePoint,
            err
          );
      } catch (err) {
        console.error("Failed to send to hardware:", err);
      }
    },
    [hardwarePoint]
  );

  // ================== กดชำระเงิน ==================
  const handlePayment = useCallback(async () => {
    // ✅ กันกดซ้ำทันที
    if (paymentLockRef.current || isProcessing) return;

    if (!user) return;

    // โหลดวิธีชำระเงินที่เลือก
    const selectedMethod = paymentMethod === "qr" ? qrMethod : coinMethod;

    // ---------- Validate ก่อนล็อก (เพื่อให้แก้แล้วกดใหม่ได้) ----------
    if (chargers.length === 0) {
      message.error("No order items");
      return;
    }

    if (paymentMethod === "qr") {
      if (!selectedMethod?.ID) {
        message.error("No Method found for QR");
        return;
      }

      // ✅ ล็อกปุ่ม (กันกดซ้ำตอนกำลังเปลี่ยนหน้า)
      paymentLockRef.current = true;
      setIsProcessing(true);

      navigate("/user/payment-by-qrcode", {
        state: {
          totalAmount: totalAmount.toFixed(2),
          userID: user.ID!,
          chargers,
          cabinet_id,
          MethodID: selectedMethod.ID,
        },
      });
      return;
    }

    // =============== Coin Payment ===============
    if (!coinMethod?.ID) {
      message.error("No Method found for Coin");
      return;
    }

    if ((user.Coin || 0) < totalAmount) {
      message.error("Insufficient Coins");
      return;
    }

    // ✅ ล็อกปุ่มทันที ก่อนเริ่มทำงานจริง (กัน double click / double request)
    paymentLockRef.current = true;
    setIsProcessing(true);

    let success = false;

    try {
      // หัก coin
      const updatedCoin = (user.Coin || 0) - totalAmount;
      const result = await UpdateCoin({ user_id: user.ID!, coin: updatedCoin });

      if (!result) {
        message.error("Coin deduction failed");
        return;
      }

      message.success("Coin payment successful");

      // ⭐ สร้างข้อมูล Payment (แก้ ev_cabinet_id ให้เป็น number | undefined)
      const paymentData = {
        date: new Date().toISOString().split("T")[0],
        amount: Number(totalAmount),
        user_id: user.ID!,
        method_id: coinMethod.ID!,
        reference_number: "",
        picture: null,
        ev_cabinet_id: cabinet_id ?? undefined,
      };

      const paymentResult = await CreatePayment(paymentData);

      if (!paymentResult || !paymentResult.ID) {
        message.error("Payment creation failed");
        return;
      }

      // ✅ ล้าง state ที่ค้างของ PaymentID นี้
      try {
        const key = `${STORAGE_KEY_PREFIX}${paymentResult.ID}`;
        localStorage.removeItem(key);
        console.log("🧹 Cleared localStorage:", key);
      } catch (e) {
        console.warn("⚠️ Clear localStorage failed:", e);
      }

      // ผูก EVChargingPayment
      if (Array.isArray(chargers)) {
        for (const charger of chargers) {
          const evChargingPaymentData = {
            evcharging_id: charger.id,
            payment_id: paymentResult.ID,
            price: charger.total,
            percent: charger.percent || 0,
            power: charger.power || 0,
          };
          await CreateEVChargingPayment(evChargingPaymentData);
        }
      }

      // สร้าง Token
      const token = await CreateChargingToken(user.ID!, paymentResult.ID);
      if (!token) {
        message.error("Token creation failed");
        return;
      }

      // ส่งข้อมูล solar + grid + เปอร์เซ็นต์ ไป hardware
      const solarCharger = Array.isArray(chargers)
        ? chargers.find((c: any) =>
          String(c.name || "").toLowerCase().includes("solar")
        )
        : null;
      const gridCharger = Array.isArray(chargers)
        ? chargers.find((c: any) =>
          String(c.name || "").toLowerCase().includes("grid")
        )
        : null;

      const solarKwh = solarCharger?.power || 0;
      const gridKwh = gridCharger?.power || 0;
      const solarPercent = solarCharger?.percent || 0;
      const gridPercent = gridCharger?.percent || 0;

      sendToHardware(solarKwh, gridKwh, solarPercent, gridPercent);

      localStorage.setItem("charging_token", token);

      success = true;

      // ⭐⭐⭐ ไปหน้าหลังชำระเงิน (ดีเลย์ 2 วิ)
      setTimeout(() => {
        navigate("/user/after-payment", {
          state: {
            paymentID: paymentResult.ID,
            cabinet_id,
          },
        });
        // ✅ ไม่ต้อง setIsProcessing(false) เพราะกำลังเปลี่ยนหน้าอยู่
        // และเราตั้งใจให้กดได้ครั้งเดียวจนสำเร็จ
      }, 2000);
    } catch (err) {
      console.error(err);
      message.error("An error occurred during payment");
    } finally {
      // ✅ ถ้าไม่สำเร็จเท่านั้น ถึงปลดล็อกให้กดใหม่ได้
      if (!success) {
        paymentLockRef.current = false;
        setIsProcessing(false);
      }
    }
  }, [
    user,
    isProcessing,
    paymentMethod,
    qrMethod,
    coinMethod,
    chargers,
    cabinet_id,
    navigate,
    totalAmount,
    sendToHardware,
  ]);

  // ================== UI ==================
  return (
    <div className="min-h-screen bg-white">
      <header
        className="sticky top-0 z-20 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md overflow-hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="w-full px-4 py-3 flex items-center gap-2 justify-start">
          <button
            onClick={() => window.history.back()}
            className="h-9 w-9 flex items-center justify-center rounded-xl active:bg-white/15 transition-colors"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5">
              <path
                d="M15 18l-6-6 6-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <BoltIcon className="h-5 w-5 text-white" />
            <span className="text-sm md:text-base font-semibold tracking-wide">
              EV Payments
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-sm px-4 pb-28 pt-4">
        <div className="mb-4 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-900">Total payment</span>
            <span className="text-xl font-bold text-blue-700">
              ฿{totalAmount.toFixed(2)}
            </span>
          </div>
          <SmallNote>Check the items before paying.</SmallNote>
        </div>

        {/* รายการสั่งซื้อ */}
        <section className="mb-6">
          <SectionTitle>Order list</SectionTitle>
          <div className="mt-3 rounded-2xl border border-gray-100">
            {chargers.map((item: any, index: number) => (
              <div key={index} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <img
                    src={`${apiUrlPicture}${item.picture}`}
                    className="h-14 w-14 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-900 line-clamp-1">
                      {item.name}
                    </h3>
                    <p className="text-xs text-gray-500">
                      Charge percentage:{" "}
                      <span className="font-semibold text-blue-700">
                        {item.percent ? `${item.percent}%` : "-"}
                      </span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Energy:{" "}
                      <span className="font-semibold text-blue-700">
                        {item.power?.toFixed(2)}{" "}
                        <span className="text-[10px] text-blue-400">kWh</span>
                      </span>
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-blue-700">
                    ฿{Number(item.total || 0).toFixed(2)}
                  </span>
                </div>
                {index < chargers.length - 1 && (
                  <Divider className="!my-3" />
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Payment Methods */}
        <section className="mb-6">
          <SectionTitle>Payment method</SectionTitle>
          <div className="mt-3 space-y-3">
            {isLoadingMethod ? (
              <p className="text-sm text-gray-500">
                Loading payment methods...
              </p>
            ) : (
              <>
                {qrMethod && (
                  <PaymentRadio
                    id="payment-qr"
                    name="payment"
                    checked={paymentMethod === "qr"}
                    onChange={() => setPaymentMethod("qr")}
                    label={
                      <div className="flex items-center gap-2">
                        <span>{qrMethod.Medthod}</span>
                        <img
                          src={qrpayment}
                          className="h-5"
                          alt="PromptPay"
                        />
                      </div>
                    }
                  />
                )}
                {coinMethod && (
                  <PaymentRadio
                    id="payment-coin"
                    name="payment"
                    checked={paymentMethod === "card"}
                    onChange={() => setPaymentMethod("card")}
                    label={
                      <div className="flex items-center gap-2">
                        <span>{coinMethod.Medthod}</span>
                        {user && (
                          <span className="text-[11px] text-blue-700 font-semibold bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                            You have {(user.Coin || 0).toFixed(2)} Coin.
                          </span>
                        )}
                      </div>
                    }
                  />
                )}
              </>
            )}
          </div>
        </section>
      </main>

      {/* Bottom Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-sm items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-gray-500">Net balance</span>
            <span className="text-lg font-bold text-blue-700">
              ฿{totalAmount.toFixed(2)}
            </span>
          </div>

          <button
            onClick={handlePayment}
            disabled={
              isProcessing || isLoadingMethod || chargers.length === 0
            }
            className={`px-6 py-2 rounded-xl flex items-center gap-2 text-white ${isProcessing || isLoadingMethod || chargers.length === 0
                ? "bg-blue-300 cursor-not-allowed"
                : "bg-gradient-to-r from-blue-600 to-sky-500 shadow-md"
              }`}
          >
            <BoltIcon className="h-5 w-5 text-white" />
            <span className="text-sm font-semibold">
              {isProcessing ? "Processing..." : "Payment"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default Index;
