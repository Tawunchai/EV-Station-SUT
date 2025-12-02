// src/pages/admin/ev/CreateEVModal.tsx

import React, { useEffect, useMemo, useState } from "react";
import { Upload, message, Select } from "antd";
import ImgCrop from "antd-img-crop";
import {
  FaTimes,
  FaBolt,
  FaImage,
  FaTag,
  FaMoneyBillWave,
  FaListAlt,
  FaInfoCircle,
  FaChargingStation,
} from "react-icons/fa";

import { StatusInterface } from "../../../../../interface/IStatus";
import { TypeInterface } from "../../../../../interface/IType";
import {
  CreateEV,
  ListCabinetsEV,
  ListEnergySource,
} from "../../../../../services/index";
import {
  getCurrentUser,
  initUserProfile,
} from "../../../../../services/httpLogin";
import { EnergySourceInterface } from "../../../../../interface/IEnergySource";

interface CreateEVModalProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  statusList: StatusInterface[];
  typeList: TypeInterface[];
}

interface CabinetInterface {
  ID: number;
  Name: string;
  Location: string;
}

const CreateEVModal: React.FC<CreateEVModalProps> = ({
  open,
  onClose,
  onSaved,
  statusList,
  typeList,
}) => {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [price, setPrice] = useState<string>("");

  const [statusID, setStatusID] = useState<number | undefined>(undefined);
  const [typeID, setTypeID] = useState<number | undefined>(undefined);

  // ⭐ Energy Source (Solar / Grid / Mixed ...)
  const [energySourceID, setEnergySourceID] = useState<number | undefined>(
    undefined
  );
  const [energySourceList, setEnergySourceList] =
    useState<EnergySourceInterface[]>([]);

  // ⭐ Multiple cabinets selection
  const [selectedCabinets, setSelectedCabinets] = useState<number[]>([]);

  const [fileList, setFileList] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const [cabinets, setCabinets] = useState<CabinetInterface[]>([]);
  const [employeeID, setEmployeeID] = useState<number | null>(null);

  const isMobile = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 768px)").matches
        : false,
    []
  );

  // Load employee_id once
  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        await initUserProfile();
        const currentUser = getCurrentUser();
        if (currentUser?.employee_id) {
          setEmployeeID(currentUser.employee_id);
        } else {
          message.warning(
            "Employee ID not found. Please log in again."
          );
        }
      } catch {
        message.error("Failed to load user profile.");
      }
    };
    fetchEmployee();
  }, []);

  // Load cabinets + energy sources when modal opens
  useEffect(() => {
    const fetchCabinets = async () => {
      try {
        const res = await ListCabinetsEV();
        if (Array.isArray(res)) {
          setCabinets(res);
        } else {
          setCabinets([]);
        }
      } catch {
        message.error("Unable to load cabinet data.");
      }
    };

    const fetchEnergySources = async () => {
      try {
        const res = await ListEnergySource();
        if (Array.isArray(res)) {
          setEnergySourceList(res);
        } else {
          setEnergySourceList([]);
        }
      } catch {
        message.error("Unable to load energy source data.");
      }
    };

    if (open) {
      fetchCabinets();
      fetchEnergySources();
    }
  }, [open]);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setPrice("");
      setStatusID(undefined);
      setTypeID(undefined);
      setEnergySourceID(undefined);
      setSelectedCabinets([]);
      setFileList([]);
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (
      !name ||
      !description ||
      !price ||
      !statusID ||
      !typeID ||
      !energySourceID ||
      selectedCabinets.length === 0 ||
      fileList.length === 0
    ) {
      message.error("Please fill in all required fields.");
      return;
    }

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("description", description);
      formData.append("price", price);
      formData.append("statusID", String(statusID));
      formData.append("typeID", String(typeID));

      // ⭐ Energy source → backend key: energySourceID
      formData.append("energySourceID", String(energySourceID));

      // ⭐ Multiple cabinets: "1,3,5"
      formData.append("cabinetIDs", selectedCabinets.join(","));

      if (employeeID) {
        formData.append("employeeID", String(employeeID));
      }

      formData.append("picture", fileList[0].originFileObj);

      const result = await CreateEV(formData);
      if (result) {
        message.success("EV charging package created successfully.");
        onSaved();
        onClose();
      } else {
        message.error("Failed to create EV charging package.");
      }
    } catch {
      message.error("An error occurred while creating data.");
    } finally {
      setSubmitting(false);
    }
  };

  // Image preview
  const onPreview = async (file: any) => {
    let src = file.url;
    if (!src && file.originFileObj) {
      src = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file.originFileObj);
        reader.onload = () => resolve(reader.result as string);
      });
    }
    const imgWindow = window.open(src as string);
    imgWindow?.document.write(
      `<img src="${src}" style="max-width: 100%;" />`
    );
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center ev-scope"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal container */}
      <div className="relative w-full max-w-[640px] mx-4 md:mx-auto mb-8 md:mb-0">
        <div
          className="bg-white rounded-2xl shadow-2xl ring-1 ring-blue-100 flex flex-col overflow-hidden"
          style={{ maxHeight: isMobile ? "78vh" : "85vh" }}
        >
          {/* HEADER */}
          <div
            className="px-5 pt-3 pb-4 bg-gradient-to-r from-blue-600 to-sky-500 text-white flex justify-between items-center"
            style={{
              paddingTop: "calc(env(safe-area-inset-top) + 8px)",
            }}
          >
            <div className="flex items-center gap-2">
              <div className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-white/20">
                <FaBolt className="opacity-90" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-semibold">
                  Create EV charging package
                </h2>
                <p className="text-[11px] text-blue-100">
                  Define pricing, status, energy source and linked cabinets.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={submitting}
              className="p-2 -m-2 rounded-lg hover:bg-white/10 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              aria-label="Close dialog"
              title="Close"
            >
              <FaTimes />
            </button>
          </div>

          {/* BODY */}
          <div
            className="px-5 py-5 bg-blue-50/40 space-y-4"
            style={{
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              maxHeight: "100%",
            }}
          >
            {/* Upload */}
            <div className="flex justify-center">
              <ImgCrop rotationSlider>
                <Upload
                  accept="image/*"
                  listType="picture-card"
                  fileList={fileList}
                  onChange={({ fileList: newList }) =>
                    setFileList(newList)
                  }
                  onPreview={onPreview}
                  beforeUpload={(file) => {
                    if (!file.type?.startsWith("image/")) {
                      message.error("Please upload image files only.");
                      return Upload.LIST_IGNORE;
                    }
                    return false; // upload on submit
                  }}
                  maxCount={1}
                >
                  {fileList.length < 1 && (
                    <div className="flex flex-col items-center text-blue-500 text-sm">
                      <FaImage className="mb-1" />
                      Upload
                    </div>
                  )}
                </Upload>
              </ImgCrop>
            </div>

            {/* FORM */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Name */}
              <label className="flex flex-col gap-1">
                <span className="text-xs flex items-center gap-2 text-slate-600">
                  <FaTag className="text-blue-500" /> EV package name
                </span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="e.g. DC Fast 60kW"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              {/* Price */}
              <label className="flex flex-col gap-1">
                <span className="text-xs flex items-center gap-2 text-slate-600">
                  <FaMoneyBillWave className="text-blue-500" /> Price
                  (THB/kWh)
                </span>
                <input
                  type="number"
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="e.g. 7.50"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
              </label>

              {/* Status */}
              <label className="flex flex-col gap-1">
                <span className="text-xs flex items-center gap-2 text-slate-600">
                  <FaListAlt className="text-blue-500" /> Status
                </span>
                <Select
                  className="ev-select w-full"
                  popupClassName="ev-select-dropdown"
                  placeholder="Select status"
                  value={statusID}
                  onChange={(v) => setStatusID(v)}
                  options={statusList.map((s) => ({
                    label: s.Status,
                    value: s.ID,
                  }))}
                  allowClear
                  size="large"
                />
              </label>

              {/* Type */}
              <label className="flex flex-col gap-1">
                <span className="text-xs flex items-center gap-2 text-slate-600">
                  <FaInfoCircle className="text-blue-500" /> Type
                </span>
                <Select
                  className="ev-select w-full"
                  popupClassName="ev-select-dropdown"
                  placeholder="Select charging type"
                  value={typeID}
                  onChange={(v) => setTypeID(v)}
                  options={typeList.map((t) => ({
                    label: t.Type,
                    value: t.ID,
                  }))}
                  allowClear
                  size="large"
                />
              </label>

              {/* Energy source */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs flex items-center gap-2 text-slate-600">
                  <FaBolt className="text-yellow-400" /> Energy source
                </span>
                <Select
                  className="ev-select w-full"
                  popupClassName="ev-select-dropdown"
                  placeholder="Select energy source e.g. Solar / Grid / Hybrid"
                  value={energySourceID}
                  onChange={(v) => setEnergySourceID(v)}
                  options={energySourceList.map((es) => ({
                    label: es.Name,
                    value: es.ID,
                  }))}
                  allowClear
                  size="large"
                />
                <span className="text-[11px] text-slate-400 mt-0.5">
                  Used for analytics and energy reporting (solar-only,
                  grid-only, or mixed).
                </span>
              </label>

              {/* Multiple cabinets */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs flex items-center gap-2 text-slate-600">
                  <FaChargingStation className="text-blue-500" /> Linked
                  cabinets (multi-select)
                </span>
                <Select
                  mode="multiple"
                  className="ev-select w-full"
                  popupClassName="ev-select-dropdown"
                  placeholder="Select one or more cabinets"
                  value={selectedCabinets}
                  onChange={(values) => setSelectedCabinets(values)}
                  options={cabinets.map((c) => ({
                    label: `${c.Name} ${
                      c.Location ? `(${c.Location})` : ""
                    }`,
                    value: c.ID,
                  }))}
                  allowClear
                  showSearch
                  size="large"
                />
                <span className="text-[11px] text-slate-400 mt-0.5">
                  Users will see this package available on the selected
                  cabinets.
                </span>
              </label>

              {/* Description */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs flex items-center gap-2 text-slate-600">
                  <FaInfoCircle className="text-blue-500" /> Description
                </span>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-sm resize-none"
                  placeholder="Short description for users, e.g. max power, connector type, notes."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>
            </div>
          </div>

          {/* FOOTER */}
          <div className="px-5 py-4 bg-white border-t border-blue-100 flex justify-end gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 active:scale-[0.99] disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-blue-200 transition"
            >
              {submitting ? "Saving..." : "Create"}
            </button>
          </div>

          {/* Safe area bottom for mobile */}
          <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
        </div>
      </div>

      {/* Scoped CSS for Antd Select in this EV modal */}
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

export default CreateEVModal;
