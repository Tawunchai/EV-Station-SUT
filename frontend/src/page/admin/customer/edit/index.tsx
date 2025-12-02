import React, { useEffect, useMemo, useState } from "react";
import { Select } from "antd";
import { GendersInterface } from "../../../../interface/IGender";
import { UserroleInterface } from "../../../../interface/IUserrole";
import {
  FaUserEdit,
  FaEnvelope,
  FaUser,
  FaPhoneAlt,
  FaCoins,
  FaTransgender,
  FaUserTag,
  FaTimes,
} from "react-icons/fa";

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  user: any;
  onSave: (updatedUser: any) => void;
  genders: GendersInterface[];
  userRoles: UserroleInterface[];
  allUsersData: { Username: string; Email: string; PhoneNumber: string }[];
}

const EditUserModal: React.FC<EditUserModalProps> = ({
  open,
  onClose,
  user,
  onSave,
  genders,
  userRoles,
  allUsersData,
}) => {
  const [form, setForm] = useState<any>(user);
  const [errors, setErrors] = useState<{
    Username?: string;
    Email?: string;
    PhoneNumber?: string;
    Coin?: string;
  }>({});

  const isMobile = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 768px)").matches
        : false,
    []
  );

  // Init/refresh form when user/open changes
  useEffect(() => {
    if (!open) return;
    setForm({
      ...user,
      UserID: user?.UserID ?? user?.ID ?? "",
      GenderID: user?.Gender?.ID ?? user?.GenderID ?? "",
      UserRoleID: user?.UserRole?.ID ?? user?.UserRoleID ?? "",
      Coin: user?.Coin ?? 0,
    });
    setErrors({});
  }, [user, open]);

  if (!open) return null;

  // Realtime duplicate checks
  useEffect(() => {
    const nextErrors: typeof errors = {};

    if (form?.Username) {
      const dupUsername = allUsersData
        .filter((u) => u.Username !== user?.Username)
        .some(
          (u) =>
            u.Username.trim().toLowerCase() ===
            form.Username.trim().toLowerCase()
        );
      if (dupUsername) {
        nextErrors.Username = "This username is already in use.";
      }
    }

    if (form?.Email) {
      const dupEmail = allUsersData
        .filter((u) => u.Email !== user?.Email)
        .some(
          (u) =>
            u.Email.trim().toLowerCase() ===
            form.Email.trim().toLowerCase()
        );
      if (dupEmail) {
        nextErrors.Email = "This email is already in use.";
      }
    }

    if (form?.PhoneNumber) {
      const dupPhone = allUsersData
        .filter((u) => u.PhoneNumber !== user?.PhoneNumber)
        .some(
          (u) =>
            u.PhoneNumber.trim() === form.PhoneNumber.trim()
        );
      if (dupPhone) {
        nextErrors.PhoneNumber = "This phone number is already in use.";
      }
    }

    setErrors((prev) => ({
      ...prev,
      Username: nextErrors.Username,
      Email: nextErrors.Email,
      PhoneNumber: nextErrors.PhoneNumber,
    }));
  }, [form?.Username, form?.Email, form?.PhoneNumber, allUsersData, user]);

  const validate = () => {
    const nextErrors: typeof errors = {};

    if (
      form?.Email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.Email)
    ) {
      nextErrors.Email = "Invalid email format.";
    }

    if (
      form?.PhoneNumber &&
      !/^0\d{9}$/.test(form.PhoneNumber)
    ) {
      nextErrors.PhoneNumber = "Please enter a valid Thai phone number.";
    }

    if (form?.Coin !== undefined && isNaN(Number(form.Coin))) {
      nextErrors.Coin = "Coin must be a number.";
    }

    setErrors((prev) => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setForm((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = () => {
    if (!validate()) return;
    if (errors.Username || errors.Email || errors.PhoneNumber || errors.Coin) {
      return;
    }

    const { Gender, UserRole, ...payload } = {
      ...form,
      Coin: Number(form.Coin),
    };
    onSave(payload);
  };

  const canSubmit =
    !errors.Username &&
    !errors.Email &&
    !errors.PhoneNumber &&
    !errors.Coin;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center ev-scope"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div className="relative w-full max-w-[640px] mx-4 md:mx-auto mb-8 md:mb-0">
        <div
          className="bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-blue-100 flex flex-col"
          style={{ maxHeight: isMobile ? "78vh" : "85vh" }}
        >
          {/* Header */}
          <div
            className="px-5 pt-3 pb-4 bg-gradient-to-r from-blue-600 to-sky-500 text-white flex justify-between items-center"
            style={{
              paddingTop: "calc(env(safe-area-inset-top) + 8px)",
            }}
          >
            <div className="flex items-center gap-2">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/20">
                <FaUserEdit className="opacity-90" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-semibold">
                  Edit user details
                </h2>
                <p className="text-[11px] text-blue-100">
                  Update account information and permissions.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 -m-2 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              aria-label="Close dialog"
              title="Close"
            >
              <FaTimes />
            </button>
          </div>

          {/* Body (scroll area) */}
          <div
            className="px-5 py-5 bg-blue-50/40"
            style={{
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              maxHeight: "100%",
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Username */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Username
                </span>
                <div
                  className={`flex items-center bg-white rounded-xl border ${
                    errors.Username
                      ? "border-red-400"
                      : "border-slate-200"
                  } focus-within:ring-2 focus-within:ring-blue-500/50`}
                >
                  <span className="pl-3 pr-2 text-blue-500">
                    <FaUser />
                  </span>
                  <input
                    className="w-full px-3 py-2.5 rounded-xl outline-none bg-transparent"
                    name="Username"
                    placeholder="Username"
                    value={form?.Username || ""}
                    onChange={handleChange}
                  />
                </div>
                {errors.Username && (
                  <span className="text-xs text-red-500">
                    {errors.Username}
                  </span>
                )}
              </label>

              {/* Email */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Email
                </span>
                <div
                  className={`flex items-center bg-white rounded-xl border ${
                    errors.Email
                      ? "border-red-400"
                      : "border-slate-200"
                  } focus-within:ring-2 focus-within:ring-blue-500/50`}
                >
                  <span className="pl-3 pr-2 text-blue-500">
                    <FaEnvelope />
                  </span>
                  <input
                    className="w-full px-3 py-2.5 rounded-xl outline-none bg-transparent"
                    name="Email"
                    placeholder="user@example.com"
                    value={form?.Email || ""}
                    onChange={handleChange}
                  />
                </div>
                {errors.Email && (
                  <span className="text-xs text-red-500">
                    {errors.Email}
                  </span>
                )}
              </label>

              {/* First Name */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  First name
                </span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  name="FirstName"
                  placeholder="First name"
                  value={form?.FirstName || ""}
                  onChange={handleChange}
                />
              </label>

              {/* Last Name */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Last name
                </span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  name="LastName"
                  placeholder="Last name"
                  value={form?.LastName || ""}
                  onChange={handleChange}
                />
              </label>

              {/* Phone Number */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Phone number
                </span>
                <div
                  className={`flex items-center bg-white rounded-xl border ${
                    errors.PhoneNumber
                      ? "border-red-400"
                      : "border-slate-200"
                  } focus-within:ring-2 focus-within:ring-blue-500/50`}
                >
                  <span className="pl-3 pr-2 text-blue-500">
                    <FaPhoneAlt />
                  </span>
                  <input
                    className="w-full px-3 py-2.5 rounded-xl outline-none bg-transparent"
                    name="PhoneNumber"
                    placeholder="0xxxxxxxxx"
                    value={form?.PhoneNumber || ""}
                    onChange={handleChange}
                    inputMode="numeric"
                  />
                </div>
                {errors.PhoneNumber && (
                  <span className="text-xs text-red-500">
                    {errors.PhoneNumber}
                  </span>
                )}
              </label>

              {/* Coin */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Coins
                </span>
                <div
                  className={`flex items-center bg-white rounded-xl border ${
                    errors.Coin
                      ? "border-red-400"
                      : "border-slate-200"
                  } focus-within:ring-2 focus-within:ring-blue-500/50`}
                >
                  <span className="pl-3 pr-2 text-blue-500">
                    <FaCoins />
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    className="w-full px-3 py-2.5 rounded-xl outline-none bg-transparent"
                    name="Coin"
                    placeholder="0"
                    value={form?.Coin ?? 0}
                    onChange={handleChange}
                  />
                </div>
                {errors.Coin && (
                  <span className="text-xs text-red-500">
                    {errors.Coin}
                  </span>
                )}
              </label>

              {/* Gender */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 flex items-center gap-2">
                  <FaTransgender className="text-blue-500" /> Gender
                </span>
                <Select
                  className="ev-select w-full"
                  popupClassName="ev-select-dropdown"
                  placeholder="Select gender"
                  size="large"
                  allowClear
                  value={form?.GenderID || undefined}
                  onChange={(val) =>
                    setForm((p: any) => ({ ...p, GenderID: val }))
                  }
                  options={genders.map((g) => ({
                    label: g.Gender,
                    value: g.ID,
                  }))}
                />
              </label>

              {/* Role */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 flex items-center gap-2">
                  <FaUserTag className="text-blue-500" /> Role
                </span>
                <Select
                  className="ev-select w-full"
                  popupClassName="ev-select-dropdown"
                  placeholder="Select role"
                  size="large"
                  allowClear
                  value={form?.UserRoleID || undefined}
                  onChange={(val) =>
                    setForm((p: any) => ({ ...p, UserRoleID: val }))
                  }
                  options={userRoles.map((r) => ({
                    label: r.RoleName,
                    value: r.ID,
                  }))}
                />
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-white border-t border-blue-100 flex gap-2 justify-end">
            <button
              onClick={onClose}
              className="px-4 h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 transition active:scale-[0.99]"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`px-4 h-10 rounded-xl text-white text-sm font-semibold shadow-sm transition active:scale-[0.99] ${
                canSubmit
                  ? "bg-blue-600 hover:bg-blue-700"
                  : "bg-blue-300 cursor-not-allowed"
              }`}
            >
              Save
            </button>
          </div>

          {/* Safe Area (iOS) */}
          <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
        </div>
      </div>

      {/* Scoped CSS for Antd Select */}
      <style>{`
        .ev-scope .ev-select .ant-select-selector {
          border-radius: 0.75rem !important;
          border-color: #e2e8f0 !important;
          height: 44px !important;
          padding: 0 12px !important;
          display: flex;
          align-items: center;
          background-color: #ffffff !important;
        }
        .ev-scope .ev-select:hover .ant-select-selector {
          border-color: #cbd5e1 !important;
        }
        .ev-scope .ev-select.ant-select-focused .ant-select-selector {
          border-color: #2563eb !important;
          box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25) !important;
        }
        .ev-scope .ev-select-dropdown {
          border-radius: 0.75rem !important;
          overflow: hidden !important;
        }
      `}</style>
    </div>
  );
};

export default EditUserModal;
