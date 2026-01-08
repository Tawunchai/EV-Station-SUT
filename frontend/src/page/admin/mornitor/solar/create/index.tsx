// src/page/admin/mornitor/solar/create/index.tsx

import React, { useEffect, useMemo, useState } from "react";
import { Upload, message } from "antd";
import ImgCrop from "antd-img-crop";
import { CreateSolar } from "../../../../../services";
import type { SolarInterface } from "../../../../../interface/ISolar";
import { Plus, X, Sun } from "react-feather";

/* =========================================
   ✅ Utils
========================================= */
const normalizePoint = (v?: string) => (v ?? "").trim().toLowerCase();

const useIsMobile = (bp = 768) => {
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth < bp);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < bp);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);
  return isMobile;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (createdSolar: Partial<SolarInterface>) => void;

  existingSolarPoints?: string[]; // normalize แล้วจาก BeforeSolar
  onCreatedSuccess?: () => void;
};

type FormState = {
  Name: string;
  UrlWebsocket: string;
  SolarPoint: string;
  Location: string;
  Description: string;
};

const emptyForm: FormState = {
  Name: "",
  UrlWebsocket: "",
  SolarPoint: "",
  Location: "",
  Description: "",
};

const CreateSolarModal: React.FC<Props> = ({
  open,
  onClose,
  onSubmit,
  existingSolarPoints = [],
  onCreatedSuccess,
}) => {
  const isMobile = useIsMobile(768);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // picture upload
  const [fileList, setFileList] = useState<any[]>([]);

  // animation state
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  const existingSet = useMemo(() => new Set(existingSolarPoints), [existingSolarPoints]);

  useEffect(() => {
    if (!open) return;

    // lock scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // reset state
    setClosing(false);
    setVisible(false);
    setSubmitting(false);
    setForm(emptyForm);
    setFileList([]);

    const t = window.requestAnimationFrame(() => setVisible(true));

    return () => {
      document.body.style.overflow = prev;
      window.cancelAnimationFrame(t);
    };
  }, [open]);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    setVisible(false);
    window.setTimeout(() => {
      setClosing(false);
      onClose();
    }, 260);
  };

  if (!open) return null;

  const validate = () => {
    const name = form.Name.trim();
    const url = form.UrlWebsocket.trim();
    const point = form.SolarPoint.trim();

    if (!name) return "กรุณากรอก Name";
    if (!url) return "กรุณากรอก UrlWebsocket";
    if (!point) return "กรุณากรอก SolarPoint";

    const norm = normalizePoint(point);
    if (norm && existingSet.has(norm)) return `SolarPoint "${point}" มีอยู่แล้ว`;
    return "";
  };

  const handleCreate = async () => {
    const err = validate();
    if (err) return message.warning(err);

    setSubmitting(true);
    try {
      // ✅ ส่งแบบ FormData (รองรับรูป)
      const fd = new FormData();
      fd.append("name", form.Name.trim());
      fd.append("url_websocket", form.UrlWebsocket.trim());
      fd.append("solar_point", form.SolarPoint.trim());
      fd.append("location", form.Location.trim());
      fd.append("description", form.Description.trim());

      const f = fileList?.[0]?.originFileObj;
      if (f) fd.append("picture", f);

      const created = await (CreateSolar as any)(fd);

      if (created) {
        message.success("Create Solar Successfully");
        onSubmit(created);
        onCreatedSuccess?.();
        requestClose();
      } else {
        message.error("Solar panel installation failed");
      }
    } catch (e) {
      message.error("Error Solar");
    } finally {
      setSubmitting(false);
    }
  };

  const Content = (
    <div className="px-4 sm:px-6 py-4 sm:py-6">
      <div className="rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-2xl bg-blue-600/10 border border-blue-100 grid place-items-center flex-shrink-0">
            <Sun size={20} className="text-blue-700" />
          </div>
          <div className="min-w-0">
            <p className="text-base font-extrabold text-slate-900">Create Solar</p>
            <p className="text-xs text-slate-500">กรอกข้อมูลแล้วกด Create</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-slate-600">Picture</label>

            <div className="mt-2">
              <ImgCrop rotationSlider aspectSlider showReset showGrid quality={1}>
                <Upload
                  listType="picture-card"
                  fileList={fileList}
                  onChange={({ fileList: fl }) => setFileList(fl)}
                  beforeUpload={() => false}
                  maxCount={1}
                >
                  {fileList.length >= 1 ? null : (
                    <div className="flex flex-col items-center justify-center">
                      <Plus size={16} />
                      <div className="mt-1 text-xs">Upload</div>
                    </div>
                  )}
                </Upload>
              </ImgCrop>

              <p className="text-[11px] text-slate-500 mt-1">รองรับรูป 1 รูป (Crop ได้)</p>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">Name *</label>
            <input
              value={form.Name}
              onChange={(e) => setForm((s) => ({ ...s, Name: e.target.value }))}
              className="w-full h-11 rounded-2xl border border-blue-200 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-blue-100"
              placeholder="เช่น Solar Station 1"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-600">SolarPoint *</label>
            <input
              value={form.SolarPoint}
              onChange={(e) => setForm((s) => ({ ...s, SolarPoint: e.target.value }))}
              className="w-full h-11 rounded-2xl border border-blue-200 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-blue-100"
              placeholder="เช่น solar_001"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-semibold text-slate-600">UrlWebsocket *</label>
            <input
              value={form.UrlWebsocket}
              onChange={(e) => setForm((s) => ({ ...s, UrlWebsocket: e.target.value }))}
              className="w-full h-11 rounded-2xl border border-blue-200 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-blue-100"
              placeholder="เช่น wss://api.evstation-sut.it.com/solar/solar_001"
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-semibold text-slate-600">Location</label>
            <input
              value={form.Location}
              onChange={(e) => setForm((s) => ({ ...s, Location: e.target.value }))}
              className="w-full h-11 rounded-2xl border border-blue-200 bg-white px-3 text-sm outline-none focus:ring-4 focus:ring-blue-100"
              placeholder="เช่น SUT อาคาร..."
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <label className="text-xs font-semibold text-slate-600">Description</label>
            <textarea
              value={form.Description}
              onChange={(e) => setForm((s) => ({ ...s, Description: e.target.value }))}
              rows={4}
              className="w-full rounded-2xl border border-blue-200 bg-white px-3 py-2 text-sm outline-none focus:ring-4 focus:ring-blue-100 resize-none"
              placeholder="อธิบายเพิ่มเติม (optional)"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-2">
          <button
            onClick={requestClose}
            className="w-full h-11 rounded-2xl border border-blue-200 bg-white text-blue-700 text-sm font-extrabold
                       hover:bg-blue-50 active:scale-[0.99] transition focus:outline-none focus:ring-4 focus:ring-blue-100"
            type="button"
          >
            Cancel
          </button>

          <button
            onClick={handleCreate}
            disabled={submitting}
            className={`w-full h-11 rounded-2xl text-sm font-extrabold transition focus:outline-none focus:ring-4 ${
              submitting
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.99] focus:ring-blue-200"
            }`}
            type="button"
          >
            {submitting ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );

  /* ============================
     ✅ Desktop Modal (Blue-White Theme)
  ============================ */
  const DesktopModal = (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 px-3 transition-opacity duration-300 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0" onClick={requestClose} />

      <div
        className={`relative w-[min(96vw,760px)] max-h-[92vh] bg-white shadow-xl border border-blue-100 rounded-3xl overflow-hidden
                    transition-transform duration-300 ${
                      visible ? "translate-y-0 scale-100" : "translate-y-3 scale-[0.98]"
                    }`}
      >
        {/* ✅ BLUE HEADER */}
        <div className="bg-blue-600 text-white">
          <div className="px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-white/15 border border-white/20 grid place-items-center flex-shrink-0">
                <Sun size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-extrabold truncate">Create Solar</p>
                <p className="text-xs text-white/80 truncate">เพิ่มสถานี Solar ใหม่เข้าสู่ระบบ</p>
              </div>
            </div>

            {/* ✅ White Close Button */}
            <button
              onClick={requestClose}
              className="h-10 px-4 rounded-2xl bg-white text-blue-700 text-sm font-extrabold
                         shadow-sm hover:bg-white/90 active:scale-[0.99] transition
                         focus:outline-none focus:ring-4 focus:ring-white/40"
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                <X size={16} />
                CLOSE
              </span>
            </button>
          </div>
        </div>

        {/* body */}
        <div className="max-h-[calc(92vh-72px)] overflow-y-auto">{Content}</div>
      </div>
    </div>
  );

  const MobileSheet = (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={requestClose}
      />
      <div
        className={`absolute inset-x-0 bottom-0 bg-white shadow-2xl border-t border-slate-200 rounded-t-3xl
                    transition-transform duration-300 ${visible ? "translate-y-0" : "translate-y-full"}`}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          maxHeight: "90dvh",
        }}
      >
        <div className="pt-2 pb-1">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
        </div>

        <div className="px-4 pb-3 flex items-center justify-between">
          <button className="text-blue-600 font-extrabold" onClick={requestClose} type="button">
            close
          </button>
          <div className="text-slate-900 font-extrabold">Create Solar</div>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: "80dvh" }}>
          {Content}
        </div>
      </div>
    </div>
  );

  return isMobile ? MobileSheet : DesktopModal;
};

export default CreateSolarModal;
