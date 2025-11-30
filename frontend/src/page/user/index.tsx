// src/pages/user/index.tsx

import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Modal, message } from "antd";
import {
  FaFileInvoice,
  FaChargingStation,
  FaBolt,
} from "react-icons/fa";

import Hero from "../../component/user/hero/hero";
import Value from "../../component/user/value/value";
import Header from "../../component/user/header/header";
import New from "../../component/user/new/new";
import NewMobile from "../../component/user/new/newmoblie";
import Review from "../../component/user/review/review";
import FooterMobile from "../../component/user/footer/footer";
import FooterDesktop from "../../component/user/footer/com/index";
import Car from "../../component/user/car/index";

import { GetPaymentByPaymentID } from "../../services";

import "./user.css";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(
    () => window.innerWidth < breakpoint
  );

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [breakpoint]);

  return isMobile;
}

// ⭐ type สำหรับข้อมูล Bill จาก backend (ตามโครง GetPaymentByPaymentID)
type BillData = {
  payment: any;
  ev_charging_payments: any[];
};

// state ที่ส่งมาจากหน้า ChargingEV
type LocationStateFromCharging = {
  fromCharging?: boolean;
  paymentID?: number;
};

const fmt = (n: number) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDateTime = (d: string | Date | undefined) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

const fmtDate = (d: string | Date | undefined) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const fmtTime = (d: string | Date | undefined) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

type SourceSummary = {
  name: string;
  usedKWh: number;
  cost: number;
};

