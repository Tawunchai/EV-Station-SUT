// src/pages/admin/ev/ModalUpdateCabinet.tsx

import React, { useEffect, useMemo, useState } from "react";
import { Select, Upload, message } from "antd";
import ImgCrop from "antd-img-crop";
import { FaChargingStation, FaTimes } from "react-icons/fa";

import {
  UpdateEVCabinetByID,
  apiUrlPicture,
  ListHardwares,
  ListCabinetsEV,
} from "../../../../../services";
import {
  getCurrentUser,
  initUserProfile,
} from "../../../../../services/httpLogin";
import type { CabinetType } from "../../EV";

type ModalUpdateCabinetProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: CabinetType | null;
};

type HardwareOption = {
  value: string;
  label: string;
};

const ModalUpdateCabinet: React.FC<ModalUpdateCabinetProps> = ({
  open,
  onClose,
  onSaved,
  initial,
}) => {
  const [name, setName] = useState<string>("");
  const [location, setLocation] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [latitude, setLatitude] = useState<string>("");
  const [longitude, setLongitude] = useState<string>("");
  const [urlWebsocket, setUrlWebsocket] = useState<string>("");
  const [chargePoint, setChargePoint] = useState<string>("");
  const [fileList, setFileList] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [employeeID, setEmployeeID] = useState<number | null>(null);

  // ⭐ Hardware
  const [hardwareOptions, setHardwareOptions] = useState<HardwareOption[]>([]);
  const [hardwareLoading, setHardwareLoading] = useState(false);
  const [selectedHardwareID, setSelectedHardwareID] = useState<string | undefined>(
    undefined
  );

  const isMobile = useMemo(
    () =>
      typeof window !== "undefined"
        ? window.matchMedia("(max-width: 768px)").matches
        : false,
    []
  );

  const validate = () => {
    if (!name.trim())
      return message.error("Please enter cabinet name"), false;
    if (!location.trim())
      return message.error("Please enter location"), false;
    if (!status.trim())
      return message.error("Please select status"), false;

    if (latitude && isNaN(Number(latitude)))
      return message.error("Latitude must be a number"), false;
    if (longitude && isNaN(Number(longitude)))
      return message.error("Longitude must be a number"), false;

    // If there are hardware options but none selected → force selection
    if (hardwareOptions.length > 0 && !selectedHardwareID) {
      message.error("Please select hardware");
      return false;
    }

    return true;
  };

  const fetchEmployee = async () => {
    try {
      await initUserProfile();
      const currentUser = getCurrentUser();
      if (currentUser && currentUser.employee_id) {
        setEmployeeID(currentUser.employee_id);
      } else {
        message.warning(
          "Employee ID not found. Please log in again."
        );
      }
    } catch {
      message.error("Unable to load user data.");
    }
  };

  // ⭐ Load hardware and filter only those not used by other cabinets
  const fetchHardwareData = async (currentCabinetID?: number | null) => {
    setHardwareLoading(true);
    try {
      const [hardwares, cabinets] = await Promise.all([
        ListHardwares(),
        ListCabinetsEV(),
      ]);

      const usedHardwareIDs = new Set<number>();

      if (Array.isArray(cabinets)) {
        cabinets.forEach((cab: any) => {
          // Collect HardwareID used by other cabinets only
          if (
            cab.HardwareID !== null &&
            cab.HardwareID !== undefined &&
            (!currentCabinetID || cab.ID !== currentCabinetID)
          ) {
            usedHardwareIDs.add(Number(cab.HardwareID));
          }
        });
      }

      const options: HardwareOption[] = Array.isArray(hardwares)
        ? hardwares
            .filter((hw: any) => {
              const idNum = Number(hw.ID);
              // Exclude hardware used by other cabinets
              return !usedHardwareIDs.has(idNum);
            })
            .map((hw: any) => {
              const idNum = Number(hw.ID);
              const rawName =
                typeof hw.Name === "string" ? hw.Name.trim() : "";
              const nameLabel = rawName || `Hardware #${idNum}`;
              return {
                value: String(idNum),
                label: nameLabel,
              };
            })
        : [];

      setHardwareOptions(options);

      // Default selection = current cabinet's hardware (if exists in options)
      if (initial?.HardwareID) {
        const idStr = String(initial.HardwareID);
        const exists = options.some((opt) => opt.value === idStr);
        setSelectedHardwareID(exists ? idStr : undefined);
      } else {
        setSelectedHardwareID(undefined);
      }
    } catch (err) {
      console.error(err);
      message.error("Unable to load hardware data.");
    } finally {
      setHardwareLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    // Init form from initial data
    setName(initial?.Name ?? "");
    setLocation(initial?.Location ?? "");
    setStatus(initial?.Status ?? "");
    setDescription(initial?.Description ?? "");
    setLatitude(
      initial?.Latitude !== undefined && initial?.Latitude !== null
        ? String(initial.Latitude)
        : ""
    );
    setLongitude(
      initial?.Longitude !== undefined && initial?.Longitude !== null
        ? String(initial.Longitude)
        : ""
    );
    setUrlWebsocket(initial?.UrlWebsocket ?? "");
    setChargePoint(initial?.ChargePoint ?? "");
    setSubmitting(false);

    if (initial?.Image) {
      setFileList([
        {
          uid: "-1",
          name: "current_image.jpg",
          status: "done",
          url: `${apiUrlPicture}${initial.Image}`,
          originFileObj: null,
        },
      ]);
    } else {
      setFileList([]);
    }

    fetchEmployee();
    fetchHardwareData(initial?.ID ?? null);
  }, [open, initial]);

  const handleSubmit = async () => {
    if (!initial?.ID) return;
    if (!validate()) return;

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("name", name.trim());
      formData.append("description", description.trim());
      formData.append("location", location.trim());
      formData.append("status", status.trim());
      formData.append("latitude", latitude.trim());
      formData.append("longitude", longitude.trim());
      formData.append("urlWebsocket", urlWebsocket.trim());
      formData.append("chargePoint", chargePoint.trim());

      if (employeeID) {
        formData.append("employeeID", String(employeeID));
      }

      // ⭐ Send hardwareID if selected
      if (selectedHardwareID) {
        formData.append("hardwareID", selectedHardwareID);
      }

      if (fileList.length > 0 && fileList[0].originFileObj) {
        formData.append("image", fileList[0].originFileObj);
      }

      const result = await UpdateEVCabinetByID(initial.ID, formData);

      if (result) {
        message.success("Cabinet updated successfully.");
        onSaved();
        onClose();
      } else {
        message.error("Failed to update cabinet.");
      }
    } catch {
      message.error("An error occurred while saving.");
    } finally {
      setSubmitting(false);
    }
  };

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

  const noAvailableHardware =
    !hardwareLoading && hardwareOptions.length === 0;

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

      {/* Dialog */}
      <div className="relative w-full max-w-[680px] mx-4 md:mx-auto mb-8 md:mb-0">
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
                <FaChargingStation className="opacity-90" />
              </div>
              <div>
                <h2 className="text-base md:text-lg font-semibold">
                  Edit EV Cabinet
                </h2>
                <p className="text-[11px] text-blue-100">
                  Update cabinet details and hardware link.
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

          {/* Body */}
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
                  onChange={({ fileList: newList }) => setFileList(newList)}
                  onPreview={onPreview}
                  beforeUpload={(file) => {
                    if (!file.type?.startsWith("image/")) {
                      message.error("Please upload image files only.");
                      return Upload.LIST_IGNORE;
                    }
                    return false;
                  }}
                  maxCount={1}
                >
                  {fileList.length < 1 && (
                    <div className="text-blue-500 text-sm">Upload</div>
                  )}
                </Upload>
              </ImgCrop>
            </div>

            {/* Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Cabinet Name */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Cabinet name
                </span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="e.g. DC Cabinet #1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              {/* Location */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Location
                </span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="e.g. Building A, Floor 1"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>

              {/* Status */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Status</span>
                <Select
                  className="ev-select w-full"
                  popupClassName="ev-select-dropdown"
                  placeholder="Select status"
                  size="large"
                  value={status || undefined}
                  onChange={(v) => setStatus(String(v))}
                  options={[
                    { label: "Active", value: "Active" },
                    { label: "Inactive", value: "Inactive" },
                    { label: "Maintenance", value: "Maintenance" },
                  ]}
                />
              </label>

              {/* Description */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">
                  Description
                </span>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="Additional details (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              {/* WebSocket URL */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  WebSocket URL
                </span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="e.g. wss://example.com/ocpp/CP_1"
                  value={urlWebsocket}
                  onChange={(e) => setUrlWebsocket(e.target.value)}
                />
              </label>

              {/* Charge Point ID */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Charge Point ID
                </span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="e.g. CP_1, ESP32-01"
                  value={chargePoint}
                  onChange={(e) => setChargePoint(e.target.value)}
                />
              </label>

              {/* Latitude */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Latitude
                </span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="e.g. 13.7563"
                  inputMode="decimal"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </label>

              {/* Longitude */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Longitude
                </span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="e.g. 100.5018"
                  inputMode="decimal"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              </label>

              {/* Hardware Select */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">
                  Hardware (link to this cabinet)
                </span>

                {hardwareLoading ? (
                  <div className="w-full h-10 rounded-xl bg-slate-100 animate-pulse" />
                ) : noAvailableHardware ? (
                  <div className="w-full px-3 py-2.5 rounded-xl bg-slate-100 text-[13px] text-slate-500 border border-dashed border-slate-300">
                    No available hardware for linking.
                  </div>
                ) : (
                  <Select
                    className="ev-select w-full"
                    popupClassName="ev-select-dropdown"
                    placeholder="Select hardware to link with this cabinet"
                    size="large"
                    value={selectedHardwareID}
                    onChange={(v) => setSelectedHardwareID(String(v))}
                    options={hardwareOptions}
                    showSearch
                    optionFilterProp="label"
                  />
                )}

                {!hardwareLoading && !noAvailableHardware && (
                  <span className="text-[11px] text-slate-400 mt-0.5">
                    Select one hardware for this cabinet.
                  </span>
                )}
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-white border-t border-blue-100 flex gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 active:scale-[0.99] disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || (hardwareOptions.length > 0 && !selectedHardwareID)}
              className={`px-4 h-10 rounded-xl text-white text-sm font-semibold shadow-sm transition active:scale-[0.99] ${
                submitting || (hardwareOptions.length > 0 && !selectedHardwareID)
                  ? "bg-blue-300 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {submitting ? "Saving..." : "Save"}
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

export default ModalUpdateCabinet;
