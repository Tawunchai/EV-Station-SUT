import React, { useState } from "react";
import { Button, Form, Input, Typography, message } from "antd";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import Background from "../../assets/woman-charging-electro-car-by-her-house.jpg"; // พื้นหลังเต็มจอแบบเดียวกับตัวอย่าง
import { resetPassword } from "../../services/httpLogin";

// ✅ import รูปโลโก้มาแทน FaBolt (แก้ path ให้ตรงไฟล์ของคุณ)
import Logo from "../../assets/Logo-Good.png";

const { Title } = Typography;

const ResetPasswordForm: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";

  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  const onFinish = async (values: { password: string; newpassword: string }) => {
    const { password, newpassword } = values;

    if (!email) {
      messageApi.error("Email ไม่ถูกต้อง หรือหมดเวลา กรุณาลองใหม่");
      return;
    }
    if (password !== newpassword) {
      messageApi.error("New password และ Confirm password ต้องตรงกัน");
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword({ email, new_password: newpassword });
      if (res) {
        messageApi.success("Password changed successfully");
        setTimeout(() => navigate("/"), 1200);
      } else {
        messageApi.error("Failed to change password");
      }
    } catch {
      messageApi.error("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {contextHolder}

      {/* พื้นหลังภาพเต็มจอ + overlay + grid +
       + blobs (สไตล์เดียวกับตัวอย่าง LoginForm1) */}
      <div className="relative min-h-dvh flex items-center justify-center px-4 py-10 overflow-hidden">
        {/* ภาพพื้นหลังเต็มจอ (แก้ white strip) */}
        <div className="absolute inset-0 -z-10">
          <img
            src={Background}
            alt=""
            className="w-full h-full object-cover"
            loading="eager"
            draggable={false}
          />
        </div>

        {/* Overlay ให้อ่านง่าย */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-900/60 via-slate-900/35 to-blue-950/60" />

        {/* Soft grid โปร่งบาง */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage:
              "linear-gradient(#0b12261a 1px, transparent 1px), linear-gradient(90deg, #0b12261a 1px, transparent 1px)",
            backgroundSize: "36px 36px, 36px 36px",
          }}
        />

        {/* Blur blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 -right-16 w-80 h-80 rounded-full blur-3xl opacity-30 -z-10"
          style={{
            background:
              "radial-gradient(circle at 40% 40%, rgba(59,130,246,0.35), rgba(59,130,246,0.0) 60%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-16 -left-16 w-72 h-72 rounded-full blur-3xl opacity-25 -z-10"
          style={{
            background:
              "radial-gradient(circle at 60% 60%, rgba(14,165,233,0.30), rgba(14,165,233,0.0) 60%)",
          }}
        />

        {/* กล่องฟอร์ม (การ์ดขาวล้วน) */}
        <div className="relative w-full max-w-xl">
          {/* กรอบไล่เฉดบาง ๆ */}
          <div
            className="rounded-[28px] p-[1px]"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(37,99,235,0.30), rgba(56,189,248,0.18), rgba(99,102,241,0.24), rgba(37,99,235,0.30))",
            }}
          >
            <div className="rounded-[26px] bg-white border border-gray-200 shadow-[0_20px_60px_rgba(2,6,23,0.18)] p-8 md:p-10">
              {/* แบรนด์ */}
              <div className="flex items-center gap-3 mb-6 justify-center">
                {/* ✅ เปลี่ยน FaBolt เป็นรูปโลโก้ */}
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow border border-gray-200 overflow-hidden">
                  <img
                    src={Logo}
                    alt="EV Station Logo"
                    className="h-9 w-9 object-contain"
                    draggable={false}
                  />
                </span>

                <div className="leading-tight text-center">
                  <h1
                    className="text-2xl font-extrabold tracking-tight"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, #1e40af, #2563eb, #06b6d4, #22c55e, #2563eb)",
                      backgroundSize: "220% 100%",
                      backgroundPosition: "0% 50%",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                      animation: "evTextShine 6s ease-in-out infinite",
                    }}
                  >
                    SUT Smart EV
                  </h1>
                  <p className="text-[12px] text-blue-700/70 font-medium">
                    Smart • Clean • Future
                  </p>
                </div>
              </div>

              {/* แถบชาร์จ/โหลด */}
              <div className="mb-8">
                <div className="h-[3px] w-full rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full w-1/3 bg-gradient-to-r from-blue-400 via-sky-400 to-indigo-400 animate-barSlide rounded-full" />
                </div>
              </div>

              {/* หัวข้อ */}
              <div className="mb-4 text-center">
                <Title level={3} className="!m-0 !text-blue-900 !font-semibold">
                  Reset Password
                </Title>
                <p className="mt-1 text-sm text-blue-900/70">
                  Please set a new password below for account security.
                </p>
              </div>

              {/* ฟอร์ม */}
              <Form layout="vertical" onFinish={onFinish}>
                <Form.Item
                  name="password"
                  label={
                    <span className="text-sm text-gray-700 font-medium">
                      New Password
                    </span>
                  }
                  rules={[{ required: true, message: "Please input your new password!" }]}
                  hasFeedback
                >
                  <Input.Password
                    size="large"
                    placeholder="New password"
                    className="rounded-2xl border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </Form.Item>

                <Form.Item
                  name="newpassword"
                  label={
                    <span className="text-sm text-gray-700 font-medium">
                      Confirm New Password
                    </span>
                  }
                  dependencies={["password"]}
                  hasFeedback
                  rules={[
                    { required: true, message: "Please confirm your new password!" },
                    ({ getFieldValue }) => ({
                      validator(_, value) {
                        if (!value || getFieldValue("password") === value) return Promise.resolve();
                        return Promise.reject(new Error("Passwords do not match!"));
                      },
                    }),
                  ]}
                >
                  <Input.Password
                    size="large"
                    placeholder="Retype new password"
                    className="rounded-2xl border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </Form.Item>

                <Form.Item className="mb-2">
                  <Button
                    block
                    type="primary"
                    htmlType="submit"
                    size="large"
                    loading={loading}
                    disabled={loading}
                    className="!h-12 !rounded-2xl !bg-blue-600 hover:!bg-blue-700 font-medium"
                  >
                    Save the new password
                  </Button>
                </Form.Item>
              </Form>

              {/* ลิงก์ช่วยเหลือ */}
              <div className="flex items-center justify-between mt-4 text-sm">
                <Link to="/" className="text-blue-600 hover:underline">
                  Go back to login
                </Link>
              </div>

              <p className="mt-8 text-center text-xs text-gray-500">SUT Smart EV Station</p>
            </div>
          </div>
        </div>
      </div>

      {/* keyframes: gradient text + loading bar */}
      <style>{`
        @keyframes evTextShine {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes barSlide {
          0%   { transform: translateX(-100%); }
          50%  { transform: translateX(30%); }
          100% { transform: translateX(110%); }
        }
        .animate-barSlide { animation: barSlide 2.8s ease-in-out infinite; }

        @media (prefers-reduced-motion: reduce) {
          .animate-barSlide { animation: none !important; }
          h1[style] { animation: none !important; }
        }
      `}</style>
    </>
  );
};

export default ResetPasswordForm;
