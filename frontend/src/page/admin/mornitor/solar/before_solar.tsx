// src/page/admin/mornitor/solar/BeforeSolar.tsx

import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { SlideLeft } from "./SlideLeft";
import { ListSolar, DeleteSolar, apiUrlPicture } from "../../../../services";
import {
  // ✅ Meter services
  ListMeter,
  DeleteMeterByID,
  UpdateMeterByID,
  CreateMeter,
} from "../../../../services/meter";
import type { SolarInterface } from "../../../../interface/ISolar";
import type { MeterInterface } from "../../../../interface/IMeter";
import {
  Edit2,
  Trash as TrashIcon,
  Trash2,
  Sun,
  Activity,
  Plus,
  X,
  RefreshCw,
  Check,
} from "react-feather";
import { message } from "antd";
import { useNavigate } from "react-router-dom";

// Solar Modals
import CreateSolarModal from "./create/index";
import EditSolarModal from "./update/index";

/* =========================================
   ✅ Hook: isMobile
========================================= */
const useIsMobile = (bp = 768) => {
  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth < bp);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < bp);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);

  return isMobile;
};

/* =========================================
   🔘 ปุ่มไอคอนแบบมินิมอล (ghost)
========================================= */
const IconGhostButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "blue" | "red";
    label: string;
    size?: "sm" | "md";
  }
