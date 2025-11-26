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

  // โหลด User จาก JWT
  useEffect(() => {
    const fetchUser = async () => {
      try {
        let current = getCurrentUser();
        if (!current) current = await initUserProfile();

        if (current?.id) {
          setUserID(current.id);
        } else {
          message.error("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่");
          navigate("/login");
        }
      } catch (err) {
        console.error("โหลดข้อมูลผู้ใช้ล้มเหลว:", err);
        message.error("เกิดข้อผิดพลาดในการโหลดผู้ใช้");
        navigate("/login");
      }
    };
    fetchUser();
  }, [navigate]);

  // โหลด PromptPay ของธนาคาร
  useEffect(() => {
    const fetchBankData = async () => {
      try {
        const banks = await ListBank();
        if (banks && banks.length > 0) {
          const bankPhone = banks[0].PromptPay || "";
          setPhoneNumber(bankPhone);
        } else {
          message.error("ไม่พบข้อมูลธนาคารสำหรับ PromptPay");
        }
      } catch {
        message.error("โหลดข้อมูลธนาคารล้มเหลว");
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
        console.log("✅ Connected to Hardware WebSocket");
        const command = {
          solar_kwh: solarKwh,
          grid_kwh: gridKwh,
          solar_percent: solarPercent,
          grid_percent: gridPercent,
        };
        sendHardwareCommand(ws, "hardware_001", command);
        console.log("📤 Sent Command to Hardware:", command);
      };
      ws.onclose = () => console.warn("⚠️ Hardware WebSocket disconnected");
      ws.onerror = (err) => console.error("❌ Hardware WebSocket error:", err);
    } catch (err) {
      console.error("❌ Failed to send to hardware:", err);
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

  // ส่งหลักฐาน + Create Payment
  const handleSubmit = async () => {
    if (!uploadedFile) {
      message.warning("กรุณาอัปโหลดสลิปก่อนส่ง");
      return;
    }
    if (!userID) {
      message.error("ไม่พบข้อมูลผู้ใช้");
      return;
    }

    setLoading(true);
    try {
      const result = await uploadSlipOK(uploadedFile);
      if (!result) {
        message.error("ส่งหลักฐานล้มเหลว");
        setLoading(false);
        return;
      }

      message.success("ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว");

      // ⭐⭐⭐ เพิ่ม cabinet_id เข้า PaymentData (แบบ type ถูกต้อง)
      const paymentData = {
        date: new Date().toISOString().split("T")[0],
        amount: Number(totalAmount),
        user_id: userID,
        method_id: MethodID,
        reference_number: result.data.ref,
        picture: uploadedFile,
        ev_cabinet_id: cabinet_id ?? undefined, // ✅ ให้เป็น number | undefined ตาม interface
      };

      const paymentResult = await CreatePayment(paymentData);

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

        // สร้าง Token
        const token = await CreateChargingToken(userID, paymentResult.ID);
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
        message.error("สร้าง Payment ล้มเหลว");
        setLoading(false);
      }
    } catch (error) {
      console.error(error);
      message.error("เกิดข้อผิดพลาดในการส่งหลักฐาน");
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
            aria-label="ย้อนกลับ"
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
                  title="ลบสลิปที่อัปโหลด"
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
            disabled={!uploadedFile}
            className={`flex-1 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-white transition ${
              uploadedFile
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