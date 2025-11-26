import "./new.css";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { SlideUp } from "./animation";
import { ListNews, apiUrlPicture } from "../../../services";
import { NewsInterface } from "../../../interface/INews";
import { useNavigate } from "react-router-dom"; // ✅ เพิ่ม useNavigate

const PAGE_SIZE = 2;

const New = () => {
  const [newsList, setNewsList] = useState<NewsInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const navigate = useNavigate(); // ✅ ใช้สำหรับเปลี่ยนหน้า

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const res = await ListNews();
        if (res) setNewsList(res);
      } finally {
        setLoading(false);
      }
    };
    fetchNews();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [newsList.length]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(newsList.length / PAGE_SIZE)),
    [newsList.length]
  );

  const pageSlice = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    const end = start + PAGE_SIZE;
    return newsList.slice(start, end);
  }, [newsList, page]);

  const goPage = (p: number) => {
    const next = Math.min(Math.max(1, p), totalPages);
    if (next !== page) setPage(next);
  };

  const prev = () => goPage(page - 1);
  const next = () => goPage(page + 1);

  // ✅ ฟังก์ชันเมื่อคลิกข่าว
  const handleClick = (news: NewsInterface) => {
    navigate("/user/one-news", {
      state: { news, id: news.ID },
    });
  };

  return (
    <>
      {/* Title */}
      <div className="mx-auto max-w-screen-lg px-4 pt-6 pb-3 text-center">
        <h1 className="text-[20px] md:text-[22px] font-bold tracking-tight text-blue-800">
          News and Events
        </h1>
        <p className="mt-1 text-[12px] text-blue-900/60">
          Keep up to date with the latest EV stories for you.
        </p>
      </div>

      <section>
        <div className="mx-auto max-w-screen-lg px-4 pb-10">
          {/* Loading skeleton */}
          {loading && (
            <div className="space-y-5">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-2xl border border-blue-100 bg-white p-3 md:p-4 shadow-[0_8px_28px_rgba(37,99,235,0.06)]"
                >
                  <div className="aspect-[16/9] rounded-xl bg-blue-50 animate-pulse" />
                  <div className="mt-3 h-4 w-2/3 rounded bg-blue-50 animate-pulse" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-blue-50 animate-pulse" />
                </div>
              ))}
            </div>
          )}

          {/* Empty */}
          {!loading && newsList.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-500">
              ยังไม่มีข่าวสารในขณะนี้
            </div>
          )}

          {/* List (paged) */}
          {!loading && newsList.length > 0 && (
            <>
              <div className="space-y-6">
                {pageSlice.map((item, index) => {
                  const realIndex = (page - 1) * PAGE_SIZE + index;
                  const isOdd = realIndex % 2 !== 0;

                  return (
                    <article
                      key={item.ID}
                      onClick={() => handleClick(item)} // ✅ คลิกเพื่อไปหน้า one-news
                      className={`
                        grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6
                        items-center
                        rounded-2xl border border-blue-100 bg-white
                        shadow-[0_8px_28px_rgba(37,99,235,0.06)]
                        p-3 md:p-4
                        cursor-pointer hover:scale-[1.01] transition-transform duration-200
                      `}
                    >
                      {/* รูปภาพ */}
                      <motion.div
                        variants={SlideUp(0.2)}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.3 }}
                        className={`${isOdd ? "md:order-2" : ""}`}
                      >
                        <div className="relative overflow-hidden rounded-xl">
                          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 z-10" />
                          <img
                            src={`${apiUrlPicture}${item.Picture}`}
                            alt={item.Title}
                            className="aspect-[16/9] w-full object-cover"
                            loading="lazy"
                          />
                          <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-blue-700 ring-1 ring-blue-200">
                            EV NEWS
                          </span>
                        </div>
                      </motion.div>

                      {/* เนื้อหา */}
                      <motion.div
                        variants={SlideUp(0.35)}
                        initial="hidden"
                        whileInView="visible"
                        viewport={{ once: true, amount: 0.3 }}
                        className={`${isOdd ? "md:order-1 md:text-right" : ""}`}
                      >
                        <p className="text-[12px] font-semibold uppercase text-blue-600">
                          Announcement
                        </p>
                        <h3 className="mt-1 text-[18px] md:text-[20px] font-bold leading-snug text-gray-900">
                          {item.Title}
                        </h3>
                        <p className="mt-2 text-[13px] leading-6 text-gray-700 line-clamp-3">
                          {item.Description}
                        </p>
                      </motion.div>
                    </article>
                  );
                })}
              </div>

              {/* Pagination controls */}
              {newsList.length > PAGE_SIZE && (
                <div className="mt-8 flex flex-col items-center gap-3">
                  <div className="text-xs text-gray-500">
                    แสดง {Math.min((page - 1) * PAGE_SIZE + 1, newsList.length)}–
                    {Math.min(page * PAGE_SIZE, newsList.length)} จาก {newsList.length} รายการ
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={prev}
                      disabled={page === 1}
                      className={`px-3 h-10 rounded-xl border text-sm font-medium transition ${
                        page === 1
                          ? "border-gray-200 text-gray-400 cursor-not-allowed"
                          : "border-blue-200 text-blue-700 hover:bg-blue-50"
                      }`}
                    >
                      ก่อนหน้า
                    </button>

                    {/* page numbers */}
                    <div className="flex items-center gap-1">
                      {Array.from({ length: totalPages }).map((_, i) => {
                        const p = i + 1;
                        const active = p === page;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => goPage(p)}
                            className={`min-w-[36px] h-10 px-2 rounded-xl text-sm font-semibold transition ${
                              active
                                ? "bg-blue-600 text-white shadow"
                                : "bg-white border border-blue-200 text-blue-700 hover:bg-blue-50"
                            }`}
                          >
                            {p}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={next}
                      disabled={page === totalPages}
                      className={`px-3 h-10 rounded-xl border text-sm font-medium transition ${
                        page === totalPages
                          ? "border-gray-200 text-gray-400 cursor-not-allowed"
                          : "border-blue-200 text-blue-700 hover:bg-blue-50"
                      }`}
                    >
                      ถัดไป
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </>
  );
};

export default New;
