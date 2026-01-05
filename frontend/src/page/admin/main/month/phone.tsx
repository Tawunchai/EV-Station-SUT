import { SparkLine } from "../../../../component/admin";
import { SparklineAreaData } from "../../../../assets/admin/dummy";
import { useStateContext } from "../../../../contexts/ContextProvider";
import { useEffect, useMemo, useState } from "react";
import { ListEVChargingPayments } from "../../../../services";

const EVBluePaymentMobile = () => {
  const { currentColor } = useStateContext();

  const [totalUsedBaht, setTotalUsedBaht] = useState<number>(0); // @ts-ignore
  const [totalUsedKwh, setTotalUsedKwh] = useState<number>(0); // ✅ ใช้ไปแล้ว (kWh)
  const [loading, setLoading] = useState<boolean>(true);

  const now = useMemo(() => new Date(), []);
  const monthLabel = useMemo(
    () => now.toLocaleString("en-US", { month: "long" }), // ✅ อังกฤษ
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
        console.error("❌ EVBluePaymentMobile fetch error:", err);
        setTotalUsedKwh(0);
        setTotalUsedBaht(0);
      } finally {
        setLoading(false);
      }
    };

    fetchUsedRevenue();
  }, [now]);

  return (
    <div className="w-[94%] mx-auto rounded-2xl shadow-md p-4 mt-4 mb-4 bg-gradient-to-br from-blue-50 via-white to-blue-100 border border-blue-200">
      {/* Header */}
      <div className="flex justify-between items-start gap-3 mb-2">
        <div>
          <p className="font-semibold text-base text-blue-800">Payment Overview</p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-xl font-bold text-blue-700 leading-tight">
            {loading
              ? "—"
              : `${totalUsedBaht.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}฿`}
          </p>
          <p className="text-xs text-blue-500 font-medium">
            Used revenue in {monthLabel} {year}
          </p>
        </div>
      </div>

      {/* Chart */}
      <div className="mt-4 bg-gradient-to-r from-blue-100 to-blue-50 rounded-xl p-2 border border-blue-200">
        <SparkLine
          currentColor={currentColor}
          id="column-sparkLine-mobile"
          height="90px"
          type="Column"
          data={SparklineAreaData}
          width="260"
          color="rgb(37, 99, 235)"
        />
      </div>
    </div>
  );
};

export default EVBluePaymentMobile;
