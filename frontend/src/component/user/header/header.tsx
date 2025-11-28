// ===============================
// FULL CODE 100% — HEADER WITH EV MAP (FIXED MOBILE MENU)
// ===============================

import { useEffect, useRef, useState } from "react";
import { BiMenuAltRight } from "react-icons/bi";
import { GiTwoCoins } from "react-icons/gi";
import { FaCarSide } from "react-icons/fa";
import { MdOutlineReport, MdMap } from "react-icons/md";
import { useNavigate } from "react-router-dom";
import { message } from "antd";

import ReportModal from "./report/index";

import {
  getUserByID,
  apiUrlPicture,
  GetReportByID,
  ListCabinetsEV,
} from "../../../services";

import {
  clearCachedUser,
  getCurrentUser,
  initUserProfile,
  Logout,
} from "../../../services/httpLogin";

import type { UsersInterface } from "../../../interface/IUser";
import type { EVCabinetInterface } from "../../../interface/IBooking";
import type { ReportInterface } from "../../../interface/IReport";

/* ===============================
   Leaflet
================================ */
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface HeaderProps {
  scrollToValue?: () => void;
  scrollToNew?: () => void;
}

const Header: React.FC<HeaderProps> = ({}) => {
  const navigate = useNavigate();

  const [menuOpened, setMenuOpened] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const [mapOpen, setMapOpen] = useState(false);
  const [stations, setStations] = useState<EVCabinetInterface[]>([]);

  const [user, setUser] = useState<UsersInterface | null>(null);

  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);

  const [messageApi, contextHolder] = message.useMessage();

  /* ===============================
      Load User
  =============================== */
  useEffect(() => {
    (async () => {
      try {
        let current = getCurrentUser();
        if (!current) current = await initUserProfile();
        const uid = current?.id;

        if (!uid) return;

        const res = await getUserByID(uid);
        if (res) setUser(res);
      } catch {}
    })();
  }, []);

  /* ===============================
      Load EV Stations
  =============================== */
  useEffect(() => {
    (async () => {
      const res = await ListCabinetsEV();
      if (Array.isArray(res)) setStations(res);
    })();
  }, []);

  /* ===============================
      Auto-close Map when clicking outside
  =============================== */
  useEffect(() => {
    if (!mapOpen) return;

    const onClick = (e: MouseEvent) => {
      if (!mapWrapRef.current?.contains(e.target as Node)) {
        setMapOpen(false);
      }
    };

    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [mapOpen]);

  /* ===============================
      Custom EV Icon
  =============================== */
  const makeEVIcon = (active: boolean) =>
    L.divIcon({
      html: `<div class="ev-pin ${active ? "active" : ""}">⚡</div>`,
      className: "",
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

  /* ===============================
      FIX: Destroy map when closed
  =============================== */
  useEffect(() => {
    if (!mapOpen) {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
    }
  }, [mapOpen]);

  /* ===============================
      Init Map
  =============================== */
  useEffect(() => {
    if (!mapOpen) return;
    if (!mapElRef.current) return;
    if (!stations.length) return;

    if (mapInstance.current) {
      mapInstance.current.invalidateSize();
      return;
    }

    const first = stations[0];

    const map = L.map(mapElRef.current, {
      center: [first.Latitude, first.Longitude],
      zoom: 14,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
      map
    );

    mapInstance.current = map;

    stations.forEach((st) => {
      const mk = L.marker([st.Latitude, st.Longitude], {
        icon: makeEVIcon(false),
      }).addTo(map);

      mk.bindPopup(`
        <b>${st.Name}</b><br/>
        ${st.Location}<br/>
        <button id="gm-${st.ID}"
          style="
            margin-top:5px; padding:4px 10px;
            background:#2563eb; color:white;
            border:none; border-radius:6px;
          "
        >
          นำทาง
        </button>
      `);

      mk.on("click", () => {
        mk.setIcon(makeEVIcon(true));
        mk.openPopup();

        setTimeout(() => {
          const btn = document.getElementById(`gm-${st.ID}`);
          if (btn) {
            btn.onclick = () =>
              window.open(
                `https://www.google.com/maps/dir/?api=1&destination=${st.Latitude},${st.Longitude}`,
                "_blank"
              );
          }
        }, 40);
      });

      mk.on("popupclose", () => mk.setIcon(makeEVIcon(false)));
    });
  }, [mapOpen, stations]);

  /* ===============================
      Report Logic
  =============================== */
  const handleOpenReport = async () => {
    try {
      let current = getCurrentUser();
      if (!current) current = await initUserProfile();
      const uid = current?.id ?? 0;

      const report: ReportInterface | null = await GetReportByID(uid);

      if (!report) {
        setModalOpen(true);
        return;
      }

      const now = new Date();
      const last = new Date(report.CreatedAt ?? "");
      const diff = (now.getTime() - last.getTime()) / (1000 * 86400);

      if (diff <= 7) {
        messageApi.warning("คุณรายงานไปแล้วภายในสัปดาห์นี้");
      } else {
        setModalOpen(true);
      }
    } catch {
      messageApi.error("ไม่สามารถตรวจสอบข้อมูลได้");
    }
  };

  /* ===============================
      Logout
  =============================== */
  const handleLogout = async () => {
    try {
      const ok = await Logout();
      if (ok) {
        messageApi.success("ออกจากระบบแล้ว");

        setTimeout(() => {
          clearCachedUser();
          localStorage.removeItem("role");
          window.dispatchEvent(new Event("roleChange"));
          navigate("/login", { replace: true });
        }, 800);
      }
    } catch {
      messageApi.error("ผิดพลาดระหว่าง Logout");
    }
  };

  const btnEqual =
    "inline-flex h-10 items-center gap-2 rounded-xl bg-white px-3 text-sm font-semibold text-blue-600 hover:bg-blue-50";

  return (
    <>
      {contextHolder}

      {/* HEADER */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-md">
        <div className="mx-auto flex max-w-screen-xl items-center justify-between px-4 py-3">
          <button onClick={() => navigate("/user")} className="font-semibold">
            EV Station
          </button>

          {/* Desktop */}
          <nav className="hidden md:flex items-center gap-3">
            <button onClick={handleOpenReport} className={btnEqual}>
              <MdOutlineReport className="text-blue-600" />
              Report
            </button>

            {/* MAP BUTTON */}
            <div className="relative" ref={mapWrapRef}>
              <button
                onClick={() => setMapOpen((s) => !s)}
                className={btnEqual}
              >
                <MdMap className="text-blue-600" />
                Map
              </button>

              {mapOpen && (
                <div className="absolute right-0 mt-2 w-[560px] rounded-2xl border border-gray-200 bg-white shadow-2xl z-50">
                  <div className="px-4 py-3 flex justify-between items-center border-b">
                    <span className="font-semibold text-sm text-gray-900">
                      All Stations
                    </span>
                    <button
                      onClick={() => setMapOpen(false)}
                      className="text-xs px-2 py-1 rounded-lg hover:bg-gray-100"
                    >
                      Close
                    </button>
                  </div>

                  <div ref={mapElRef} style={{ width: "100%", height: 380 }} />

                  <div className="bg-gray-50 text-xs px-4 py-2 text-gray-700">
                    All {stations.length} Stations
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate("/user/add-cars")}
              className={btnEqual}
            >
              <FaCarSide className="text-blue-600" /> Add Car
            </button>

            {user && (
              <button
                onClick={() => navigate("/user/my-coins")}
                className={btnEqual}
              >
                <GiTwoCoins className="text-blue-600" />
                My Coins: <b>{user.Coin}</b>
              </button>
            )}

            <button onClick={handleLogout} className={btnEqual}>
              Logout
            </button>

            <button onClick={() => navigate("/user/profile")} className="ml-2">
              <img
                src={
                  user?.Profile ? `${apiUrlPicture}${user.Profile}` : undefined
                }
                alt="profile"
                className="h-9 w-9 rounded-full object-cover ring-2 ring-white/30"
              />
            </button>
          </nav>

          {/* Mobile */}
          <button
            className="md:hidden h-10 w-10 flex items-center justify-center rounded-xl hover:bg-white/10"
            onClick={() => setMenuOpened((s) => !s)}
          >
            <BiMenuAltRight size={28} />
          </button>
        </div>
      </header>

      {/* MOBILE MENU (Bottom Sheet) */}
      {menuOpened && (
        <>
          {/* คลิกพื้นหลังดำเพื่อปิด */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setMenuOpened(false)}
          />

          <div className="fixed inset-x-0 bottom-0 bg-white p-4 rounded-t-3xl shadow-2xl z-50 animate-[sheetUp_180ms_ease-out]">
            {/* แถบลาก + ปุ่มปิด */}
            <div className="relative mb-2 flex items-center justify-center">
              <div className="h-1.5 w-12 bg-gray-300 rounded-full" />
              <button
                onClick={() => setMenuOpened(false)}
                className="absolute right-1 p-2 rounded-full hover:bg-gray-100"
                aria-label="Close menu"
              >
                <svg
                  className="w-5 h-5 text-gray-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M18 6 L6 18" strokeLinecap="round" />
                  <path d="M6 6 L18 18" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            <button
              onClick={() => {
                handleOpenReport();
                // ไม่ต้องปิดเมนูทันที ถ้าอยากให้ปิดก็ uncomment บรรทัดล่าง
                // setMenuOpened(false);
              }}
              className="w-full rounded-xl px-4 py-3 text-left text-gray-800 hover:bg-gray-50"
            >
              รายงานปัญหา (Report)
            </button>

            {/* ปุ่ม My Coins */}
            {user && (
              <button
                onClick={() => {
                  navigate("/user/my-coins");
                  setMenuOpened(false);
                }}
                className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
              >
                <GiTwoCoins className="text-lg" />
                My Coins: <b>{user.Coin}</b>
              </button>
            )}

            {/* โปรไฟล์ */}
            <div className="mt-3 flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
              <div className="flex items-center gap-2">
                <img
                  src={
                    user?.Profile ? `${apiUrlPicture}${user.Profile}` : undefined
                  }
                  alt="profile"
                  className="h-9 w-9 rounded-full object-cover ring-1 ring-gray-200"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><rect width='100%' height='100%' fill='%23e5e7eb'/></svg>";
                  }}
                />
                <div className="text-sm">
                  <div className="font-semibold text-gray-900">
                    {user
                      ? `${user.FirstName ?? ""} ${user.LastName ?? ""}`
                      : "Guest"}
                  </div>
                  <div className="text-gray-500">Profile</div>
                </div>
              </div>
              <button
                onClick={() => {
                  navigate("/user/profile");
                  setMenuOpened(false);
                }}
                className="rounded-lg px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50"
              >
                open
              </button>
            </div>

            {/* Logout */}
            <button
              onClick={() => {
                handleLogout();
                setMenuOpened(false);
              }}
              className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white"
            >
              Logout
            </button>
          </div>
        </>
      )}

      {/* REPORT MODAL */}
      <ReportModal open={modalOpen} onClose={() => setModalOpen(false)} />

      {/* EV PIN ICON */}
      <style>
        {`
          .ev-pin {
            width: 36px;
            height: 36px;
            border-radius: 999px;
            background: #3b82f6;
            color: white;
            display: grid;
            place-items: center;
            font-size: 18px;
            border: 2px solid white;
            box-shadow: 0 6px 16px rgba(59,130,246,0.35);
            transform: translate(-50%, -50%) scale(1);
            transition: 0.18s;
          }
          .ev-pin.active {
            background: #2563eb;
            transform: translate(-50%, -50%) scale(1.12);
            box-shadow: 0 10px 26px rgba(37,99,235,0.55);
          }

          @keyframes sheetUp {
            from { transform: translateY(100%); opacity: 0.3; }
            to { transform: translateY(0%); opacity: 1; }
          }
        `}
      </style>
    </>
  );
};

export default Header;
