import "./new.css";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom"; // ✅ เพิ่ม useNavigate
import { ListNews, apiUrlPicture } from "../../../services";
import { NewsInterface } from "../../../interface/INews";

const NewsCarousel = () => {
  const [newsList, setNewsList] = useState<NewsInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate(); // ✅ ตัวนี้ไว้ใช้ navigate

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

  // ✅ ฟังก์ชันเวลาคลิกข่าว
  const handleClick = (news: NewsInterface) => {
    navigate("/user/one-news", {
      state: { news, id: news.ID }, // ส่งทั้ง object และ id ไปด้วย
    });
  };

  return (
    <section
      className="
        w-full
        via-white to-white
        rounded-2xl
        px-4 py-5
        mb-8
      "
      aria-label="ข่าวสารและกิจกรรม"
    >
      {/* Header */}
      <div className="mx-auto max-w-screen-lg flex items-center justify-between">
        <h2 className="text-[15px] md:text-base font-bold tracking-tight text-blue-800">
          News and Events
        </h2>

        <Link
          to="/user/all-news"
          className="
            inline-flex items-center gap-1
            text-[12px] font-semibold
            text-blue-700
            bg-blue-50 hover:bg-blue-100
            px-3 py-1 rounded-full
            transition-colors
            whitespace-nowrap
          "
        >
          View more
          <span aria-hidden>›</span>
        </Link>
      </div>

      {/* List */}
      <div className="mx-auto max-w-screen-lg mt-3 overflow-x-auto no-scrollbar">
        <div className="flex snap-x snap-mandatory gap-4 pr-1">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="
                    snap-start shrink-0
                    w-72 md:w-80
                    rounded-xl border border-blue-100 bg-white
                    shadow-[0_8px_24px_rgba(37,99,235,0.06)]
                    overflow-hidden
                  "
                >
                  <div className="aspect-[16/9] bg-blue-50 animate-pulse" />
                  <div className="p-3">
                    <div className="h-3.5 w-40 bg-blue-50 rounded mb-2 animate-pulse" />
                    <div className="h-3 w-24 bg-blue-50 rounded animate-pulse" />
                  </div>
                </div>
              ))
            : newsList.map((item) => (
                <article
                  key={item.ID}
                  onClick={() => handleClick(item)} // ✅ เมื่อคลิกข่าวนี้
                  className="
                    snap-start shrink-0
                    w-72 md:w-80
                    rounded-xl border border-blue-100 bg-white
                    shadow-[0_8px_24px_rgba(37,99,235,0.06)]
                    overflow-hidden
                    transition-transform
                    cursor-pointer
                    hover:scale-[1.02] active:scale-[0.98]
                  "
                  role="button"
                  tabIndex={0}
                  aria-label={item.Title}
                >
                  <div className="relative aspect-[16/9]">
                    <img
                      src={`${apiUrlPicture}${item.Picture}`}
                      alt={item.Title}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/50 via-black/10 to-transparent">
                      <h3
                        className="
                          text-[13px] md:text-[14px]
                          font-semibold leading-5 text-white line-clamp-2
                          drop-shadow-sm
                        "
                        title={item.Title}
                      >
                        {item.Title}
                      </h3>
                    </div>
                    <span
                      className="
                        absolute left-2 top-2
                        text-[10px] font-semibold
                        px-2 py-0.5 rounded-full
                        bg-white/90 text-blue-700
                        ring-1 ring-blue-200
                      "
                    >
                      EV NEWS
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="text-[12px] leading-5 text-gray-600 line-clamp-2">
                      {item.Description ||
                        "อัปเดตกิจกรรมและข่าวสารเกี่ยวกับการชาร์จไฟฟ้า EV"}
                    </p>
                  </div>
                </article>
              ))}
        </div>
      </div>
    </section>
  );
};

export default NewsCarousel;
