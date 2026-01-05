import { useEffect, useMemo, useState } from "react";
import { IoIosMore } from "react-icons/io";
import { useStateContext } from "../../../../contexts/ContextProvider";
import { BsBatteryCharging } from "react-icons/bs";
import {
  ListPayments,
  ListEVChargingPayments,
  ListUsers,
  apiUrlPicture,
} from "../../../../services";

type ChargerUsedStat = {
  usedPower: number; // kWh ที่ใช้ไปแล้ว
  usedBaht: number;  // บาทที่ใช้ไปแล้ว (คำนวณจาก RemainingPower)
  rate: number;      // บาท/kWh (ไว้สำหรับ debug/tooltip)
};

const Index = () => {
  const { currentColor } = useStateContext();

  // ✅ ต้องการ “ค่าที่ใช้ไปแล้ว” เท่านั้น
  const [power, setPower] = useState(0);     // used kWh
  const [expense, setExpense] = useState(0); // used ฿

  const [today, setToday] = useState("");
  const [chargerUsedMap, setChargerUsedMap] = useState<Record<string, ChargerUsedStat>>({});
  const [todayPaymentCount, setTodayPaymentCount] = useState(0);
  const [leaders, setLeaders] = useState<string[]>([]);

  // ✅ helper: รูปโปรไฟล์/รูปจาก backend อาจเป็น "uploads/..." หรือ "/uploads/..." หรือ url เต็ม
  const resolveImageUrl = (path?: string) => {
    if (!path) return "";
    if (path.startsWith("http://") || path.startsWith("https://")) return path;
    if (path.startsWith("/")) return `${apiUrlPicture}${path}`;
    return `${apiUrlPicture}${path}`;
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const evResponse = await ListEVChargingPayments();
        const paymentResponse = await ListPayments();
        const userResponse = await ListUsers();

        const todayDate = new Date().toISOString().split("T")[0];

        /* ======================================================
           1) EV Charging วันนี้ (แสดงเฉพาะ “ใช้ไปแล้ว”)
              - usedPower = Power - RemainingPower
              - usedBaht  = Price - (RemainingPower * EVcharging.Price)
                (fallback: usedPower * EVcharging.Price ถ้า Price ไม่มี)
        ====================================================== */
        const todayEV = Array.isArray(evResponse)
          ? evResponse.filter((item: any) => {
              const paymentDate = item?.Payment?.Date?.split("T")[0];
              return paymentDate === todayDate;
            })
          : [];

        let totalUsedPower = 0;
        let totalUsedBaht = 0;

        const map: Record<string, ChargerUsedStat> = {};

        todayEV.forEach((item: any) => {
          const chargerName = item?.EVcharging?.Name || "Unknown";

          const totalPower = Number(item?.Power) || 0; // kWh ที่ซื้อ/ได้มา
          const remainingPower = Math.max(0, Number(item?.RemainingPower) || 0);
          const usedPower = Math.max(0, totalPower - remainingPower);

          const rate = Number(item?.EVcharging?.Price) || 0; // บาท/kWh
          const paidBaht = Number(item?.Price) || 0; // บาทที่จ่ายสำหรับ type นั้น

          // มูลค่าไฟที่เหลือ (บาท)
          let remainingBaht = rate > 0 ? remainingPower * rate : 0;
          if (paidBaht > 0 && remainingBaht > paidBaht) remainingBaht = paidBaht;

          // เงินที่ใช้ไปแล้ว (บาท)
          let usedBaht = 0;
          if (paidBaht > 0) {
            usedBaht = Math.max(0, paidBaht - remainingBaht);
          } else if (rate > 0) {
            usedBaht = usedPower * rate;
          }

          totalUsedPower += usedPower;
          totalUsedBaht += usedBaht;

          if (!map[chargerName]) {
            map[chargerName] = { usedPower: 0, usedBaht: 0, rate };
          }
          map[chargerName].usedPower += usedPower;
          map[chargerName].usedBaht += usedBaht;
          map[chargerName].rate = rate || map[chargerName].rate;
        });

        setPower(totalUsedPower);
        setExpense(totalUsedBaht);
        setChargerUsedMap(map);

        /* ======================================================
           2) Payment วันนี้ (นับจำนวนรายการเพื่อโชว์ Recent Transactions)
        ====================================================== */
        const todayPayments = Array.isArray(paymentResponse)
          ? paymentResponse.filter((item: any) => item?.Date?.startsWith(todayDate))
          : [];
        setTodayPaymentCount(todayPayments.length);

        /* ======================================================
           3) Today date format
        ====================================================== */
        const date = new Date();
        const options: Intl.DateTimeFormatOptions = {
          year: "numeric",
          month: "short",
          day: "2-digit",
        };
        setToday(date.toLocaleDateString("en-US", options));

        /* ======================================================
           4) Leaders (Admin)
        ====================================================== */
        const adminUsers = Array.isArray(userResponse)
          ? userResponse.filter((user: any) => user?.UserRole?.RoleName === "Admin")
          : [];

        const adminImages = adminUsers
          .map((user: any) => user?.Profile)
          .filter(Boolean);

        setLeaders(adminImages);
      } catch (err) {
        console.error("❌ Overview fetch error:", err);
        setPower(0);
        setExpense(0);
        setChargerUsedMap({});
        setTodayPaymentCount(0);
        setLeaders([]);
      }
    };

    fetchData();
  }, []);

  const medicalproBranding = useMemo(() => {
    return {
      data: [
        { title: "Today Date", desc: today },
        { title: "Power", desc: `${power.toFixed(2)} kWh` }, // ✅ ใช้ไปแล้ว
        {
          title: "Expense",
          desc: `฿${expense.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
        }, // ✅ ใช้ไปแล้ว
      ],
    };
  }, [today, power, expense]);

  return (
    <div className="w-250 bg-gradient-to-br from-blue-50 to-blue-100 dark:text-gray-200 rounded-2xl shadow-lg border border-blue-200 p-6 m-3 transition-all duration-300 hover:shadow-xl">
      {/* Header */}
      <div className="flex justify-between items-center">
        <p className="text-xl font-semibold text-blue-800">Daily Overview</p>
        <button
          type="button"
          className="text-2xl font-semibold text-blue-500 hover:text-blue-700 transition-all"
        >
          <IoIosMore />
        </button>
      </div>

      {/* Date Tag */}
      <p className="text-xs font-semibold rounded-full w-fit px-3 py-1 mt-6 text-white bg-blue-600 shadow-md">
        {today}
      </p>

      {/* Summary */}
      <div className="flex gap-6 border-b border-blue-200 mt-6 pb-3">
        {medicalproBranding.data.map((item) => (
          <div key={item.title} className="pr-4">
            <p className="text-xs text-gray-500">{item.title}</p>
            <p className="text-sm font-semibold text-blue-800">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Power Type */}
      <div className="border-b border-blue-200 pb-4 mt-4">
        <p className="text-md font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <BsBatteryCharging className="text-blue-600" /> Power Type
        </p>

        <div className="flex flex-wrap gap-2">
          {Object.entries(chargerUsedMap).map(([name, stat]) => (
            <p
              key={name}
              className="cursor-pointer text-white py-1.5 px-3 rounded-full text-xs bg-blue-600 hover:bg-blue-700 transition-all shadow-sm"
              title={`${name} @ ฿${stat.rate.toFixed(2)}/kWh`}
            >
              {/* ✅ ต้องการรูปแบบ: 1.20 kWh • ฿3.15 */}
              {name}: {stat.usedPower.toFixed(2)} kWh • ฿
              {stat.usedBaht.toFixed(2)}
            </p>
          ))}

          {Object.keys(chargerUsedMap).length === 0 && (
            <p className="text-xs text-gray-400">No data available</p>
          )}
        </div>
      </div>

      {/* Leaders */}
      <div className="mt-4">
        <p className="text-md font-semibold text-blue-900 mb-2">Leaders</p>
        <div className="flex gap-3">
          {leaders.slice(0, 5).map((img, index) => (
            <img
              key={index}
              className="rounded-full w-9 h-9 object-cover ring-2 ring-blue-200 shadow-sm hover:scale-105 transition-transform"
              src={resolveImageUrl(img)}
              alt={`Leader ${index}`}
            />
          ))}

          {leaders.length === 0 && <p className="text-xs text-gray-400">No leaders found</p>}
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-between items-center mt-5 border-t border-blue-200 pt-3">
        <button
          type="button"
          className="text-white text-3xl p-4 rounded-full shadow-lg hover:shadow-2xl transition-all"
          style={{ backgroundColor: currentColor || "#2563eb" }}
        >
          <BsBatteryCharging />
        </button>
        <p className="text-blue-700 text-sm font-medium">
          {todayPaymentCount} Recent Transactions
        </p>
      </div>
    </div>
  );
};

export default Index;
