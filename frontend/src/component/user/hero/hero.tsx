import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import CountUp from "react-countup";
import Hero_Image from "../../../assets/picture/car_charging.jpg";

import {
  ListEVCharging,
  ListUsers,
  GetChargingSessionByStatusAndUserID,
} from "../../../services";

import { EVchargingInterface } from "../../../interface/IEV";
import { UsersInterface } from "../../../interface/IUser";
import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";

import {
  FaBolt,
  FaCalendarCheck,
  FaUsers,
  FaChargingStation,
} from "react-icons/fa";

type HeaderProps = {
  scrollToValue: () => void;
};

const Hero = ({}: HeaderProps) => {
  const [evList, setEVList] = useState<EVchargingInterface[]>([]);
  const [userList, setUserList] = useState<UsersInterface[]>([]);
  const [userID, setUserID] = useState<number | null>(null);

  const [sessions, setSessions] = useState<any[]>([]);
  const [isChargingActive, setIsChargingActive] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);

  const navigate = useNavigate();

  // ⭐ โหลด user จาก JWT
  useEffect(() => {
    const loadUser = async () => {
      let u = getCurrentUser();
      if (!u) u = await initUserProfile();
      if (u?.id) setUserID(u.id);
    };
    loadUser();
  }, []);

  // ⭐ โหลด Charging Session ที่ Status = true
  useEffect(() => {
    const loadSession = async () => {
      if (!userID) return;

      const res = await GetChargingSessionByStatusAndUserID(userID);
      const list = res?.data || [];

      const active = list.filter(
        (s: any) => s.Status === true || s.Status === 1
      );

      setSessions(active);
      setIsChargingActive(active.length > 0);
    };

    loadSession();
  }, [userID]);

  // ⭐ โหลดรายการ EV / Users
  useEffect(() => {
    const fetchData = async () => {
      const evs = await ListEVCharging();
      const users = await ListUsers();
      if (evs) setEVList(evs);
      if (users) setUserList(users);
    };
    fetchData();
  }, []);

  // ⭐ คำนวณผลรวมราคา EV
  const namePriceSums = useMemo(() => {
    return evList.reduce((acc: Record<string, number>, ev) => {
      const name = ev.Name || "Unknown";
      acc[name] = (acc[name] || 0) + (Number(ev.Price) || 0);
      return acc;
    }, {});
  }, [evList]);

  // ⭐ ไปยังตู้ชาร์จที่เลือก
  const goToCabinet = (s: any) => {
    navigate("/user/charging", {
      state: {
        paymentID: s?.PaymentID,
        cabinet_id: s?.Payment?.EVCabinetID,
      },
    });
    setModalOpen(false);
  };

  // ⭐ ไปซื้อไฟฟ้าเพิ่ม
  const goToBuyMore = () => {
    setModalOpen(false);
    navigate("/user/evs-selector");
  };

  return (
    <>
      {/* ✔ HERO SECTION */}
      <section className="relative w-full bg-white text-gray-900">
        <div className="mx-auto max-w-screen-xl px-4 md:px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 items-end pt-10 md:pt-14 pb-10 md:pb-16">
            {/* LEFT */}
            <div className="flex flex-col gap-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-medium text-blue-700 w-max">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                EV Charging Made Simple
              </div>

              {/* ห่อหัวข้อ + subtitle ด้วย flex-col */}
              <div className="flex flex-col gap-2">
                <h1 className="font-bold leading-tight tracking-tight text-3xl sm:text-4xl">
                  Discover the Best EV <br />
                  Charging Spots Near You
                </h1>

                <p className="text-[13px] sm:text-base text-gray-600">
                  Quickly find the charging station that's right for you.
                </p>
              </div>

              {/* ⭐ ACTION BUTTON */}
              <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
                {/* 👉 ปุ่มเริ่มชาร์จ / กำลังชาร์จ */}
                <button
                  className={`relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold shadow-sm active:scale-[0.99] transition
                    ${
                      isChargingActive
                        ? "bg-orange-500 text-white shadow-lg"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                    }`}
                  onClick={() =>
                    isChargingActive
                      ? setModalOpen(true)
                      : navigate("/user/evs-selector")
                  }
                >
                  {/* Bubble Animation */}
                  {isChargingActive && (
                    <>
                      <span className="bubble bubble1"></span>
                      <span className="bubble bubble2"></span>
                      <span className="bubble bubble3"></span>
                      <span className="bubble bubble4"></span>
                      <span className="bubble bubble5"></span>
                      <span className="bubble bubble6"></span>
                      <span className="bubble bubble7"></span>
                    </>
                  )}

                  <FaBolt className="text-lg" />
                  {isChargingActive ? "Charging" : "Start charging"}
                </button>

                {/* ปุ่มจอง */}
                <button
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 font-semibold bg-white text-blue-700 ring-1 ring-blue-200 hover:bg-blue-50 active:scale-[0.99] transition"
                  onClick={() => navigate("/user/booking-ev")}
                >
                  <FaCalendarCheck className="text-blue-600 text-lg" />
                  Reserve EV Charger
                </button>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-5 mt-2">
                {Object.entries(namePriceSums).map(
                  ([name, total], index, arr) => {
                    const isLast = index === arr.length - 1;
                    const isOdd = arr.length % 2 === 1;

                    return (
                      <div
                        key={name}
                        className={`
                          rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_8px_24px_rgba(2,6,23,0.06)]
                          text-center sm:text-left
                          ${isLast && isOdd ? "col-span-2" : ""}
                        `}
                      >
                        {/* icon + text group จัดเป็นคอลัมน์เอง */}
                        <div className="flex items-center justify-center sm:justify-start gap-3">
                          <FaChargingStation className="text-blue-600 text-lg" />
                          <div className="flex flex-col items-start">
                            <div className="text-2xl font-extrabold text-blue-700">
                              {Number(total).toFixed(2)}
                              <span className="text-blue-300"> ฿</span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {name}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  }
                )}

                {/* การ์ด Members */}
                <div className="col-span-2 sm:col-span-1 rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_8px_24px_rgba(2,6,23,0.06)] text-center sm:text-left">
                  <div className="flex items-center justify-center sm:justify-start gap-3">
                    <FaUsers className="text-blue-600 text-lg" />
                    <div className="flex flex-col items-start">
                      <div className="text-2xl font-extrabold text-blue-700">
                        <CountUp start={0} end={userList.length} duration={2} />
                        <span className="text-blue-300"> +</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Members
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT IMAGE */}
            <div className="hidden md:flex justify-end">
              <figure className="relative w-[34rem] max-w-full h-[28rem] rounded-[2rem] overflow-hidden border border-gray-100 shadow-[0_20px_60px_rgba(2,6,23,0.08)] bg-white">
                <img
                  src={Hero_Image}
                  alt="EV Charging"
                  className="h-full w-full object-cover"
                />
                <figcaption className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-blue-300 via-blue-500 to-blue-600" />
              </figure>
            </div>
          </div>
        </div>

        <div className="h-6 md:h-8 w-full bg-gradient-to-b from-white to-blue-50/30" />

        {/* ANIMATION CSS */}
        <style>
          {`
            @keyframes bubbleUpWide {
              0% { transform: translateY(20px) scale(0.3); opacity: 0; }
              40% { opacity: 0.45; }
              100% { transform: translateY(-35px) scale(1.2); opacity: 0; }
            }
            .bubble {
              position: absolute;
              bottom: 0;
              background: rgba(255,255,255,0.45);
              border-radius: 50%;
              animation: bubbleUpWide 2.2s infinite ease-out;
            }
            .bubble1 { width: 8px; height: 8px; left: 10%; animation-delay: 0s; }
            .bubble2 { width: 12px; height: 12px; left: 30%; animation-delay: 0.3s; }
            .bubble3 { width: 9px; height: 9px; left: 50%; animation-delay: 0.6s; }
            .bubble4 { width: 7px; height: 7px; left: 70%; animation-delay: 0.9s; }
            .bubble5 { width: 11px; height: 11px; left: 85%; animation-delay: 1.2s; }
            .bubble6 { width: 10px; height: 10px; left: 40%; animation-delay: 1.5s; }
            .bubble7 { width: 6px; height: 6px; left: 20%; animation-delay: 1.8s; }
          `}
        </style>
      </section>

      {/* ⭐ MODAL — เลือกตู้ระหว่างกำลังชาร์จ */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* BACKDROP */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          />

          {/* MODAL */}
          <div
            className="
              relative w-full max-w-[400px]
              bg-gradient-to-b from-blue-50 to-white
              rounded-3xl shadow-[0_10px_35px_rgba(0,0,0,0.15)]
              border border-blue-100
              overflow-hidden animate-fadeIn
            "
          >
            {/* CLOSE BUTTON */}
            <button
              onClick={() => setModalOpen(false)}
              className="
                absolute top-3 right-3 p-2 rounded-full hover:bg-blue-100 active:scale-90 transition
              "
            >
              <svg
                className="w-5 h-5 text-blue-600"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 L6 18" strokeLinecap="round" />
                <path d="M6 6 L18 18" strokeLinecap="round" />
              </svg>
            </button>

            {/* CONTENT */}
            <div className="px-6 py-9 text-center flex flex-col items-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 blur-xl bg-blue-300 opacity-40 rounded-full"></div>

                <div
                  className="
                    relative z-10
                    w-16 h-16 flex items-center justify-center
                    rounded-full bg-gradient-to-b from-blue-100 to-blue-200
                    border border-blue-300 shadow-inner
                  "
                >
                  <FaBolt className="w-7 h-7 text-blue-700" />
                </div>
              </div>

              <h3 className="text-xl font-bold text-blue-900 tracking-tight">
                You are charging
              </h3>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed max-w-[260px]">
                Select a station to check status or add power.
              </p>
            </div>

            {/* LIST CABINETS */}
            <div className="px-5 space-y-3 pb-4 max-h-[240px] overflow-y-auto">
              {sessions.map((s: any, i: number) => (
                <button
                  key={i}
                  onClick={() => goToCabinet(s)}
                  className="
                    w-full flex flex-col items-start text-left
                    bg-white border border-blue-200 
                    rounded-2xl px-4 py-3
                    shadow-sm hover:shadow-md
                    hover:bg-blue-50 active:scale-[0.98]
                    transition-all
                  "
                >
                  <div className="font-semibold text-blue-700 text-sm">
                    🔌 {s.Payment?.EVCabinet?.Name || "ไม่พบชื่อตู้"}
                  </div>

                  <div className="text-xs text-gray-600 mt-1">
                    📍 {s.Payment?.EVCabinet?.Location || "ไม่พบตำแหน่ง"}
                  </div>
                </button>
              ))}
            </div>

            {/* BUY MORE BUTTON */}
            <div className="px-6 pb-7">
              <button
                onClick={goToBuyMore}
                className="
                  w-full py-3.5 rounded-xl font-semibold text-white
                  bg-gradient-to-r from-blue-600 to-sky-500
                  shadow-[0_4px_15px_rgba(56,132,255,0.45)]
                  hover:shadow-[0_6px_20px_rgba(56,132,255,0.55)]
                  active:scale-[0.97] transition
                "
              >
                Buy more power
              </button>
            </div>
          </div>

          {/* Animation */}
          <style>
            {`
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(14px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0px) scale(1); }
              }
              .animate-fadeIn {
                animation: fadeIn 0.25s ease-out;
              }
            `}
          </style>
        </div>
      )}
    </>
  );
};

export default Hero;