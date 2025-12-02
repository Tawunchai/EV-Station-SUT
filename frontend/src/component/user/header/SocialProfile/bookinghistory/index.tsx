import React, { useEffect, useState } from "react";
import { Spin, Empty, message } from "antd";
import dayjs from "dayjs";
import "dayjs/locale/th";

import {
  ListBookingByUserID,
  ListPaymentsByUserID,
  apiUrlPicture,
} from "../../../../../services";
import {
  getCurrentUser,
  initUserProfile,
} from "../../../../../services/httpLogin";
import type { BookingInterface } from "../../../../../interface/IBooking";
import bgCard from "../../../../../assets/booking-ev.png"; // 🔹 รูปพื้นหลัง EV station

// ---- Types ----
type EVChargingPaymentItem = {
  Power?: number;
  RemainingPower?: number;
  EVcharging?: {
    Name?: string;
    Description?: string;
    Price?: number;
  };
};

type PaymentChargeItem = {
  payment: any;
  ev_charging_payments: EVChargingPaymentItem[];
};

const History: React.FC = () => {
  const [userID, setUserID] = useState<number | undefined>(undefined);

  const [bookings, setBookings] = useState<BookingInterface[]>([]);
  const [loadingBookings, setLoadingBookings] = useState(true);

  const [payments, setPayments] = useState<PaymentChargeItem[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(true);

  // ✅ โหลด userID จาก JWT
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
        console.error("Error loading user:", error);
        message.error("Unable to load user data");
      }
    };
    loadUser();
  }, []);

  // ✅ โหลดประวัติการจอง (History booking)
  useEffect(() => {
    const fetchBookings = async () => {
      if (!userID) return;
      setLoadingBookings(true);
      try {
        const res = await ListBookingByUserID(userID);
        if (res && Array.isArray(res)) {
          const now = dayjs();

          // กรองเฉพาะที่ยัง active หรือหมดอายุไม่เกิน 7 วัน
          const filtered = res.filter((b: BookingInterface) => {
            const end = dayjs(b.EndDate);
            return end.isAfter(now.subtract(7, "day"));
          });

          // active ก่อน ตามด้วย expired ใหม่สุด
          const sorted = filtered.sort((a, b) => {
            const now = dayjs();
            const aEnd = dayjs(a.EndDate);
            const bEnd = dayjs(b.EndDate);

            const aActive = now.isBefore(aEnd);
            const bActive = now.isBefore(bEnd);

            if (aActive && !bActive) return -1;
            if (!aActive && bActive) return 1;

            return bEnd.diff(aEnd);
          });

          setBookings(sorted);
        }
      } catch (err) {
        console.error("Error fetching bookings:", err);
        message.error("Failed to load booking history");
      } finally {
        setLoadingBookings(false);
      }
    };

    if (userID) fetchBookings();
  }, [userID]);

  // ✅ โหลดประวัติการชาร์จ (History charge)
  useEffect(() => {
    const fetchPayments = async () => {
      if (!userID) return;
      setLoadingPayments(true);
      try {
        const res: any = await ListPaymentsByUserID(userID);
        console.log("🔵 History charge - raw response:", res);

        let list: PaymentChargeItem[] = [];

        // กรณีเป็น array อยู่แล้ว
        if (Array.isArray(res)) {
          list = res as PaymentChargeItem[];
        }
        // กรณี backend ห่อใน data
        else if (res && Array.isArray(res.data)) {
          list = res.data as PaymentChargeItem[];
        }
        // กรณีคืน object เดียว { payment, ev_charging_payments }
        else if (res && res.payment) {
          list = [res as PaymentChargeItem];
        }

        if (list.length > 0) {
          const sorted = [...list].sort((a, b) => {
            const ad: any =
              a.payment?.CreatedAt || a.payment?.Date || a.payment?.createdAt;
            const bd: any =
              b.payment?.CreatedAt || b.payment?.Date || b.payment?.createdAt;
            const at = ad ? new Date(ad).getTime() : 0;
            const bt = bd ? new Date(bd).getTime() : 0;
            return bt - at;
          });
          setPayments(sorted);
        } else {
          setPayments([]);
        }
      } catch (err) {
        console.error("Error fetching payments:", err);
        message.error("Loading charging history failed");
      } finally {
        setLoadingPayments(false);
      }
    };

    if (userID) fetchPayments();
  }, [userID]);

  // ---- Helpers ----
  // @ts-ignore
  const getDynamicStatusTag = (start: string, end: string) => {
    const now = dayjs();
    const active = now.isBefore(dayjs(end));
    return (
      <div
        className={`px-3 py-[2px] rounded-full text-[12px] font-medium ${
          active
            ? "bg-green-100 text-green-700 border border-green-200"
            : "bg-gray-100 text-red-500 border border-red-200"
        }`}
      >
        {active ? "Already reserved" : "Reservation expired"}
      </div>
    );
  };

  // ✅ ทศนิยม 2 ตำแหน่ง
  const fmtNumber = (n: number, digits = 2) =>
    Number(n || 0).toLocaleString(undefined, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });

  const fmtDateTime = (d?: Date | string) =>
    d ? dayjs(d).locale("th").format("DD/MM/YYYY HH:mm") : "-";

  const getSegmentColor = (name?: string, index?: number) => {
    const lower = (name || "").toLowerCase();
    // 🔸 Solar = ส้ม, 🔹 Grid = น้ำเงิน
    if (lower.includes("solar")) return "bg-orange-400";
    if (lower.includes("grid")) return "bg-blue-500";
    if (index === 0) return "bg-orange-400";
    if (index === 1) return "bg-blue-500";
    if (index === 2) return "bg-emerald-500";
    return "bg-sky-400";
  };

  // % share ของแต่ละ source จาก totalPower
  const getSharePercent = (
    item: EVChargingPaymentItem,
    totalPower: number
  ): number => {
    const power = Number(item.Power || 0);
    if (totalPower <= 0 || power <= 0) return 0;
    return (power / totalPower) * 100;
  };

  // % remain อิง totalPower (ให้ sum ตรงกับ chargedPercent)
  const getRemainPercent = (
    item: EVChargingPaymentItem,
    totalPower: number
  ): number => {
    const remain = Number(item.RemainingPower || 0);
    if (totalPower <= 0 || remain <= 0) return 0;
    return (remain / totalPower) * 100;
  };

  // ---- UI หลัก ----
  return (
    <div className="space-y-6">
      {/* ========== ส่วนบน: HISTORY BOOKING ========== */}
      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          History booking
        </h3>

        {loadingBookings ? (
          <div className="flex justify-center items-center py-6">
            <Spin size="large" />
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex justify-center items-center py-6">
            <Empty description="No booking history in the past 7 days." />
          </div>
        ) : (
          <div
            className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 overflow-y-auto pr-2"
            style={{ maxHeight: bookings.length > 2 ? "360px" : "auto" }}
          >
            {bookings.map((b) => (
              <div
                key={b.ID}
                className="relative rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 border border-blue-100 bg-white/80 backdrop-blur-[1px]"
              >
                {/* พื้นหลัง */}
                <div
                  className="absolute inset-0 bg-cover bg-center opacity-90"
                  style={{
                    backgroundImage: `url(${bgCard})`,
                    filter: "brightness(0.8) saturate(1.05)",
                    zIndex: 1,
                  }}
                />
                {/* Overlay */}
                <div
                  className="absolute inset-0 bg-gradient-to-b from-[#001a3b70] via-[#002b5570] to-[#00408060]"
                  style={{ zIndex: 2 }}
                />
                {/* เนื้อหา */}
                <div
                  className="relative z-10 p-4 flex flex-col justify-between h-full text-white"
                  style={{ minHeight: "170px" }}
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        b.EVCabinet?.Image
                          ? `${apiUrlPicture}${b.EVCabinet.Image}`
                          : "https://via.placeholder.com/60x60.png?text=EV"
                      }
                      alt={b.EVCabinet?.Name}
                      className="w-12 h-12 rounded-lg object-cover shadow-md border border-white/40"
                    />
                    <div>
                      <span className="inline-block bg-blue-600 text-white text-[13px] font-semibold px-3 py-[3px] rounded-md shadow-md drop-shadow-[0_2px_2px_rgba(0,0,0,0.4)]">
                        {b.EVCabinet?.Name || "Unknown cabinet name"}
                      </span>
                      <p className="text-[13px] text-blue-100 font-medium mt-1 drop-shadow-[0_2px_2px_rgba(0,0,0,0.7)]">
                        {dayjs(b.StartDate).locale("th").format("DD MMM YYYY")}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-between text-[13px] mt-3 text-blue-100 drop-shadow-[0_2px_2px_rgba(0,0,0,0.7)]">
                    <div>
                      <span className="font-semibold text-blue-200">Start :</span>{" "}
                      {dayjs(b.StartDate).format("HH:mm")}
                    </div>
                    <div>
                      <span className="font-semibold text-blue-200">
                        End :
                      </span>{" "}
                      {dayjs(b.EndDate).format("HH:mm")}
                    </div>
                  </div>

                  <div className="h-[1px] bg-white/40 my-2" />

                  <div className="flex justify-start items-center text-blue-50">
                    {getDynamicStatusTag(b.StartDate, b.EndDate)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ========== ส่วนล่าง: HISTORY CHARGE ========== */}
      <section>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          History charge
        </h3>

        {loadingPayments ? (
          <div className="flex justify-center items-center py-6">
            <Spin size="large" />
          </div>
        ) : (
          <>
            {payments.filter((p) => {
              const evList = p.ev_charging_payments || [];
              const total = evList.reduce(
                (sum, it) => sum + Number(it.Power || 0),
                0
              );
              return total > 0;
            }).length === 0 ? (
              <div className="flex justify-center items-center py-6">
                <Empty description="ยังไม่มีประวัติการชาร์จไฟฟ้า" />
              </div>
            ) : (
              <div
                className="space-y-4 overflow-y-auto pr-1"
                style={{ maxHeight: payments.length > 3 ? "360px" : "auto" }}
              >
                {payments.map((p, idxPayment) => {
                  const evList = p.ev_charging_payments || [];

                  const totalPower = evList.reduce(
                    (sum, it) => sum + Number(it.Power || 0),
                    0
                  );
                  if (totalPower <= 0) return null;

                  const totalRemain = evList.reduce(
                    (sum, it) => sum + Number(it.RemainingPower || 0),
                    0
                  );
                  const charged = Math.max(0, totalPower - totalRemain);
                  const chargedPercent =
                    totalPower > 0 ? (charged / totalPower) * 100 : 0;

                  const payDate =
                    p.payment?.CreatedAt ||
                    p.payment?.Date ||
                    p.payment?.createdAt;

                  return (
                    <div
                      key={idxPayment}
                      className="rounded-2xl border border-gray-200 bg-white shadow-sm px-4 py-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[12px] text-gray-600">
                          Charged on{" "}
                          <span className="font-semibold text-gray-800">
                            {fmtDateTime(payDate)}
                          </span>
                        </div>
                        <div className="text-[12px] text-gray-600">
                          Total :{" "}
                          <span className="font-semibold text-gray-900">
                            {fmtNumber(totalPower)} kWh
                          </span>
                        </div>
                      </div>

                      {/* stacked bar: share ของแต่ละ source */}
                      <div className="w-full rounded-full bg-gray-200 overflow-hidden h-6 relative">
                        <div className="flex h-full w-full">
                          {evList.map((item, idx) => {
                            const power = Number(item.Power || 0);
                            if (power <= 0) return null;
                            const width = (power / totalPower) * 100;
                            const color = getSegmentColor(
                              item.EVcharging?.Name,
                              idx
                            );
                            return (
                              <div
                                key={idx}
                                className={`${color} h-full`}
                                style={{ width: `${width}%` }}
                              />
                            );
                          })}
                        </div>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[11px] font-semibold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
                            {chargedPercent.toFixed(2)}%
                          </span>
                        </div>
                      </div>

                      {/* 🔸 รายละเอียดทุก source: kWh + % share (total) + kWh remain + % remain (total) */}
                      <div className="mt-2 space-y-1 text-[11px]">
                        {evList.map((item, idx) => {
                          const name =
                            item.EVcharging?.Name || `Source ${idx + 1}`;
                          const power = Number(item.Power || 0);
                          if (power <= 0) return null;

                          const remain = Number(item.RemainingPower || 0);
                          const share = getSharePercent(item, totalPower);
                          const remainPercent = getRemainPercent(
                            item,
                            totalPower
                          );
                          const color = getSegmentColor(name, idx);

                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-2"
                            >
                              {/* ซ้าย: icon + name + kWh */}
                              <div className="flex items-center gap-1 whitespace-nowrap">
                                <span
                                  className={`inline-block h-2 w-4 rounded-full ${color}`}
                                />
                                <span className="font-medium">{name}</span>
                                <span className="ml-2 text-gray-500">
                                  {fmtNumber(power)} kWh
                                </span>
                              </div>

                              {/* ขวา: % share + remain */}
                              <div className="text-right whitespace-nowrap">
                                <span className="font-semibold text-gray-800">
                                  {share.toFixed(2)}%
                                </span>
                                {remain > 0 && (
                                  <span className="ml-2 text-purple-600 font-semibold">
                                    {fmtNumber(remain)} kWh (
                                    {remainPercent.toFixed(2)}%)
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
};

export default History;
