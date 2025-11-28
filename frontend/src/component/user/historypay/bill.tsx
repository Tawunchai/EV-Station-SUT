import React from "react";
import { Modal } from "antd";
import { FaFileInvoice, FaChargingStation, FaBolt } from "react-icons/fa";

interface BillData {
  payment: any;
  ev_charging_payments: any[];
}

interface BillModalProps {
  open: boolean;
  bill: BillData | null;
  onClose: () => void;
}

const fmt = (n: number) =>
  Number(n || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString("th-TH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

const fmtTime = (d: string | Date) =>
  new Date(d).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

const BillModal: React.FC<BillModalProps> = ({ open, bill, onClose }) => {
  const payment = bill?.payment;
  const evList = bill?.ev_charging_payments || [];

  const totalPower: number = evList.reduce((sum: number, it: any) => {
    return sum + Number(it.Power || 0);
  }, 0);

  const totalPrice: number = evList.reduce((sum: number, it: any) => {
    return sum + Number(it.Price || 0);
  }, 0);

  // 💸 เงินที่ต้องคืนลูกค้า = RemainingPower * EVcharging.Price
  const totalRefund: number = evList.reduce((sum: number, it: any) => {
    const ev = it.EVcharging || it.evcharging || {};
    const unitPrice = Number(ev.Price || 0);
    const remain = Number(it.RemainingPower || 0);
    return sum + unitPrice * remain;
  }, 0);

  const payDate = payment?.CreatedAt || payment?.Date;
  const dateText = payDate ? fmtDate(payDate) : "-";
  const timeText = payDate ? fmtTime(payDate) : "-";

  const netCharge = Math.max(
    0,
    Number(payment?.Amount || 0) - Number(totalRefund || 0)
  );

  return (
    <Modal
      open={open}
      footer={null}
      onCancel={onClose}
      centered
      width={900}
      closable={false} // ใช้ปุ่ม X ของเราเอง
      // ทำให้พื้นหลังของ modal เป็นโปร่งใส ไม่มีสีขาว
      bodyStyle={{ padding: 0, background: "transparent" }}
      // ถ้าใช้ Antd v5 จะมี prop styles
      // ถ้าโปรเจ็กต์ยังเป็น v4 ใช้ CSS override class แทนได้
      // @ts-ignore
      styles={{
        content: {
          background: "transparent",
          boxShadow: "none",
          padding: 0,
        },
      }}
      destroyOnClose
    >
      {/* ใบเสร็จหลัก (การ์ดขาวใบเดียว) */}
      <div className="w-full max-w-4xl mx-auto rounded-[26px] bg-white shadow-xl overflow-hidden">
        {/* TOP HEADER */}
        <div className="bg-gradient-to-r from-blue-600 to-sky-500 px-5 sm:px-8 py-4 flex items-center gap-4 text-white">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15">
            <FaFileInvoice className="h-5 w-5" />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-sm sm:text-base font-semibold truncate">
              EV Charging Receipt
            </div>
            <div className="text-[11px] text-blue-100 truncate">
              ใบเสร็จการชำระเงินสำหรับบริการชาร์จรถยนต์ไฟฟ้า
            </div>
          </div>

          {/* วันที่ + ปุ่ม X */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col text-[11px] text-blue-100 leading-tight text-right">
              <span>{dateText}</span>
              <span>{timeText}</span>
            </div>

            <button
              onClick={onClose}
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

        {!bill || !payment ? (
          <div className="p-6 text-center text-sm text-gray-500">
            ไม่พบข้อมูล Bill
          </div>
        ) : (
          <>
            {/* PAYMENT SUMMARY BAR (เหมือนรูป) */}
            <div className="px-5 sm:px-8 py-3 border-b border-gray-200 bg-white">
              <div className="text-[11px] font-semibold tracking-[0.18em] text-gray-500">
                PAYMENT SUMMARY
              </div>
            </div>

            {/* ENERGY USAGE SECTION */}
            <div className="px-5 sm:px-8 pt-4 pb-5 border-b border-gray-200 bg-white">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-[11px] font-semibold tracking-[0.18em] text-gray-500">
                    ENERGY USAGE
                  </div>
                  <div className="mt-1 text-sm sm:text-base font-semibold text-gray-900">
                    รายละเอียดพลังงานไฟฟ้าที่ซื้อ
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-gray-500">Total kWh</div>
                  <div className="text-lg sm:text-xl font-bold text-emerald-600 tabular-nums font-mono">
                    {fmt(totalPower)} kWh
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {evList.length} source{evList.length > 1 ? "s" : ""}
                  </div>
                </div>
              </div>

              {evList.length === 0 ? (
                <div className="text-sm text-gray-400 text-center py-3">
                  No EV energy records for this payment.
                </div>
              ) : (
                <>
                  {/* DESKTOP TABLE */}
                  <div className="hidden md:block">
                    <div className="grid grid-cols-[3fr_1.4fr_1.6fr_1.6fr_1.6fr] text-[11px] font-semibold text-gray-500 border-b border-gray-100 pb-2">
                      <div>Source</div>
                      <div className="text-right">Percent (%)</div>
                      <div className="text-right">Power (kWh)</div>
                      <div className="text-right">Remain (kWh)</div>
                      <div className="text-right">Refund (฿)</div>
                    </div>

                    <div className="max-h-72 overflow-y-auto">
                      {evList.map((item: any, idx: number) => {
                        const ev = item.EVcharging || item.evcharging || {};
                        const remain = Number(item.RemainingPower || 0);
                        const unitPrice = Number(ev.Price || 0);
                        const refund = remain * unitPrice;

                        return (
                          <div
                            key={idx}
                            className="grid grid-cols-[3fr_1.4fr_1.6fr_1.6fr_1.6fr] text-sm text-gray-800 py-2 border-b border-gray-50"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-8 w-8 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-500">
                                <FaChargingStation className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-semibold">
                                  {ev.Name || "EV Source"}
                                </div>
                                <div className="truncate text-[11px] text-gray-500">
                                  {ev.Description || ""}
                                </div>
                              </div>
                            </div>

                            <div className="text-right text-xs tabular-nums">
                              {fmt(item.Percent || 0)} %
                            </div>
                            <div className="text-right text-xs tabular-nums">
                              {fmt(item.Power || 0)} kWh
                            </div>
                            <div className="text-right text-xs tabular-nums">
                              {fmt(item.RemainingPower || 0)} kWh
                            </div>
                            <div className="text-right text-xs font-semibold text-emerald-700 tabular-nums">
                              {fmt(refund)} ฿
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* MOBILE CARDS */}
                  <div className="md:hidden space-y-3 max-h-72 overflow-y-auto">
                    {evList.map((item: any, idx: number) => {
                      const ev = item.EVcharging || item.evcharging || {};
                      const remain = Number(item.RemainingPower || 0);
                      const unitPrice = Number(ev.Price || 0);
                      const refund = remain * unitPrice;

                      return (
                        <div
                          key={idx}
                          className="rounded-2xl border border-gray-100 bg-gray-50 p-3 space-y-2"
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                              <FaBolt className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-semibold text-gray-900">
                                {ev.Name || "EV Source"}
                              </div>
                              <div className="truncate text-[11px] text-gray-500">
                                {ev.Description || ""}
                              </div>
                            </div>
                            <div className="text-right text-sm font-semibold text-blue-600 tabular-nums">
                              {fmt(item.Power || 0)} kWh
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-2 text-[11px] text-gray-600">
                            <div>
                              <div className="text-[10px] text-gray-500">
                                Percent
                              </div>
                              <div className="font-semibold tabular-nums">
                                {fmt(item.Percent || 0)} %
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-500">
                                Remain
                              </div>
                              <div className="font-semibold tabular-nums">
                                {fmt(item.RemainingPower || 0)} kWh
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-500">
                                Price/kWh
                              </div>
                              <div className="font-semibold tabular-nums">
                                {fmt(unitPrice)} ฿
                              </div>
                            </div>
                            <div>
                              <div className="text-[10px] text-gray-500">
                                Refund
                              </div>
                              <div className="font-semibold text-emerald-700 tabular-nums">
                                {fmt(refund)} ฿
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* SUMMARY แถวล่าง */}
            <div className="px-5 sm:px-8 py-4 bg-white">
              <div className="space-y-1 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Total energy price</span>
                  <span className="font-semibold text-gray-900 tabular-nums font-mono">
                    {fmt(totalPrice)} ฿
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Total kWh purchased</span>
                  <span className="font-semibold text-gray-900 tabular-nums font-mono">
                    {fmt(totalPower)} kWh
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Refund to customer</span>
                  <span className="font-semibold text-emerald-700 tabular-nums font-mono">
                    {fmt(totalRefund)} ฿
                  </span>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between text-sm">
                <span className="text-gray-800 font-semibold">Net charge</span>
                <span className="font-bold text-blue-700 tabular-nums font-mono">
                  {fmt(netCharge)} ฿
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
  );
};

export default BillModal;