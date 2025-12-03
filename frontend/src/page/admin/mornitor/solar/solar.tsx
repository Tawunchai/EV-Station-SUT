// src/page/admin/mornitor/solar/after-solar/index.tsx

import React, { useEffect, useState } from "react";
import { FiZap, FiBarChart2, FiBatteryCharging, FiSun } from "react-icons/fi";
import { FaCarSide } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";

import {
  connectSolarSocket,
  ListSolarRealtimeDataByDeviceID,
} from "../../../../services";
import type { SolarInterface } from "../../../../interface/ISolar";

/** ---------- Types ---------- */
type Parameter = {
  name: string;
  value: string;
  status: "ON" | "OFF";
  icon: React.ReactNode;
};

// ✅ ขยายให้รองรับ field ทั้งหมดตาม JSON ที่ส่งมา
type SolarData = {
  device_id?: string;
  type?: string;
  payload?: {
    device_id?: string;
    timestamp?: string;
    data?: {
      power_in?: number;
      power_out?: number;
      battery_percentage?: number;
      battery_power?: number;
      voltage?: number;
      current?: number;
      solar_irradiance?: number;
      temperature?: number;
      status?: string;
      panel_temperature?: number;
      efficiency?: number;
      frequency?: number;
      daily_energy?: number;
      total_energy?: number;
      alerts?: any[];
      grid_power?: number;
    };
  };
};

