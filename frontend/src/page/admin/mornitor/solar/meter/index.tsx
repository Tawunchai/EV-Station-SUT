// src/pages/admin/meter/index.tsx
import React, { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FiArrowLeft, FiActivity, FiSun } from "react-icons/fi";
import type { SolarInterface } from "../../../../../interface/ISolar";

type LocationState = {
  solarPoint?: string | null;
  solar?: SolarInterface | null;
};

const Meter: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const state = (location.state as LocationState | null) ?? null;

  const solarPoint = useMemo(() => {
    const sp = state?.solarPoint ?? state?.solar?.SolarPoint ?? null;
    return typeof sp === "string" && sp.trim() !== "" ? sp.trim() : null;
  }, [state]);

  const solarName = useMemo(() => {
    const name = state?.solar?.Name ?? null;
    return typeof name === "string" && name.trim() !== "" ? name.trim() : null;
  }, [state]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-gray-900 mt-14 sm:mt-0">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          {/* Left */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white border border-white/20 hover:bg-white/15 active:scale-[0.99] transition"
            >
              <FiArrowLeft />
              Back
            </button>

            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-[0.18em] text-blue-100">
                Meter
              </span>
              <span className="text-xs sm:text-sm font-semibold">
                {solarName ? `${solarName} • ` : ""}
                {solarPoint ?? "-"}
              </span>
            </div>
          </div>

          {/* Right */}
          <div className="flex items-center gap-2 text-[11px] sm:text-xs">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
              <FiSun className="text-yellow-300" />
              <span>SolarPoint</span>
            </span>

            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-blue-700 border-white/40 shadow-md shadow-black/10 ring-1 ring-white/60">
              <FiActivity className="text-[13px] text-blue-700" />
              <span className="font-semibold">{solarPoint ?? "—"}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6">
        <div className="rounded-2xl bg-white border border-sky-100 shadow-sm shadow-sky-100 p-5 md:p-6">
          <h1 className="text-lg md:text-xl font-bold text-sky-800 mb-2">
            Meter Page
          </h1>

          {solarPoint ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-600">
                SolarPoint ที่ส่งมาจากหน้าก่อนหน้า:
              </p>

              <div className="inline-flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                <FiActivity className="text-sky-600" />
                <span className="font-mono text-slate-800">{solarPoint}</span>
              </div>

              {solarName && (
                <p className="text-[12px] text-slate-500">
                  Solar: <span className="font-semibold">{solarName}</span>
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-700">
              ไม่พบ SolarPoint ที่ส่งมา (กรุณากลับไปหน้า Solar Monitor แล้วกดปุ่ม
              Meter ใหม่อีกครั้ง)
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Meter;
