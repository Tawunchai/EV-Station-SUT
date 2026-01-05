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
  usedPower: number; // kWh ใช้ไปแล้ว
  usedBaht: number;  // บาทใช้ไปแล้ว
  rate: number;      // บาท/kWh
};

const PhoneEVOverview = () => {
  const { currentColor } = useStateContext();

  // ✅ ใช้ไปแล้วเท่านั้น
  const [power, setPower] = useState(0);
  const [expense, setExpense] = useState(0);

  const [today, setToday] = useState("");
  const [chargerUsedMap, setChargerUsedMap] = useState<Record<string, ChargerUsedStat>>({});
  const [todayPaymentCount, setTodayPaymentCount] = useState(0);
  const [leaders, setLeaders] = useState<string[]>([]);

  // ✅ helper: รองรับ uploads/... , /uploads/... , url เต็ม
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

        /* =========================================================
           1) EV Charging วันนี้ (คำนวณ “ใช้ไปแล้ว”)
              usedPower = Power - RemainingPower
              usedBaht  = Price - (RemainingPower * EVcharging.Price)
              fallback: usedPower * EVcharging.Price
        ========================================================= */
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

          const totalPower = Number(item?.Power) || 0;
          const remainingPower = Math.max(0, Number(item?.RemainingPower) || 0);
          const usedPower = Math.max(0, totalPower - remainingPower);

          const rate = Number(item?.EVcharging?.Price) || 0; // บาท/kWh
          const paidBaht = Number(item?.Price) || 0;         // บาทที่จ่ายสำหรับ type นั้น

          let remainingBaht = rate > 0 ? remainingPower * rate : 0;
          if (paidBaht > 0 && remainingBaht > paidBaht) remainingBaht = paidBaht;

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

        /* =========================================================
           2) Payment วันนี้ (นับจำนวนรายการ)
        ========================================================= */
        const todayPayments = Array.isArray(paymentResponse)
          ? paymentResponse.filter((item: any) => item?.Date?.startsWith(todayDate))
          : [];
        setTodayPaymentCount(todayPayments.length);

        /* =========================================================
           3) Today Date Display
        ========================================================= */
        const date = new Date();
        const options: Intl.DateTimeFormatOptions = {
          year: "numeric",
          month: "short",
          day: "2-digit",
        };
        setToday(date.toLocaleDateString("en-US", options));

        /* =========================================================
           4) Leaders (Admin)
        ========================================================= */
        const admins = Array.isArray(userResponse)
          ? userResponse.filter((user: any) => user?.UserRole?.RoleName === "Admin")
          : [];

        const adminImages = admins.map((u: any) => u?.Profile).filter(Boolean);
        setLeaders(adminImages);
      } catch (err) {
        console.error("❌ PhoneEVOverview fetch error:", err);
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
          })}`, // ✅ ใช้ไปแล้ว
        },
      ],
    };
  }, [today, power, expense]);

  return (
    <div className="w-[92%] mx-auto bg-white rounded-2xl shadow-md border border-blue-100 p-4 mt-3 mb-4">
      {/* ===== Header ===== */}
      <div className="flex justify-between items-center">
        <p className="text-base font-semibold text-blue-800">EV Station Status</p>
        <button
          type="button"
          className="text-lg font-semibold text-blue-500 hover:text-blue-700 transition-all"
        >
          <IoIosMore />
        </button>
      </div>

      {/* ===== Date Tag ===== */}
      <p className="text-xs font-semibold rounded-full w-fit px-3 py-1 mt-4 text-white bg-blue-600 shadow-sm">
        {today}
      </p>

      {/* ===== Summary ===== */}
      <div className="flex justify-between border-b border-blue-100 mt-4 pb-2">
        {medicalproBranding.data.map((item) => (
          <div key={item.title} className="flex flex-col items-start pr-2 min-w-0">
            <p className="text-[11px] text-gray-500">{item.title}</p>
            <p className="text-sm font-semibold text-blue-800 truncate">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* ===== Power Type (ใช้ไปแล้ว) ===== */}
      <div className="border-b border-blue-100 pb-3 mt-3">
        <p className="text-sm font-semibold text-blue-900 mb-1 flex items-center gap-2">
          <BsBatteryCharging className="text-blue-600" /> Power Type
        </p>

        <div className="flex flex-wrap gap-1.5">
          {Object.entries(chargerUsedMap).map(([name, stat]) => (
            <p
              key={name}
              className="text-white py-[3px] px-2.5 rounded-full text-[11px] bg-blue-600 hover:bg-blue-700 transition-all shadow-sm"
              title={`${name} @ ฿${stat.rate.toFixed(2)}/kWh`}
            >
              {name}: {stat.usedPower.toFixed(2)} kWh • ฿{stat.usedBaht.toFixed(2)}
            </p>
          ))}

          {Object.keys(chargerUsedMap).length === 0 && (
            <p className="text-[11px] text-gray-400">No data available</p>
          )}
        </div>
      </div>

      {/* ===== Leaders ===== */}
      <div className="mt-3">
        <p className="text-sm font-semibold text-blue-900 mb-1">Leaders</p>
        <div className="flex gap-2">
          {leaders.slice(0, 5).map((img, index) => (
            <img
              key={index}
              className="rounded-full w-7 h-7 object-cover ring-1 ring-blue-200 shadow-sm"
              src={resolveImageUrl(img)}
              alt={`Leader ${index}`}
            />
          ))}

          {leaders.length === 0 && (
            <p className="text-[11px] text-gray-400">No leaders found</p>
          )}
        </div>
      </div>

      {/* ===== Footer ===== */}
      <div className="flex justify-between items-center mt-4 border-t border-blue-100 pt-3">
        <button
          type="button"
          className="text-white text-2xl p-3 rounded-full shadow-md hover:shadow-lg transition-all"
          style={{ backgroundColor: currentColor || "#2563eb" }}
        >
          <BsBatteryCharging />
        </button>
        <p className="text-blue-700 text-xs font-medium">
          {todayPaymentCount} Recent Transactions
        </p>
      </div>
    </div>
  );
};

export default PhoneEVOverview;