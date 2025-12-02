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
import type { CarsInterface } from "../../../interface/ICar";
import { getCurrentUser, initUserProfile } from "../../../services/httpLogin";

/* =========================
   EV Bolt Icon (minimal)
   ========================= */
const BoltIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
    <path d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z" fill="currentColor" />
  </svg>
);

/* =========================
   HeaderBar (Mobile)
   ========================= */
const HeaderBar: React.FC<{ title?: string; onBack?: () => void }> = ({
  title = "EV Station",
  onBack,
}) => {
  const goBack = () => (onBack ? onBack() : window.history.back());
  return (
    <header
      className="sticky top-0 z-30 bg-gradient-to-r from-blue-600 to-sky-500 text-white rounded-b-2xl shadow-md overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="w-full px-4 py-3 flex items-center gap-2 justify-start">
        <button
          onClick={goBack}
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

        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 text-white">
            <path d="M13.5 2 4 13h6l-1.5 9L20 11h-6l1.5-9Z" fill="currentColor" />
          </svg>
          <span className="text-sm md:text-base font-semibold tracking-wide">
            {title}
          </span>
        </div>
      </div>
    </header>
  );
};

/* =========================
   EV Marker icon
   ========================= */
const createEVIcon = (selected: boolean) =>
  new L.DivIcon({
    html: `
      <div class="flex items-center justify-center ${selected
        ? "bg-blue-600 shadow-blue-400 scale-110"
        : "bg-blue-400 hover:bg-blue-500"
      } transition-all duration-200 rounded-full w-8 h-8 text-white shadow-md border-2 border-white">
        ⚡
      </div>`,
    iconSize: [36, 36],
    className: "animate-fadeIn",
  });

/* =========================
   Recenter helper (สำคัญ!)
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
   EVMapMobile Component
   ========================= */
