// src/pages/admin/ev/ModalCreateCabinet.tsx

import React, { useEffect, useState } from "react";
import { Select, Upload, message } from "antd";
import { CloseOutlined } from "@ant-design/icons";
import ImgCrop from "antd-img-crop";

import {
  CreateEVCabinet,
  ListHardwares,
  ListCabinetsEV,
} from "../../../../../services";
import {
  getCurrentUser,
  initUserProfile,
} from "../../../../../services/httpLogin";

type ModalCreateCabinetProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

type HardwareOption = {
  value: string;
  label: string;
};

const ModalCreateCabinet: React.FC<ModalCreateCabinetProps> = ({
  open,
  onClose,
  onSaved,
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
  const [selectedHardwareID, setSelectedHardwareID] = useState<string | undefined>(undefined);

  const resetForm = () => {
    setName("");
    setLocation("");
    setStatus("");
    setDescription("");
    setLatitude("");
    setLongitude("");
    setUrlWebsocket("");
    setChargePoint("");
    setFileList([]);
    setSubmitting(false);
    setSelectedHardwareID(undefined);
    setHardwareOptions([]);
  };

  const validate = () => {
    if (!name.trim()) return message.error("กรุณากรอกชื่อ Cabinet"), false;
    if (!location.trim()) return message.error("กรุณากรอก Location"), false;
    if (!status.trim()) return message.error("กรุณาเลือก Status"), false;

    if (!selectedHardwareID) {
      if (hardwareOptions.length === 0) {
        message.error("ไม่มี Hardware ว่างให้เลือก");
      } else {
        message.error("กรุณาเลือก Hardware");
      }
      return false;
    }

    if (latitude && isNaN(Number(latitude)))
      return message.error("Latitude ต้องเป็นตัวเลข"), false;
    if (longitude && isNaN(Number(longitude)))
      return message.error("Longitude ต้องเป็นตัวเลข"), false;
    return true;
  };

  const fetchEmployee = async () => {
    try {
      await initUserProfile();
      const currentUser = getCurrentUser();
      if (currentUser && currentUser.employee_id) {
        setEmployeeID(currentUser.employee_id);
      } else {
        message.warning("ไม่พบรหัสพนักงาน กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      }
    } catch {
      message.error("ไม่สามารถโหลดข้อมูลผู้ใช้ได้");
    }
  };

  // ⭐ โหลด Hardware ทั้งหมด + filter เอาเฉพาะตัวที่ "ยังไม่ถูกใช้ใน Cabinet ใดเลย"
  const fetchHardwareData = async () => {
    setHardwareLoading(true);
    try {
      const [hardwares, cabinets] = await Promise.all([
        ListHardwares(),
        ListCabinetsEV(),
      ]);

      const usedHardwareIDs = new Set<number>();

      if (Array.isArray(cabinets)) {
        cabinets.forEach((cab: any) => {
          if (cab.HardwareID !== null && cab.HardwareID !== undefined) {
            usedHardwareIDs.add(Number(cab.HardwareID));
          }
        });
      }

      const options: HardwareOption[] = Array.isArray(hardwares)
        ? hardwares
            .filter((hw: any) => {
              const idNum = Number(hw.ID);
              return !usedHardwareIDs.has(idNum); // ✅ เอาเฉพาะตัวที่ยังไม่ถูกใช้
            })
            .map((hw: any) => {
              const idNum = Number(hw.ID);
              const rawName =
                typeof hw.Name === "string" ? hw.Name.trim() : "";
              const nameLabel = rawName || `Hardware #${idNum}`; // ✅ ไม่มี ?? ซ้อนแล้ว

              return {
                value: String(idNum),
                label: nameLabel,
              };
            })
        : [];

      setHardwareOptions(options);
      setSelectedHardwareID(undefined);
    } catch (err) {
      console.error(err);
      message.error("ไม่สามารถโหลดข้อมูล Hardware ได้");
    } finally {
      setHardwareLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
    fetchEmployee();
    fetchHardwareData();
  }, [open]);

  const handleSubmit = async () => {
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

      // ⭐ ส่ง hardwareID ตาม controller
      if (selectedHardwareID) {
        formData.append("hardwareID", selectedHardwareID);
      }

      if (fileList.length > 0 && fileList[0].originFileObj) {
        formData.append("image", fileList[0].originFileObj);
      }

      const result = await CreateEVCabinet(formData);

      if (result) {
        message.success("สร้าง Cabinet สำเร็จ");
        onSaved();
        onClose();
      } else {
        message.error("ไม่สามารถสร้าง Cabinet ได้");
      }
    } catch {
      message.error("เกิดข้อผิดพลาดระหว่างการบันทึก");
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
    imgWindow?.document.write(`<img src="${src}" style="max-width: 100%;" />`);
  };

  if (!open) return null;

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches;

  const noAvailableHardware =
    !hardwareLoading && hardwareOptions.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
      />
      <div className="relative w-full max-w-[680px] mx-4 md:mx-auto mb-8 md:mb-0">
        <div
          className="bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-blue-100 flex flex-col"
          style={{ maxHeight: isMobile ? "78vh" : "82vh" }}
        >
          {/* Header */}
          <div
            className="px-5 pt-3 pb-4 bg-blue-600 text-white flex justify-between items-center"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
          >
            <h2 className="text-base md:text-lg font-semibold">
              เพิ่ม EV Cabinet
            </h2>
            <button
              onClick={onClose}
              disabled={submitting}
              title="ปิด"
              aria-label="ปิด"
              className="p-2 rounded-lg hover:bg-white/10 disabled:opacity-50 leading-none inline-flex items-center justify-center"
            >
              <CloseOutlined style={{ fontSize: 18 }} />
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
                      message.error("กรุณาอัปโหลดเฉพาะไฟล์รูปภาพ");
                      return Upload.LIST_IGNORE;
                    }
                    return false; // อัปโหลดตอน submit
                  }}
                  maxCount={1}
                >
                  {fileList.length < 1 && (
                    <div className="text-blue-500">Upload</div>
                  )}
                </Upload>
              </ImgCrop>
            </div>

            {/* Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* ชื่อ */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">ชื่อ Cabinet</span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="เช่น DC Cabinet #1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>

              {/* Location */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">Location</span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="เช่น Building A, Floor 1"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>

              {/* Status */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">Status</span>
                <Select
                  className="w-full"
                  placeholder="เลือกสถานะ"
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
                <span className="text-xs text-slate-600">Description</span>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </label>

              {/* WebSocket URL */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">WebSocket URL</span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="เช่น wss://example.com/ocpp/CP_1"
                  value={urlWebsocket}
                  onChange={(e) => setUrlWebsocket(e.target.value)}
                />
              </label>

              {/* Charge Point */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">Charge Point ID</span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="เช่น CP_1, ESP32-01"
                  value={chargePoint}
                  onChange={(e) => setChargePoint(e.target.value)}
                />
              </label>

              {/* Latitude */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">Latitude</span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="เช่น 13.7563"
                  inputMode="decimal"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                />
              </label>

              {/* Longitude */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">Longitude</span>
                <input
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  placeholder="เช่น 100.5018"
                  inputMode="decimal"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                />
              </label>

              {/* ⭐ Hardware Select / หรือข้อความถ้าไม่มี Hardware ว่าง */}
              <label className="flex flex-col gap-1 md:col-span-2">
                <span className="text-xs text-slate-600">
                  Hardware (เชื่อมกับ Cabinet)
                </span>

                {hardwareLoading ? (
                  <div className="w-full h-10 rounded-xl bg-slate-100 animate-pulse" />
                ) : noAvailableHardware ? (
                  <div className="w-full px-3 py-2.5 rounded-xl bg-slate-100 text-[13px] text-slate-500 border border-dashed border-slate-300">
                    ไม่มีข้อมูลอุปกรณ์ Hardware ที่พร้อม
                  </div>
                ) : (
                  <Select
                    className="w-full"
                    placeholder="เลือก Hardware ที่จะเชื่อมกับ Cabinet"
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
                    เลือก Hardware 1 ตัวสำหรับ Cabinet นี้
                  </span>
                )}
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 bg-white border-top border-blue-100 flex gap-2 justify-end">
            <button
              onClick={onClose}
              disabled={submitting}
              className="px-4 h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 active:scale-[0.99] disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || noAvailableHardware}
              className="px-4 h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 focus:outline-none focus:ring-4 focus:ring-blue-200 transition"
            >
              {submitting ? "กำลังบันทึก..." : "สร้าง"}
            </button>
          </div>

          <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
        </div>
      </div>
    </div>
  );
};

export default ModalCreateCabinet;