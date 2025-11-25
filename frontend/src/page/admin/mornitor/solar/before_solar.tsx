// src/page/admin/mornitor/solar/BeforeSolar.tsx

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SlideLeft } from "./SlideLeft";
import {
  ListSolar,
  DeleteSolar,
  apiUrlPicture, // ⭐ ใช้เหมือนหน้า News
} from "../../../../services";
import type { SolarInterface } from "../../../../interface/ISolar";
import { Edit2, Trash as TrashIcon, Trash2, Sun } from "react-feather";
import { message } from "antd";
import { useNavigate } from "react-router-dom"; // ⭐ เพิ่ม

import CreateSolarModal from "./create/index";
import EditSolarModal from "./update/index";

// 🔘 ปุ่มไอคอนแบบมินิมอล (ghost)
const IconGhostButton: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    tone?: "blue" | "red";
    label: string;
  }
> = ({ tone = "blue", label, children, ...props }) => {
  const toneClass =
    tone === "blue"
      ? "border-blue-200 text-blue-700 hover:border-blue-300 hover:bg-blue-50/70 focus:ring-blue-200"
      : "border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50/70 focus:ring-red-200";
  return (
    <button
      {...props}
      className={`h-9 w-9 grid place-items-center rounded-lg border bg-white/80 backdrop-blur
                  transition-all active:scale-[0.98] focus:outline-none focus:ring-4 ${toneClass}`}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  );
};

