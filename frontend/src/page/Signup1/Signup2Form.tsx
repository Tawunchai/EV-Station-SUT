import React, { useEffect, useState } from "react";
import { Button, Form, Input, Select, message, Upload } from "antd";
import ImgCrop from "antd-img-crop";
import { PlusOutlined } from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import { ListGenders, CreateUser, ListUsers } from "../../services";
import { SendOTP } from "../../services/httpLogin";
import OTPModal from "./otp/index";
import Background from "../../assets/woman-charging-electro-car-by-her-house.jpg";

// ✅ import รูปโลโก้มาแทน FaBolt (ปรับ path ให้ตรงไฟล์ของคุณ)
import Logo from "../../assets/Logo-Good.png";

const Signup2Form: React.FC = () => {
  const [form] = Form.useForm();
  const navigate = useNavigate();
  const [genderOptions, setGenderOptions] = useState<{ ID: number; Name: string }[]>([]);
  const [users, setUsers] = useState<any[]>([]); // ✅ เก็บข้อมูล user ทั้งหมด
  const [fileList, setFileList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [pendingValues, setPendingValues] = useState<any>(null);
  const [messageApi, contextHolder] = message.useMessage();

  // ========================= โหลดข้อมูลเพศและผู้ใช้ทั้งหมด =========================
  useEffect(() => {
    const fetchData = async () => {
      const genderRes = await ListGenders();
      if (genderRes) {
        const mapped = genderRes.map((g: any) => ({ ID: g.ID ?? 0, Name: g.Gender ?? "" }));
        setGenderOptions(mapped);
      }

      const usersRes = await ListUsers();
      if (usersRes) {
        setUsers(usersRes);
      }
    };
    fetchData();
  }, []);

  // ========================= Upload =========================
  const onChange = ({ fileList: newFileList }: any) => setFileList(newFileList);

  const onPreview = async (file: any) => {
    let src = file.url;
    if (!src) {
      src = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file.originFileObj);
        reader.onload = () => resolve(reader.result as string);
      });
    }
    const imgWindow = window.open(src as string);
    imgWindow?.document.write(`<img src="${src}" style="max-width:100%;" />`);
  };

  // ========================= ตรวจสอบค่าซ้ำ =========================
  const isDuplicate = (field: string, value: string) => {
    if (!value) return false;
    return users.some((user) => user[field]?.toLowerCase() === value.toLowerCase());
  };

  // ========================= ส่ง OTP ก่อนสมัคร =========================
  const onFinish = async (values: any) => {
    if (fileList.length === 0) {
      messageApi.error("Please upload a photo before applying");
      return;
    }

    // ✅ ตรวจสอบซ้ำก่อนส่ง OTP
    const duplicateErrors: any = {};
    if (isDuplicate("Username", values.username)) duplicateErrors.username = "Username already used.";
    if (isDuplicate("Email", values.email)) duplicateErrors.email = "Email already used.";
    if (isDuplicate("PhoneNumber", values.phone)) duplicateErrors.phone = "Phone already used.";

    if (Object.keys(duplicateErrors).length > 0) {
      form.setFields(
        Object.entries(duplicateErrors).map(([name, error]) => ({
          name,
          errors: [error as string],
        }))
      );
      return;
    }

    try {
      setLoading(true);
      await SendOTP(values.email);
      setPendingValues(values);
      setOtpModalOpen(true);
      messageApi.info("OTP has been sent to your email");
    } catch (err) {
      messageApi.error("Failed to send OTP. Please try again");
    } finally {
      setLoading(false);
    }
  };

  // ========================= สมัครจริงหลังยืนยัน OTP =========================
  const handleOTPVerified = async () => {
    const values = pendingValues;
    if (!values) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("username", values.username);
    formData.append("email", values.email);
    formData.append("password", values.password);
    formData.append("firstname", values.firstname || "");
    formData.append("lastname", values.lastname || "");
    formData.append("phone", values.phone || "");
    formData.append("gender", values.gender);
    formData.append("userRoleID", "3");
    formData.append("profile", fileList[0].originFileObj);

    try {
      const res = await CreateUser(formData);
      if (res) {
        messageApi.success("Registration successful");
        navigate("/auth/login-2");
      } else {
        messageApi.error("Registration failed");
      }
    } catch {
      messageApi.error("Registration error");
    } finally {
      setLoading(false);
      setOtpModalOpen(false);
    }
  };

  // ======================================================================
  return (
    <>
      {contextHolder}

      <div className="relative min-h-dvh flex items-start justify-center px-4 py-6 md:py-5 overflow-hidden">
        {/* BG */}
        <div className="absolute inset-0 -z-10">
          <img src={Background} alt="" className="w-full h-full object-cover" loading="eager" />
        </div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-blue-900/60 via-slate-900/35 to-blue-950/60" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.08] mix-blend-overlay"
          style={{
            backgroundImage:
              "linear-gradient(#0b12261a 1px, transparent 1px), linear-gradient(90deg, #0b12261a 1px, transparent 1px)",
            backgroundSize: "36px 36px, 36px 36px",
          }}
        />

        {/* Card */}
        <div className="relative w-full max-w-[900px] md:-mt-2">
          <div
            className="rounded-[24px] p-[1px]"
            style={{
              background:
                "conic-gradient(from 0deg, rgba(37,99,235,0.30), rgba(56,189,248,0.18), rgba(99,102,241,0.24), rgba(37,99,235,0.30))",
            }}
          >
            <div className="rounded-[22px] bg-white border border-gray-200 shadow-[0_16px_44px_rgba(2,6,23,0.16)] p-6 md:p-7">
              {/* Header */}
              <div className="flex items-center justify-center gap-3 mb-4">
                {/* ✅ เปลี่ยนจาก FaBolt เป็นรูปโลโก้ */}
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow border border-gray-200 overflow-hidden">
                  <img
                    src={Logo}
                    alt="EV Station Logo"
                    className="h-7 w-7 object-contain"
                    draggable={false}
                  />
                </span>

                <div className="leading-tight text-center">
                  <h1
                    className="text-xl md:text-2xl font-extrabold tracking-tight"
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
                  <p className="text-[12px] text-blue-700/70 font-medium">Smart • Clean • Future</p>
                </div>
              </div>

              <div className="mb-4">
                <div className="h-[2px] w-full rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full w-1/3 bg-gradient-to-r from-blue-400 via-sky-400 to-indigo-400 animate-barSlide rounded-full" />
                </div>
              </div>

              {/* FORM */}
              <Form
                layout="vertical"
                form={form}
                onFinish={onFinish}
                encType="multipart/form-data"
                disabled={loading}
                className="form-compact"
              >
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  {/* LEFT */}
                  <div className="md:col-span-4">
                    <Form.Item
                      label={<span className="text-sm text-gray-700">Profile Picture</span>}
                      name="profile"
                      className="mb-2 ml-24"
                      rules={[
                        {
                          validator: () =>
                            fileList.length > 0
                              ? Promise.resolve()
                              : Promise.reject(new Error("Please upload an image")),
                        },
                      ]}
                    >
                      <ImgCrop rotationSlider>
                        <Upload
                          fileList={fileList}
                          onChange={onChange}
                          onPreview={onPreview}
                          beforeUpload={(file) => {
                            const isImage = file.type.startsWith("image/");
                            if (!isImage) {
                              messageApi.error("Please upload an image");
                              return Upload.LIST_IGNORE;
                            }
                            setFileList([file]);
                            return false;
                          }}
                          maxCount={1}
                          listType="picture-card"
                          className="w-full signup-upload-balanced"
                        >
                          {fileList.length < 1 && (
                            <div className="text-center">
                              <PlusOutlined style={{ fontSize: 26 }} />
                              <div className="mt-1 text-sm">Upload</div>
                            </div>
                          )}
                        </Upload>
                      </ImgCrop>
                    </Form.Item>

                    <Form.Item
                      name="gender"
                      label={<span className="text-sm text-gray-700">Gender</span>}
                      rules={[{ required: true, message: "Please select gender" }]}
                      className="mb-5 md:mt-[39px]"
                    >
                      <Select placeholder="Select Gender" size="middle" className="!rounded-xl">
                        {genderOptions.map((g) => (
                          <Select.Option key={g.ID} value={g.ID}>
                            {g.Name}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <div className="text-[11px] text-gray-500 leading-tight">
                      Tip: Use a clear, front-facing photo
                    </div>
                  </div>

                  {/* RIGHT */}
                  <div className="md:col-span-8">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                      {/* Username */}
                      <Form.Item
                        name="username"
                        label={<span className="text-sm text-gray-700">Username</span>}
                        rules={[{ required: true, message: "Please enter your username." }]}
                        className="md:col-span-6"
                      >
                        <Input placeholder="Username" size="middle" className="rounded-xl" />
                      </Form.Item>

                      {/* Email */}
                      <Form.Item
                        name="email"
                        label={<span className="text-sm text-gray-700">Email</span>}
                        rules={[
                          { required: true, message: "Please enter your email address." },
                          { type: "email", message: "Please enter a valid email address." },
                        ]}
                        className="md:col-span-6"
                      >
                        <Input placeholder="Email" size="middle" className="rounded-xl" />
                      </Form.Item>

                      {/* Password */}
                      <Form.Item
                        name="password"
                        label={<span className="text-sm text-gray-700">Password</span>}
                        rules={[{ required: true, message: "Please enter your password." }]}
                        className="md:col-span-6"
                      >
                        <Input.Password placeholder="Password" size="middle" className="rounded-xl" />
                      </Form.Item>

                      {/* Phone */}
                      <Form.Item
                        name="phone"
                        label={<span className="text-sm text-gray-700">Phone</span>}
                        rules={[
                          { required: true, message: "Please enter your phone number." },
                          { pattern: /^0\d{9}$/, message: "Phone number must be 10 digits." },
                        ]}
                        className="md:col-span-6"
                      >
                        <Input placeholder="0XXXXXXXXX" size="middle" className="rounded-xl" />
                      </Form.Item>

                      {/* Firstname */}
                      <Form.Item
                        name="firstname"
                        label={<span className="text-sm text-gray-700">First Name</span>}
                        rules={[{ required: true, message: "Please enter your name" }]}
                        className="md:col-span-6"
                      >
                        <Input placeholder="First Name" size="middle" className="rounded-xl" />
                      </Form.Item>

                      {/* Lastname */}
                      <Form.Item
                        name="lastname"
                        label={<span className="text-sm text-gray-700">Last Name</span>}
                        rules={[{ required: true, message: "Please enter your last name" }]}
                        className="md:col-span-6"
                      >
                        <Input placeholder="Last Name" size="middle" className="rounded-xl" />
                      </Form.Item>
                    </div>

                    <Form.Item className="mt-1">
                      <Button
                        block
                        type="primary"
                        htmlType="submit"
                        size="middle"
                        loading={loading}
                        disabled={loading}
                        className="!h-11 !rounded-xl !bg-blue-600 hover:!bg-blue-700 font-medium"
                      >
                        {loading ? "Applying..." : "Sign up"}
                      </Button>
                    </Form.Item>

                    <div className="mt-1 text-sm text-center text-gray-600">
                      Already have an account??{" "}
                      <Link to="/auth/login-2" className="text-blue-600 hover:underline">
                        Log in
                      </Link>
                    </div>

                    <p className="mt-4 text-center text-[11px] text-gray-500">
                      SUT Smart EV Station
                    </p>
                  </div>
                </div>
              </Form>
            </div>
          </div>
        </div>
      </div>

      {/* ✅ เรียก Modal OTP */}
      <OTPModal
        open={otpModalOpen}
        email={pendingValues?.email || ""}
        onSuccess={handleOTPVerified}
        onCancel={() => setOtpModalOpen(false)}
      />

      {/* Animations */}
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
        .animate-barSlide { animation: barSlide 2.4s ease-in-out infinite; }
        .form-compact .ant-form-item { margin-bottom: 12px; }
        .form-compact .ant-form-item-label > label { font-size: 12px; }
        .signup-upload-balanced .ant-upload-select-picture-card {
          width: 220px !important;
          height: 220px !important;
          border-radius: 14px;
        }
      `}</style>
    </>
  );
};

export default Signup2Form;
