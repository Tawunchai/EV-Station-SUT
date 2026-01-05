import { SparkLine } from "../../../../component/admin";
import { SparklineAreaData } from "../../../../assets/admin/dummy";
import { useStateContext } from "../../../../contexts/ContextProvider";
import { useState, useEffect, useMemo } from "react";
import { ListEVChargingPayments } from "../../../../services";

const EVBluePaymentCard = () => {
  const { currentColor } = useStateContext();

  const [totalUsedBaht, setTotalUsedBaht] = useState<number>(0); // @ts-ignore
  const [totalUsedKwh, setTotalUsedKwh] = useState<number>(0); // ✅ kWh “ใช้ไปแล้ว”
  const [loading, setLoading] = useState<boolean>(true);

  const now = useMemo(() => new Date(), []);

  // ✅ monthLabel เป็นภาษาอังกฤษเสมอ
  const monthLabel = useMemo(
    () => now.toLocaleString("en-US", { month: "long" }),
    [now]
  );

  const year = useMemo(() => now.getFullYear(), [now]);

  useEffect(() => {
    const fetchUsedRevenue = async () => {
      try {
        setLoading(true);

        const res = await ListEVChargingPayments();
        const list = Array.isArray(res) ? res : [];

        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // ✅ filter เฉพาะเดือน/ปีปัจจุบันจาก Payment.Date
        const monthly = list.filter((item: any) => {
          const d = item?.Payment?.Date;
          if (!d) return false;
          const dt = new Date(d);
          return dt.getMonth() === currentMonth && dt.getFullYear() === currentYear;
        });

        let usedBahtSum = 0;
        let usedKwhSum = 0;

        monthly.forEach((item: any) => {
          const totalPower = Number(item?.Power) || 0; // kWh ที่ซื้อ
          const remainingPower = Math.max(0, Number(item?.RemainingPower) || 0); // kWh ที่เหลือ
          const usedPower = Math.max(0, totalPower - remainingPower); // ✅ ใช้ไปแล้ว

          const rate = Number(item?.EVcharging?.Price) || 0; // บาท/kWh
          const paidBaht = Number(item?.Price) || 0; // บาทที่จ่ายของ type นี้ (จาก backend)

          let remainingBaht = rate > 0 ? remainingPower * rate : 0;
          if (paidBaht > 0 && remainingBaht > paidBaht) remainingBaht = paidBaht;

          // ✅ เงินที่ “ใช้ไปแล้ว”
          let usedBaht = 0;
          if (paidBaht > 0) {
            usedBaht = Math.max(0, paidBaht - remainingBaht);
          } else if (rate > 0) {
            usedBaht = usedPower * rate;
          }

          usedKwhSum += usedPower;
          usedBahtSum += usedBaht;
        });

        setTotalUsedKwh(usedKwhSum);
        setTotalUsedBaht(usedBahtSum);
      } catch (err) {
        console.error("❌ EVBluePaymentCard fetch error:", err);
        setTotalUsedKwh(0);
        setTotalUsedBaht(0);
      } finally {
        setLoading(false);
      }
    };

    fetchUsedRevenue();
  }, [now]);

  return (
    <div className="rounded-2xl md:w-400 p-6 m-3 shadow-md bg-gradient-to-r from-blue-600 via-blue-500 to-blue-700 text-white">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <p className="font-medium text-xl tracking-wide">Payment Overview</p>

        <div className="text-right">
          <p className="text-3xl font-bold leading-tight mb-1">
            {loading
              ? "—"
              : `${totalUsedBaht.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}฿`}
          </p>

          <p className="text-sm text-blue-100 font-medium">
            Used revenue in {monthLabel} {year}
          </p>

          {/* (ถ้าต้องการแสดงบรรทัดนี้เพิ่มทีหลัง)
          <p className="mt-1 text-xs text-blue-100/90 font-medium">
            {loading ? "Calculating…" : `${totalUsedKwh.toFixed(2)} kWh • ฿${totalUsedBaht.toFixed(2)}`}
          </p>
          */}
        </div>
      </div>

      {/* Sparkline Chart */}
      <div className="mt-5 bg-blue-800/20 rounded-xl p-3 border border-blue-400/30">
        <SparkLine
          currentColor={currentColor}
          id="column-sparkLine"
          height="100px"
          type="Column"
          data={SparklineAreaData}
          width="320"
          color="rgb(219, 234, 254)"
        />
      </div>
    </div>
  );
};

export default EVBluePaymentCard;
