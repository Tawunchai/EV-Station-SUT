// src/page/admin/mornitor/solar/after-solar/index.tsx

import React, { useEffect, useState } from "react";
import {
  FiZap,
  FiBarChart2,
  FiBatteryCharging,
  FiSun,
} from "react-icons/fi";
import { FaCarSide } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";

import { connectSolarSocket } from "../../../../services";
import type { SolarInterface } from "../../../../interface/ISolar";

/** ---------- Types ---------- */
type Parameter = {
  name: string;
  value: string;
  status: "ON" | "OFF";
  icon: React.ReactNode;
};

// ✅ ปรับให้ตรงกับ JSON ที่ส่งมา
type SolarData = {
  device_id?: string;
  type?: string;
  payload?: {
    device_id?: string;
    timestamp?: string;
    data?: {
      battery_percentage?: number;
      battery_power?: number;
      current?: number;
      grid_power?: number;
      power_in?: number;
      power_out?: number;
      solar_irradiance?: number;
      status?: string;
      temperature?: number;
      voltage?: number;
    };
  };
};

/** ---------- Helper: แปลงชุดข้อมูลเป็น polyline points ---------- */
function toPolylinePoints(values: number[], width = 560, height = 120): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(0.0001, max - min);
  const stepX = width / Math.max(1, values.length - 1);

  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / range) * height; // ค่ามากอยู่ด้านบน
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

