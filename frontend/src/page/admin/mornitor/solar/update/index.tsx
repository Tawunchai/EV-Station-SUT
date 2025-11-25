// src/page/admin/mornitor/solar/update/index.tsx
// ปรับ path import ให้ตรงโปรเจกต์จริงด้วยนะ

import React, { useEffect, useState } from "react";
import { Upload, message } from "antd";
import ImgCrop from "antd-img-crop";
import { UpdateSolarByID, apiUrlPicture } from "../../../../../services";
import type { SolarInterface } from "../../../../../interface/ISolar";
import {
  FaTimes,
  FaSolarPanel,
  FaGlobe,
  FaMapMarkerAlt,
  FaImage,
  FaAlignLeft,
} from "react-icons/fa";

type Props = {
  open: boolean;
  onClose: () => void;
  solar: SolarInterface | null;
  onSubmit: (updatedSolar: {
    ID?: number;
    Name: string;
    UrlWebsocket: string;
    SolarPoint: string;
    Description?: string;
    Picture?: string;
    Location?: string;
  }) => void;
};

const EditSolarModal: React.FC<Props> = ({ open, onClose, solar, onSubmit }) => {
  const [form, setForm] = useState({
    Name: "",
    UrlWebsocket: "",
    SolarPoint: "",
    Description: "",
    Location: "",
  });

  const [fileList, setFileList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // โหลดข้อมูลจาก solar ตอนเปิด modal
  useEffect(() => {
    if (open && solar) {
      setForm({
        Name: solar.Name || "",
        UrlWebsocket: solar.UrlWebsocket || "",
        SolarPoint: solar.SolarPoint || "",
        Description: solar.Description || "",
        Location: solar.Location || "",
      });

      // ถ้ามีรูปเดิม ให้แสดงใน Upload ด้วย
      if (solar.Picture) {
        setFileList([
          {
            uid: "-1",
            name: solar.Picture,
            status: "done",
            url: `${apiUrlPicture}${solar.Picture}`,
          },
        ]);
      } else {
        setFileList([]);
      }

      setLoading(false);
    }

    if (!open) {
      // ปิดแล้วรีเซ็ต state เผื่อเคสเปิดของใหม่
      setLoading(false);
    }
  }, [open, solar]);

  if (!open || !solar) return null;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validate = () => {
    if (!form.Name.trim()) {
      message.warning("กรุณากรอกชื่อ Solar");
      return false;
    }
    if (!form.UrlWebsocket.trim()) {
      message.warning("กรุณากรอก WebSocket URL");
      return false;
    }
    if (!form.SolarPoint.trim()) {
      message.warning("กรุณากรอก Solar Point");
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!solar || !solar.ID) {
      message.error("ไม่พบข้อมูล Solar ที่ต้องการแก้ไข");
      return;
    }
    if (!validate()) return;
    if (loading) return;

    try {
      setLoading(true);

      const formData = new FormData();
      // key ต้องตรงกับ backend (json:"name" เป็นต้น)
      formData.append("name", form.Name);
      formData.append("url_websocket", form.UrlWebsocket);
      formData.append("solar_point", form.SolarPoint);
      formData.append("description", form.Description);
      formData.append("location", form.Location);

      // ถ้าเลือกไฟล์ใหม่ (มี originFileObj) → ส่งขึ้น backend
      if (fileList.length > 0 && fileList[0].originFileObj) {
        formData.append("picture", fileList[0].originFileObj);
      }
      // ถ้าไม่มี originFileObj แปลว่าใช้รูปเดิม → ไม่ต้องส่ง field picture, backend จะเก็บรูปเดิมไว้

      const res = await UpdateSolarByID(solar.ID, formData);

      if (!res) {
        message.error("แก้ไข Solar ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }

      const d: any = res.data;

      const updatedSolar = {
        ID: d.ID ?? solar.ID,
        Name: d.name ?? d.Name ?? form.Name,
        UrlWebsocket: d.url_websocket ?? d.UrlWebsocket ?? form.UrlWebsocket,
        SolarPoint: d.solar_point ?? d.SolarPoint ?? form.SolarPoint,
        Description: d.description ?? d.Description ?? form.Description,
        Location: d.location ?? d.Location ?? form.Location,
        Picture: d.picture ?? d.Picture ?? solar.Picture ?? "",
      };

      message.success(res.message || "แก้ไข Solar สำเร็จ");

      // ส่งขึ้นไปให้ parent (BeforeSolar) → parent จะ refetch อีกที
      onSubmit(updatedSolar);
      onClose();
    } catch (error) {
      console.error("❌ UpdateSolarByID error:", error);
      message.error("เกิดข้อผิดพลาดในการแก้ไข Solar");
    } finally {
      setLoading(false);
    }
  };

  // Upload change
  const handleUploadChange = ({ fileList }: { fileList: any[] }) => {
    setFileList(fileList);
  };

  // Preview รูป (เหมือน EV / CreateSolar)
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center ev-scope"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={loading ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Card */}
      <div className="relative w-full max-w-[520px] mx-4 md:mx-auto mb-6 md:mb-0">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden ring-1 ring-blue-100 flex flex-col">
          {/* Header */}
          <div
            className="px-5 pt-3 pb-4 bg-blue-600 text-white flex justify-between items-center"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
          >
            <div className="flex items-center gap-2">
              <FaSolarPanel className="opacity-90" />
              <h2 className="text-base md:text-lg font-semibold">
                แก้ไข Solar
              </h2>
            </div>
            <button
              onClick={loading ? undefined : onClose}
              className="p-2 -m-2 rounded-lg hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              aria-label="ปิดหน้าต่าง"
              title="ปิด"
            >
              <FaTimes />
            </button>
          </div>

          {/* Body */}
          <div
            className="px-5 py-5 bg-blue-50/40"
            style={{
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              maxHeight: "72vh",
            }}
          >
            {/* Upload อยู่ด้านบนสุดแบบ EV Modal / CreateSolar */}
            <div className="flex justify-center mb-4">
              <ImgCrop rotationSlider>
                <Upload
                  accept="image/*"
                  listType="picture-card"
                  fileList={fileList}
                  onChange={handleUploadChange}
                  onPreview={onPreview}
                  beforeUpload={() => false}
                  maxCount={1}
                >
                  {fileList.length < 1 && (
                    <div className="flex flex-col items-center text-blue-500">
                      <FaImage size={24} />
                      <span className="mt-1 text-sm">Upload</span>
                    </div>
                  )}
                </Upload>
              </ImgCrop>
            </div>

            <div className="space-y-3">
              {/* Name */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">ชื่อ Solar</span>
                <div className="flex items-center bg-white rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/40">
                  <span className="pl-3 pr-2 text-amber-500">
                    <FaSolarPanel />
                  </span>
                  <input
                    name="Name"
                    value={form.Name}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 rounded-xl outline-none bg-transparent text-sm"
                    placeholder="เช่น Solar_001 หรือ Solar Roof A1"
                    disabled={loading}
                  />
                </div>
              </label>

              {/* WebSocket URL */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">WebSocket URL</span>
                <div className="flex items-center bg-white rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/40">
                  <span className="pl-3 pr-2 text-blue-500">
                    <FaGlobe />
                  </span>
                  <input
                    name="UrlWebsocket"
                    value={form.UrlWebsocket}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 rounded-xl outline-none bg-transparent text-sm"
                    placeholder="เช่น wss://payment-project-t4dj.onrender.com/solar/solar_001"
                    disabled={loading}
                  />
                </div>
              </label>

              {/* Solar Point */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600">
                  Solar Point
                </span>
                <div className="flex items-center bg-white rounded-xl border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/40">
                  <span className="pl-3 pr-2 text-rose-500">
                    <FaMapMarkerAlt />
                  </span>
                  <input
                    name="SolarPoint"
                    value={form.SolarPoint}
                    onChange={handleChange}
                    className="w-full px-3 py-2.5 rounded-xl outline-none bg-transparent text-sm"
                    placeholder="เช่น อาคารเรียน 2 ชั้นดาดฟ้า / solar_001"
                    disabled={loading}
                  />
                </div>
              </label>

              {/* Description */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 flex items-center gap-2">
                  <FaAlignLeft className="text-blue-500" />
                  รายละเอียด (Description)
                </span>
                <textarea
                  name="Description"
                  value={form.Description}
                  onChange={handleChange}
                  className="w-full min-h-[72px] px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm resize-y"
                  placeholder="เช่น Solar ดาดฟ้าอาคารเรียน 1 ผลิตไฟไปยังตู้ EV โซนหน้าอาคาร"
                  disabled={loading}
                />
              </label>

              {/* Location */}
              <label className="flex flex-col gap-1">
                <span className="text-xs text-slate-600 flex items-center gap-2">
                  <FaMapMarkerAlt className="text-emerald-500" />
                  Location (ตำแหน่ง)
                </span>
                <input
                  name="Location"
                  value={form.Location}
                  onChange={handleChange}
                  className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40 text-sm"
                  placeholder="เช่น ดาดฟ้าอาคารเรียน 1 / Parking Zone B"
                  disabled={loading}
                />
              </label>
            </div>
          </div>

          {/* Footer: ปุ่มเดียว บันทึก Solar */}
          <div className="px-5 py-4 bg-white border-t border-blue-100 flex justify-end">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="px-4 h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.99] disabled:bg-blue-300 disabled:cursor-not-allowed transition"
            >
              {loading ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
            </button>
          </div>

          {/* safe-area bottom สำหรับ mobile */}
          <div className="md:hidden h-[env(safe-area-inset-bottom)] bg-white" />
        </div>
      </div>

      {/* Scoped CSS สำหรับ AntD Select / Upload ถ้าใช้ร่วมใน modal นี้ในอนาคต */}
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

export default EditSolarModal;