const BeforeSolar: React.FC = () => {
  const [solarList, setSolarList] = useState<SolarInterface[]>([]);
  const [openConfirmModal, setOpenConfirmModal] = useState(false);

  const [openCreateModal, setOpenCreateModal] = useState(false);
  const [openEditModal, setOpenEditModal] = useState(false);

  const selectedSolarRef = useRef<SolarInterface | null>(null);
  const navigate = useNavigate(); // ⭐ ใช้ navigate ไปหน้า after-solar

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
    console.log("⚡ raw ListSolar:", data);

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

      console.log("✅ mapped solar:", mapped);
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

  // ---------- Create / Edit (ใช้งานจริง, ไม่ mock แล้ว) ----------

  const openCreate = () => {
    selectedSolarRef.current = null;
    setOpenCreateModal(true);
  };

  const openEdit = (solar: SolarInterface) => {
    selectedSolarRef.current = solar;
    setOpenEditModal(true);
  };

  // เมื่อสร้างเสร็จ
  const handleCreateSolar = (_createdSolar: {
    ID?: number;
    Name: string;
    UrlWebsocket: string;
    SolarPoint: string;
    Description?: string;
    Picture?: string;
    Location?: string;
  }) => {
    setOpenCreateModal(false);
    fetchSolar();
  };

  // เมื่อแก้ไขเสร็จ
  const handleEditSolar = (_updatedSolar: any) => {
    setOpenEditModal(false);
    selectedSolarRef.current = null;
    fetchSolar();
  };

  const closeCreateModal = () => {
    setOpenCreateModal(false);
  };

  const closeEditModal = () => {
    setOpenEditModal(false);
    selectedSolarRef.current = null;
  };

  // ⭐ คลิก card → ไปหน้า admin/after-solar พร้อมส่งข้อมูล solar ไปด้วย
  const handleCardClick = (solar: SolarInterface) => {
    navigate("/admin/after-solar", {
      state: {
        solar,
      },
    });
  };

  return (
    <div
      className="min-h-screen w-full bg-[linear-gradient(180deg,#eaf2ff_0%,#f6f9ff_60%,#ffffff_100%)] mt-14 sm:mt-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Top bar */}
      <div className="sticky top-0 z-10 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm sm:text-base font-semibold tracking-wide">
            Solar Management
          </h1>
          <button
            onClick={openCreate}
            className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-white text-blue-700 text-sm font-semibold shadow-sm hover:bg-white/90 active:scale-[0.99] transition"
          >
            CREATE
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* Summary / Title */}
        <div className="rounded-2xl bg-white border border-blue-100 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total Solar</p>
              <p className="text-2xl font-extrabold text-blue-700">
                {solarList.length}
              </p>
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
                onClick={() => handleCardClick(item)} // ⭐ คลิกทั้ง card
                className="group rounded-2xl bg-white border border-blue-100 p-4 shadow-sm hover:shadow-md transition-shadow relative cursor-pointer"
              >
                {/* Actions */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <IconGhostButton
                    tone="blue"
                    label="แก้ไข Solar"
                    onClick={(e) => {
                      e.stopPropagation(); // ⭐ กันไม่ให้วิ่งไป handleCardClick
                      openEdit(item);
                    }}
                  >
                    <Edit2 size={16} strokeWidth={2} />
                  </IconGhostButton>

                  <IconGhostButton
                    tone="red"
                    label="ลบ Solar"
                    onClick={(e) => {
                      e.stopPropagation(); // ⭐ กันไม่ให้วิ่งไป handleCardClick
                      openDeleteModal(item);
                    }}
                  >
                    <TrashIcon size={16} strokeWidth={2} />
                  </IconGhostButton>
                </div>

                {/* Row */}
                <div className="flex items-start gap-3">
                  {/* รูป / ไอคอน Solar */}
                  <div className="h-16 w-16 rounded-xl overflow-hidden ring-1 ring-blue-100 bg-blue-50 flex-shrink-0">
                    {item.Picture && item.Picture !== "" ? (
                      <img
                        src={imgSrc}
                        alt={item.Name || "solar"}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            fallbackImg;
                        }}
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-yellow-50 via-amber-50 to-blue-50">
                        <Sun size={24} className="text-amber-500" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    {/* Name */}
                    <p className="text-[15px] font-semibold text-gray-900 line-clamp-2">
                      {item.Name}
                    </p>

                    {/* UrlWebsocket */}
                    {item.UrlWebsocket && (
                      <p className="text-[12px] text-gray-500 break-all line-clamp-2">
                        <span className="font-medium text-gray-700">
                          WebSocket:
                        </span>{" "}
                        {item.UrlWebsocket}
                      </p>
                    )}

                    {/* SolarPoint */}
                    {item.SolarPoint && (
                      <p className="text-[12px] text-blue-700 line-clamp-1">
                        <span className="font-medium text-gray-700">
                          Point:
                        </span>{" "}
                        {item.SolarPoint}
                      </p>
                    )}

                    {/* Location */}
                    {item.Location && (
                      <p className="text-[12px] text-emerald-700 line-clamp-1">
                        <span className="font-medium text-gray-700">
                          Location:
                        </span>{" "}
                        {item.Location}
                      </p>
                    )}

                    {/* Description */}
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

        {/* Empty state */}
        {solarList.length === 0 && (
          <div className="text-center text-gray-500 py-16">
            ยังไม่มีรายการ Solar
          </div>
        )}
      </div>

      {/* Confirm delete modal — EV Blue, minimal */}
      {openConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40">
          <div className="w-[min(92vw,280px)] rounded-2xl bg-white text-center px-3 py-4 shadow-lg">
            {/* Icon ในกรอบฟ้าอ่อน */}
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50">
              <Trash2 size={22} className="text-blue-600" />
            </div>

            {/* หัวข้อ & คำอธิบาย */}
            <h3 className="text-base font-bold text-slate-900">
              ยืนยันการลบ Solar
            </h3>
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
              <span className="text-xs text-slate-500">
                การดำเนินการนี้ไม่สามารถย้อนกลับได้
              </span>
            </p>

            {/* ปุ่ม action */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmDelete}
                className="w-full h-10 rounded-xl bg-blue-600 text-white text-sm font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-200 transition"
              >
                ลบ
              </button>

              <button
                onClick={cancelDelete}
                className="w-full h-10 rounded-xl border border-blue-200 bg-white text-blue-700 text-sm font-semibold hover:bg-blue-50 active:scale-[0.99] focus:outline-none focus:ring-4 focus:ring-blue-100 transition"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Solar Modal */}
      <CreateSolarModal
        open={openCreateModal}
        onClose={closeCreateModal}
        onSubmit={handleCreateSolar}
      />

      {/* Edit Solar Modal */}
      <EditSolarModal
        open={openEditModal}
        onClose={closeEditModal}
        solar={selectedSolarRef.current}
        onSubmit={handleEditSolar}
      />
    </div>
  );
};

export default BeforeSolar;