const Index: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // รับข้อมูล Solar จากหน้า BeforeSolar
  const solar =
    (location.state as { solar?: SolarInterface } | null)?.solar || null;

  // ---------- STATE ---------- //
  const [solarData, setSolarData] = useState<SolarData | null>(null);
  const [powerSeries, setPowerSeries] = useState<number[]>([]);
  const [isLive, setIsLive] = useState(false);

  // ---------- CONNECT WEBSOCKET ---------- //
  useEffect(() => {
    // ถ้าไม่มี Solar หรือไม่มี SolarPoint ให้ไม่ต้องเชื่อมต่อ
    if (!solar || !solar.SolarPoint) return;

    const deviceId = solar.SolarPoint; // เช่น "solar_001"

    const socket = connectSolarSocket((data: SolarData) => {
      // data ตรงกับ JSON: { device_id, payload: { data: {...}, timestamp }, type }
      setSolarData(data);
      setIsLive(true);

      // ✅ เก็บค่า power_in เพื่อใช้แสดงในกราฟย้อนหลัง
      const powerInRealtime = data?.payload?.data?.power_in;
      if (powerInRealtime !== undefined) {
        setPowerSeries((prev) => {
          const updated = [...prev, powerInRealtime];
          return updated.slice(-10); // เก็บไว้ 10 จุดล่าสุด
        });
      }
    }, deviceId);

    return () => {
      try {
        socket?.close();
      } catch {
        // ignore
      }
      setIsLive(false);
    };
  }, [solar]);

  // ---------- ถ้าไม่มี Solar (เข้าหน้านี้ตรง ๆ) ---------- //
  if (!solar) {
    return (
      <div className="min-h-screen bg-white mt-14 sm:mt-0">
        <header className="sticky top-0 z-20 bg-blue-600 text-white shadow-sm">
          <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center">
            <h1 className="text-sm sm:text-base font-semibold tracking-wide">
              Monitor Solar Station
            </h1>
          </div>
        </header>

        <div className="max-w-screen-xl mx-auto px-4 py-8">
          <p className="text-slate-600 mb-4">
            ไม่พบข้อมูล Solar ที่ส่งมาจากหน้าก่อนหน้า
          </p>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            ← กลับไปหน้าเลือก Solar
          </button>
        </div>
      </div>
    );
  }

  // ---------- เตรียมค่าที่จะใช้แสดง ---------- //
  const payloadData = solarData?.payload?.data;

  const powerIn = payloadData?.power_in ?? 0;
  const battery = payloadData?.battery_percentage ?? 0;
  const batteryPower = payloadData?.battery_power ?? 0;
  const gridPower = payloadData?.grid_power ?? 0;
  const powerOut = payloadData?.power_out ?? 0;
  const solarIrradiance = payloadData?.solar_irradiance ?? 0;
  const temperature = payloadData?.temperature ?? 0;
  const voltage = payloadData?.voltage ?? 0;
  const current = payloadData?.current ?? 0;
  const solarStatus = payloadData?.status ?? "Unknown";

  const updatedTime = solarData?.payload?.timestamp
    ? new Date(solarData.payload.timestamp).toLocaleTimeString()
    : "Waiting...";

  // ✅ ใช้ power_out เป็นโหลดฝั่ง EV
  const loadPower = powerOut;
  const batteryLabel = battery > 0 ? `${battery.toFixed(0)}%` : "None";

  const params: Parameter[] = [
    {
      name: "Power In",
      value: `${powerIn.toFixed(2)} W`,
      status: "ON",
      icon: <FiZap className="text-xl md:text-2xl text-blue-600" />,
    },
    {
      name: "Power Out",
      value: `${powerOut.toFixed(2)} W`,
      status: "ON",
      icon: <FiBarChart2 className="text-xl md:text-2xl text-blue-600" />,
    },
    {
      name: "Battery %",
      value: `${battery.toFixed(1)}%`,
      status: "ON",
      icon: (
        <FiBatteryCharging className="text-xl md:text-2xl text-blue-600" />
      ),
    },
    {
      name: "Battery Power",
      value: `${batteryPower.toFixed(2)} W`,
      status: "ON",
      icon: <FiBatteryCharging className="text-xl md:text-2xl text-blue-600" />,
    },
    {
      name: "Grid Power",
      value: `${gridPower.toFixed(2)} W`,
      status: "ON",
      icon: <FiZap className="text-xl md:text-2xl text-blue-600" />,
    },
    {
      name: "Solar Irradiance",
      value: `${solarIrradiance.toFixed(1)} W/m²`,
      status: "ON",
      icon: <FiSun className="text-xl md:text-2xl text-blue-600" />,
    },
    {
      name: "Voltage",
      value: `${voltage.toFixed(1)} V`,
      status: "ON",
      icon: <FiZap className="text-xl md:text-2xl text-blue-600" />,
    },
    {
      name: "Current",
      value: `${current.toFixed(2)} A`,
      status: "ON",
      icon: <FiBarChart2 className="text-xl md:text-2xl text-blue-600" />,
    },
  ];

  // ✅ ใช้ power_in เป็นข้อมูลในกราฟ
  const points = toPolylinePoints(powerSeries, 720, 160);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-gray-900 mt-14 sm:mt-0">
      {/* Header แบบเดียวกับ EVCalibet + ปุ่ม Back */}
      <header className="sticky top-0 z-20 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center rounded-lg bg-white/95 px-3 py-1.5 text-xs sm:text-sm font-semibold text-blue-600 shadow-sm hover:bg-white"
            >
              ← Back
            </button>
            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-wide opacity-90">
                Monitor Solar Station
              </span>
              <span className="text-xs sm:text-sm font-semibold">
                {solar.Name}
                {solar.SolarPoint ? ` • ${solar.SolarPoint}` : ""}
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end text-[11px] sm:text-xs">
            <span className="inline-flex items-center gap-1 mb-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
              <FiSun className={isLive ? "text-yellow-300" : "text-blue-100"} />
              {isLive ? "Receiving data..." : "Waiting signal..."}
            </span>
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              {solarStatus}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 pt-5 pb-24 max-w-screen-xl mx-auto">
        {/* 🔹 SECTION บน: ซ้าย = Status + Cards, ขวา = Power Flow */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          {/* LEFT SIDE */}
          <div className="space-y-4">
            {/* Hero — สรุปสถานะแบตเตอรี่ */}
            <div className="rounded-2xl bg-white border border-gray-200 p-5 md:p-6 shadow-sm">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs md:text-sm text-gray-500 font-medium">
                    System Status
                  </p>
                  <p className="text-3xl md:text-4xl font-extrabold text-blue-700">
                    {battery.toFixed(1)}%
                  </p>
                  <p className="text-xs md:text-sm text-emerald-600 font-semibold mt-1">
                    {solarStatus}
                  </p>
                  <p className="text-sm md:text-base text-gray-500">
                    Battery Capacity
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] md:text-xs text-gray-500">
                    Updated
                  </p>
                  <p className="text-sm md:text-base font-semibold">
                    {updatedTime}
                  </p>
                  <p className="text-[11px] md:text-xs text-gray-500 mt-1">
                    Device: {solarData?.device_id ?? "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* การ์ดค่าหลัก */}
            <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-2 gap-3 md:gap-4">
              {params.map((item) => (
                <div
                  key={item.name}
                  className="rounded-xl bg-white border border-gray-200 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="inline-grid place-items-center h-9 w-9 md:h-10 md:w-10 rounded-lg bg-blue-50 border border-blue-100">
                      {item.icon}
                    </div>
                    <span
                      className={`text-[10px] md:text-xs px-2 py-1 rounded-full font-semibold ${
                        item.status === "ON"
                          ? "bg-green-50 text-green-700 border border-green-200"
                          : "bg-gray-50 text-gray-500 border border-gray-200"
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="text-[11px] md:text-xs text-gray-500">
                      {item.name}
                    </p>
                    <p className="text-xl md:text-2xl font-bold text-blue-700">
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT SIDE — Power Flow Diagram */}
          <div className="rounded-2xl bg-white border border-gray-200 p-5 md:p-6 shadow-sm flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-gray-500">Power Flow</p>
                <p className="text-lg md:text-xl font-bold text-blue-700">
                  Solar • Grid • Battery
                </p>
              </div>
              <span className="text-[10px] md:text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                EV Load
              </span>
            </div>

            <div className="mt-6 flex justify-center">
              <div className="relative w-64 h-64 md:w-72 md:h-72">
                {/* SVG: วงกลมใหญ่ + เส้นโค้ง + animation จุดเหลือง */}
                <svg
                  viewBox="0 0 260 260"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <defs>
                    {/* center: (130,130), radius ใหญ่ = 100 */}
                    {/* Solar -> EV (บนสุด) */}
                    <path id="solarPath" d="M 130 30 L 130 130" fill="none" />
                    {/* Grid -> EV (ล่างซ้าย) */}
                    <path
                      id="gridPath"
                      d="M 43.4 180 L 130 130"
                      fill="none"
                    />
                    {/* Battery -> EV (ล่างขวา) */}
                    <path
                      id="batteryPath"
                      d="M 216.6 180 L 130 130"
                      fill="none"
                    />
                    {/* เส้นโค้งบนวงกลมใหญ่จาก Solar -> Battery (ภายนอก) */}
                    <path
                      id="outerSolarBatteryPath"
                      d="M 130 30 A 100 100 0 0 1 216.6 180"
                      fill="none"
                    />
                  </defs>

                  {/* วงกลมใหญ่รอบนอก */}
                  <circle
                    cx={130}
                    cy={130}
                    r={100}
                    fill="none"
                    stroke="rgba(148,163,184,0.35)"
                    strokeWidth={10}
                    strokeLinecap="round"
                  />

                  {/* ✅ เส้นเชื่อมจาก Solar / Grid / Battery → EV */}
                  <g
                    stroke="rgba(148,163,184,0.85)"
                    strokeWidth={12}
                    strokeLinecap="round"
                    fill="none"
                  >
                    <use href="#solarPath" />
                    <use href="#gridPath" />
                    <use href="#batteryPath" />
                  </g>

                  {/* จุดเหลืองวิ่งจาก Solar -> EV */}
                  <circle r={5} fill="#FACC15">
                    <animateMotion
                      dur="2.0s"
                      repeatCount="indefinite"
                      keyPoints="0;1"
                      keyTimes="0;1"
                    >
                      <mpath xlinkHref="#solarPath" />
                    </animateMotion>
                  </circle>

                  {/* จุดเหลืองวิ่งจาก Grid -> EV */}
                  <circle r={5} fill="#FACC15">
                    <animateMotion
                      dur="2.3s"
                      repeatCount="indefinite"
                      keyPoints="0;1"
                      keyTimes="0;1"
                    >
                      <mpath xlinkHref="#gridPath" />
                    </animateMotion>
                  </circle>

                  {/* จุดเหลืองวิ่งจาก Battery -> EV */}
                  <circle r={5} fill="#FACC15">
                    <animateMotion
                      dur="2.6s"
                      repeatCount="indefinite"
                      keyPoints="0;1"
                      keyTimes="0;1"
                    >
                      <mpath xlinkHref="#batteryPath" />
                    </animateMotion>
                  </circle>

                  {/* จุดเหลืองวิ่งบนวงกลมใหญ่จาก Solar -> Battery */}
                  <circle r={5} fill="#FACC15">
                    <animateMotion
                      dur="3s"
                      repeatCount="indefinite"
                      keyPoints="0;1"
                      keyTimes="0;1"
                    >
                      <mpath xlinkHref="#outerSolarBatteryPath" />
                    </animateMotion>
                  </circle>
                </svg>

                {/* CENTER CAR (EV Load) */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center">
                    <FaCarSide className="text-blue-600 text-lg md:text-xl mb-1" />
                    <span className="text-[11px] md:text-xs text-slate-500">
                      EV Load
                    </span>
                    <span className="text-sm md:text-base font-bold text-blue-700">
                      {loadPower.toFixed(0)} W
                    </span>
                  </div>
                </div>

                {/* SOLAR */}
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    top: "11.5%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <span className="text-[10px] md:text-xs text-slate-500 mb-1">
                    Solar
                  </span>
                  <div className="w-16 h-16 rounded-full bg-white border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center">
                    <FiSun className="text-blue-600 text-base md:text-lg mb-0.5" />
                    <span className="text-[11px] md:text-xs font-semibold text-blue-700">
                      {powerIn.toFixed(0)}W
                    </span>
                  </div>
                </div>

                {/* GRID */}
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    top: "65%",
                    left: "18%",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <span className="text-[10px] md:text-xs text-slate-500 mb-1">
                    Grid
                  </span>
                  <div className="w-16 h-16 rounded-full bg-white border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center">
                    <FiZap className="text-blue-600 text-base md:text-lg mb-0.5" />
                    <span className="text-[11px] md:text-xs font-semibold text-blue-700">
                      {gridPower.toFixed(0)}W
                    </span>
                  </div>
                </div>

                {/* BATTERY */}
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    top: "65%",
                    left: "82%",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <span className="text-[10px] md:text-xs text-slate-500 mb-1">
                    Battery
                  </span>
                  <div className="w-16 h-16 rounded-full bg-white border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center">
                    <FiBatteryCharging className="text-blue-600 text-base md:text-lg mb-0.5" />
                    <span className="text-[11px] md:text-xs font-semibold text-blue-700">
                      {batteryLabel}
                    </span>
                    <span className="text-[9px] md:text-[10px] text-slate-500">
                      {batteryPower.toFixed(0)}W
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 🔹 ค่า Temp / Irradiance / Voltage / Current แสดงแบบสรุปเล็ก ๆ ใต้ Power Flow */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] md:text-xs">
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Temperature</p>
                <p className="font-semibold text-blue-700">
                  {temperature.toFixed(1)} °C
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Irradiance</p>
                <p className="font-semibold text-blue-700">
                  {solarIrradiance.toFixed(1)} W/m²
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Voltage</p>
                <p className="font-semibold text-blue-700">
                  {voltage.toFixed(1)} V
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Current</p>
                <p className="font-semibold text-blue-700">
                  {current.toFixed(2)} A
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 🔹 กราฟ Power In — ขยายให้เต็มกว้างของ content */}
        <section className="mt-6 rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-gray-500">Power Input</p>
                <p className="text-lg md:text-xl font-bold text-blue-700">
                  Last 10 Data
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] md:text-xs text-gray-500">Peak</p>
                <p className="text-sm md:text-base font-semibold text-blue-700">
                  {powerSeries.length > 0
                    ? `${Math.max(...powerSeries).toFixed(2)} W`
                    : "0.00 W"}
                </p>
              </div>
            </div>
          </div>

          <div className="px-3 pt-2 pb-4">
            <div className="rounded-xl bg-white border border-gray-200 p-2">
              <svg
                viewBox="0 0 720 220"
                className="w-full h-48 md:h-64"
                role="img"
                aria-label="Power input line chart"
              >
                {/* Grid */}
                <g>
                  {[40, 80, 120, 160, 200].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      x2="720"
                      y1={y}
                      y2={y}
                      stroke="rgba(2,6,23,0.06)"
                      strokeWidth="1"
                    />
                  ))}
                </g>

                {/* Gradients */}
                <defs>
                  <linearGradient id="lineGradBlue" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(37,99,235,0.95)" />
                    <stop offset="100%" stopColor="rgba(37,99,235,0.65)" />
                  </linearGradient>
                  <linearGradient id="areaGradBlue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(59,130,246,0.2)" />
                    <stop offset="100%" stopColor="rgba(59,130,246,0)" />
                  </linearGradient>
                </defs>

                {/* Filled area */}
                <polyline
                  points={points ? `${points} 720,220 0,220` : "0,220 720,220"}
                  fill="url(#areaGradBlue)"
                  stroke="none"
                />
                {/* Line */}
                {points && (
                  <polyline
                    points={points}
                    fill="none"
                    stroke="url(#lineGradBlue)"
                    strokeWidth="3"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}
              </svg>
            </div>

            {/* Min/Avg/Max */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] md:text-xs">
              <div className="rounded-lg bg-blue-50 border border-blue-100 py-2">
                <p className="text-gray-500">Min</p>
                <p className="font-semibold text-blue-700">
                  {powerSeries.length > 0
                    ? `${Math.min(...powerSeries).toFixed(2)} W`
                    : "0.00 W"}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 py-2">
                <p className="text-gray-500">Avg</p>
                <p className="font-semibold text-blue-700">
                  {powerSeries.length > 0
                    ? `${(
                        powerSeries.reduce((a, b) => a + b, 0) /
                        powerSeries.length
                      ).toFixed(2)} W`
                    : "0.00 W"}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 py-2">
                <p className="text-gray-500">Max</p>
                <p className="font-semibold text-blue-700">
                  {powerSeries.length > 0
                    ? `${Math.max(...powerSeries).toFixed(2)} W`
                    : "0.00 W"}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div className="h-10" />
      </main>
    </div>
  );
};

export default Index;