/** ---------- Helper: แปลงชุดข้อมูลเป็น polyline points ---------- */
function toPolylinePoints(values: number[], width = 560, height = 120): string {
  if (!values || values.length === 0) return "";
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
  const [isLive, setIsLive] = useState(false);

  // ข้อมูล history ทั้งหมดจาก API
  const [historyData, setHistoryData] = useState<any[] | null>(null);
  const [batterySeries, setBatterySeries] = useState<number[]>([]);
  const [powerInSeries, setPowerInSeries] = useState<number[]>([]);
  const [powerOutSeries, setPowerOutSeries] = useState<number[]>([]);

  // 🔹 สถานะที่ใช้โชว์ใน UI (DB ครั้งแรก + socket ภายหลัง)
  const [displayStatus, setDisplayStatus] = useState<string>("Unknown");
  const [lastStatusTime, setLastStatusTime] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  // ---------- CONNECT WEBSOCKET (Realtime) ---------- //
  useEffect(() => {
    if (!solar || !solar.SolarPoint) return;

    const deviceId = solar.SolarPoint; // เช่น "solar_001"

    const socket = connectSolarSocket((data: SolarData) => {
      // data ตรงกับ JSON: { type, device_id, payload: { device_id, timestamp, data: {...} } }
      setSolarData(data);
      setIsLive(true);

      const realtimeStatus = data?.payload?.data?.status ?? "Unknown";
      const realtimeTsStr = data?.payload?.timestamp;
      const realtimeTs = realtimeTsStr ? new Date(realtimeTsStr) : new Date();

      setDisplayStatus(realtimeStatus);
      setLastStatusTime(realtimeTs);
      setIsOffline(false);

      console.log("Realtime solar data:", data);
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

  // ---------- LOAD HISTORY จาก API (ListSolarRealtimeDataByDeviceID) ---------- //
  useEffect(() => {
    if (!solar || !solar.SolarPoint) return;

    const deviceId = solar.SolarPoint; // เช่น "solar_001"

    const fetchHistory = async () => {
      try {
        const res = await ListSolarRealtimeDataByDeviceID(deviceId);
        console.log("History solar data from API:", res);
        if (res && Array.isArray(res)) {
          setHistoryData(res);

          // สมมติว่า field จาก backend เป็น snake_case ตาม json tag:
          // { power_in, power_out, battery_percentage, status, CreatedAt, ... }
          const batteryArr = res.map(
            (item: any) => item.battery_percentage ?? 0
          );
          const powerInArr = res.map((item: any) => item.power_in ?? 0);
          const powerOutArr = res.map((item: any) => item.power_out ?? 0);

          setBatterySeries(batteryArr);
          setPowerInSeries(powerInArr);
          setPowerOutSeries(powerOutArr);

          // ✅ ดึง status ล่าสุดจาก DB (CreatedAt ล่าสุด) ใช้เป็นค่าเริ่มต้น
          if (res.length > 0) {
            const lastRecord = res[res.length - 1];
            const histStatus =
              lastRecord.status ??
              lastRecord.Status ??
              lastRecord.solar_status ??
              "Unknown";

            const createdAtStr =
              lastRecord.CreatedAt ?? lastRecord.created_at ?? null;
            const createdAt = createdAtStr ? new Date(createdAtStr) : null;

            setDisplayStatus(histStatus);
            if (createdAt) {
              setLastStatusTime(createdAt);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching solar history:", err);
      }
    };

    fetchHistory();
  }, [solar]);

  // 🔹 ตรวจจับ Offline: ถ้า lastStatusTime เกิน 30 นาทีโดยไม่มีอัปเดต → Offline
  useEffect(() => {
    if (!lastStatusTime) return;

    const checkOffline = () => {
      const diffMs = Date.now() - lastStatusTime.getTime();
      const diffMin = diffMs / (1000 * 60);
      const offline = diffMin > 30;
      setIsOffline(offline);
      if (offline) {
        setIsLive(false);
      }
    };

    checkOffline();
    const interval = setInterval(checkOffline, 60 * 1000); // เช็คทุก 1 นาที

    return () => clearInterval(interval);
  }, [lastStatusTime]);

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

  // ---------- เตรียมค่าที่จะใช้แสดงจาก realtime ---------- //
  const payloadData = solarData?.payload?.data;

  const powerIn = payloadData?.power_in ?? 0;
  const battery = payloadData?.battery_percentage ?? 0;
  const batteryPower = payloadData?.battery_power ?? 0;
  const gridPower = payloadData?.grid_power ?? 0; // ใช้ทั้งใน Power Flow + card metrics
  const powerOut = payloadData?.power_out ?? 0;
  const solarIrradiance = payloadData?.solar_irradiance ?? 0;
  const temperature = payloadData?.temperature ?? 0;
  const voltage = payloadData?.voltage ?? 0;
  const current = payloadData?.current ?? 0;

  const panelTemperature = payloadData?.panel_temperature ?? 0;
  const efficiency = payloadData?.efficiency ?? 0;
  const frequency = payloadData?.frequency ?? 0;
  const dailyEnergy = payloadData?.daily_energy ?? 0;
  const totalEnergy = payloadData?.total_energy ?? 0;
  const alerts = payloadData?.alerts ?? [];

  // ✅ ใช้เวลาอัปเดตจาก lastStatusTime (ถ้ามี) ถ้าไม่มีก็ fallback ไป timestamp ของ socket
  const updatedTime = lastStatusTime
    ? lastStatusTime.toLocaleTimeString()
    : solarData?.payload?.timestamp
    ? new Date(solarData.payload.timestamp).toLocaleTimeString()
    : "Waiting...";

  // ✅ ใช้ power_out เป็นโหลดฝั่ง EV
  const loadPower = powerOut;
  const batteryLabel = battery > 0 ? `${battery.toFixed(0)}%` : "None";

  // 🔹 การ์ดด้านซ้าย: รวมทั้งหมด 7 การ์ด
  // 1 การ์ดบน = Status (ทำเป็น hero card ด้านบน)
  // 6 การ์ดล่าง = power_in, power_out, battery_percentage, battery_power, voltage, current
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

  /** ---------- เตรียมจุดสำหรับกราฟจาก history (battery %, power_in, power_out) ---------- */
  const chartWidth = 720;
  const chartHeight = 160;
  const batteryPoints = toPolylinePoints(batterySeries, chartWidth, chartHeight);
  const powerInPoints = toPolylinePoints(powerInSeries, chartWidth, chartHeight);
  const powerOutPoints = toPolylinePoints(
    powerOutSeries,
    chartWidth,
    chartHeight
  );

  const hasHistory =
    batterySeries.length > 0 ||
    powerInSeries.length > 0 ||
    powerOutSeries.length > 0;

  const lastBattery =
    batterySeries.length > 0
      ? batterySeries[batterySeries.length - 1]
      : undefined;
  const lastPowerIn =
    powerInSeries.length > 0
      ? powerInSeries[powerInSeries.length - 1]
      : undefined;
  const lastPowerOut =
    powerOutSeries.length > 0
      ? powerOutSeries[powerOutSeries.length - 1]
      : undefined;

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
              <FiSun
                className={
                  isOffline
                    ? "text-red-300"
                    : isLive
                    ? "text-yellow-300"
                    : "text-blue-100"
                }
              />
              {isOffline
                ? "Offline"
                : isLive
                ? "Receiving data..."
                : "Waiting signal..."}
            </span>
            <span
              className={`px-2 py-0.5 rounded-full border font-semibold ${
                isOffline
                  ? "bg-red-50 text-red-700 border-red-200"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              {isOffline ? "Offline" : displayStatus}
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
            {/* Hero — แสดง Status + Updated + Device */}
            <div className="rounded-2xl bg-white border border-gray-200 p-5 md:p-6 shadow-sm">
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-xs md:text-sm text-gray-500 font-medium">
                    Status
                  </p>
                  <p
                    className={`text-3xl md:text-4xl font-extrabold ${
                      isOffline ? "text-red-600" : "text-blue-700"
                    }`}
                  >
                    {isOffline ? "Offline" : displayStatus}
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
                    Device: {solarData?.device_id ?? solar.SolarPoint ?? "-"}
                  </p>
                </div>
              </div>
            </div>

            {/* การ์ดค่าหลัก 6 ใบ: power_in, power_out, battery_percentage, battery_power, voltage, current */}
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

          {/* RIGHT SIDE — Power Flow Diagram + metrics ฝั่งขวา */}
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

            {/* 🔹 metrics ด้านขวา: เพิ่ม Grid Power + solar_irradiance, temperature, panel_temperature, efficiency, frequency, daily_energy, total_energy */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] md:text-xs">
              {/* ✅ Card ใหม่: Grid Power */}
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Grid Power</p>
                <p className="font-semibold text-blue-700">
                  {gridPower.toFixed(1)} W
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Solar Irradiance</p>
                <p className="font-semibold text-blue-700">
                  {solarIrradiance.toFixed(1)} W/m²
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Ambient Temp</p>
                <p className="font-semibold text-blue-700">
                  {temperature.toFixed(1)} °C
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Panel Temp</p>
                <p className="font-semibold text-blue-700">
                  {panelTemperature.toFixed(1)} °C
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Efficiency</p>
                <p className="font-semibold text-blue-700">
                  {efficiency.toFixed(1)} %
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Frequency</p>
                <p className="font-semibold text-blue-700">
                  {frequency.toFixed(1)} Hz
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Daily Energy</p>
                <p className="font-semibold text-blue-700">
                  {dailyEnergy.toFixed(1)} kWh
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                <p className="text-slate-500">Total Energy</p>
                <p className="font-semibold text-blue-700">
                  {totalEnergy.toFixed(1)} kWh
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 🔹 กราฟ History แยก 3 กราฟ: Battery %, Power In, Power Out */}
        <section className="mt-6 rounded-2xl bg-white border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-gray-500">
                  History Metrics
                </p>
                <p className="text-lg md:text-xl font-bold text-blue-700">
                  Battery % • Power In • Power Out
                </p>
              </div>
              <div className="flex flex-col items-end text-[10px] md:text-xs text-gray-500">
                <span>Records: {historyData?.length ?? 0}</span>
                {alerts && alerts.length > 0 && (
                  <span className="mt-1 text-red-500">
                    Alerts: {alerts.join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="px-3 pt-2 pb-4">
            <div className="rounded-xl bg-white border border-gray-200 p-3 space-y-4">
              {hasHistory ? (
                <>
                  {/* กราฟ Battery % */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs md:text-sm font-semibold text-amber-700 flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                        Battery %
                      </span>
                    </div>
                    {batterySeries.length > 0 && batteryPoints ? (
                      <svg
                        viewBox={`0 0 ${chartWidth} 220`}
                        className="w-full h-32 md:h-40"
                        role="img"
                        aria-label="Battery % history chart"
                      >
                        <g>
                          {[40, 80, 120, 160, 200].map((y) => (
                            <line
                              key={y}
                              x1="0"
                              x2={chartWidth}
                              y1={y}
                              y2={y}
                              stroke="rgba(2,6,23,0.06)"
                              strokeWidth="1"
                            />
                          ))}
                        </g>
                        <defs>
                          <linearGradient
                            id="lineBatterySingle"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                          >
                            <stop
                              offset="0%"
                              stopColor="rgba(245,158,11,0.95)"
                            />
                            <stop
                              offset="100%"
                              stopColor="rgba(245,158,11,0.65)"
                            />
                          </linearGradient>
                        </defs>
                        <polyline
                          points={batteryPoints}
                          fill="none"
                          stroke="url(#lineBatterySingle)"
                          strokeWidth={2.5}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <div className="h-16 flex items-center justify-center text-xs text-gray-400">
                        ไม่มีข้อมูล Battery % สำหรับกราฟ
                      </div>
                    )}
                  </div>

                  {/* กราฟ Power In */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs md:text-sm font-semibold text-blue-700 flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                        Power In
                      </span>
                    </div>
                    {powerInSeries.length > 0 && powerInPoints ? (
                      <svg
                        viewBox={`0 0 ${chartWidth} 220`}
                        className="w-full h-32 md:h-40"
                        role="img"
                        aria-label="Power In history chart"
                      >
                        <g>
                          {[40, 80, 120, 160, 200].map((y) => (
                            <line
                              key={y}
                              x1="0"
                              x2={chartWidth}
                              y1={y}
                              y2={y}
                              stroke="rgba(2,6,23,0.06)"
                              strokeWidth="1"
                            />
                          ))}
                        </g>
                        <defs>
                          <linearGradient
                            id="linePowerInSingle"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                          >
                            <stop
                              offset="0%"
                              stopColor="rgba(37,99,235,0.95)"
                            />
                            <stop
                              offset="100%"
                              stopColor="rgba(37,99,235,0.65)"
                            />
                          </linearGradient>
                          <linearGradient
                            id="areaPowerInSingle"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="rgba(59,130,246,0.18)"
                            />
                            <stop
                              offset="100%"
                              stopColor="rgba(59,130,246,0)"
                            />
                          </linearGradient>
                        </defs>
                        {/* Filled area */}
                        <polyline
                          points={`${powerInPoints} ${chartWidth},220 0,220`}
                          fill="url(#areaPowerInSingle)"
                          stroke="none"
                        />
                        {/* Line */}
                        <polyline
                          points={powerInPoints}
                          fill="none"
                          stroke="url(#linePowerInSingle)"
                          strokeWidth={3}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <div className="h-16 flex items-center justify-center text-xs text-gray-400">
                        ไม่มีข้อมูล Power In สำหรับกราฟ
                      </div>
                    )}
                  </div>

                  {/* กราฟ Power Out */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs md:text-sm font-semibold text-emerald-700 flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                        Power Out
                      </span>
                    </div>
                    {powerOutSeries.length > 0 && powerOutPoints ? (
                      <svg
                        viewBox={`0 0 ${chartWidth} 220`}
                        className="w-full h-32 md:h-40"
                        role="img"
                        aria-label="Power Out history chart"
                      >
                        <g>
                          {[40, 80, 120, 160, 200].map((y) => (
                            <line
                              key={y}
                              x1="0"
                              x2={chartWidth}
                              y1={y}
                              y2={y}
                              stroke="rgba(2,6,23,0.06)"
                              strokeWidth="1"
                            />
                          ))}
                        </g>
                        <defs>
                          <linearGradient
                            id="linePowerOutSingle"
                            x1="0"
                            y1="0"
                            x2="1"
                            y2="0"
                          >
                            <stop
                              offset="0%"
                              stopColor="rgba(16,185,129,0.95)"
                            />
                            <stop
                              offset="100%"
                              stopColor="rgba(16,185,129,0.65)"
                            />
                          </linearGradient>
                        </defs>
                        <polyline
                          points={powerOutPoints}
                          fill="none"
                          stroke="url(#linePowerOutSingle)"
                          strokeWidth={2.5}
                          strokeLinejoin="round"
                          strokeLinecap="round"
                        />
                      </svg>
                    ) : (
                      <div className="h-16 flex items-center justify-center text-xs text-gray-400">
                        ไม่มีข้อมูล Power Out สำหรับกราฟ
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="h-32 flex items-center justify-center text-sm text-gray-400">
                  ยังไม่มีข้อมูลจาก API สำหรับกราฟ
                </div>
              )}
            </div>

            {/* Legend + Last values */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] md:text-xs">
              <div className="rounded-lg bg-amber-50 border border-amber-100 py-2 px-2 text-center">
                <p className="text-gray-500 flex items-center justify-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                Battery %
                </p>
                <p className="font-semibold text-amber-700">
                  {lastBattery !== undefined
                    ? `${lastBattery.toFixed(1)} %`
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-blue-50 border border-blue-100 py-2 px-2 text-center">
                <p className="text-gray-500 flex items-center justify-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  Power In
                </p>
                <p className="font-semibold text-blue-700">
                  {lastPowerIn !== undefined
                    ? `${lastPowerIn.toFixed(2)} W`
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 py-2 px-2 text-center">
                <p className="text-gray-500 flex items-center justify-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  Power Out
                </p>
                <p className="font-semibold text-emerald-700">
                  {lastPowerOut !== undefined
                    ? `${lastPowerOut.toFixed(2)} W`
                    : "—"}
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
