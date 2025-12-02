import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { RiNewspaperLine } from "react-icons/ri";
import { ListNews, apiUrlPicture } from "../../../../services";
import { NewsInterface } from "../../../../interface/INews";

type NavState = { news?: NewsInterface; id?: number };

const formatThaiDate = (d?: string | Date) => {
  try {
    const date = d ? new Date(d) : new Date();
    return date.toLocaleDateString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
};

const OneNews: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { news: passedNews, id: passedId } = (location.state as NavState) || {};
  const [news, setNews] = useState<NewsInterface | null>(passedNews ?? null);

  // โหลดข้อมูลเมื่อเข้าหน้าโดยตรง
  useEffect(() => {
    if (news || !passedId) return;
    (async () => {
      const list = await ListNews();
      if (Array.isArray(list)) {
        const found = list.find((x) => x.ID === passedId);
        if (found) setNews(found);
      }
    })();
  }, [news, passedId]);

  const img = useMemo(
    () => (news?.Picture ? `${apiUrlPicture}${news.Picture}` : ""),
    [news?.Picture]
  );

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
              <path
                d="M15 18l-6-6 6-6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
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
      <main className="mx-auto w-full max-w-screen-lg px-4 py-8 md:py-10">
        {!news ? (
          <div className="py-20 text-center text-gray-500">No news found</div>
        ) : (
          <div className="flex flex-col md:flex-row md:gap-8 items-start">
            {/* รูปภาพหัวเรื่อง */}
            {img && (
              <div className="md:w-1/2 rounded-2xl bg-blue-50 ring-1 ring-blue-100 overflow-hidden shadow-sm mb-5 md:mb-0">
                <img
                  src={img}
                  alt={news.Title}
                  className="w-full h-auto object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).style.display = "none";
                  }}
                />
              </div>
            )}

            {/* เนื้อหา */}
            <div className="md:w-1/2">
              <div className="flex justify-center md:justify-start py-3 md:py-0">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
              </div>

              <h1 className="text-[22px] md:text-[26px] font-bold text-gray-800 leading-snug">
                {news.Title}
              </h1>

              <div className="mt-2 flex items-center gap-2 text-gray-500">
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                </svg>
                <span className="text-[14px] md:text-[15px]">
                  {formatThaiDate(
                    (news as any)?.CreatedAt || (news as any)?.createdAt
                  )}
                </span>
              </div>

              <article className="prose prose-sm md:prose-base mt-4 max-w-none">
                <p className="text-[15px] md:text-[16px] leading-7 md:leading-8 text-gray-700 whitespace-pre-line">
                  {news.Description}
                </p>
              </article>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default OneNews;