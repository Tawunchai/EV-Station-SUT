import { useEffect, useMemo, useState } from "react";
import Slider, { Settings } from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";
import { ListGetStarted, apiUrlPicture } from "../../../../services";
import { Button, Spin } from "antd";
import { useNavigate, useLocation } from "react-router-dom";
import { GetstartedInterface } from "../../../../interface/IGetstarted";

/* ⚡ EV Icon */
const BoltIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z" fill="currentColor" />
  </svg>
);

const GettingStarted: React.FC = () => {
  const [data, setData] = useState<GetstartedInterface[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  // ⭐⭐⭐ รับ paymentID และ cabinet_id จาก after-payment
  const location = useLocation();
  const { paymentID, cabinet_id } = location.state || {};

  console.log("📦 PAYMENT ID (User Manual):", paymentID);
  console.log("🟦 CABINET ID (User Manual):", cabinet_id);

  /* โหลดข้อมูลจาก API */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await ListGetStarted();
        if (res) setData(res);
      } catch (err) {
        console.error("Error fetching data:", err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const hasData = data.length > 0;

  /* Slider Settings */
  const settings: Settings = useMemo(() => {
    const n = data.length;
    const baseShow = Math.min(3, n || 1);
    const showMd = Math.min(2, n || 1);
    const showSm = Math.min(1, n || 1);

    return {
      dots: true,
      arrows: false,
      infinite: n > baseShow,
      speed: 500,
      slidesToScroll: 1,
      autoplay: n > 1,
      autoplaySpeed: 3000,
      cssEase: "ease",
      pauseOnHover: true,
      slidesToShow: baseShow,
      responsive: [
        {
          breakpoint: 1024,
          settings: { slidesToShow: showMd, slidesToScroll: 1, infinite: n > showMd },
        },
        {
          breakpoint: 640,
          settings: { slidesToShow: showSm, slidesToScroll: 1, infinite: n > showSm },
        },
      ],
    };
  }, [data.length]);

  /* Loading */
  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  /* No Data */
  if (!hasData) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-gray-500">
        There is no user manual information yet
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md">
        <div className="w-full px-4 py-3 flex items-center gap-2">
          <button
            onClick={() => navigate("/user")}
            className="h-9 w-9 flex items-center justify-center rounded-xl active:bg-white/15"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <div className="flex items-center gap-2">
            <BoltIcon className="h-5 w-5 text-white" />
            <span className="text-base font-semibold tracking-wide">EV User Manual</span>
          </div>
        </div>
      </header>

      {/* Content */}
      <section className="relative w-full bg-white py-10">
        <div className="mx-auto max-w-screen-lg px-4">
          <Slider {...settings}>
            {data.map((item, idx) => {
              const imageSrc = item.Picture
                ? `${apiUrlPicture}${item.Picture}`
                : "https://via.placeholder.com/600x400?text=EV+Guide";

              return (
                <div key={item.ID ?? idx} className="px-3">
                  <article
                    className="
                      group relative flex flex-col justify-between
                      overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-md
                      transition-transform hover:-translate-y-1 hover:shadow-lg
                      min-h-[500px]
                    "
                  >
                    {/* Image */}
                    <div className="w-full h-72 md:h-72 overflow-hidden">
                      <img
                        src={imageSrc}
                        alt={item.Title}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    </div>

                    {/* Text */}
                    <div className="p-5 text-center flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-lg font-semibold text-blue-700 mb-2">
                          {item.Title}
                        </h3>
                        <p className="text-sm text-gray-700 leading-relaxed line-clamp-4">
                          {item.Description}
                        </p>
                      </div>
                    </div>
                  </article>
                </div>
              );
            })}
          </Slider>

          {/* NEXT Button */}
          <div className="fixed right-8 bottom-8 z-50">
            <Button
              type="primary"
              shape="round"
              className="bg-blue-600 hover:bg-blue-700 px-6 py-4 text-base"
              onClick={() =>
                navigate("/user/charging", {
                  state: { paymentID, cabinet_id },
                })
              }
            >
              Next
            </Button>
          </div>
        </div>

        {/* Custom Dots */}
        <style>{`
          .slick-dots { bottom: -28px; }
          .slick-dots li { margin: 0 5px; }
          .slick-dots li button:before {
            font-size: 8px;
            color: #cbd5e1;
            opacity: 1;
          }
          .slick-dots li.slick-active button:before {
            color: #2563eb;
            opacity: 1;
          }
        `}</style>
      </section>
    </div>
  );
};

export default GettingStarted;