> = ({ tone = "blue", label, size = "md", children, className, ...props }) => {
  const toneClass =
    tone === "blue"
      ? "border-blue-200 text-blue-700 hover:border-blue-300 hover:bg-blue-50/70 focus:ring-blue-200"
      : "border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50/70 focus:ring-red-200";

  const sz = size === "sm" ? "h-9 w-9 rounded-lg" : "h-10 w-10 rounded-xl";

  return (
    <button
      {...props}
      type="button"
      className={`${sz} grid place-items-center border bg-white/85 backdrop-blur
                  transition-all active:scale-[0.98] focus:outline-none focus:ring-4 ${toneClass} ${
        className ?? ""
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
};

/* =========================================
   ✅ Meter Modal / Bottom Sheet (Mobile)
   - Desktop: Center modal
   - Mobile: Bottom Sheet slide up from bottom
   - No sub-modal create/update/delete (แก้ไข inline ใน card)
========================================= */
type MeterFormState = {
  name: string;
  url_websocket: string;
  meter_point: string;
  description: string;
};

const emptyMeterForm: MeterFormState = {
  name: "",
  url_websocket: "",
  meter_point: "",
  description: "",
};

const MeterModal: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  const isMobile = useIsMobile(768);

  const [meterList, setMeterList] = useState<MeterInterface[]>([]);
  const [loading, setLoading] = useState(false);

  // Create form (always visible)
  const [createForm, setCreateForm] = useState<MeterFormState>(emptyMeterForm);

  // Inline edit
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<MeterFormState>(emptyMeterForm);

  // animation state for sheet/modal
  const [visible, setVisible] = useState(false); // controls translate/opacity
  const [closing, setClosing] = useState(false);

  const mapMeter = (item: any): MeterInterface => ({
    ID: item.ID,
    CreatedAt: item.CreatedAt,
    UpdatedAt: item.UpdatedAt,
    DeletedAt: item.DeletedAt,
    name: item.Name ?? item.name ?? "",
    url_websocket: item.UrlWebsocket ?? item.url_websocket ?? "",
    meter_point: item.MeterPoint ?? item.meter_point ?? "",
    description: item.Description ?? item.description ?? "",
  });

  const fetchMeters = useCallback(async () => {
    setLoading(true);
    try {
      const data = await ListMeter();
      if (Array.isArray(data)) setMeterList(data.map(mapMeter));
      else setMeterList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // open/close animation
  useEffect(() => {
    if (!open) return;

    // reset state
    setClosing(false);
    setVisible(false);

    // load
    fetchMeters();
    setCreateForm(emptyMeterForm);
    setEditingId(null);
    setEditForm(emptyMeterForm);

    // animate in next frame
    const t = window.requestAnimationFrame(() => setVisible(true));
    return () => window.cancelAnimationFrame(t);
  }, [open, fetchMeters]);

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

  const validateForm = (f: MeterFormState) => {
    const name = f.name.trim();
    const url = f.url_websocket.trim();
    const point = f.meter_point.trim();
    if (!name) return "กรุณากรอก Name";
    if (!url) return "กรุณากรอก UrlWebsocket";
    if (!point) return "กรุณากรอก MeterPoint";
    return "";
  };

  const Field = ({
    label,
    value,
    onChange,
    placeholder,
    compact,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    compact?: boolean;
  }) => (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full ${compact ? "h-10" : "h-11"} rounded-2xl border border-blue-200 bg-white px-3 text-sm
                   outline-none focus:ring-4 focus:ring-blue-100`}
      />
    </div>
  );

  const TextArea = ({
    label,
    value,
    onChange,
    placeholder,
    compact,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
    placeholder?: string;
    compact?: boolean;
  }) => (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-slate-600">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={compact ? 3 : 4}
        className="w-full rounded-2xl border border-blue-200 bg-white px-3 py-2 text-sm
                   outline-none focus:ring-4 focus:ring-blue-100 resize-none"
      />
    </div>
  );

  const handleCreate = async () => {
    const err = validateForm(createForm);
    if (err) return message.warning(err);

    const payload = {
      name: createForm.name.trim(),
      url_websocket: createForm.url_websocket.trim(),
      meter_point: createForm.meter_point.trim(),
      description: createForm.description.trim(),
    };

    const created = await CreateMeter(payload);
    if (created) {
      message.success("สร้าง Meter สำเร็จ");
      setCreateForm(emptyMeterForm);
      fetchMeters();
    } else {
      message.error("สร้าง Meter ไม่สำเร็จ");
    }
  };

  const startEdit = (m: MeterInterface) => {
    if (!m.ID) return;
    setEditingId(m.ID);
    setEditForm({
      name: m.name ?? "",
      url_websocket: m.url_websocket ?? "",
      meter_point: m.meter_point ?? "",
      description: m.description ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(emptyMeterForm);
  };

  const saveEdit = async () => {
    if (!editingId) return;

    const err = validateForm(editForm);
    if (err) return message.warning(err);

    const payload = {
      name: editForm.name.trim(),
      url_websocket: editForm.url_websocket.trim(),
      meter_point: editForm.meter_point.trim(),
      description: editForm.description.trim(),
    };

    const updated = await UpdateMeterByID(editingId, payload);
    if (updated) {
      message.success("แก้ไข Meter สำเร็จ");
      setEditingId(null);
      setEditForm(emptyMeterForm);
      fetchMeters();
    } else {
      message.error("แก้ไข Meter ไม่สำเร็จ");
    }
  };

  const handleDelete = async (m: MeterInterface) => {
    if (!m.ID) return;
    const okConfirm = window.confirm(`ยืนยันลบ Meter: "${m.name || "-"}" ?`);
    if (!okConfirm) return;

    const ok = await DeleteMeterByID(m.ID);
    if (ok) {
      message.success("ลบ Meter สำเร็จ");
      if (editingId === m.ID) cancelEdit();
      fetchMeters();
    } else {
      message.error("ลบ Meter ไม่สำเร็จ");
    }
  };

  /* --------------------------
     ✅ Shared content (body)
  --------------------------- */
  const Content = (
    <div className="px-4 sm:px-6 py-4 sm:py-6">
      {/* Summary + Create */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Summary */}
        <div className="lg:col-span-4 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
          <p className="text-xs text-slate-500">Total Meter</p>
          <p className="text-3xl font-extrabold text-blue-700 leading-tight">
            {meterList.length}
          </p>
          <p className="text-xs text-slate-500 mt-2 leading-5">
            จัดการ Meter สำหรับหน้า Solar/EV
          </p>

          {editingId && (
            <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50 px-3 py-2">
              <p className="text-xs text-blue-700">
                กำลังแก้ไข ID: <span className="font-extrabold">{editingId}</span>
              </p>
            </div>
          )}
        </div>

        {/* Create form */}
        <div className="lg:col-span-8 rounded-3xl border border-blue-100 bg-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-base font-extrabold text-slate-900">Create Meter</p>
              <p className="text-xs text-slate-500">กรอกแล้วกด Create ได้เลย</p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                onClick={() => setCreateForm(emptyMeterForm)}
                className="h-11 sm:h-10 w-full sm:w-auto px-4 rounded-2xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold
                           hover:bg-blue-50 active:scale-[0.99] transition focus:outline-none focus:ring-4 focus:ring-blue-100"
                type="button"
              >
                Reset
              </button>

              <button
                onClick={handleCreate}
                className="inline-flex items-center justify-center gap-2 h-11 sm:h-10 w-full sm:w-auto px-4 rounded-2xl bg-blue-600 text-white text-sm font-extrabold
                           hover:bg-blue-700 active:scale-[0.99] transition focus:outline-none focus:ring-4 focus:ring-blue-200"
                type="button"
              >
                <Plus size={16} className="text-white" />
                Create
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field
              label="Name *"
              value={createForm.name}
              onChange={(v) => setCreateForm((s) => ({ ...s, name: v }))}
              placeholder="เช่น Meter Solar"
            />
            <Field
              label="MeterPoint *"
              value={createForm.meter_point}
              onChange={(v) => setCreateForm((s) => ({ ...s, meter_point: v }))}
              placeholder="เช่น meter_001"
            />

            <div className="sm:col-span-2">
              <Field
                label="UrlWebsocket *"
                value={createForm.url_websocket}
                onChange={(v) => setCreateForm((s) => ({ ...s, url_websocket: v }))}
                placeholder="เช่น wss://api.evstation-sut.it.com/meter/"
              />
            </div>

            <div className="sm:col-span-2">
              <TextArea
                label="Description"
                value={createForm.description}
                onChange={(v) => setCreateForm((s) => ({ ...s, description: v }))}
                placeholder="อธิบายเพิ่มเติม (optional)"
              />
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="mt-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <p className="text-base font-extrabold text-slate-900">Meter List</p>
          <p className="text-xs text-slate-500">กดดินสอเพื่อแก้ไขใน card ได้เลย</p>
        </div>

        {/* ✅ bigger card + responsive */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5 pb-2">
          {meterList.map((m) => {
            const isEditing = editingId === m.ID;

            return (
              <div
                key={m.ID}
                className={`rounded-3xl border bg-white shadow-sm transition relative overflow-hidden
                  ${
                    isEditing
                      ? "border-blue-300 ring-4 ring-blue-100"
                      : "border-blue-100 hover:shadow-md"
                  }`}
              >
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600/80 via-blue-400/70 to-blue-200/60" />

                <div className="p-5 sm:p-6">
                  {/* Desktop corner actions */}
                  <div className="hidden sm:block absolute top-4 right-4">
                    <div className="flex gap-2">
                      {!isEditing ? (
                        <>
                          <IconGhostButton
                            tone="blue"
                            label="แก้ไข Meter"
                            size="md"
                            onClick={() => startEdit(m)}
                          >
                            <Edit2 size={18} strokeWidth={2} />
                          </IconGhostButton>

                          <IconGhostButton
                            tone="red"
                            label="ลบ Meter"
                            size="md"
                            onClick={() => handleDelete(m)}
                          >
                            <TrashIcon size={18} strokeWidth={2} />
                          </IconGhostButton>
                        </>
                      ) : (
                        <>
                          <IconGhostButton tone="blue" label="บันทึก" size="md" onClick={saveEdit}>
                            <Check size={18} />
                          </IconGhostButton>

                          <IconGhostButton tone="red" label="ยกเลิก" size="md" onClick={cancelEdit}>
                            <X size={18} />
                          </IconGhostButton>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-3xl bg-blue-600/10 border border-blue-100 grid place-items-center flex-shrink-0">
                      <Activity size={22} className="text-blue-700" />
                    </div>

                    <div className="min-w-0 flex-1">
                      {!isEditing ? (
                        <>
                          <p className="text-[18px] sm:text-[19px] font-extrabold text-slate-900 leading-snug break-words">
                            {m.name || "-"}
                          </p>

                          {/* Mobile action row */}
                          <div className="flex sm:hidden gap-2 mt-3">
                            <button
                              onClick={() => startEdit(m)}
                              className="w-full h-11 rounded-2xl border border-blue-200 bg-white text-blue-700 text-sm font-extrabold
                                         hover:bg-blue-50 active:scale-[0.99] transition focus:outline-none focus:ring-4 focus:ring-blue-100"
                              type="button"
                            >
                              แก้ไข
                            </button>
                            <button
                              onClick={() => handleDelete(m)}
                              className="w-full h-11 rounded-2xl border border-red-200 bg-white text-red-600 text-sm font-extrabold
                                         hover:bg-red-50 active:scale-[0.99] transition focus:outline-none focus:ring-4 focus:ring-red-100"
                              type="button"
                            >
                              ลบ
                            </button>
                          </div>

                          {m.meter_point && (
                            <p className="text-[13px] text-blue-700 mt-3 break-words">
                              <span className="font-semibold text-slate-700">Point:</span>{" "}
                              <span className="font-extrabold">{m.meter_point}</span>
                            </p>
                          )}

                          {m.url_websocket && (
                            <p className="text-[13px] text-slate-600 break-all mt-2">
                              <span className="font-semibold text-slate-700">WebSocket:</span>{" "}
                              {m.url_websocket}
                            </p>
                          )}

                          {m.description && (
                            <div className="mt-3 rounded-2xl border border-blue-100 bg-blue-50/50 px-3 py-2">
                              <p className="text-[12.5px] text-slate-600 leading-6 break-words">
                                {m.description}
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="space-y-3">
                            <Field
                              label="Name *"
                              value={editForm.name}
                              onChange={(v) => setEditForm((s) => ({ ...s, name: v }))}
                              compact
                            />
                            <Field
                              label="MeterPoint *"
                              value={editForm.meter_point}
                              onChange={(v) => setEditForm((s) => ({ ...s, meter_point: v }))}
                              compact
                            />
                            <Field
                              label="UrlWebsocket *"
                              value={editForm.url_websocket}
                              onChange={(v) => setEditForm((s) => ({ ...s, url_websocket: v }))}
                              compact
                            />
                            <TextArea
                              label="Description"
                              value={editForm.description}
                              onChange={(v) => setEditForm((s) => ({ ...s, description: v }))}
                              compact
                            />

                            {/* Mobile save/cancel */}
                            <div className="flex gap-2 pt-1 sm:hidden">
                              <button
                                onClick={saveEdit}
                                className="w-full h-11 rounded-2xl bg-blue-600 text-white text-sm font-extrabold
                                           hover:bg-blue-700 active:scale-[0.99] transition focus:outline-none focus:ring-4 focus:ring-blue-200"
                                type="button"
                              >
                                Save
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="w-full h-11 rounded-2xl border border-blue-200 bg-white text-blue-700 text-sm font-extrabold
                                           hover:bg-blue-50 active:scale-[0.99] transition focus:outline-none focus:ring-4 focus:ring-blue-100"
                                type="button"
                              >
                                Cancel
                              </button>
                            </div>

                            <div className="hidden sm:block text-xs text-slate-500 pt-1">
                              กดปุ่ม ✓ / ✕ มุมขวาบนเพื่อบันทึก/ยกเลิก
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {meterList.length === 0 && !loading && (
          <div className="text-center text-slate-500 py-12">ยังไม่มีรายการ Meter</div>
        )}
      </div>
    </div>
  );

  /* --------------------------
     ✅ Desktop modal wrapper
  --------------------------- */
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
        className={`relative w-[min(96vw,1120px)] max-h-[92vh] bg-white shadow-xl border border-blue-100 rounded-3xl overflow-hidden
                    transition-transform duration-300 ${
                      visible ? "translate-y-0 scale-100" : "translate-y-3 scale-[0.98]"
                    }`}
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-blue-100 bg-[linear-gradient(180deg,#eff6ff_0%,#ffffff_100%)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-10 w-10 rounded-2xl bg-blue-600 grid place-items-center flex-shrink-0">
                <Activity size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-slate-900 truncate">Meter Manager</p>
                <p className="text-xs text-slate-500 truncate">สร้าง / แก้ไข / ลบ Meter</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchMeters}
                disabled={loading}
                className={`h-10 px-4 rounded-2xl text-sm font-semibold border transition
                  ${
                    loading
                      ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                      : "bg-white text-blue-700 border-blue-200 hover:bg-blue-50"
                  }`}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <RefreshCw size={16} />
                  {loading ? "Loading..." : "Refresh"}
                </span>
              </button>

              <button
                onClick={requestClose}
                className="h-10 px-4 rounded-2xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold
                           hover:bg-blue-50 active:scale-[0.99] transition focus:outline-none focus:ring-4 focus:ring-blue-100"
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <X size={16} />
                  CLOSE
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Body scroll */}
        <div className="max-h-[calc(92vh-72px)] overflow-y-auto">{Content}</div>
      </div>
    </div>
  );

  /* --------------------------
     ✅ Mobile Bottom Sheet wrapper
     - slide up from bottom like your example
  --------------------------- */
  const MobileSheet = (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true">
      {/* overlay */}
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
        onClick={requestClose}
      />

      {/* sheet */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-white shadow-2xl border-t border-slate-200 rounded-t-3xl
                    transition-transform duration-300 ${
                      visible ? "translate-y-0" : "translate-y-full"
                    }`}
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          maxHeight: "90dvh",
        }}
      >
        {/* handle */}
        <div className="pt-2 pb-1">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
        </div>

        {/* header */}
        <div className="px-4 pb-3 flex items-center justify-between">
          <button
            className="text-blue-600 font-extrabold"
            onClick={requestClose}
            type="button"
          >
            close
          </button>

          <div className="flex items-center gap-2">
            <div className="text-slate-900 font-extrabold">Meter Manager</div>
          </div>
        </div>

        {/* content scroll */}
        <div className="overflow-y-auto" style={{ maxHeight: "80dvh" }}>
          {Content}
        </div>
      </div>
    </div>
  );

  return isMobile ? MobileSheet : DesktopModal;
};

/* =========================================
   ✅ BeforeSolar (Solar Management)
========================================= */
const BeforeSolar: React.FC = () => {
  const [solarList, setSolarList] = useState<SolarInterface[]>([]);
  const [openConfirmModal, setOpenConfirmModal] = useState(false);

  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);

  // ✅ Meter modal open
  const [openMeterModal, setOpenMeterModal] = useState(false);

  const selectedSolarRef = useRef<SolarInterface | null>(null);
  const navigate = useNavigate();

  // SVG fallback ถ้าไม่มีรูป
  const fallbackImg =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'>
        <defs>
          <linearGradient id='g' x1='0%' y1='0%' x2='100%' y2='100%'>
            <stop offset='0%' stop-color='#fef3c7'/>
            <stop offset='50%' stop-color='#e0f2fe'/>
            <stop offset='100%' stop-color='#dbeafe'/>
          </linearGradient>
        </defs>
        <rect width='100%' height='100%' fill='url(#g)'/>
        <circle cx='52' cy='54' r='18' fill='#fbbf24'/>
        <rect x='72' y='72' width='60' height='40' rx='6' fill='#0ea5e9' opacity='0.85'/>
        <line x1='78' y1='82' x2='126' y2='82' stroke='#e0f2fe' stroke-width='3'/>
        <line x1='78' y1='92' x2='126' y2='92' stroke='#e0f2fe' stroke-width='3'/>
        <line x1='78' y1='102' x2='126' y2='102' stroke='#e0f2fe' stroke-width='3'/>
        <text x='50%' y='26%' dominant-baseline='middle' text-anchor='middle'
          font-size='16' fill='#1d4ed8' font-family='Arial'>SOLAR</text>
      </svg>`
    );

  const fetchSolar = async () => {
    const data = await ListSolar();
    if (Array.isArray(data)) {
      const mapped: SolarInterface[] = data.map((item: any) => ({
        ID: item.ID,
        Name: item.Name ?? item.name ?? "",
        UrlWebsocket: item.UrlWebsocket ?? item.url_websocket ?? "",
        SolarPoint: item.SolarPoint ?? item.solar_point ?? "",
        Description: item.Description ?? item.description ?? "",
        Location: item.Location ?? item.location ?? "",
        Picture: item.Picture ?? item.picture ?? "",
        CreatedAt: item.CreatedAt,
        UpdatedAt: item.UpdatedAt,
        DeletedAt: item.DeletedAt,
      }));
      setSolarList(mapped);
    } else {
      setSolarList([]);
    }
  };

  useEffect(() => {
    fetchSolar();
  }, []);

  const openDeleteModal = (solar: SolarInterface) => {
    selectedSolarRef.current = solar;
    setOpenConfirmModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedSolarRef.current) return;
    const ok = await DeleteSolar(selectedSolarRef.current.ID!);
    if (ok) {
      message.success("ลบ Solar สำเร็จ");
      fetchSolar();
    } else {
      message.warning("เกิดข้อผิดพลาดในการลบ Solar");
    }
    setOpenConfirmModal(false);
    selectedSolarRef.current = null;
  };

  const cancelDelete = () => {
    setOpenConfirmModal(false);
    selectedSolarRef.current = null;
  };

  const openCreate = () => {
    selectedSolarRef.current = null;
    setOpenCreateModal(true);
  };

  const openEdit = (solar: SolarInterface) => {
    selectedSolarRef.current = solar;
    setOpenEditModal(true);
  };

  const handleCreateSolar = (_createdSolar: any) => {
    setOpenCreateModal(false);
    fetchSolar();
  };

  const handleEditSolar = (_updatedSolar: any) => {
    setOpenEditModal(false);
    selectedSolarRef.current = null;
    fetchSolar();
  };

  const closeCreateModal = () => setOpenCreateModal(false);
  const closeEditModal = () => {
    setOpenEditModal(false);
    selectedSolarRef.current = null;
  };

  const handleCardClick = (solar: SolarInterface) => {
    navigate("/admin/after-solar", { state: { solar } });
  };

  return (
    <div
      className="min-h-screen w-full bg-[linear-gradient(180deg,#eaf2ff_0%,#f6f9ff_60%,#ffffff_100%)] mt-14 sm:mt-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h1 className="text-sm sm:text-base font-semibold tracking-wide">Solar Management</h1>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <button
              onClick={() => setOpenMeterModal(true)}
              className="inline-flex items-center justify-center h-10 sm:h-9 px-4 rounded-lg bg-white/15 text-white text-sm font-extrabold
                         border border-white/25 hover:bg-white/20 active:scale-[0.99] transition"
              title="จัดการ Meter (สร้าง/แก้ไข/ลบ)"
              type="button"
            >
              <span className="inline-flex items-center gap-2">
                <Activity size={16} className="text-white" />
                <span>SHOW METER</span>
              </span>
            </button>

            <button
              onClick={openCreate}
              className="inline-flex items-center justify-center h-10 sm:h-9 px-4 rounded-lg bg-white text-blue-700 text-sm font-extrabold
                         shadow-sm hover:bg-white/90 active:scale-[0.99] transition"
              type="button"
            >
              CREATE
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* Summary */}
        <div className="rounded-2xl bg-white border border-blue-100 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total Solar</p>
              <p className="text-2xl font-extrabold text-blue-700">{solarList.length}</p>
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-xs text-white bg-blue-600/90 px-2 py-1 rounded-lg border border-white/20">
                Solar Monitoring
              </p>
            </div>
          </div>
        </div>

        {/* Grid list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-5">
          {solarList.map((item, index) => {
            const delay = 0.12 + index * 0.06;

            const imgSrc =
              item.Picture && item.Picture !== ""
                ? `${apiUrlPicture}${item.Picture}`
                : fallbackImg;

            return (
              <motion.div
                key={item.ID}
                variants={SlideLeft(delay)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                onClick={() => handleCardClick(item)}
                className="group rounded-2xl bg-white border border-blue-100 p-4 shadow-sm hover:shadow-md transition-shadow relative cursor-pointer"
              >
                {/* Actions */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <IconGhostButton
                    tone="blue"
                    label="แก้ไข Solar"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEdit(item);
                    }}
                  >
                    <Edit2 size={16} strokeWidth={2} />
                  </IconGhostButton>

                  <IconGhostButton
                    tone="red"
                    label="ลบ Solar"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openDeleteModal(item);
                    }}
                  >
                    <TrashIcon size={16} strokeWidth={2} />
                  </IconGhostButton>
                </div>

                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 rounded-xl overflow-hidden ring-1 ring-blue-100 bg-blue-50 flex-shrink-0">
                    {item.Picture && item.Picture !== "" ? (
                      <img
                        src={imgSrc}
                        alt={item.Name || "solar"}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src = fallbackImg;
                        }}
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-yellow-50 via-amber-50 to-blue-50">
                        <Sun size={24} className="text-amber-500" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[15px] font-semibold text-gray-900 line-clamp-2">{item.Name}</p>

                    {item.UrlWebsocket && (
                      <p className="text-[12px] text-gray-500 break-all line-clamp-2">
                        <span className="font-medium text-gray-700">WebSocket:</span>{" "}
                        {item.UrlWebsocket}
                      </p>
                    )}

                    {item.SolarPoint && (
                      <p className="text-[12px] text-blue-700 line-clamp-1">
                        <span className="font-medium text-gray-700">Point:</span>{" "}
                        {item.SolarPoint}
                      </p>
                    )}

                    {item.Location && (
                      <p className="text-[12px] text-emerald-700 line-clamp-1">
                        <span className="font-medium text-gray-700">Location:</span>{" "}
                        {item.Location}
                      </p>
                    )}

                    {item.Description && (
                      <p className="text-[12px] text-gray-500 line-clamp-2 mt-1">
                        {item.Description}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {solarList.length === 0 && (
          <div className="text-center text-gray-500 py-16">ยังไม่มีรายการ Solar</div>
        )}
      </div>

      {/* Confirm delete modal — Solar */}
      {openConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
          <div className="w-full max-w-[320px] rounded-2xl bg-white text-center px-3 py-4 shadow-lg">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50">
              <Trash2 size={22} className="text-blue-600" />
            </div>

            <h3 className="text-base font-bold text-slate-900">ยืนยันการลบ Solar</h3>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              คุณต้องการลบ
              {selectedSolarRef.current?.Name && (
                <>
                  <br />
                  <span className="font-semibold text-blue-700">
                    “{selectedSolarRef.current.Name}”
                  </span>
                </>
              )}
              <br />
              <span className="text-xs text-slate-500">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
            </p>

            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmDelete}
                className="w-full h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-200 transition"
                type="button"
              >
                ลบ
              </button>

              <button
                onClick={cancelDelete}
                className="w-full h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
                type="button"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Solar Modals */}
      <CreateSolarModal open={openCreateModal} onClose={closeCreateModal} onSubmit={handleCreateSolar} />
      <EditSolarModal open={openEditModal} onClose={closeEditModal} solar={selectedSolarRef.current} onSubmit={handleEditSolar} />

      {/* ✅ Meter (Desktop modal / Mobile bottom sheet) */}
      <MeterModal open={openMeterModal} onClose={() => setOpenMeterModal(false)} />
    </div>
  );
};

export default BeforeSolar;