const EVMapMobile: React.FC = () => {
  const [selected, setSelected] = useState<number | null>(null);
  const [cabinets, setCabinets] = useState<EVCabinetInterface[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCarModal, setShowCarModal] = useState(false);
  const [userID, setUserID] = useState<number | undefined>(undefined);
  const navigate = useNavigate();

  // พิกัดเริ่มต้น = มทส.
  const SUT_CENTER: [number, number] = [14.8820, 102.0170];

  // ⭐ NEW: Center ของแผนที่ (สำหรับคลิก Card)
  const [mapCenter, setMapCenter] = useState<[number, number]>(SUT_CENTER);

  /* ========== โหลด user ID ========== */
  useEffect(() => {
    const loadUser = async () => {
      try {
        let current = getCurrentUser();
        if (!current) current = await initUserProfile();

        const uid = current?.id;
        if (!uid) {
          message.error("User information not found. Please log in again");
          return;
        }

        setUserID(uid);
      } catch (error) {
        console.error("load user error:", error);
        message.error("Unable to retrieve user data.");
      }
    };
    loadUser();
  }, []);

  /* ========== โหลดข้อมูลสถานี ========== */
  useEffect(() => {
    const fetchCabinets = async () => {
      try {
        const res = await ListCabinetsEV();
        if (res) setCabinets(res);
      } catch (error) {
        console.error("Error loading EV cabinets:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchCabinets();
  }, []);

  /* ========== หา center เริ่มต้น ========== */
  useEffect(() => {
    if (cabinets.length > 0) {
      const first = cabinets[0];
      setMapCenter([first.Latitude, first.Longitude]);
    }
  }, [cabinets]);

  /* ========== ตรวจสอบว่าผู้ใช้มีรถไหม ก่อนกดจอง ========== */
  const handleBookingClick = async (cabinet: EVCabinetInterface) => {
    if (!userID) {
      message.error("User information not found. Please log in again");
      return;
    }

    try {
      const cars: CarsInterface[] | null = await GetCarByUserID(userID);
      if (!cars || cars.length === 0) {
        setShowCarModal(true);
        return;
      }
      navigate("/user/booking-date", { state: { cabinet } });
    } catch (error) {
      console.error("Error checking car:", error);
      setShowCarModal(true);
    }
  };

  /* ========== ถ้าไม่มีสถานีเลย ========== */
  if (!loading && !cabinets.length) {
    return (
      <div className="relative w-full h-screen bg-gradient-to-b from-blue-50 to-blue-100 overflow-hidden flex flex-col">
        <HeaderBar title="EV Station" onBack={() => navigate(-1)} />
        <div className="flex flex-1 items-center justify-center text-gray-500">
          <div className="text-center">
            <BoltIcon className="h-6 w-6 text-blue-500 mb-2" />
            <p>No information found on electric charging stations.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen bg-gradient-to-b from-blue-50 to-blue-100 overflow-hidden flex flex-col">
      <HeaderBar title="EV Station" onBack={() => navigate(-1)} />

      {/* Map */}
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
          <div className="absolute bottom-0 left-0 right-0 z-20 px-3 pb-3 bg-gradient-to-t from-blue-100/95 to-transparent">
            <div className="flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2">
              {cabinets.map((cabinet) => (
                <div
                  key={cabinet.ID}
                  onClick={() => {
                    setSelected(cabinet.ID);
                    setMapCenter([cabinet.Latitude, cabinet.Longitude]); // ⭐ สำคัญที่สุด
                  }}
                  className={`snap-center min-w-[200px] bg-white rounded-xl p-2 shadow-md border flex-shrink-0 transition-all duration-300 ${selected === cabinet.ID
                      ? "border-blue-500 shadow-blue-300 scale-105"
                      : "border-gray-100"
                    }`}
                >
                  {/* Image */}
                  <div className="relative w-[200px] h-24 rounded-lg overflow-hidden">
                    <img
                      src={`${apiUrlPicture}${cabinet.Image}`}
                      alt={cabinet.Name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "https://via.placeholder.com/200x120.png?text=EV";
                      }}
                    />
                    <div className="absolute top-1 right-1 bg-white/90 text-blue-700 text-[10px] px-1.5 py-0.5 rounded-full">
                      {cabinet.Status}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="mt-2 space-y-0.5">
                    <h2 className="font-semibold text-blue-800 text-[13px] truncate">
                      {cabinet.Name}
                    </h2>
                    <p className="text-gray-600 text-[11px] flex items-center gap-1 truncate">
                      <FaMapMarkerAlt className="text-blue-500 text-xs" />
                      {cabinet.Location}
                    </p>
                    <p className="text-[11px] text-gray-400 flex items-center gap-1 w-[200px] ml-0.5">
                      {cabinet.Employee
                        ? `details : ${cabinet.Description || ""}`
                        : "No details"}
                    </p>
                  </div>

                  <button
                    onClick={() => handleBookingClick(cabinet)}
                    className="mt-2 w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] rounded-lg shadow-sm transition-all"
                  >
                    Reserve this charging point
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-1 w-full text-center text-[10px] text-gray-400">
        ⚡ EV Smart Charging App © {new Date().getFullYear()}
      </div>

      <Modal
        open={showCarModal}
        footer={null}
        onCancel={() => setShowCarModal(false)}
        centered
      >
        <div className="flex flex-col items-center text-center mt-2 mb-1">
          <div className="text-4xl mb-3">🚗</div>

          <h3 className="text-lg font-semibold text-blue-700 mb-1">
            No car information found
          </h3>

          <p className="text-gray-600 mb-5">
            Before making a payment, please add your car information.
          </p>

          <div className="flex justify-center gap-3">
            <Button onClick={() => setShowCarModal(false)}>Cancel</Button>
            <Button
              type="primary"
              onClick={() => navigate("/user/add-cars")}
              className="bg-blue-600"
            >
              Go to add car
            </Button>
          </div>
        </div>
      </Modal>

      <style>
        {`
          .ev-modal-clean .ant-modal-content {
            border-radius: 20px !important;
            background: linear-gradient(180deg, #ffffff 0%, #f0f9ff 100%) !important;
            box-shadow: 0 8px 30px rgba(59,130,246,0.25) !important;
            text-align: center;
            padding: 32px 28px !important;
            border: none !important;
            animation: fadeIn 0.3s ease-out;
          }

          .ev-modal-clean .ant-modal-body {
            padding: 0 !important;
          }

          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }
        `}
      </style>
    </div>
  );
};

export default EVMapMobile;
