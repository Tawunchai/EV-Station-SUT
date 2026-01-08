import React, { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Form,
  Input,
  Button,
  Upload,
  message,
  Select,
  Row,
  Col,
} from "antd";
import ImgCrop from "antd-img-crop";
import { EditOutlined, PlusOutlined, CloseOutlined } from "@ant-design/icons";
import {
  UpdateUserProfileByID,
  apiUrlPicture,
  ListGenders,
  ListUsers,
} from "../../../../../services";
import { UsersInterface } from "../../../../../interface/IUser";
import { GendersInterface } from "../../../../../interface/IGender";
import {
  getCurrentUser,
  initUserProfile,
} from "../../../../../services/httpLogin";

const { Option } = Select;

interface EditUserModalProps {
  show: boolean;
  onClose: () => void;
  onSaveSuccess: () => void;
  initialData: UsersInterface;
}

const EditUserModal: React.FC<EditUserModalProps> = ({
  show,
  onClose,
  onSaveSuccess,
  initialData,
}) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fileList, setFileList] = useState<any[]>([]);
  const [genders, setGenders] = useState<GendersInterface[]>([]);
  const [users, setUsers] = useState<UsersInterface[]>([]);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  const isMobile = useMemo(
    () => window.matchMedia("(max-width: 768px)").matches,
    []
  );

  // Load genders + all users
  useEffect(() => {
    const fetchData = async () => {
      const [gendersRes, usersRes] = await Promise.all([
        ListGenders(),
        ListUsers(),
      ]);
      if (gendersRes) setGenders(gendersRes);
      if (usersRes) setUsers(usersRes);
    };
    fetchData();
  }, []);

  // Prepare initial form
  useEffect(() => {
    if (!show || !initialData) return;

    form.setFieldsValue({
      username: initialData.Username,
      email: initialData.Email,
      firstname: initialData.FirstName,
      lastname: initialData.LastName,
      phone: initialData.PhoneNumber,
      gender: initialData.Gender?.ID,
    });

    if (initialData.Profile) {
      setFileList([
        {
          uid: "-1",
          name: "profile.png",
          status: "done",
          url: `${apiUrlPicture}${initialData.Profile}`,
        },
      ]);
    } else {
      setFileList([]);
    }

    setUsernameError(null);
    setEmailError(null);
    setPhoneError(null);
  }, [show, initialData, form]);

  const onChangeUpload = ({ fileList: newList }: any) => setFileList(newList);

  const validateUnique = (
    field: "username" | "email" | "phone",
    value: string
  ) => {
    if (!value) return;

    const trimmed = value.trim();
    const currentID = initialData?.ID;

    const duplicate = users.find((u) => {
      const username = (u.Username ?? "").trim();
      const email = (u.Email ?? "").trim();
      const phone = (u.PhoneNumber ?? "").trim();

      return (
        u.ID !== currentID &&
        ((field === "username" && username === trimmed) ||
          (field === "email" && email === trimmed) ||
          (field === "phone" && phone === trimmed))
      );
    });

    if (duplicate) {
      if (field === "username")
        setUsernameError("This username is already in use.");
      if (field === "email")
        setEmailError("This email is already in use.");
      if (field === "phone")
        setPhoneError("This phone number is already in use.");
    } else {
      if (field === "username") setUsernameError(null);
      if (field === "email") setEmailError(null);
      if (field === "phone") setPhoneError(null);
    }
  };

  // =====================================
  // SUBMIT FORM
  // =====================================
  const onFinish = async (values: any) => {
    if (usernameError || emailError || phoneError) {
      message.warning("Please fix any duplicates before saving");
      return;
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("username", values.username.trim());
    formData.append("email", values.email.trim());
    formData.append("firstname", values.firstname.trim());
    formData.append("lastname", values.lastname.trim());
    formData.append("phone", values.phone.trim());
    formData.append("gender", values.gender || "");

    if (fileList.length > 0 && fileList[0].originFileObj) {
      formData.append("profile", fileList[0].originFileObj);
    }

    // Get userID from token
    let current = getCurrentUser();
    if (!current) current = await initUserProfile();
    const userID = current?.id;

    if (!userID) {
      message.error("User not found. Please log in again");
      setLoading(false);
      return;
    }

    const res = await UpdateUserProfileByID(Number(userID), formData);
    setLoading(false);

    if (res) {
      message.success("Updated Successfully");
      onSaveSuccess();
      onClose();
    } else {
      message.error("Failed to update user");
    }
  };

  if (!show) return null;

  return (
    <Modal
      open={show}
      onCancel={onClose}
      footer={null}
      centered={!isMobile}
      destroyOnClose
      closable={false}
      width={600}
      className="max-w-full md:max-w-[600px]"
      style={
        isMobile
          ? { top: 1, paddingBottom: "env(safe-area-inset-bottom)" }
          : {}
      }
      bodyStyle={{ padding: 0, background: "transparent" }}
      // @ts-ignore
      styles={{
        content: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
          marginTop: isMobile ? 60 : undefined,
          overflow: "visible",
        },
      }}
    >
      {/* การ์ดหลักแบบเดียวกับ Bill / EditCar */}
      <div className="w-full max-w-xl mx-auto rounded-[26px] bg-white shadow-xl overflow-hidden">
        <Form
          layout="vertical"
          form={form}
          onFinish={onFinish}
          className="flex flex-col"
        >
          {/* HEADER GRADIENT */}
          <div className="relative flex items-center justify-between gap-2 text-white bg-gradient-to-r from-blue-600 to-sky-500 px-5 sm:px-6 py-4">
            <div className="flex items-center gap-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
                <EditOutlined style={{ fontSize: 20 }} />
              </div>
              <div className="flex flex-col">
                <span className="font-semibold text-sm sm:text-base">
                  Edit user profile
                </span>
                <span className="text-[11px] text-blue-100">
                  Update your account information
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              aria-label="close"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
            >
              <CloseOutlined style={{ fontSize: 16 }} />
            </button>
          </div>

          {/* BODY (scroll ได้) */}
          <div
            className="px-5 md:px-7 pt-4 pb-6 bg-blue-50/40"
            style={{
              maxHeight: isMobile ? "60vh" : "65vh",
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
            }}
          >
            {/* UPLOAD */}
            <div className="flex justify-center mb-6">
              <ImgCrop rotationSlider>
                <Upload
                  listType="picture-circle"
                  fileList={fileList}
                  onChange={onChangeUpload}
                  beforeUpload={(file) => {
                    if (!file.type.startsWith("image/")) {
                      message.error("Please upload only image file");
                      return Upload.LIST_IGNORE;
                    }
                    setFileList([file]);
                    return false;
                  }}
                  maxCount={1}
                  showUploadList={{
                    showPreviewIcon: true,
                    showRemoveIcon: true,
                  }}
                >
                  {fileList.length < 1 && (
                    <div className="flex flex-col items-center text-blue-600">
                      <PlusOutlined style={{ fontSize: 28 }} />
                      <div className="mt-1 text-xs">Upload a photo</div>
                    </div>
                  )}
                </Upload>
              </ImgCrop>
            </div>

            {/* FIELDS */}
            <Row gutter={[12, 8]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Username"
                  name="username"
                  validateStatus={usernameError ? "error" : ""}
                  help={usernameError || ""}
                >
                  <Input
                    placeholder="Enter your username"
                    size="large"
                    className="rounded-lg"
                    onChange={(e) =>
                      validateUnique("username", e.target.value.trim())
                    }
                  />
                </Form.Item>
              </Col>

              <Col xs={24} md={12}>
                <Form.Item
                  label="Email"
                  name="email"
                  validateStatus={emailError ? "error" : ""}
                  help={emailError || ""}
                >
                  <Input
                    type="email"
                    placeholder="Enter your email"
                    size="large"
                    className="rounded-lg"
                    onChange={(e) =>
                      validateUnique("email", e.target.value.trim())
                    }
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 8]}>
              <Col xs={24} md={12}>
                <Form.Item label="Firstname" name="firstname">
                  <Input
                    placeholder="Enter your FirstName"
                    size="large"
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>

              <Col xs={24} md={12}>
                <Form.Item label="Lastname" name="lastname">
                  <Input
                    placeholder="Enter your Lastname"
                    size="large"
                    className="rounded-lg"
                  />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={[12, 8]}>
              <Col xs={24} md={12}>
                <Form.Item
                  label="Phone Number"
                  name="phone"
                  validateStatus={phoneError ? "error" : ""}
                  help={phoneError || ""}
                >
                  <Input
                    placeholder="Enter your phone number"
                    size="large"
                    className="rounded-lg"
                    onChange={(e) =>
                      validateUnique("phone", e.target.value.trim())
                    }
                  />
                </Form.Item>
              </Col>

              <Col xs={24} md={12}>
                <Form.Item label="Gender" name="gender">
                  <Select
                    placeholder="Select gender"
                    size="large"
                    className="rounded-lg"
                  >
                    {genders.map((g) => (
                      <Option key={g.ID} value={g.ID}>
                        {g.Gender}
                      </Option>
                    ))}
                  </Select>
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* FOOTER */}
          <div className="px-5 sm:px-6 py-4 bg-white border-t border-blue-100 flex flex-col md:flex-row justify-end gap-3">
            <Button
              onClick={onClose}
              block={isMobile}
              style={{
                borderColor: "#2563eb",
                color: "#2563eb",
                height: 40,
                borderRadius: 10,
                fontWeight: 600,
              }}
            >
              Cancel
            </Button>

            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              block={isMobile}
              style={{
                background:
                  "linear-gradient(135deg, rgba(37,99,235,1) 0%, rgba(29,78,216,1) 100%)",
                border: "none",
                height: 40,
                borderRadius: 10,
                fontWeight: 700,
                boxShadow: "0 8px 20px rgba(37,99,235,0.25)",
              }}
            >
              Save
            </Button>
          </div>
        </Form>
      </div>
    </Modal>
  );
};

export default EditUserModal;
