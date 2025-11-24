import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { SlideLeft } from "./SlideLeft";
import { ListGetStarted, DeleteGettingByID, apiUrlPicture } from "../../services";
import type { GetstartedInterface } from "../../interface/IGetstarted";
import { Edit2, Trash as TrashIcon, Trash2 } from "react-feather";
import Modal from "../admin/get/Modal";
import { useNavigate } from "react-router-dom";
import { message } from "antd";

const Editor: React.FC = () => {
  const [getstartedList, setGetstartedList] = useState<GetstartedInterface[]>([]);
  const [openConfirmModal, setOpenConfirmModal] = useState(false);
  const selectedRef = useRef<GetstartedInterface | null>(null);
  const navigate = useNavigate();

  const fetchData = async () => {
    const data = await ListGetStarted();
    if (data) setGetstartedList(data);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openDeleteModal = (item: GetstartedInterface) => {
    selectedRef.current = item;
    setOpenConfirmModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedRef.current) return;
    const ok = await DeleteGettingByID(selectedRef.current.ID!);
    if (ok) {
      message.success("ลบข้อมูลสำเร็จ");
      fetchData();
    } else {
      message.error("เกิดข้อผิดพลาดในการลบ");
    }
    setOpenConfirmModal(false);
    selectedRef.current = null;
  };

  const cancelDelete = () => {
    setOpenConfirmModal(false);
    selectedRef.current = null;
  };

  const handleEdit = (item: GetstartedInterface) => {
    navigate("/admin/edit-editor", {
      state: {
        id: item.ID,
        initialTitle: item.Title,
        initialDescription: item.Description,
        initialPicture: item.Picture, // ส่ง path ไปหน้าแก้ไขด้วย (เผื่อโชว์รูปเดิม)
      },
    });
  };

  // ปุ่มไอคอนมินิมอล (ghost)
  const IconGhostButton: React.FC<
    React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "blue" | "red"; label: string }
  > = ({ tone = "blue", label, children, ...props }) => {
    const toneClass =
      tone === "blue"
        ? "border-blue-200 text-blue-700 hover:border-blue-300 hover:bg-blue-50/70 focus:ring-blue-200"
        : "border-red-200 text-red-600 hover:border-red-300 hover:bg-red-50/70 focus:ring-red-200";
    return (
      <button
        {...props}
        className={`h-9 w-9 grid place-items-center rounded-lg border bg-white/80 backdrop-blur transition-all active:scale-[0.98] focus:outline-none focus:ring-4 ${toneClass}`}
        aria-label={label}
        title={label}
      >
        {children}
      </button>
    );
  };

  // ฟังก์ชันช่วยประกอบ URL รูป (รองรับทั้งเก็บเป็น relative path และเป็น URL เต็ม)
  const toImageUrl = (path?: string) => {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${apiUrlPicture}${path}`;
  };

  // fallback svg (สีฟ้าอ่อน โทน EV)
  const FALLBACK_SVG =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160"><rect width="160" height="160" fill="#e8f1ff"/><g fill="#3b82f6"><rect x="28" y="40" width="104" height="12" rx="6"/><rect x="28" y="68" width="88" height="12" rx="6"/><rect x="28" y="96" width="72" height="12" rx="6"/></g></svg>`
    );

  return (
    <div
      className="min-h-screen w-full bg-[linear-gradient(180deg,#eaf2ff_0%,#f6f9ff_60%,#ffffff_100%)] mt-14 sm:mt-0"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Top bar (EV Blue) */}
      <div className="sticky top-0 z-10 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <h1 className="text-sm sm:text-base font-semibold tracking-wide">Getting Started Management</h1>
          <button
            onClick={() => navigate("/admin/create-editor")}
            className="inline-flex items-center justify-center h-9 px-4 rounded-lg bg-white text-blue-700 text-sm font-semibold shadow-sm hover:bg-white/90 active:scale-[0.99] transition"
          >
            CREATE
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6">
        {/* Summary */}
        <div className="rounded-2xl bg-white border border-blue-100 p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total Items</p>
              <p className="text-2xl font-extrabold text-blue-700">{getstartedList.length}</p>
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-xs text-white bg-blue-600/90 px-2 py-1 rounded-lg border border-white/20">EV Docs</p>
            </div>
          </div>
        </div>

        {/* Grid list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-5">
          {getstartedList.map((item, index) => {
            const delay = 0.12 + index * 0.06;
            const imgSrc = toImageUrl(item.Picture);
            return (
              <motion.div
                key={item.ID}
                variants={SlideLeft(delay)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                className="group rounded-2xl bg-white border border-blue-100 p-4 shadow-sm hover:shadow-md transition-shadow relative"
              >
                {/* Actions (minimal) */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <IconGhostButton tone="blue" label="แก้ไข" onClick={() => handleEdit(item)}>
                    <Edit2 size={16} strokeWidth={2} />
                  </IconGhostButton>
                  <IconGhostButton tone="red" label="ลบ" onClick={() => openDeleteModal(item)}>
                    <TrashIcon size={16} strokeWidth={2} />
                  </IconGhostButton>
                </div>

                {/* Row */}
                <div className="flex items-start gap-3">
                  {/* Thumbnail: ใช้รูปจริงแทนไอคอน */}
                  <div className="h-16 w-16 rounded-xl overflow-hidden ring-1 ring-blue-100 bg-blue-50 flex-shrink-0">
                    {imgSrc ? (
                      <img
                        src={imgSrc}
                        alt={item.Title || "Getting Started"}
                        className="h-full w-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          // ถ้ารูปเสีย ให้ใช้ fallback svg
                          (e.currentTarget as HTMLImageElement).src = FALLBACK_SVG;
                        }}
                      />
                    ) : (
                      <img
                        src={FALLBACK_SVG}
                        alt="no image"
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-gray-900 line-clamp-2">{item.Title}</p>
                    <p className="mt-1 text-[13px] text-gray-500 line-clamp-3">{item.Description}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {getstartedList.length === 0 && (
          <div className="text-center text-gray-500 py-16">ยังไม่มีรายการ</div>
        )}
      </div>

      {/* Confirm delete modal — EV Blue, minimal, mobile-first */}
      <Modal open={openConfirmModal} onClose={cancelDelete}>
        <div className="w-[min(92vw,280px)] text-center px-3 py-4">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50">
            <Trash2 size={22} className="text-blue-600" />
          </div>

          <h3 className="text-base font-bold text-slate-900">ยืนยันการลบ</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            คุณต้องการลบ
            {selectedRef.current?.Title && (
              <>
                <br />
                <span className="font-semibold text-blue-700">“{selectedRef.current.Title}”</span>
              </>
            )}
            <br />
            <span className="text-xs text-slate-500">การดำเนินการนี้ไม่สามารถย้อนกลับได้</span>
          </p>

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
      </Modal>
    </div>
  );
};

export default Editor;
