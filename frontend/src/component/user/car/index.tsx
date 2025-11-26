import React from "react";
import { useNavigate } from "react-router-dom";

type CardAddVehicleProps = {
  /** ใส่ลิงก์หรือ import รูปรถของคุณเอง เช่น /images/ev-blue.png */
  carImageUrl?: string;
  /** ขนาดรูป (tailwind class) */
  carImageClassName?: string;
};

const CardAddVehicle: React.FC<CardAddVehicleProps> = ({
  carImageUrl,
  carImageClassName = "h-20 w-28 md:h-24 md:w-36",
}) => {
  const navigate = useNavigate();
  const goIntro = () => navigate("/user/intro-cars");

  return (
    <section className="w-full px-4 py-6">
      <div
        className="
          relative mx-auto w-full max-w-screen-sm overflow-hidden
          rounded-2xl border border-blue-100 bg-white
          shadow-[0_10px_30px_rgba(37,99,235,0.08)]
        "
      >
        {/* แถบไฮไลต์ด้านบน */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600" />

        {/* ส่วนหัว */}
        <div className="flex items-start justify-between gap-4 px-5 pt-5">
          <div className="min-w-0">
            <p className="text-[12px] font-medium tracking-wide text-blue-700/80">
              Ready for Use
            </p>
            <h3 className="mt-0.5 text-[18px] font-semibold text-gray-900">
              Add your vehicle
            </h3>
            <p className="mt-1 text-[13px] leading-5 text-gray-600">
              The station can be used
            </p>
          </div>

          {/* รูปรถ (คุณใส่เอง) */}
          {carImageUrl ? (
            <img
              src={carImageUrl}
              alt="EV Car"
              className={`object-contain ${carImageClassName}`}
              draggable={false}
            />
          ) : (
            <div
              className={`
                grid place-items-center rounded-xl bg-blue-50 text-blue-400
                ${carImageClassName}
              `}
              aria-label="Car image placeholder"
            >
              <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
                <path d="M3 13a2 2 0 012-2h1.3l1.3-3.3A3 3 0 0110.7 6h2.6a3 3 0 012.8 1.7L18.7 11H19a2 2 0 012 2v3a1 1 0 01-1 1h-1a2 2 0 01-2-2h-8a2 2 0 01-2 2H6a1 1 0 01-1-1v-3zm4.4-2h9.2l-1.1-2.5A1 1 0 0013.3 8h-2.6a1 1 0 00-.92.59L7.4 11zM6 15.5a1.5 1.5 0 103 0a1.5 1.5 0 00-3 0zm9 0a1.5 1.5 0 103 0a1.5 1.5 0 00-3 0z"/>
              </svg>
            </div>
          )}
        </div>

        {/* เส้นคั่นบางๆ */}
        <div className="mx-5 mt-4 h-px bg-blue-50" />

        {/* CTA */}
        <div className="px-5 py-4">
          <button
            type="button"
            onClick={goIntro}
            className="
              group inline-flex w-full items-center justify-between
              rounded-xl bg-blue-600 px-4 py-3 text-white font-semibold
              transition hover:bg-blue-700 active:bg-blue-800
              focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-300
            "
          >
            <span className="text-[14px]">Add vehicle</span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>
      </div>
    </section>
  );
};

export default CardAddVehicle;