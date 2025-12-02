// src/pages/admin/ev/EditEVModal.tsx

import React, { useEffect, useMemo, useState } from "react";
import { Upload, message, Select } from "antd";
import ImgCrop from "antd-img-crop";
import { StatusInterface } from "../../../../../interface/IStatus";
import { TypeInterface } from "../../../../../interface/IType";
import {
  UpdateEVByID,
  ListCabinetsEV,
  apiUrlPicture,
  ListEnergySource,
} from "../../../../../services";
import {
  getCurrentUser,
  initUserProfile,
} from "../../../../../services/httpLogin";
import {
  FaTimes,
  FaEdit,
  FaImage,
  FaTag,
  FaMoneyBillWave,
  FaListAlt,
  FaInfoCircle,
  FaChargingStation,
  FaBolt,
} from "react-icons/fa";
import { EnergySourceInterface } from "../../../../../interface/IEnergySource";

interface EditEVModalProps {
  open: boolean;
  onClose: () => void;
  evCharging: any;
  onSaved: () => void;
  statusList: StatusInterface[];
  typeList: TypeInterface[];
}

interface CabinetInterface {
  ID: number;
  Name: string;
  Location: string;
}

const EditEVModal: React.FC<EditEVModalProps> = ({
  open,
  onClose,
  evCharging,
  onSaved,
  statusList,
  typeList,
}) => {
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [price, setPrice] = useState<string>("");

  const [statusID, setStatusID] = useState<number | undefined>(undefined);
  const [typeID, setTypeID] = useState<number | undefined>(undefined);

  // ⭐ Energy source (Solar / Grid / Hybrid)
  const [energySourceID, setEnergySourceID] = useState<number | undefined>(
    undefined
  );
  const [energySourceList, setEnergySourceList] =
    useState<EnergySourceInterface[]>([]);

  // ⭐ Multi-cabinet selection
  const [selectedCabinets, setSelectedCabinets] = useState<number[]>([]);

  const [fileList, setFileList] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [employeeID, setEmployeeID] = useState<number | null>(null);
  const [cabinets, setCabinets] = useState<CabinetInterface[]>([]);

  const isMobile = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 768px)").matches
        : false,
    []
  );

  // Load employee
  useEffect(() => {
    const fetchEmployee = async () => {
      try {
        await initUserProfile();
        const currentUser = getCurrentUser();
        if (currentUser?.employee_id) {
          setEmployeeID(currentUser.employee_id);
        }
      } catch {
        message.error("Failed to load user profile.");
      }
    };
    fetchEmployee();
  }, []);

  // Load cabinets + energy sources when modal opens
  useEffect(() => {
    const fetchCab = async () => {
      try {
        const res = await ListCabinetsEV();
        if (Array.isArray(res)) setCabinets(res);
        else setCabinets([]);
      } catch {
        message.error("Unable to load cabinet data.");
      }
    };

    const fetchEnergySource = async () => {
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
      fetchCab();
      fetchEnergySource();
    }
  }, [open]);

  // Load EV data to edit
  useEffect(() => {
    if (!open || !evCharging) return;

    setName(evCharging.Name ?? "");
    setDescription(evCharging.Description ?? "");
    setPrice(
      evCharging.Price !== undefined && evCharging.Price !== null
        ? String(evCharging.Price)
        : ""
    );

    setStatusID(evCharging.StatusID ?? undefined);
    setTypeID(evCharging.TypeID ?? undefined);

    // ⭐ Set energy source from existing data
    if (evCharging.EnergySourceID) {
      setEnergySourceID(evCharging.EnergySourceID);
    } else if (evCharging.EnergySource?.ID) {
      setEnergySourceID(evCharging.EnergySource.ID);
    } else {
      setEnergySourceID(undefined);
    }

    // ⭐ Multi-cabinet → [1, 2, 3]
    if (Array.isArray(evCharging.Cabinets)) {
      setSelectedCabinets(evCharging.Cabinets.map((c: any) => c.ID));
    } else {
      setSelectedCabinets([]);
    }

    // Load picture
    if (evCharging.Picture) {
      setFileList([
        {
          uid: "-1",
          name: "current_image.jpg",
          status: "done",
          url: apiUrlPicture + evCharging.Picture,
          originFileObj: null,
        },
      ]);
    } else {
      setFileList([]);
    }
  }, [open, evCharging]);

  // Submit update
  const handleSubmit = async () => {
    if (!evCharging?.ID) {
      message.error("Invalid EV charging data.");
      return;
    }

    if (
      !name ||
      !description ||
      !price ||
      !statusID ||
      !typeID ||
      !energySourceID ||
      selectedCabinets.length === 0
    ) {
      message.error("Please fill in all required fields.");
      return;
    }

    const formData = new FormData();
    formData.append("name", name);
    formData.append("description", description);
    formData.append("price", price);
    formData.append("statusID", String(statusID));
    formData.append("typeID", String(typeID));

    // ⭐ Send energy source ID
    formData.append("energySourceID", String(energySourceID));

    // ⭐ Send multiple cabinets as "1,3,5"
    formData.append("cabinetIDs", selectedCabinets.join(","));

    if (employeeID) {
      formData.append("employeeID", String(employeeID));
    }

    // If user uploaded a new picture
    if (fileList.length > 0 && fileList[0].originFileObj) {
      formData.append("picture", fileList[0].originFileObj);
    }

    try {
      setSubmitting(true);
      const result = await UpdateEVByID(evCharging.ID, formData);

      if (result) {
        message.success("EV charging package updated successfully.");
        onSaved();
        onClose();
      } else {
        message.error("Failed to update EV charging package.");
      }
    } catch (err) {
      message.error("An error occurred while saving data.");
    } finally {
      setSubmitting(false);
    }
  };

  // Preview image
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
                <FaEdit className="opacity-90" />
              </div>
            <div>
                <h2 className="text-base md:text-lg font-semibold">
                  Edit EV charging package
                </h2>
                <p className="text-[11px] text-blue-100">
                  Update pricing, status, energy source and linked cabinets.
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
                  size="large"
                  allowClear
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
                  size="large"
                  allowClear
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

              {/* Multi cabinet */}
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
              {submitting ? "Saving..." : "Save changes"}
            </button>
          </div>

          {/* Safe area bottom for mobile */}
          <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
        </div>
      </div>

      {/* Scoped CSS for AntD Select inside this modal */}
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

export default EditEVModal;
