// src/component/user/payment/payment-by-qrcode/index.tsx
import React, { useRef, useEffect, useState } from "react";
import { FaPaypal, FaUpload, FaPaperPlane, FaTimes } from "react-icons/fa";
import { message, QRCode, Image } from "antd";
import generatePayload from "promptpay-qr";
import { useLocation, useNavigate } from "react-router-dom";
import {
  uploadSlipOK,
  CreatePayment,
  CreateEVChargingPayment,
  ListBank,
  CreateChargingToken,
  connectHardwareSocket,
  sendHardwareCommand,
  GetCabinetByID, // ⭐ ใช้ดึง HardwarePoint จากตู้
  GetDataPaymentByRef, // ⭐ ใช้เช็คว่าสลิปซ้ำไหม
} from "../../../../services";
import { getCurrentUser, initUserProfile } from "../../../../services/httpLogin";
import { FileImageOutlined } from "@ant-design/icons";
import LoadingAnimation from "../../../../component/user/money/LoadingAnimation";

const PayPalCard: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const location = useLocation();

  // ⭐⭐⭐ รับค่าจากหน้า payment index
  const { totalAmount, chargers, MethodID, cabinet_id } = location.state || {};

  console.log("📦 CABINET ID (Slip Page):", cabinet_id);
  console.log("🟩 Chargers:", chargers);

  const amountNumber = Number(totalAmount) || 0;

  const [userID, setUserID] = useState<number | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // ⭐ HardwarePoint จาก Hardware ที่ผูกกับตู้ (เช่น "hardware_888")
  const [hardwarePoint, setHardwarePoint] = useState<string | null>(null);

  // ✅ ข้อมูล Bank สำหรับตรวจสอบสลิป
  const [bankingCode, setBankingCode] = useState<string>("");
  const [managerName, setManagerName] = useState<string>("");

  // โหลด User จาก JWT
  useEffect(() => {
    const fetchUser = async () => {
      try {
        let current = getCurrentUser();
        if (!current) current = await initUserProfile();

        if (current?.id) {
          setUserID(current.id);
        } else {
          message.error("User information not found. Please log in again");
          navigate("/login");
        }
      } catch (err) {
        console.error("Failed to load user data :", err);
        message.error("An error occurred while loading users");
        navigate("/login");
      }
    };
    fetchUser();
  }, [navigate]);

  // ⭐ โหลดข้อมูล Cabinet โดยใช้ cabinet_id → ดึง Hardware.HardwarePoint มาใช้แทน "hardware_001"
  useEffect(() => {
    const loadCabinetHardware = async () => {
      if (!cabinet_id) return;

      try {
        const idNum = Number(cabinet_id);
        if (Number.isNaN(idNum)) {
          console.warn("⚠️ cabinet_id ไม่ถูกต้อง (QR Page):", cabinet_id);
          return;
        }

        const cabinet = await GetCabinetByID(idNum);
        console.log("🔍 Cabinet (QR Page):", cabinet);

        const hwPoint = (cabinet as any)?.Hardware?.HardwarePoint as
          | string
          | undefined;

        if (hwPoint) {
          setHardwarePoint(hwPoint);
          console.log("✅ Loaded HardwarePoint from cabinet (QR Page):", hwPoint);
        } else {
          console.log("ℹ️ Cabinet นี้ยังไม่ได้ผูก HardwarePoint (QR Page)");
        }
      } catch (err) {
        console.error("❌ loadCabinetHardware error (QR Page):", err);
      }
    };

    loadCabinetHardware();
  }, [cabinet_id]);

  // โหลด PromptPay + Bank info
  useEffect(() => {
    const fetchBankData = async () => {
      try {
        const banks = await ListBank();
        if (banks && banks.length > 0) {
          const bank = banks[0];
          const bankPhone = bank.PromptPay || "";
          setPhoneNumber(bankPhone);

          // ✅ เก็บข้อมูลไว้ใช้เช็คสลิป
          setBankingCode(bank.Banking || "");
          setManagerName(bank.Manager || "");
        } else {
          message.error("Bank information not found for PromptPay");
        }
      } catch {
        message.error("Bank data loading failed");
      }
    };
    fetchBankData();
  }, []);

  // สร้าง QR Payload
  useEffect(() => {
    if (amountNumber > 0 && phoneNumber) {
      const payload = generatePayload(phoneNumber, { amount: amountNumber });
      setQrCode(payload);
    } else {
      setQrCode("");
    }
  }, [amountNumber, phoneNumber]);

  // ส่งข้อมูลไป Hardware (⚡ ส่งทั้ง kWh + เปอร์เซ็นต์)
  const sendToHardware = (
    solarKwh: number,
    gridKwh: number,
    solarPercent: number,
    gridPercent: number
  ) => {
    try {
      const ws = connectHardwareSocket(() => {});

      ws.onopen = () => {
        console.log("✅ Connected to Hardware WebSocket (QR Page)");

        if (!hardwarePoint) {
          console.warn(
            "⚠️ ไม่มี HardwarePoint จาก Cabinet (QR Page), ยกเลิกการส่งคำสั่งไป hardware"
          );
          ws.close();
          return;
        }

        const command = {
          solar_kwh: solarKwh,
          grid_kwh: gridKwh,
          solar_percent: solarPercent,
          grid_percent: gridPercent,
        };
        // ⭐ ใช้ HardwarePoint จาก Cabinet แทน "hardware_001"
        sendHardwareCommand(ws, hardwarePoint, command);
        console.log("📤 Sent Command to Hardware:", {
          device_id: hardwarePoint,
          command,
        });
      };

      ws.onclose = () =>
        console.warn("⚠️ Hardware WebSocket disconnected (QR Page)");
      ws.onerror = (err) =>
        console.error("❌ Hardware WebSocket error (QR Page):", err);
    } catch (err) {
      console.error("❌ Failed to send to hardware (QR Page):", err);
    }
  };

  // อัปโหลด Slip
  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files?.length) {
      const file = event.target.files[0];
      setUploadedFile(file);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ส่งหลักฐาน + Create Payment (พร้อมเช็คสลิปเหมือนหน้า Coin)
  const handleSubmit = async () => {
    if (!uploadedFile) {
      message.warning("Please upload the slip before sending");
      return;
    }
    if (!userID) {
      message.error("User information not found");
      return;
    }

    setLoading(true);
    try {
      // 🔹 อัปโหลดสลิปไป OIIO
      const result = await uploadSlipOK(uploadedFile);
      console.log("🔹 uploadSlipOK result (QR Page):", result);

      if (!result || !result.data) {
        message.warning("Unable to read data from slip");
        setLoading(false);
        return;
      }

      const slipData = result.data;
      const receiverBank = slipData.receiver_bank;
      const receiverName = slipData.receiver_name?.trim()?.toUpperCase();
      const slipAmount = Number(slipData.amount);
      const refNumber = slipData.ref;

      const bankCode = bankingCode?.trim()?.toUpperCase();
      const manager = managerName?.trim()?.toUpperCase();

      console.log("🧩 ตรวจข้อมูลสลิป (QR Page):", {
        receiverBank,
        receiverName,
        slipAmount,
        bankCode,
        manager,
        amountNumber,
        refNumber,
      });

      // ✅ เช็คธนาคารผู้รับ
      if (receiverBank !== bankCode) {
        message.warning("Recipient bank mismatch");
        setLoading(false);
        return;
      }

      // ✅ เช็คชื่อผู้รับ
      if (receiverName !== manager) {
        message.warning("Recipient mismatch");
        setLoading(false);
        return;
      }

      // ✅ เช็คจำนวนเงินตาม QR (ต้องเท่ากับ totalAmount ที่หน้า Payment ส่งมา)
      if (slipAmount !== amountNumber) {
        message.warning("Amounts do not match");
        setLoading(false);
        return;
      }

      // ✅ เช็คสลิปซ้ำจาก Ref Number
      const existing = await GetDataPaymentByRef(refNumber);
      if (existing && (existing as any).found) {
        message.warning("Slip already used");
        setLoading(false);
        return;
      }

      message.success("Payment slip verified");

      // ⭐⭐⭐ เตรียมข้อมูล Payment (ใช้วันที่จากสลิป ถ้ามี)
      const paymentData = {
        date: new Date().toISOString().split("T")[0],
        amount: Number(totalAmount),
        user_id: userID,
        method_id: MethodID,
        reference_number: result.data.ref,
        picture: uploadedFile,
        ev_cabinet_id: cabinet_id ?? undefined, // ✅ number | undefined
      };

      console.log(paymentData)

      const paymentResult = await CreatePayment(paymentData);

      console.log(paymentResult)

      if (paymentResult && paymentResult.ID) {
        // ผูก EV Charging Payment
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

        // สร้าง Token สำหรับตู้ชาร์จ
        const token = await CreateChargingToken(userID, paymentResult.ID);
        console.log(token)
        if (!token) {
          setLoading(false);
          return;
        }

        // 🔁 ส่งข้อมูลไป Hardware (ทั้ง kWh + เปอร์เซ็นต์เหมือนหน้า Coin)
        const solarItem =
          Array.isArray(chargers) &&
          chargers.find((c: any) =>
            typeof c.name === "string"
              ? c.name.toLowerCase().includes("solar")
              : false
          );

        const gridItem =
          Array.isArray(chargers) &&
          chargers.find((c: any) =>
            typeof c.name === "string"
              ? c.name.toLowerCase().includes("grid")
              : false
          );

        const solarKwh = solarItem?.power || 0;
        const gridKwh = gridItem?.power || 0;
        const solarPercent = solarItem?.percent || 0;
        const gridPercent = gridItem?.percent || 0;

        sendToHardware(solarKwh, gridKwh, solarPercent, gridPercent);

        localStorage.setItem("charging_token", token);

        setTimeout(() => {
          navigate("/user/after-payment", {
            state: {
              paymentID: paymentResult.ID,
              cabinet_id,
            },
          });
          setLoading(false);
        }, 800);
      } else {
        message.error("Payment creation failed");
        setLoading(false);
      }
    } catch (error) {
      console.error(error);
      message.error("An error occurred while submitting evidence");
      setLoading(false);
    }
  };

  // Drag & Drop Upload
  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.dataTransfer.files?.length) {
      const file = event.dataTransfer.files[0];
      setUploadedFile(file);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) =>
    event.preventDefault();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header
        className="sticky top-0 z-20 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md overflow-hidden"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="w-full px-4 py-3 flex items-center gap-2 justify-start">
          <button
            onClick={() => window.history.back()}
            aria-label="Back"
            className="h-9 w-9 flex items-center justify-center rounded-xl active:bg-white/15 transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="M15 18l-6-6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white">
              <path
                d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z"
                fill="currentColor"
              />
            </svg>
            <span className="text-sm md:text-base font-semibold tracking-wide">
              Scan to Pay / Upload Slip
            </span>
          </div>
        </div>
      </header>

      {/* Loading */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 flex flex-col items-center justify-center z-50">
          <LoadingAnimation />
        </div>
      )}

      {/* Content */}
      <main className="mx-auto max-w-screen-sm px-4 pb-28 pt-4">
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-blue-50 px-4 py-3">
          <div className="text-sm text-blue-900">Total payment</div>
          <div className="text-xl font-bold text-blue-700">
            ฿{amountNumber.toFixed(2)}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-3">
              <FaPaypal className="text-blue-600 text-2xl" />
              <span className="text-base font-semibold text-gray-800">
                PromptPay
              </span>
            </div>

            <div className="p-3 bg-white rounded-xl shadow-sm border border-gray-100">
              {qrCode ? (
                <QRCode value={qrCode} size={180} errorLevel="H" />
              ) : (
                <div className="w-[180px] h-[180px] flex items-center justify-center bg-gray-100 text-gray-400 rounded-lg">
                  Generating QR Code...
                </div>
              )}
            </div>
          </div>

          {/* Upload Section */}
          <div className="mt-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">
              Upload payment slip
            </h2>

            {uploadedFile ? (
              <div className="relative mb-3 flex justify-center border border-gray-200 rounded-xl p-2 bg-white">
                <Image
                  src={URL.createObjectURL(uploadedFile)}
                  alt="Preview slip"
                  style={{
                    maxHeight: 240,
                    maxWidth: "100%",
                    objectFit: "contain",
                    borderRadius: 12,
                  }}
                  placeholder
                />
                <button
                  onClick={handleRemoveFile}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 shadow transition"
                  aria-label="Remove uploaded file"
                  title="Delete uploaded slip"
                  type="button"
                >
                  <FaTimes size={14} />
                </button>
              </div>
            ) : (
              <div
                className="mb-3 flex flex-col justify-center items-center border-2 border-dashed border-gray-300 rounded-xl py-10 text-gray-500 cursor-pointer select-none"
                onClick={handleUploadClick}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <FileImageOutlined style={{ fontSize: 44, marginBottom: 10 }} />
                <p className="text-sm font-medium">No uploaded slip yet.</p>
                <p className="text-[12px] mt-1 text-gray-500 text-center px-2">
                  Click or “drag-drop” the slip file here to upload.
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </main>

      {/* Bottom Bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-200 bg-white/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto flex max-w-screen-sm items-center gap-3 px-4 py-3">
          <button
            onClick={handleUploadClick}
            className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 transition"
          >
            <FaUpload />
            <span className="text-sm font-semibold">Upload slip</span>
          </button>

          <button
            onClick={handleSubmit}
            disabled={!uploadedFile || loading}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-white transition ${
              uploadedFile && !loading
                ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 active:from-blue-800 active:to-blue-700"
                : "bg-blue-300 cursor-not-allowed"
            }`}
          >
            <FaPaperPlane />
            <span className="text-sm font-semibold">Submit</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default PayPalCard;