const Index = () => {
  const valueRef = useRef<HTMLDivElement>(null);
  const newRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile(768);

  const location = useLocation();
  const navigate = useNavigate();

  const [showBillModal, setShowBillModal] = useState(false);
  const [bill, setBill] = useState<BillData | null>(null);
  const [loadingBill, setLoadingBill] = useState(false);

  // เก็บ timeout id ไว้เคลียร์เวลา unmount
  const modalTimerRef = useRef<number | null>(null);

  // ⭐ โหลด Bill จาก paymentID ที่ส่งมาจาก ChargingEV
  useEffect(() => {
    const state = location.state as LocationStateFromCharging | undefined;

    console.log("🏠 [Home] location.state =", state);

    // ถ้าไม่มี paymentID ก็ไม่ต้องเรียก service
    if (!state?.fromCharging || !state.paymentID) {
      return;
    }

    const paymentID = state.paymentID;

    const fetchBill = async () => {
      try {
        setLoadingBill(true);
        const data = await GetPaymentByPaymentID(paymentID);

        if (!data) {
          message.error("ไม่พบข้อมูลการชำระเงิน");
          return;
        }

        setBill(data as any as BillData);

        // ดีเลย์ 2 วินาทีก่อนให้ Modal เด้ง
        modalTimerRef.current = window.setTimeout(() => {
          setShowBillModal(true);
        }, 2000);

        // ล้าง state จาก history เพื่อไม่ให้กลับมาโชว์อีกครั้งตอน back/refresh
        navigate(location.pathname + location.search, {
          replace: true,
          state: {},
        });
      } catch (error) {
        console.error("Error loading bill:", error);
        message.error("เกิดข้อผิดพลาดในการโหลดข้อมูลใบเสร็จ");
      } finally {
        setLoadingBill(false);
      }
    };

    fetchBill();

    // cleanup: ถ้าออกจากหน้า / component unmount ให้เคลียร์ timeout
    return () => {
      if (modalTimerRef.current !== null) {
        window.clearTimeout(modalTimerRef.current);
        modalTimerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]); // ไม่ผูกกับ location.state เพื่อไม่ให้ loop

  const handleCloseBill = () => {
    // เคลียร์ timeout เผื่อยังไม่ยิง
    if (modalTimerRef.current !== null) {
      window.clearTimeout(modalTimerRef.current);
      modalTimerRef.current = null;
    }

    setShowBillModal(false);
    setBill(null); // ล้างข้อมูล bill

    // ล้าง state paymentID อีกรอบให้ชัวร์
    navigate(location.pathname + location.search, {
      replace: true,
      state: {},
    });
  };

  // 👉 เตรียมค่าคำนวณสรุปแบบสั้น ๆ
  const payment = bill?.payment;
  const evList = bill?.ev_charging_payments || [];

  console.log("💳 payment =", payment);

  // ✅ เอา StartTime / EndTime จาก ChargingSessions ของ Payment
  const sessions =
    payment?.ChargingSessions || payment?.charging_sessions || [];
  const primarySession =
    Array.isArray(sessions) && sessions.length > 0 ? sessions[0] : null;

  const startRaw =
    primarySession?.StartTime ||
    primarySession?.start_time ||
    payment?.StartTime ||
    payment?.StartDate ||
    payment?.Start ||
    payment?.CreatedAt;

  const endRaw =
    primarySession?.EndTime ||
    primarySession?.end_time ||
    payment?.EndTime ||
    payment?.EndDate ||
    payment?.End ||
    payment?.UpdatedAt ||
    payment?.CreatedAt;

  const startText = fmtDateTime(startRaw);
  const endText = fmtDateTime(endRaw);

  // ใช้วันที่จาก StartTime ของ session เป็นหลักใน header ถ้าไม่มี fallback ไป CreatedAt/Date
  const payDateRaw =
    primarySession?.StartTime ||
    primarySession?.start_time ||
    payment?.CreatedAt ||
    payment?.Date ||
    startRaw;
  const dateText = fmtDate(payDateRaw);
  const timeText = fmtTime(payDateRaw);

  // kWh ที่ซื้อรวม (Power)
  const totalPurchasedKWh: number = evList.reduce((sum: number, it: any) => {
    return sum + Number(it.Power || 0);
  }, 0);

  // kWh ที่เหลือรวม (RemainingPower)
  const totalRemainingKWh: number = evList.reduce((sum: number, it: any) => {
    return sum + Number(it.RemainingPower || 0);
  }, 0);

  // kWh ที่ใช้จริง = ซื้อ - เหลือ
  const totalUsedKWh = Math.max(0, totalPurchasedKWh - totalRemainingKWh);

  // ราคาต่อ source → ใช้เฉพาะส่วนที่ "ใช้จริง"
  const totalUsedCost: number = evList.reduce((sum: number, it: any) => {
    const ev = it.EVcharging || it.evcharging || {};
    const unitPrice = Number(ev.Price || 0);
    const power = Number(it.Power || 0);
    const remain = Number(it.RemainingPower || 0);
    const used = Math.max(0, power - remain);
    return sum + used * unitPrice;
  }, 0);

  // ยอดที่จ่ายจริงจาก Payment
  const paidAmount: number = Number(payment?.Amount || 0);

  // เงินที่ต้องคืน = RemainingPower * Price
  const totalRefund: number = evList.reduce((sum: number, it: any) => {
    const ev = it.EVcharging || it.evcharging || {};
    const unitPrice = Number(ev.Price || 0);
    const remain = Number(it.RemainingPower || 0);
    return sum + unitPrice * remain;
  }, 0);

  // ยอดสุทธิที่คิดกับลูกค้า (หลังหักคืนเงิน)
  const netCharge = Math.max(0, paidAmount - totalRefund);

  // รายชื่อแหล่งพลังงานแบบ unique (เช่น Solar, Grid)
  const energySources: string[] = Array.from(
    new Set(
      evList
        .map((it: any) => {
          const ev = it.EVcharging || it.evcharging || {};
          // ถ้ามี EnergySource.Name ให้ใช้ก่อน
          return (
            ev.EnergySource?.Name ||
            (ev.Name as string | undefined) ||
            undefined
          );
        })
        .filter(Boolean)
    )
  ) as string[];

  // 🔍 Breakdown ต่อ source: Solar / Grid ใช้ไปกี่ kWh และกี่บาท
  const sourceSummaryMap: Record<string, SourceSummary> = {};

  evList.forEach((it: any) => {
    const ev = it.EVcharging || it.evcharging || {};
    const sourceName =
      ev.EnergySource?.Name ||
      (ev.Name as string | undefined) ||
      "Unknown";

    const unitPrice = Number(ev.Price || 0);
    const power = Number(it.Power || 0);
    const remain = Number(it.RemainingPower || 0);
    const used = Math.max(0, power - remain);
    const cost = used * unitPrice;

    if (!sourceSummaryMap[sourceName]) {
      sourceSummaryMap[sourceName] = {
        name: sourceName,
        usedKWh: 0,
        cost: 0,
      };
    }

    sourceSummaryMap[sourceName].usedKWh += used;
    sourceSummaryMap[sourceName].cost += cost;
  });

  const sourceSummaries: SourceSummary[] = Object.values(sourceSummaryMap);

  return (
    <div
      className="user"
      style={{
        paddingBottom: isMobile
          ? "calc(84px + env(safe-area-inset-bottom))"
          : 0,
      }}
    >
      <div>
        <Header
          scrollToValue={() =>
            valueRef.current?.scrollIntoView({ behavior: "smooth" })
          }
          scrollToNew={() =>
            newRef.current?.scrollIntoView({ behavior: "smooth" })
          }
        />
        <Hero
          scrollToValue={() =>
            valueRef.current?.scrollIntoView({ behavior: "smooth" })
          }
        />
        <div className="white-gradient" />
      </div>

      {isMobile && <Car />}

      <div ref={valueRef}>
        <Value />
      </div>

      <div ref={newRef}>{isMobile ? <NewMobile /> : <New />}</div>

      <Review />
      <br />

      {/* ✅ Footer แยก mobile/desktop */}
      {isMobile ? <FooterMobile /> : <FooterDesktop />}

      {/* ⭐ Bill Modal – minimal EV style */}
      <Modal
        open={showBillModal}
        onCancel={handleCloseBill}
        footer={null}
        centered
        width={900}
        closable={false} // ใช้ปุ่ม X ของเราเอง
        bodyStyle={{ padding: 0, background: "transparent" }}
        // @ts-ignore Antd v5 styles
        styles={{
          content: {
            background: "transparent",
            boxShadow: "none",
            padding: 0,
          },
        }}
        destroyOnClose
      >
        {/* ใบเสร็จหลัก (การ์ดขาวใบเดียว minimal) */}
        <div className="w-full max-w-4xl mx-auto rounded-[26px] bg-white shadow-xl overflow-hidden">
          {/* TOP HEADER */}
          <div className="bg-gradient-to-r from-blue-600 to-sky-500 px-5 sm:px-8 py-4 flex items-center gap-4 text-white">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
              <FaFileInvoice className="h-5 w-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="text-sm sm:text-base font-semibold truncate">
                EV Charging Summary
              </div>
              <div className="text-[11px] text-blue-100 truncate">
                สรุปค่าใช้จ่ายการชาร์จรถยนต์ไฟฟ้าของคุณ
              </div>
            </div>

            {/* วันที่ + ปุ่ม X */}
            <div className="flex items-center gap-3">
              <div className="hidden sm:flex flex-col text-[11px] text-blue-100 leading-tight text-right">
                <span>{dateText}</span>
                <span>{timeText}</span>
              </div>

              <button
                onClick={handleCloseBill}
                aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M6 6l12 12M6 18L18 6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          {loadingBill ? (
            <div className="p-6 text-center text-sm text-gray-500">
              กำลังโหลดข้อมูลใบเสร็จ...
            </div>
          ) : !bill || !payment ? (
            <div className="p-6 text-center text-sm text-gray-500">
              ไม่พบข้อมูลการชำระเงินสำหรับรายการนี้
            </div>
          ) : (
            <>
              {/* PAYMENT SUMMARY BAR */}
              <div className="px-5 sm:px-8 py-3 border-b border-gray-200 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-gray-500">
                      SESSION SUMMARY
                    </div>
                    <div className="mt-1 text-[11px] text-gray-500">
                      {startText} - {endText}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-right">
                    <div className="hidden sm:block">
                      <div className="text-[11px] text-gray-500">
                        Total used
                      </div>
                      <div className="text-lg font-bold text-emerald-600 tabular-nums font-mono">
                        {fmt(totalUsedKWh)} kWh
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-gray-500">
                        Remaining
                      </div>
                      <div className="text-lg font-semibold text-blue-600 tabular-nums font-mono">
                        {fmt(totalRemainingKWh)} kWh
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ENERGY USAGE SECTION */}
              <div className="px-5 sm:px-8 pt-4 pb-5 border-b border-gray-200 bg-white">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-[11px] font-semibold tracking-[0.18em] text-gray-500">
                      ENERGY USAGE
                    </div>
                  </div>
                  <div className="text-right">
                  </div>
                </div>

                {/* Total used */}
                <div className="flex flex-wrap items-center justify-between text-xs mb-2">
                  <span className="text-gray-600">Total used energy</span>
                  <span className="font-semibold text-emerald-700 tabular-nums font-mono">
                    {fmt(totalUsedKWh)} kWh
                  </span>
                </div>

                {/* Total remaining */}
                <div className="flex flex-wrap items-center justify-between text-xs mb-3">
                  <span className="text-gray-600">
                    Remaining energy (not used)
                  </span>
                  <span className="font-semibold text-blue-700 tabular-nums font-mono">
                    {fmt(totalRemainingKWh)} kWh
                  </span>
                </div>

                {/* 🔽 Breakdown: Solar / Grid ใช้กี่ kWh และกี่บาท */}
                {sourceSummaries.length === 0 ? (
                  <div className="text-sm text-gray-400 text-center py-3">
                    No energy breakdown records for this payment.
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-100 bg-gray-50/60 p-3 sm:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11px] font-semibold text-gray-500">
                        BY ENERGY SOURCE
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-gray-500">
                        <FaBolt className="h-3 w-3 text-amber-400" />
                        <span>{energySources.join(" • ")}</span>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-40 overflow-y-auto">
                      {sourceSummaries.map((src) => (
                        <div
                          key={src.name}
                          className="flex items-center justify-between text-[11px] sm:text-xs bg-white rounded-xl px-3 py-2 shadow-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="h-7 w-7 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                              <FaChargingStation className="h-3 w-3" />
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-gray-800 truncate">
                                {src.name}
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {src.name} use {fmt(src.usedKWh)} kWh
                              </div>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-[10px] text-gray-500">
                              Cost
                            </div>
                            <div className="font-semibold text-gray-800 tabular-nums font-mono">
                              {fmt(src.cost)} THB
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* รวม cost ทั้งหมดจาก energy ที่ใช้ */}
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-gray-600">
                        Energy cost (total)
                      </span>
                      <span className="font-semibold text-blue-700 tabular-nums font-mono">
                        {fmt(totalUsedCost)} THB
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* SUMMARY แถวล่าง */}
              <div className="px-5 sm:px-8 py-4 bg-white">
                <div className="space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Paid amount</span>
                    <span className="font-semibold text-gray-900 tabular-nums font-mono">
                      {fmt(paidAmount)} THB
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Refund</span>
                    <span className="font-semibold text-emerald-700 tabular-nums font-mono">
                      {fmt(totalRefund)} THB
                    </span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-sm">
                  <span className="text-gray-800 font-semibold">
                    Net charge
                  </span>
                  <span className="font-bold text-blue-700 tabular-nums font-mono">
                    {fmt(netCharge)} THB
                  </span>
                </div>

                <div className="pt-3 text-[11px] text-center text-gray-400">
                  ขอบคุณที่ใช้บริการ EV Station ของเรา
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default Index;
