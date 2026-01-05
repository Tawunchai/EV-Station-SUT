import { Pie } from "../../../../component/admin";
import { ecomPieChartData } from "../../../../assets/admin/dummy";
import { useEffect, useMemo, useState } from "react";
import { ListEVChargingPayments } from "../../../../services";

const EVBlueYearlySales = () => {
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
          const paidBaht = Number(item?.Price) || 0; // บาทที่จ่าย (จาก backend)

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
        console.error("❌ EVBlueYearlySales fetch error:", err);
        setYearlyUsedKwh(0);
        setYearlyUsedBaht(0);
      } finally {
        setLoading(false);
      }
    };

    fetchYearlyUsed();
  }, [currentYear]);

  return (
    <div className="bg-white text-blue-800 rounded-2xl md:w-400 p-6 m-3 flex justify-between items-center shadow-md border border-blue-100">
      {/* Left Info */}
      <div className="flex flex-col justify-center items-start">
        <p className="text-3xl font-bold text-blue-700">
          {loading
            ? "—"
            : `${yearlyUsedBaht.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}฿`}
        </p>

        <p className="text-sm text-blue-600 mt-1">Yearly Used Revenue</p>
      </div>

      {/* Right Pie Chart */}
      <div className="w-36 bg-gradient-to-br from-blue-50 to-white p-2 rounded-xl border border-blue-100">
        <Pie
          id="pie-chart"
          data={ecomPieChartData}
          legendVisiblity={false}
          height="150px"
        />
      </div>
    </div>
  );
};

export default EVBlueYearlySales;
