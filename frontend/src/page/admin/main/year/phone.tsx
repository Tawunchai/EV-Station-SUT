import { Pie } from "../../../../component/admin";
import { ecomPieChartData } from "../../../../assets/admin/dummy";
import { useEffect, useMemo, useState } from "react";
import { ListEVChargingPayments } from "../../../../services";

const EVBlueYearlySalesMobile = () => {
  const [yearlyUsedBaht, setYearlyUsedBaht] = useState<number>(0); // @ts-ignore
  const [yearlyUsedKwh, setYearlyUsedKwh] = useState<number>(0); // ✅ ใช้ไปแล้ว (kWh) ปีนี้
  const [loading, setLoading] = useState<boolean>(true);

  const now = useMemo(() => new Date(), []);
  const currentYear = useMemo(() => now.getFullYear(), [now]);

  useEffect(() => {
    const fetchYearlyUsed = async () => {
      try {
        setLoading(true);

        const res = await ListEVChargingPayments();
        const list = Array.isArray(res) ? res : [];

        // ✅ กรองเฉพาะปีปัจจุบันจาก Payment.Date
        const yearly = list.filter((item: any) => {
          const d = item?.Payment?.Date;
          if (!d) return false;
          const dt = new Date(d);
          return dt.getFullYear() === currentYear;
        });

        let usedBahtSum = 0;
        let usedKwhSum = 0;

        yearly.forEach((item: any) => {
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

        setYearlyUsedKwh(usedKwhSum);
        setYearlyUsedBaht(usedBahtSum);
      } catch (err) {
        console.error("❌ EVBlueYearlySalesMobile fetch error:", err);
        setYearlyUsedKwh(0);
        setYearlyUsedBaht(0);
      } finally {
        setLoading(false);
      }
    };

    fetchYearlyUsed();
  }, [currentYear]);

  return (
    <div className="w-[94%] mx-auto bg-gradient-to-br from-blue-50 via-white to-blue-100 text-blue-800 rounded-2xl shadow-sm border border-blue-200 p-4 mt-3 mb-3 flex justify-between items-center">
      {/* Left Side */}
      <div className="flex flex-col justify-center items-start">
        <p className="text-lg font-semibold text-blue-700">
          {loading
            ? "—"
            : `${yearlyUsedBaht.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}฿`}
        </p>

        <p className="text-sm text-blue-600 mt-1">Yearly Used Revenue</p>

      </div>

      {/* Right Side (Pie Chart) */}
      <div className="w-24 bg-gradient-to-br from-blue-100 to-white p-1.5 rounded-xl border border-blue-100">
        <Pie
          id="pie-chart"
          data={ecomPieChartData}
          legendVisiblity={false}
          height="100px"
        />
      </div>
    </div>
  );
};

export default EVBlueYearlySalesMobile;
