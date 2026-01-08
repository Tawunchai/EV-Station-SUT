import React, { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AiFillHome } from "react-icons/ai";
import { HiOutlineMap } from "react-icons/hi";
import { FaBolt } from "react-icons/fa";
import { RiNewspaperLine } from "react-icons/ri";
import { FiUser } from "react-icons/fi";

import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";
import { GetChargingSessionByStatusAndUserID } from "../../../services";

type Tab = {
  key: string;
  label: string;
  to: string;
  icon: React.ReactNode;
  "aria-label": string;
};

const Footer: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const [userID, setUserID] = useState<number | null>(null);

  const [isChargingActive, setIsChargingActive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [sessions, setSessions] = useState<any[]>([]);

  // ✅ ป้องกัน setState หลัง unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // ⭐ โหลด user
  useEffect(() => {
    const loadUser = async () => {
      let user = getCurrentUser();
      if (!user) user = await initUserProfile();
      if (!mountedRef.current) return;
      if (user?.id) setUserID(user.id);
    };
    loadUser();
  }, []);

  // ✅ helper: session active ต้องมี PaymentID จริง (ไม่ใช่ null/0/undefined) และมีตู้จริง
  const isValidActiveSession = (s: any) => {
    const statusOk = s?.Status === true || s?.Status === 1;

    const paymentId = s?.PaymentID;
    const paymentIdOk =
      paymentId !== null &&
      paymentId !== undefined &&
      paymentId !== "" &&
      Number(paymentId) > 0;

    const cabinetId = s?.Payment?.EVCabinetID;
    const cabinetIdOk =
      cabinetId !== null &&
      cabinetId !== undefined &&
      cabinetId !== "" &&
      Number(cabinetId) > 0;

    return statusOk && paymentIdOk && cabinetIdOk;
  };

  // ⭐ โหลด session ที่กำลังชาร์จ
  useEffect(() => {
    const loadSession = async () => {
      if (!userID) return;

      const res = await GetChargingSessionByStatusAndUserID(userID);
      const list = res?.data || [];

      // ✅ กรองเฉพาะ session ที่ "active จริง" (มี PaymentID + EVCabinetID)
      const active = Array.isArray(list)
        ? list.filter((s: any) => isValidActiveSession(s))
        : [];

      if (!mountedRef.current) return;

      setSessions(active);
      setIsChargingActive(active.length > 0);

      // ✅ ถ้าไม่มี active จริง ให้ปิด modal เผื่อค้าง
      if (active.length === 0) setModalOpen(false);
    };

    loadSession();
  }, [userID]);

  // ⭐ ไปยังหน้า charging พร้อมส่งค่าไปด้วย
  const goToCabinet = (session: any) => {
    // ✅ Safety: ถ้า session ไม่ valid จริง ๆ ไม่ให้ไป และกลับไป Start/Charge ปกติ
    if (!isValidActiveSession(session)) {
      setModalOpen(false);
      setIsChargingActive(false);
      setSessions([]);
      return;
    }

    navigate("/user/charging", {
      state: {
        paymentID: session.PaymentID,
        cabinet_id: session.Payment?.EVCabinetID,
      },
    });
    setModalOpen(false);
  };

  // ⭐ ซื้อไฟฟ้าเพิ่ม
  const goToBuyMore = () => {
    setModalOpen(false);
    navigate("/user/evs-selector");
  };

  const tabs: Tab[] = [
    {
      key: "home",
      label: "Home",
      to: "/",
      icon: <AiFillHome />,
      "aria-label": "home",
    },
    {
      key: "map",
      label: "Map",
      to: "/user/map",
      icon: <HiOutlineMap />,
      "aria-label": "map",
    },
    {
      key: "charge",
      label: "Charge",
      to: "/user/evs-selector",
      icon: <FaBolt />,
      "aria-label": "charge",
    },
    {
      key: "news",
      label: "News",
      to: "/user/all-news",
      icon: <RiNewspaperLine />,
      "aria-label": "news",
    },
    {
      key: "account",
      label: "Account",
      to: "/user/profile",
      icon: <FiUser />,
      "aria-label": "account",
    },
  ];

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <>
      {/* FOOTER */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto max-w-screen-sm px-3">
          <div
            className="relative rounded-2xl bg-white/95 backdrop-blur border border-gray-100 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] pb-2 pt-1"
            style={{ paddingBottom: "max(10px, env(safe-area-inset-bottom))" }}
          >
            <ul className="grid grid-cols-5 items-end">
              {tabs.map((tab) => {
                const active = isActive(tab.to);

                // ⭐ ปุ่มชาร์จ
                if (tab.key === "charge") {
                  return (
                    <li key={tab.key} className="flex justify-center">
                      <button
                        onClick={() =>
                          isChargingActive
                            ? setModalOpen(true)
                            : navigate("/user/evs-selector")
                        }
                        aria-label="charge"
                        className="-translate-y-2 pb-1 transition-all duration-200 rounded-full shadow-lg relative"
                      >
                        <div
                          className={
                            isChargingActive
                              ? "relative flex h-14 w-14 items-center justify-center rounded-full text-white bg-orange-500 ring-4 ring-white shadow-lg overflow-hidden"
                              : "relative flex h-14 w-14 items-center justify-center rounded-full text-white bg-gradient-to-b from-blue-500 to-blue-600 ring-4 ring-white"
                          }
                        >
                          {isChargingActive && (
                            <>
                              <span className="bubble bubble1"></span>
                              <span className="bubble bubble2"></span>
                              <span className="bubble bubble3"></span>
                              <span className="bubble bubble4"></span>
                            </>
                          )}
                          <FaBolt className="text-xl" />
                        </div>

                        <div
                          className={
                            isChargingActive
                              ? "mt-1 text-center text-[11px] font-semibold text-orange-600"
                              : "mt-1 text-center text-[11px] font-semibold text-blue-700"
                          }
                        >
                          {isChargingActive ? "Charging" : tab.label}
                        </div>
                      </button>
                    </li>
                  );
                }

                return (
                  <li key={tab.key} className="flex justify-center">
                    <NavLink
                      to={tab.to}
                      aria-label={tab["aria-label"]}
                      className="flex flex-col items-center gap-1 py-3 w-full"
                    >
                      <span
                        className={`grid place-items-center h-9 w-9 rounded-xl transition-colors ${
                          active ? "bg-blue-50 text-blue-600" : "text-gray-400"
                        }`}
                      >
                        <span className="text-[20px]">{tab.icon}</span>
                      </span>

                      <span
                        className={`text-[11px] font-medium transition-colors ${
                          active ? "text-blue-600" : "text-gray-400"
                        }`}
                      >
                        {tab.label}
                      </span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </nav>

      {/* ⭐ EV Premium Select Cabinet Modal — Blue Gradient */}
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
            {/* CLOSE (X) */}
            <button
              onClick={() => setModalOpen(false)}
              className="
                absolute top-3 right-3
                p-2 rounded-full
                hover:bg-blue-100 active:scale-90 transition
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
              {/* ICON + HALO */}
              <div className="relative mb-6">
                <div className="absolute inset-0 blur-xl bg-blue-300 opacity-40 rounded-full"></div>

                <div
                  className="
                    relative z-10
                    w-16 h-16 flex items-center justify-center
                    rounded-full
                    bg-gradient-to-b from-blue-100 to-blue-200
                    border border-blue-300 shadow-inner
                  "
                >
                  <FaBolt className="w-7 h-7 text-blue-700 drop-shadow-md" />
                </div>
              </div>

              {/* TITLE */}
              <h3 className="text-xl font-bold text-blue-900 tracking-tight">
                You are charging
              </h3>

              {/* DESCRIPTION */}
              <p className="text-sm text-gray-600 mt-2 leading-relaxed max-w-[260px]">
                Select a station to check status or add power.
              </p>
            </div>

            {/* ⭐ LIST CABINETS */}
            <div className="px-5 space-y-3 pb-4 max-h-[240px] overflow-y-auto">
              {sessions.map((s: any, i: number) => (
                <button
                  key={i}
                  onClick={() => goToCabinet(s)}
                  className="
                    w-full flex flex-col items-start text-left
                    bg-white
                    border border-blue-200 
                    rounded-2xl px-4 py-3
                    shadow-sm hover:shadow-md
                    hover:bg-blue-50 active:scale-[0.98]
                    transition-all
                  "
                >
                  <div className="font-semibold text-blue-700 text-sm leading-tight">
                    🔌 {s.Payment?.EVCabinet?.Name || "ไม่พบชื่อตู้"}
                  </div>

                  <div className="text-xs text-gray-600 mt-1 leading-tight">
                    📍 {s.Payment?.EVCabinet?.Location || "ไม่พบตำแหน่ง"}
                  </div>
                </button>
              ))}
            </div>

            {/* BUTTON: BUY MORE */}
            <div className="px-6 pb-7 pt-2">
              <button
                onClick={goToBuyMore}
                className="
                  w-full py-3.5 rounded-xl font-semibold
                  bg-gradient-to-r from-blue-600 to-sky-500
                  text-white shadow-[0_4px_15px_rgba(56,132,255,0.45)]
                  hover:shadow-[0_6px_20px_rgba(56,132,255,0.55)]
                  active:scale-[0.97] transition-all
                "
              >
                Buy more power
              </button>
            </div>
          </div>

          {/* Fade Animation */}
          <style>
            {`
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(14px) scale(0.96); }
                to   { opacity: 1; transform: translateY(0px) scale(1); }
              }
              .animate-fadeIn {
                animation: fadeIn 0.25s ease-out;
              }

              @keyframes bubbleUpWide {
                0% { transform: translateY(16px) scale(0.3); opacity: 0; }
                40% { opacity: 0.45; }
                100% { transform: translateY(-28px) scale(1.2); opacity: 0; }
              }
              .bubble {
                position: absolute;
                bottom: 0;
                background: rgba(255,255,255,0.45);
                border-radius: 50%;
                animation: bubbleUpWide 2.2s infinite ease-out;
              }
              .bubble1 { width: 8px; height: 8px; left: 20%; animation-delay: 0s; }
              .bubble2 { width: 11px; height: 11px; left: 40%; animation-delay: 0.35s; }
              .bubble3 { width: 7px; height: 7px; left: 60%; animation-delay: 0.7s; }
              .bubble4 { width: 10px; height: 10px; left: 75%; animation-delay: 1.05s; }
            `}
          </style>
        </div>
      )}
    </>
  );
};

export default Footer;