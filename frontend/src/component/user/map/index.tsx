// ===============================
// FULL CODE: EV Map + ListCabinetsEV
// ===============================

import React, { useEffect, useRef, useState } from "react";
import Footer from "../../../component/user/footer/footer";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { ListCabinetsEV, apiUrlPicture } from "../../../services";
import type { EVCabinetInterface } from "../../../interface/IBooking";

// Fix default marker warnings
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/* =========================
   UI Helper
   ========================= */
const formatNow = () => {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")} n.`;
};

const StatusBadge: React.FC<{ s: string }> = ({ s }) => {
  const cls =
    s === "Active"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span className={`rounded-xl border px-3 py-1 text-[12px] ${cls}`}>{s}</span>
  );
};

/* =========================
   MAIN COMPONENT
   ========================= */
const Index: React.FC = () => {
  const [stations, setStations] = useState<EVCabinetInterface[]>([]);
  const [selectedStation, setSelectedStation] =
    useState<EVCabinetInterface | null>(null);

  const [sheetOpen, setSheetOpen] = useState<"peek" | "half">("peek");
  const [infoOpen, setInfoOpen] = useState(false);

  // Leaflet refs
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markerRefs = useRef<Record<number, L.Marker>>({});

  // ========================
  // Load Stations
  // ========================
  useEffect(() => {
    (async () => {
      const res = await ListCabinetsEV();
      if (res) setStations(res);
    })();
  }, []);

  // ========================
  // Create Custom EV Icon
  // ========================
  const makeEVIcon = (active: boolean) =>
    L.divIcon({
      html: `<div class="ev-pin ${active ? "active" : ""}">⚡</div>`,
      className: "",
      iconSize: [36, 36],
    });

  // ========================
  // Init Map
  // ========================
  useEffect(() => {
    if (!mapEl.current || !stations.length || mapInstance.current) return;

    const first = stations[0];

    const map = L.map(mapEl.current, {
      center: [first.Latitude, first.Longitude],
      zoom: 15,
      zoomControl: true,
      scrollWheelZoom: true,
    });
    mapInstance.current = map;

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(
      map
    );

    stations.forEach((st) => {
      const mk = L.marker([st.Latitude, st.Longitude], {
        icon: makeEVIcon(false),
      }).addTo(map);

      markerRefs.current[st.ID] = mk;

      mk.bindPopup(
        `<b>${st.Name}</b><br/>${st.Location}<br/><i>${st.Description}</i>`
      );

      // ✅ คลิก marker → เปิด modal
      mk.on("click", () => {
        setSelectedStation(st);
        setInfoOpen(true);
        mk.setIcon(makeEVIcon(true));
        mk.openPopup();
      });

      mk.on("popupclose", () => mk.setIcon(makeEVIcon(false)));
    });
  }, [stations]);

  // ========================
  // Focus Station from List (NO MODAL)
  // ========================
  const focusStation = (st: EVCabinetInterface) => {
    setSelectedStation(st); // highlight only

    if (mapInstance.current) {
      mapInstance.current.setView([st.Latitude, st.Longitude], 17, {
        animate: true,
      });
    }

    const mk = markerRefs.current[st.ID];
    if (mk) {
      mk.setIcon(makeEVIcon(true));
      mk.openPopup();
    }

    // ❌ ห้ามเปิด modal จาก bottom sheet
    // setInfoOpen(true);
  };

  // ========================
  // Google Maps Navigation
  // ========================
  const openGoogleMaps = (st: EVCabinetInterface) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${st.Latitude},${st.Longitude}`;
    window.open(url, "_blank");
  };

  const sheetHeight = sheetOpen === "peek" ? "36vh" : "50vh";

  return (
    <div className="relative min-h-screen bg-white">
      {/* Map */}
      <div className="absolute inset-0 z-[10]">
        <div ref={mapEl} style={{ height: "100%", width: "100%" }} />
      </div>

      {/* Modal info (เฉพาะเมื่อกด marker) */}
      {infoOpen && selectedStation && (
        <div
          className="fixed left-0 right-0 z-30 mx-auto max-w-screen-sm px-3"
          style={{ bottom: `calc(${sheetHeight} + 12px)` }}
        >
          <div className="rounded-3xl bg-white shadow-xl ring-1 ring-black/5 p-4">
            <div className="flex items-start justify-between">
              <StatusBadge s={selectedStation.Status} />
              <button
                onClick={() => setInfoOpen(false)}
                className="h-9 w-9 grid place-items-center rounded-xl hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            {/* Title */}
            <div className="mt-3 flex items-center gap-3">
              <img
                src={`${apiUrlPicture}${selectedStation.Image}`}
                className="h-14 w-14 object-cover rounded-xl ring-1 ring-blue-100"
              />

              <div>
                <h3 className="font-semibold text-gray-900">
                  {selectedStation.Name}
                </h3>
                <p className="text-sm text-gray-500">
                  {selectedStation.Location}
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="mt-3 text-sm text-gray-600 line-clamp-3">
              {selectedStation.Description}
            </p>

            <div className="mt-4 flex gap-3">
              <button
                onClick={() => openGoogleMaps(selectedStation)}
                className="flex-1 rounded-2xl border border-blue-300 py-3 text-blue-700"
              >
                navigate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Sheet */}
      <div
        className="fixed inset-x-0 z-20 mx-auto max-w-screen-sm rounded-t-3xl bg-white shadow-[0_-10px_30px_rgba(0,0,0,0.12)] transition-[height] duration-200"
        style={{ height: sheetHeight, bottom: 0 }}
      >
        <div className="px-4 pb-2">
          <div className="flex items-center justify-between py-2">
            <div>
              <span className="text-gray-500">
                Found <b className="text-blue-600">{stations.length}</b> Station
              </span>
              <div className="text-[12px] text-gray-400">
                Latest update {formatNow()}
              </div>
            </div>

            <button
              onClick={() =>
                setSheetOpen((v) => (v === "peek" ? "half" : "peek"))
              }
              className="h-9 w-9 grid place-items-center border rounded-xl"
            >
              ⌃
            </button>
          </div>

          <div className="mt-2 h-[calc(100%-84px)] overflow-y-auto pb-28">
            {stations.map((st) => (
              <article
                key={st.ID}
                onClick={() => focusStation(st)}
                className="flex gap-3 py-3 border-b border-gray-100 active:bg-gray-50 px-2 rounded-xl -mx-2"
              >
                <img
                  src={`${apiUrlPicture}${st.Image}`}
                  className="h-12 w-12 object-cover rounded-xl ring-1 ring-blue-100"
                />

                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-gray-900">
                    {st.Name}
                  </h3>
                  <p className="truncate text-sm text-gray-500">
                    {st.Location}
                  </p>

                  <div className="mt-1 flex gap-2 items-center">
                    <StatusBadge s={st.Status} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {/* Custom EV Pin */}
      <style>{`
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
          box-shadow: 0 6px 16px rgba(59, 130, 246, 0.35);
          transform: translate(-50%, -50%) scale(1);
          transition: 0.18s;
        }
        .ev-pin.active {
          background: #2563eb;
          transform: translate(-50%, -50%) scale(1.12);
          box-shadow: 0 10px 26px rgba(37, 99, 235, 0.55);
        }
      `}</style>

      <Footer />
    </div>
  );
};

export default Index;