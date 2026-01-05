import React, { useState } from "react";
import { Button, Form, Input, message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { LoginInterface } from "../../interface/Login";
import { AddLogin, clearCachedUser, GetProfile } from "../../services/httpLogin";
import Background from "../../assets/woman-charging-electro-car-by-her-house.jpg";
import Logo from "../../assets/Logo-Good.png";

const LoginForm1: React.FC = () => {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [messageApi, contextHolder] = message.useMessage();
  const [loading, setLoading] = useState(false);

  const handleLogin = async (loginData: LoginInterface) => {
    try {
      setLoading(true);
      const res = await AddLogin(loginData);

      if (res.status === 200) {
        messageApi.success("Login successful");
        console.log("✅ Message shown — waiting 1s before redirect...");

        setTimeout(async () => {
          // ล้าง cache เก่า
          clearCachedUser();

          // ดึงข้อมูลโปรไฟล์ใหม่จาก cookie
          const profileRes = await GetProfile();
          const roleName = profileRes.data.role;

          // เก็บ role ไว้ใน localStorage
          localStorage.setItem("role", roleName);

          // แจ้งให้ ConfigRoutes รู้ว่ามีการเปลี่ยน role
          window.dispatchEvent(new Event("roleChange"));

          // เปลี่ยนหน้า
          if (roleName === "Admin" || roleName === "Employee") {
            navigate("/admin", { replace: true });
          } else {
            navigate("/user", { replace: true });
          }
        }, 1500);
      } else {
        messageApi.error("Username or password is incorrect.");
      }
    } catch (error: any) {
      messageApi.warning("Invalid login information");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {contextHolder}

      <div className="relative min-h-dvh flex items-center justify-center px-4 py-10 overflow-hidden">
        {/* BG image */}
        <div className="absolute inset-0 -z-10">
          <img
            src={Background}
            alt="EV Station background"
            className="w-full h-full object-cover"
          />
        </div>

        {/* dark overlay */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-900/60 via-slate-900/35 to-blue-950/60" />

        {/* grid overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage:
              "linear-gradient(#0b12261a 1px, transparent 1px), linear-gradient(90deg, #0b12261a 1px, transparent 1px)",
            backgroundSize: "36px 36px, 36px 36px",
          }}
        />

        {/* CARD */}
        <div className="relative w-full max-w-md">
          <div
            className="rounded-[28px] p-[1px]"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(37,99,235,0.30), rgba(56,189,248,0.18), rgba(99,102,241,0.24), rgba(37,99,235,0.30))",
            }}
          >
            <div className="rounded-[26px] bg-white border border-gray-200 shadow-[0_20px_60px_rgba(2,6,23,0.18)] p-8 md:p-10">
              {/* โลโก้ + ชื่อระบบ */}
              <div className="flex items-center justify-center gap-3 mb-6">
                {/* ✅ เปลี่ยนจาก icon เป็นรูป */}
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow border border-gray-200 overflow-hidden">
                  <img
                    src={Logo}
                    alt="EV Station Logo"
                    className="h-9 w-9 object-contain"
                    draggable={false}
                  />
                </span>

                {/* บังคับให้ title + subtitle เรียงเป็นคอลัมน์เสมอ */}
                <div className="flex flex-col leading-tight text-left sm:text-center">
                  <h1
                    className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent"
                    style={{
                      backgroundImage:
                        "linear-gradient(90deg, #1e40af, #2563eb, #06b6d4, #22c55e, #2563eb)",
                      backgroundSize: "220% 100%",
                      animation: "evTextShine 6s ease-in-out infinite",
                    }}
                  >
                    SUT Smart EV
                  </h1>
                  <p className="text-[12px] text-blue-700/70 font-medium mt-1">
                    Smart • Clean • Future
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mb-8">
                <div className="h-[3px] w-full rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full w-1/3 bg-gradient-to-r from-blue-400 via-sky-400 to-indigo-400 animate-barSlide rounded-full" />
                </div>
              </div>

              {/* ฟอร์มล็อกอิน */}
              <Form
                layout="vertical"
                form={form}
                onFinish={(values) => {
                  const { username, password } = values as LoginInterface;
                  if (!username || !password) {
                    messageApi.warning("Please fill in all information.");
                    return;
                  }
                  handleLogin({ username: username.trim(), password });
                }}
                disabled={loading}
              >
                <Form.Item
                  name="username"
                  label={
                    <span className="text-sm text-gray-700 font-medium">
                      Username
                    </span>
                  }
                  rules={[
                    { required: true, message: "Please enter your username." },
                  ]}
                >
                  <Input
                    size="large"
                    className="rounded-2xl border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="yourname"
                  />
                </Form.Item>

                <Form.Item
                  name="password"
                  label={
                    <span className="text-sm text-gray-700 font-medium">
                      Password
                    </span>
                  }
                  rules={[
                    { required: true, message: "Please enter your password." },
                  ]}
                >
                  <Input.Password
                    size="large"
                    className="rounded-2xl border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                    placeholder="••••••••"
                  />
                </Form.Item>

                <div className="flex items-center justify-between mb-4 text-sm">
                  <Link
                    to="/forgot-password"
                    className="text-blue-600 hover:underline"
                  >
                    Forgot your password?
                  </Link>
                  <Link to="/register" className="text-blue-600 hover:underline">
                    Register
                  </Link>
                </div>

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
                    Log in
                  </Button>
                </Form.Item>
              </Form>

              <p className="mt-8 text-center text-xs text-gray-500">
                SUT Smart EV Station
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* keyframes */}
      <style>{`
        @keyframes evTextShine {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes barSlide {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(30%); }
          100% { transform: translateX(110%); }
        }
        .animate-barSlide {
          animation: barSlide 2.8s ease-in-out infinite;
        }
      `}</style>
    </>
  );
};

export default LoginForm1;
