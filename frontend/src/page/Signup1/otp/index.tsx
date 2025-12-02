import React, { useState, useEffect, useRef } from "react";
import { Modal, Button, message } from "antd";
import { VerifyOTP, SendOTP } from "../../../services/httpLogin";

interface OTPModalProps {
  open: boolean;
  email: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const OTPModal: React.FC<OTPModalProps> = ({ open, email, onSuccess, onCancel }) => {
  const [otp, setOtp] = useState<string[]>(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // countdown resend timer
  useEffect(() => {
    if (resendTimer <= 0) return;
    const timer = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [resendTimer]);

  const handleVerify = async () => {
    const code = otp.join("");
    if (code.length !== 6) return message.error("Please enter the OTP with 6 digits");
    setLoading(true);
    try {
      const res = await VerifyOTP(email, code);
      if (res?.message) {
        message.success("Confirmed successfully");
        onSuccess();
      }
    } catch {
      message.error("OTP is invalid or has expired");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    try {
      await SendOTP(email);
      message.success("New OTP has been sent");
      setResendTimer(60);
    } catch {
      message.error("Unable to send new OTP");
    }
  };

  const handleChange = (val: string, idx: number) => {
    if (!/^\d?$/.test(val)) return; // allow only digit
    const newOtp = [...otp];
    newOtp[idx] = val;
    setOtp(newOtp);

    if (val && idx < 5) inputRefs.current[idx + 1]?.focus(); // auto next
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === "Backspace" && !otp[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus(); // go back
    }
  };

  return (
    <Modal
      open={open}
      footer={null}
      centered
      maskClosable={false} // ✅ ห้ามคลิกพื้นหลังแล้วปิด
      closable={true} // ✅ เปิดปุ่มกากบาท
      onCancel={onCancel}
      width={360}
      className="otp-modal"
    >
      <div className="flex flex-col items-center text-center py-2">
        {/* Icon */}
        <div className="flex items-center justify-center w-14 h-14 rounded-full bg-blue-100 mb-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="#2563eb"
            className="w-8 h-8"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h2 className="text-[18px] font-semibold text-gray-800 mb-1">
          Verify your code
        </h2>
        <p className="text-gray-500 text-sm mb-4">
          We have sent a code to your email <br />
          <span className="font-medium text-gray-600">{email}</span>
        </p>

        {/* ช่อง OTP */}
        <div className="flex justify-center gap-2 mb-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <input
              key={i}
              ref={(el) => void (inputRefs.current[i] = el)} // ✅ แก้ type error
              type="text"
              maxLength={1}
              className="w-10 h-12 text-center text-lg font-semibold border border-gray-300 rounded-md focus:border-blue-500 focus:outline-none"
              value={otp[i]}
              onChange={(e) => handleChange(e.target.value, i)}
              onKeyDown={(e) => handleKeyDown(e, i)}
            />
          ))}
        </div>

        <Button
          type="primary"
          size="large"
          block
          loading={loading}
          onClick={handleVerify}
          className="!rounded-lg !bg-blue-600 hover:!bg-blue-700 font-medium"
        >
          Verify
        </Button>

        <div className="text-gray-500 text-sm mt-3">
          Didn’t receive code?{" "}
          <button
            disabled={resendTimer > 0}
            onClick={handleResend}
            className={`font-medium ${
              resendTimer > 0
                ? "text-gray-400 cursor-not-allowed"
                : "text-blue-600 hover:underline"
            }`}
          >
            {resendTimer > 0 ? `Resend in ${resendTimer}s` : "Resend"}
          </button>
        </div>
      </div>

      <style>{`
        .otp-modal .ant-modal-content {
          border-radius: 16px;
          background-color: #fff;
          padding: 24px 28px;
        }
        .otp-modal .ant-modal-body {
          padding: 0;
        }
        .otp-modal .ant-modal-close-x {
          color: #1e3a8a;
          font-size: 18px;
        }
      `}</style>
    </Modal>
  );
};

export default OTPModal;
