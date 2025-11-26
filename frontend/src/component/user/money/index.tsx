import React, { useRef, useEffect, useState } from "react";
import { FaPaypal, FaUpload, FaPaperPlane, FaTimes } from "react-icons/fa";
import { message, QRCode, Image, InputNumber } from "antd";
import generatePayload from "promptpay-qr";
import {
  uploadSlipOK,
  UpdateCoin,
  getUserByID,
  CreatePaymentCoin,
  ListBank,
  GetDataPaymentByRef,
} from "../../../services";
import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";
import { FileImageOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import LoadingAnimation from "./LoadingAnimation";

// ⚡ EV bolt icon
const BoltIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z" fill="currentColor" />
  </svg>
);

const AddMoneyCoin: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [qrCode, setQrCode] = useState<string>("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  const [coinAmount, setCoinAmount] = useState<number>(0);
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [userID, setUserID] = useState<number>();
  const [userCoin, setUserCoin] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const [promptPay, setPromptPay] = useState<string>("");
  const [defaultAmount, setDefaultAmount] = useState<number>(0);

  // ✅ ข้อมูล Bank สำหรับตรวจสอบ
  const [bankingCode, setBankingCode] = useState<string>("");
  const [managerName, setManagerName] = useState<string>("");

  const navigate = useNavigate();

  // ✅ โหลดข้อมูลผู้ใช้
  useEffect(() => {
    const loadUser = async () => {
      try {
        let current = getCurrentUser();
        if (!current) current = await initUserProfile();

        const uid = current?.id;
        if (!uid) {
          message.error("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่");
          navigate("/login");
          return;
        }

        setUserID(uid);
        const user = await getUserByID(uid);
        if (user) setUserCoin(user.Coin ?? 0);
      } catch (error) {
        console.error("Error loading user:", error);
        message.error("โหลดข้อมูลผู้ใช้ล้มเหลว");
      }
    };
    loadUser();
  }, [navigate]);

  // ✅ โหลด PromptPay และ Default Amount จาก Bank
  useEffect(() => {
    const fetchBank = async () => {
      try {
        const banks = await ListBank();
        if (banks && banks.length > 0) {
          const bank = banks[0];
          setPromptPay(bank.PromptPay);
          setDefaultAmount(bank.Minimum || 0);
          setCoinAmount(bank.Minimum || 0);
          setTotalAmount(bank.Minimum || 0);
          setBankingCode(bank.Banking);
          setManagerName(bank.Manager);
        }
      } catch {
        message.error("ไม่สามารถโหลดข้อมูลธนาคารได้");
      }
    };
    fetchBank();
  }, []);

  // ✅ สร้าง QR Code จาก PromptPay
  useEffect(() => {
    if (promptPay && totalAmount > 0) {
      const payload = generatePayload(promptPay, { amount: totalAmount });
      setQrCode(payload);
    } else {
      setQrCode("");
    }
  }, [promptPay, totalAmount]);

  // ✅ Upload Slip
  const handleUploadClick = () => fileInputRef.current?.click();
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) setUploadedFile(e.target.files[0]);
  };
  const handleRemoveFile = () => {
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ✅ ส่งหลักฐานการชำระเงิน
  const handleSubmit = async () => {
    if (!userID) {
      message.error("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    if (!uploadedFile || coinAmount <= 0) {
      message.warning("กรุณาใส่จำนวนเงินและอัปโหลดสลิปก่อน");
      return;
    }

    try {
      setLoading(true);

      // 🔹 อัปโหลดสลิป
      const result = await uploadSlipOK(uploadedFile);
      console.log("🔹 uploadSlipOK result:", result);

      if (!result || !result.data?.ref) {
        message.warning("ไม่สามารถอ่านข้อมูลจากสลิปได้");
        setLoading(false);
        return;
      }

      // ✅ ตรวจสอบข้อมูลสลิป
      const slipData = result.data;
      const receiverBank = slipData.receiver_bank;
      const receiverName = slipData.receiver_name?.trim()?.toUpperCase();
      const slipAmount = Number(slipData.amount);
      const refNumber = slipData.ref;

      const bankCode = bankingCode?.trim()?.toUpperCase();
      const manager = managerName?.trim()?.toUpperCase();

      console.log("🧩 ตรวจสอบข้อมูล:", {
        receiverBank,
        receiverName,
        slipAmount,
        bankCode,
        manager,
        coinAmount,
        refNumber,
      });

      if (receiverBank !== bankCode) {
        message.warning(`รหัสธนาคารผู้รับ (${receiverBank}) ไม่ตรงกับระบบ (${bankCode})`);
        setLoading(false);
        return;
      }

      if (receiverName !== manager) {
        message.warning(`ชื่อผู้รับในสลิป (${receiverName}) ไม่ตรงกับผู้จัดการบัญชี (${manager})`);
        setLoading(false);
        return;
      }

      if (slipAmount !== coinAmount) {
        message.warning(`จำนวนเงินในสลิป (${slipAmount} บาท) ไม่ตรงกับที่กรอก (${coinAmount} บาท)`);
        setLoading(false);
        return;
      }

      // ✅ ตรวจสอบสลิปซ้ำ
      const existing = await GetDataPaymentByRef(refNumber);
      if (existing && existing.found) {
        message.warning("สลิปนี้ถูกใช้ไปแล้ว กรุณาอัปโหลดสลิปใหม่");
        setLoading(false);
        return;
      }

      // ✅ สร้างข้อมูล PaymentCoin
      const paymentCoin = {
        Date: slipData.date || new Date().toISOString(),
        Amount: slipData.amount || coinAmount,
        ReferenceNumber: refNumber,
        Picture: uploadedFile,
        UserID: userID,
      };

      const paymentResult = await CreatePaymentCoin(paymentCoin);
      if (!paymentResult) {
        message.error("บันทึกธุรกรรมล้มเหลว");
        setLoading(false);
        return;
      }

      // ✅ อัปเดต Coin ใหม่
      const newTotalCoin = userCoin + coinAmount;
      const updateResult = await UpdateCoin({
        user_id: userID,
        coin: newTotalCoin,
      });

      if (!updateResult) {
        message.error("อัปเดต Coin ล้มเหลว");
        setLoading(false);
        return;
      }

      message.success(`เติม Coin สำเร็จ (รวม ${newTotalCoin.toFixed(2)} Coin)`);

      setTimeout(() => {
        setUserCoin(newTotalCoin);
        setCoinAmount(defaultAmount);
        setTotalAmount(defaultAmount);
        setUploadedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
        navigate("/user");
        setLoading(false);
      }, 1000);
    } catch (error) {
      console.error("Error submit:", error);
      message.error("เกิดข้อผิดพลาดในการส่งหลักฐาน");
      setLoading(false);
    }
  };

  // ✅ Drag & Drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      setUploadedFile(e.dataTransfer.files[0]);
      e.dataTransfer.clearData();
    }
  };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const canSubmit = !!uploadedFile && coinAmount > 0 && !loading;

  return (
    <div className="min-h-screen bg-white">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md">
        <div className="w-full px-4 py-3 flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            className="h-9 w-9 flex items-center justify-center rounded-xl active:bg-white/15"
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
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
              <BoltIcon className="h-5 w-5 text-white" />
            </span>
            <span className="text-sm md:text-base font-semibold tracking-wide">
              Top up Coin
            </span>
          </div>
        </div>
      </header>

      {/* Loading */}
      {loading && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <LoadingAnimation />
        </div>
      )}

      {/* MAIN */}
      <main className="mx-auto max-w-screen-sm px-4 pb-28 pt-4">
        <div className="mb-4 flex justify-between rounded-2xl bg-blue-50 px-4 py-3">
          <div className="text-sm text-blue-900">Amount to be paid</div>
          <div className="text-xl font-bold text-blue-700">
            ฿{totalAmount.toFixed(2)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-3">
              <FaPaypal className="text-blue-600 text-2xl" />
              <span className="text-base font-semibold text-gray-800">PromptPay</span>
            </div>
            <div className="p-3 bg-white rounded-xl border">
              {qrCode ? (
                <QRCode value={qrCode} size={180} errorLevel="H" />
              ) : (
                <div className="w-[180px] h-[180px] flex items-center justify-center bg-gray-100 text-gray-400 rounded-lg">
                  Enter the amount to generate QR code.
                </div>
              )}
            </div>
          </div>

          {/* จำนวน Coin */}
          <div className="mt-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Number of Coins to top up
            </label>
            <div className="rounded-xl border border-gray-200 p-2">
              <InputNumber
                value={coinAmount}
                onChange={(v) => {
                  const val = Number(v);
                  setCoinAmount(val);
                  setTotalAmount(val);
                }}
                className="w-full"
              />
            </div>
          </div>

          {/* Upload Slip */}
          <div className="mt-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-2">
              Upload payment slip
            </h2>
            {uploadedFile ? (
              <div className="relative mb-2 flex justify-center border rounded-xl p-2 bg-white">
                <Image
                  src={URL.createObjectURL(uploadedFile)}
                  alt="Preview slip"
                  style={{ maxHeight: 240, objectFit: "contain", borderRadius: 12 }}
                />
                <button
                  onClick={handleRemoveFile}
                  className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5"
                >
                  <FaTimes size={14} />
                </button>
              </div>
            ) : (
              <div
                className="mb-2 flex flex-col justify-center items-center border-2 border-dashed border-gray-300 rounded-xl py-10 text-gray-500 cursor-pointer"
                onClick={handleUploadClick}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
              >
                <FileImageOutlined style={{ fontSize: 44, marginBottom: 10 }} />
                <p className="text-sm font-medium">No uploaded slip yet.</p>
                <p className="text-xs mt-1 text-gray-500 text-center px-2">
                  Click or “drag-drop” the slip file here.
                </p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>
        </div>
      </main>

      {/* ปุ่มล่าง */}
      <div className="fixed inset-x-0 bottom-0 border-t bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-sm items-center gap-3 px-4 py-3">
          <button
            onClick={handleUploadClick}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-white bg-blue-600 hover:bg-blue-700"
          >
            <FaUpload />
            <span className="text-sm font-semibold">Upload slip</span>
          </button>

          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-white transition ${
              canSubmit
                ? "bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600"
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

export default AddMoneyCoin;