import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { SlideLeft } from "./SlideLeft";
import { ListNews, DeleteNews, apiUrlPicture } from "../../../services";
import type { NewsInterface } from "../../../interface/INews";
import { Edit2, Trash as TrashIcon, Trash2 } from "react-feather"; // ⬅️ ใช้เส้นบาง มินิมอล
import Modal from "../get/Modal";
import { useNavigate } from "react-router-dom";
import { message } from "antd";

const New: React.FC = () => {
  const [newsList, setNewsList] = useState<NewsInterface[]>([]);
  const [openConfirmModal, setOpenConfirmModal] = useState(false);
  const selectedNewsRef = useRef<NewsInterface | null>(null);
  const navigate = useNavigate();

  const fetchNews = async () => {
    const data = await ListNews();
    if (data) setNewsList(data);
  };

  useEffect(() => {
    fetchNews();
  }, []);

  const openDeleteModal = (news: NewsInterface) => {
    selectedNewsRef.current = news;
    setOpenConfirmModal(true);
  };

  const confirmDelete = async () => {
    if (!selectedNewsRef.current) return;
    const ok = await DeleteNews(selectedNewsRef.current.ID!);
    if (ok) {
      message.success("ลบข่าวสำเร็จ");
      fetchNews();
    } else {
      message.warning("เกิดข้อผิดพลาดในการลบข่าว");
    }
    setOpenConfirmModal(false);
    selectedNewsRef.current = null;
  };

  const cancelDelete = () => {
    setOpenConfirmModal(false);
    selectedNewsRef.current = null;
  };

  const handleEdit = (news: NewsInterface) => {
    navigate("/admin/edit-new", {
      state: {
        newsId: news.ID,
        initialTitle: news.Title,
        initialDescription: news.Description,
        initialPicture: news.Picture,
      },
    });
  };

  const fallbackImg =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'>
        <rect width='100%' height='100%' fill='#eff6ff'/>
        <text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' font-size='18' fill='#2563eb' font-family='Arial'>EV</text>
      </svg>`
    );

  // 🔘 ปุ่มไอคอนแบบมินิมอล (ghost)
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
        className={`h-9 w-9 grid place-items-center rounded-lg border bg-white/80 backdrop-blur
                    transition-all active:scale-[0.98] focus:outline-none focus:ring-4 ${toneClass}`}
        aria-label={label}
        title={label}
      >
        {children}
      </button>
    );
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
            News Management
          </h1>
          <button
            onClick={() => navigate("/admin/create-new")}
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
              <p className="text-xs text-gray-500">Total News</p>
              <p className="text-2xl font-extrabold text-blue-700">{newsList.length}</p>
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-xs text-white bg-blue-600/90 px-2 py-1 rounded-lg border border-white/20">
                EV Events
              </p>
            </div>
          </div>
        </div>

        {/* Grid list */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6 mt-5">
          {newsList.map((item, index) => {
            const delay = 0.12 + index * 0.06;
            const imgSrc = item?.Picture ? `${apiUrlPicture}${item.Picture}` : fallbackImg;

            return (
              <motion.div
                key={item.ID}
                variants={SlideLeft(delay)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-50px" }}
                className="group rounded-2xl bg-white border border-blue-100 p-4 shadow-sm hover:shadow-md transition-shadow relative"
              >
                {/* Actions — มินิมอล */}
                <div className="absolute top-3 right-3 flex gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                  <IconGhostButton
                    tone="blue"
                    label="แก้ไขข่าว"
                    onClick={() => handleEdit(item)}
                  >
                    <Edit2 size={16} strokeWidth={2} />
                  </IconGhostButton>

                  <IconGhostButton
                    tone="red"
                    label="ลบข่าว"
                    onClick={() => openDeleteModal(item)}
                  >
                    <TrashIcon size={16} strokeWidth={2} />
                  </IconGhostButton>
                </div>

                {/* Row */}
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 rounded-xl overflow-hidden ring-1 ring-blue-100 bg-blue-50 flex-shrink-0">
                    <img
                      src={imgSrc}
                      alt={item?.Title || "news"}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).src = fallbackImg;
                      }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-gray-900 line-clamp-2">
                      {item.Title}
                    </p>
                    <p className="mt-1 text-[13px] text-gray-500 line-clamp-3">
                      {item.Description}
                    </p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Empty state */}
        {newsList.length === 0 && (
          <div className="text-center text-gray-500 py-16">
            ยังไม่มีรายการข่าว
          </div>
        )}
      </div>

      {/* Confirm delete modal — EV Blue, minimal, mobile-first */}
      <Modal open={openConfirmModal} onClose={cancelDelete}>
        <div className="w-[min(92vw,280px)] text-center px-3 py-4">
          {/* Icon ในกรอบฟ้าอ่อน */}
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl border border-blue-100 bg-blue-50">
            <Trash2 size={22} className="text-blue-600" />
          </div>

          {/* หัวข้อ & คำอธิบาย */}
          <h3 className="text-base font-bold text-slate-900">ยืนยันการลบข่าว</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            คุณต้องการลบ
            {selectedNewsRef.current?.Title && (
              <>
                <br />
                <span className="font-semibold text-blue-700">
                  “{selectedNewsRef.current.Title}”
                </span>
              </>
            )}
            <br />
            <span className="text-xs text-slate-500">
              การดำเนินการนี้ไม่สามารถย้อนกลับได้
            </span>
          </p>

          {/* ปุ่ม action: ลบ (ฟ้า) / ยกเลิก (ขาวกรอบฟ้า) */}
          <div className="mt-4 flex gap-2">
            <button
              onClick={confirmDelete}
              className="
          w-full h-10 rounded-xl
          bg-blue-600 text-white text-sm font-semibold
          shadow-sm hover:bg-blue-700 active:scale-[0.99]
          focus:outline-none focus:ring-4 focus:ring-blue-200
          transition
        "
            >
              ลบ
            </button>

            <button
              onClick={cancelDelete}
              className="
          w-full h-10 rounded-xl
          border border-blue-200 bg-white
          text-blue-700 text-sm font-semibold
          hover:bg-blue-50 active:scale-[0.99]
          focus:outline-none focus:ring-4 focus:ring-blue-100
          transition
        "
            >
              ยกเลิก
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default New;
