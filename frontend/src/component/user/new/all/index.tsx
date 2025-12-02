// NewsListMobile.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { RiNewspaperLine } from "react-icons/ri";
import { ListNews, apiUrlPicture } from "../../../../services";
import { NewsInterface } from "../../../../interface/INews";
import Footer from "../../../../component/user/footer/footer";

const NewsListMobile: React.FC = () => {
  const navigate = useNavigate();

  const [items, setItems] = useState<NewsInterface[]>([]);
  const [loading, setLoading] = useState(true);        // โหลดข้อมูลจาก API
  const [imgsReady, setImgsReady] = useState(false);   // โหลดรูปครบหรือยัง (หรือหมดเวลา)
  const [preloadStarted, setPreloadStarted] = useState(false);

  // โหลดข่าว
  useEffect(() => {
    (async () => {
      try {
        const res = await ListNews();
        if (Array.isArray(res)) setItems(res);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // พรีโหลดรูปทั้งหมด หลังจากมี items แล้ว
  useEffect(() => {
    if (loading || preloadStarted) return;

    setPreloadStarted(true);

    const urls = items
      .map((n) => (n?.Picture ? `${apiUrlPicture}${n.Picture}` : ""))
      .filter(Boolean);

    // ถ้าไม่มีรูปให้โหลด ถือว่า ready ทันที
    if (urls.length === 0) {
      setImgsReady(true);
      return;
    }

    // helper: โหลดรูป 1 ใบเป็น Promise
    const loadImage = (src: string) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve(); // error ก็ resolve เพื่อไม่ให้ค้าง
        img.src = src;
      });

    const allImages = Promise.allSettled(urls.map(loadImage));

    // กันหน้าค้าง ถ้ารูปช้าเกิน 3 วิ ก็ปล่อยให้แสดงหน้าไปก่อน
    const timeout = new Promise<void>((resolve) =>
      setTimeout(() => resolve(), 3000)
    );

    Promise.race([allImages, timeout]).finally(() => setImgsReady(true));
  }, [loading, items, preloadStarted]);

  const showSkeleton = loading || !imgsReady;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header
        className="sticky top-0 z-20 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md overflow-hidden w-full"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="w-full px-4 py-3 flex items-center gap-2 justify-start">
          {/* ปุ่มย้อนกลับ */}
          <button
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="h-9 w-9 flex items-center justify-center rounded-xl active:bg-white/15 transition-colors"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {/* ไอคอนและชื่อหัวข้อ */}
          <div className="flex items-center gap-2">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-white/15">
              <RiNewspaperLine className="h-5 w-5 text-white" />
            </span>
            <span className="text-sm md:text-base font-semibold tracking-wide">
              News and Events
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-screen-sm px-4 py-3">
        {showSkeleton ? (
          // สเกเลตันแบบ list
          <ul className="divide-y divide-gray-100">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex gap-3 py-4">
                <div className="h-16 w-28 rounded-lg bg-gray-200 animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-3/4 rounded bg-gray-200 animate-pulse" />
                  <div className="h-4 w-2/3 rounded bg-gray-100 animate-pulse" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-gray-500">
            No news found
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((n) => {
              const img = n?.Picture ? `${apiUrlPicture}${n.Picture}` : "";
              return (
                <li key={n.ID} className="py-2">
                  <button
                    type="button"
                    onClick={() => navigate("/user/one-news", { state: { news: n } })}
                    className="flex w-full gap-3 py-2 text-left"
                  >
                    {/* Thumbnail */}
                    <div className="h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg ring-1 ring-blue-100 bg-blue-50">
                      {img ? (
                        <img
                          src={img}
                          alt={n.Title}
                          className="h-full w-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = "none";
                          }}
                          // ไม่ต้องรอรูป ณ จุดนี้แล้ว เพราะเรา preload มาแล้ว/หรือหมดเวลา
                          loading="eager"
                          decoding="async"
                        />
                      ) : null}
                    </div>

                    {/* Texts */}
                    <div className="min-w-0 flex-1">
                      <h3 className="line-clamp-2 text-[15px] font-semibold text-gray-900">
                        {n.Title}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-[13px] text-gray-500">
                        {n.Description}
                      </p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default NewsListMobile;