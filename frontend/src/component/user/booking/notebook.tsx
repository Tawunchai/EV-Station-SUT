import React, { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import { useNavigate } from "react-router-dom";
import { FaMapMarkerAlt } from "react-icons/fa";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Modal, Button, message } from "antd";

import {
  ListCabinetsEV,
  apiUrlPicture,
  GetCarByUserID,
} from "../../../services";
import type { EVCabinetInterface } from "../../../interface/IBooking";
import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";

/* =========================
   EV Bolt Icon
   ========================= */
const BoltIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z" fill="currentColor" />
  </svg>
);

/* =========================
   HeaderBar (Desktop)
   ========================= */
const HeaderBar: React.FC<{ title?: string; onBack?: () => void }> = ({
  title = "EV Station",
  onBack,
}) => {
  const goBack = () => (onBack ? onBack() : window.history.back());
  return (
    <header
      className="sticky top-0 z-20 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="w-full px-4 py-3 flex items-center gap-2 justify-start">
        <button
          onClick={goBack}
          aria-label="ย้อนกลับ"
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

        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-white">
            <path d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z" fill="currentColor" />
          </svg>
          <span className="text-base font-semibold tracking-wide">
            {title}
          </span>
        </div>
      </div>
    </header>
  );
};

/* =========================
   EV Marker Icon
   ========================= */
const createEVIcon = (selected: boolean) =>
  new L.DivIcon({
    html: `
      <div class="flex items-center justify-center ${selected ? "bg-blue-600 shadow-blue-400 scale-110" : "bg-blue-400 hover:bg-blue-500"
      } transition-all duration-200 rounded-full w-8 h-8 text-white shadow-md border-2 border-white">
        ⚡
      </div>`,
    iconSize: [36, 36],
    className: "animate-fadeIn",
  });

/* =========================
   Recenter Helper
   ========================= */
const RecenterOnChange: React.FC<{ center: [number, number]; zoom?: number }> = ({
  center,
  zoom = 15,
}) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: true });
  }, [center, zoom, map]);
  return null;
};

/* =========================
   EV MAP NOTEBOOK (DESKTOP)
   ========================= */
const EVMapNotebook: React.FC = () => {
  const [selected, setSelected] = useState<number | null>(null);
  const [cabinets, setCabinets] = useState<EVCabinetInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCarModal, setShowCarModal] = useState(false);
  const [userID, setUserID] = useState<number | undefined>(undefined);

  const navigate = useNavigate();

  // พิกัดเริ่มต้น = มทส.
  const SUT_CENTER: [number, number] = [14.8820, 102.0170];

  // ⭐ map center (ให้ map เลื่อนได้)
  const [mapCenter, setMapCenter] = useState<[number, number]>(SUT_CENTER);

  /* =========================
     โหลด user จาก cookie
     ========================= */
  useEffect(() => {
    const loadUser = async () => {
      let current = getCurrentUser();
      if (!current) current = await initUserProfile();

      const uid = current?.id;
      if (!uid) {
        message.error("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่");
        return;
      }
      setUserID(uid);
    };
    loadUser();
  }, []);

  /* =========================
     โหลดข้อมูลสถานี EV
     ========================= */
  useEffect(() => {
    const fetchCabinets = async () => {
      try {
        const res = await ListCabinetsEV();
        if (res && res.length > 0) {
          setCabinets(res);

          // ตั้งค่า center เป็นสถานีแรก
          const first = res[0];
          setMapCenter([first.Latitude, first.Longitude]);
        }
      } catch (error) {
        console.error("Error loading EV cabinets:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCabinets();
  }, []);

  /* =========================
     ตรวจรถผู้ใช้ก่อนจอง
     ========================= */
  const handleBookingClick = async (cabinet: EVCabinetInterface) => {
    if (!userID) {
      message.error("ไม่พบข้อมูลผู้ใช้ กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    try {
      const cars = await GetCarByUserID(userID);
      if (!cars || cars.length === 0) {
        setShowCarModal(true);
        return;
      }
      navigate("/user/booking-date", { state: { cabinet } });
    } catch (err) {
      console.error(err);
      setShowCarModal(true);
    }
  };

  /* =========================
     ถ้าไม่มีข้อมูล
     ========================= */
  if (!loading && cabinets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-screen text-gray-500">
        <BoltIcon className="h-6 w-6 text-blue-500 mb-2" />
        <p>ไม่พบข้อมูลสถานีชาร์จไฟฟ้า</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-gradient-to-b from-blue-50 to-blue-100 flex flex-col">
      <HeaderBar onBack={() => navigate(-1)} />

      {/* MAP */}
      <div className="flex-1 relative">
        <MapContainer
          center={mapCenter}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          className="z-10"
        >
          <RecenterOnChange center={mapCenter} zoom={15} />

          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

          {cabinets.map((cabinet) => (
            <Marker
              key={cabinet.ID}
              position={[cabinet.Latitude, cabinet.Longitude]}
              icon={createEVIcon(selected === cabinet.ID)}
              eventHandlers={{
                click: () => {
                  setSelected(cabinet.ID);
                  setMapCenter([cabinet.Latitude, cabinet.Longitude]);
                },
              }}
            />
          ))}
        </MapContainer>

        {/* Floating Cards */}
        {cabinets.length > 0 && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full flex justify-center z-20">
            <div className="flex gap-4 overflow-x-auto max-w-5xl px-4 pb-2 scrollbar-hide">
              {cabinets.map((cabinet) => (
                <div
                  key={cabinet.ID}
                  onClick={() => {
                    setSelected(cabinet.ID);
                    setMapCenter([cabinet.Latitude, cabinet.Longitude]); // ⭐ ทำให้ map เลื่อนได้!
                  }}
                  className={`min-w-[200px] bg-white rounded-xl p-3 shadow-md border cursor-pointer transition-all duration-300 ${selected === cabinet.ID
                    ? "border-blue-500 shadow-blue-300 scale-105"
                    : "border-gray-200"
                    }`}
                >
                  <div className="relative w-[200px] h-32 rounded-lg overflow-hidden">
                    <img
                      src={`${apiUrlPicture}${cabinet.Image}`}
                      alt={cabinet.Name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 right-1 bg-white/90 text-blue-700 text-[10px] px-2 py-0.5 rounded-full">
                      {cabinet.Status}
                    </div>
                  </div>

                  <h2 className="font-semibold text-blue-800 text-sm mt-2 truncate">
                    {cabinet.Name}
                  </h2>

                  <p className="text-gray-600 text-xs truncate flex items-center gap-1">
                    <FaMapMarkerAlt className="text-blue-500" />
                    {cabinet.Location}
                  </p>
                  <p className="text-[11px] text-gray-400 flex items-center gap-1 w-[200px] ml-0.5">
                    {cabinet.Employee
                      ? `รายละเอียด ${cabinet.Description || ""}`
                      : "ไม่มีรายละเอียด"}
                  </p>

                  <button
                    onClick={() => handleBookingClick(cabinet)}
                    className="mt-3 w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-lg transition"
                  >
                    Reserve this charging point
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="absolute bottom-1 w-full text-center text-[10px] text-gray-400">
        ⚡ EV Smart Charging App © {new Date().getFullYear()}
      </div>

      {/* MODAL */}
      <Modal
        open={showCarModal}
        onCancel={() => setShowCarModal(false)}
        footer={null}
        centered
      >
        <div className="text-center">
          <div className="text-4xl mb-3">🚗</div>
          <h3 className="text-lg font-semibold text-blue-700">ไม่พบข้อมูลรถของคุณ</h3>
          <p className="text-gray-600 mb-5">Before making a reservation, please add your vehicle information to the system.</p>

          <div className="flex justify-center gap-3">
            <Button onClick={() => setShowCarModal(false)}>ยกเลิก</Button>

            <Button type="primary" onClick={() => navigate("/user/add-cars")}>
              ไปเพิ่มข้อมูลรถ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default EVMapNotebook;
