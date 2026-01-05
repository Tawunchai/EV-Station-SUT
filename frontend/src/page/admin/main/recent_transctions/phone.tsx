import React, { useEffect, useMemo, useState } from "react";
import { DropDownListComponent } from "@syncfusion/ej2-react-dropdowns";
import { BsCurrencyDollar } from "react-icons/bs";
import { FaCoins, FaUniversity, FaBolt } from "react-icons/fa";
import { useStateContext } from "../../../../contexts/ContextProvider";
import {
  ListPayments,
  ListUsers,
  ListEVChargingPayments,
} from "../../../../services";

// ======= Month options (Jan–Dec) =======
const MONTH_OPTIONS = [
  { Id: 0, Time: "Jan" },
  { Id: 1, Time: "Feb" },
  { Id: 2, Time: "Mar" },
  { Id: 3, Time: "Apr" },
  { Id: 4, Time: "May" },
  { Id: 5, Time: "Jun" },
  { Id: 6, Time: "Jul" },
  { Id: 7, Time: "Aug" },
  { Id: 8, Time: "Sep" },
  { Id: 9, Time: "Oct" },
  { Id: 10, Time: "Nov" },
  { Id: 11, Time: "Dec" },
];

type EVUsedRow = { name: string; usedBaht: number; usedKwh: number };

const MonthDropDown: React.FC<{
  currentMode: string;
  value: number; // 0-11
  onChange: (val: number) => void;
}> = ({ currentMode, value, onChange }) => {
  return (
    <div className="w-24 border border-blue-200 px-2 py-1 rounded-md bg-white">
      <DropDownListComponent
        id="month-mobile"
        fields={{ text: "Time", value: "Id" }}
        style={{
          border: "none",
          color: currentMode === "Dark" ? "white" : "#2563eb",
        }}
        value={value}
        dataSource={MONTH_OPTIONS}
        popupHeight="220px"
        popupWidth="100px"
        change={(e: any) => {
          if (typeof e?.value === "number") onChange(e.value);
        }}
      />
    </div>
  );
};

const EVBlueTransactionsMobile: React.FC = () => {
  const { currentMode } = useStateContext();

  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear] = useState<number>(now.getFullYear());

  // ✅ PromptPay (Money Added) แบบ “ใช้ไปแล้ว” (คิด RemainingPower)
  const [promptPayUsedAmount, setPromptPayUsedAmount] = useState<number>(0);

  const [totalCoins, setTotalCoins] = useState<number>(0);
  const [currentMonthTransactionCount, setCurrentMonthTransactionCount] =
    useState<number>(0);

  // ✅ EV Used Revenue (แยกตามหัวชาร์จ)
  const [evUsedByCharger, setEvUsedByCharger] = useState<EVUsedRow[]>([]);

  const inSelectedMonth = (raw: Date | string | null | undefined) => {
    if (!raw) return false;
    const d = typeof raw === "string" ? new Date(raw) : raw;
    if (isNaN(d.getTime())) return false;
    return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
  };

  useEffect(() => {
    const fetchData = async () => {
      /* =========================================================
         1) Transactions count (Payments)
      ========================================================= */
      const payments = await ListPayments();
      if (Array.isArray(payments)) {
        const filtered = payments.filter((p: any) => inSelectedMonth(p?.Date));
        setCurrentMonthTransactionCount(filtered.length);
      } else {
        setCurrentMonthTransactionCount(0);
      }

      /* =========================================================
         2) Coins (รวมทุก user)
      ========================================================= */
      const users = await ListUsers();
      if (Array.isArray(users)) {
        const coinSum = users.reduce(
          (acc, curr) => acc + (Number(curr?.Coin) || 0),
          0
        );
        setTotalCoins(coinSum);
      } else {
        setTotalCoins(0);
      }

      /* =========================================================
         3) EV Charging Payments เดือนที่เลือก
            ✅ คิด “ใช้ไปแล้ว” โดยคำนึง RemainingPower
            - usedKwh = max(0, Power - RemainingPower)
            - usedBaht:
              - ถ้ามี Price (บาทที่จ่ายของ type นี้) => usedBaht = Price - remainingBaht
              - remainingBaht = min(Price, RemainingPower * EVcharging.Price)
              - ถ้าไม่มี Price แต่มี rate => usedBaht = usedKwh * rate
            ✅ PromptPay Money Added = รวม usedBaht (ไม่ใช่ยอดจ่ายทั้งหมด)
      ========================================================= */
      const evPayments = await ListEVChargingPayments();
      if (Array.isArray(evPayments)) {
        const filteredEV = evPayments.filter((p: any) =>
          inSelectedMonth(p?.Payment?.Date ?? p?.CreatedAt)
        );

        let usedBahtTotal = 0;

        const accMap: Record<string, { usedBaht: number; usedKwh: number }> = {};

        filteredEV.forEach((item: any) => {
          const name = item?.EVcharging?.Name ?? "Unknown EV";

          const totalPower = Number(item?.Power) || 0; // kWh ที่ซื้อ
          const remainingPower = Math.max(0, Number(item?.RemainingPower) || 0); // kWh เหลือ
          const usedPower = Math.max(0, totalPower - remainingPower); // ✅ ใช้ไปแล้ว

          const rate = Number(item?.EVcharging?.Price) || 0; // บาท/kWh
          const paidBaht = Number(item?.Price) || 0; // บาทที่จ่ายของ type นี้ (จาก backend)

          let remainingBaht = rate > 0 ? remainingPower * rate : 0;
          if (paidBaht > 0 && remainingBaht > paidBaht) remainingBaht = paidBaht;

          let usedBaht = 0;
          if (paidBaht > 0) {
            usedBaht = Math.max(0, paidBaht - remainingBaht);
          } else if (rate > 0) {
            usedBaht = usedPower * rate;
          }

          usedBahtTotal += usedBaht;

          if (!accMap[name]) accMap[name] = { usedBaht: 0, usedKwh: 0 };
          accMap[name].usedBaht += usedBaht;
          accMap[name].usedKwh += usedPower;
        });

        setPromptPayUsedAmount(usedBahtTotal);

        const rows: EVUsedRow[] = Object.entries(accMap).map(([name, v]) => ({
          name,
          usedBaht: v.usedBaht,
          usedKwh: v.usedKwh,
        }));
        rows.sort((a, b) => b.usedBaht - a.usedBaht);
        setEvUsedByCharger(rows);
      } else {
        setPromptPayUsedAmount(0);
        setEvUsedByCharger([]);
      }
    };

    fetchData();
  }, [selectedMonth, selectedYear]);

  const monthLabel =
    MONTH_OPTIONS.find((m) => m.Id === selectedMonth)?.Time ?? "";

  const baseTransactions = [
    {
      icon: <BsCurrencyDollar />,
      amount: `${promptPayUsedAmount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}฿`,
      title: "PromptPay",
      desc: "Money Added (Used)",
      iconColor: "#2563EB",
      iconBg: "#EFF6FF",
    },
    {
      icon: <FaCoins />,
      amount: `${totalCoins.toLocaleString()}฿`,
      title: "Coins",
      desc: "All Payment",
      iconColor: "#3B82F6",
      iconBg: "#E0F2FE",
    },
    {
      icon: <FaUniversity />,
      amount: `${currentMonthTransactionCount}`,
      title: "Transactions",
      desc: "This Month",
      iconColor: "#1E40AF",
      iconBg: "#DBEAFE",
    },
  ];

  const evTransactions = evUsedByCharger.map((ev) => ({
    icon: <FaBolt />,
    // ✅ format ตามที่คุณต้องการ: "1.20 kWh • ฿3.15"
    amount: `${ev.usedKwh.toFixed(2)} kWh • ฿${ev.usedBaht.toFixed(2)}`,
    title: ev.name,
    desc: "Used energy revenue",
    iconColor: "#1D4ED8",
    iconBg: "#E0E7FF",
  }));

  const recentTransactions = [
    baseTransactions[0],
    baseTransactions[1],
    ...evTransactions,
    baseTransactions[2],
  ];

  return (
    <div className="w-[94%] mx-auto bg-gradient-to-br from-blue-50 via-white to-blue-100 text-blue-800 rounded-2xl shadow-sm border border-blue-200 p-4 mt-3 mb-3">
      {/* Header */}
      <div className="flex justify-between items-center gap-2">
        <p className="text-base font-semibold text-blue-700 leading-tight">
          Recent Transactions{" "}
          <span className="text-blue-500">
            ({monthLabel} {selectedYear})
          </span>
        </p>

        <MonthDropDown
          currentMode={currentMode}
          value={selectedMonth}
          onChange={setSelectedMonth}
        />
      </div>

      {/* Transactions */}
      <div className="mt-4 flex flex-col gap-3">
        {recentTransactions.map((item, idx) => (
          <div
            key={`${item.title}-${idx}`}
            className="flex justify-between items-center bg-gradient-to-r from-blue-50 to-white rounded-xl px-3 py-2 shadow-sm hover:shadow-md transition-all"
          >
            <div className="flex gap-3 items-center min-w-0">
              <div
                className="text-xl p-2.5 rounded-full shadow-sm shrink-0"
                style={{ backgroundColor: item.iconBg, color: item.iconColor }}
                aria-label={item.title}
              >
                {item.icon}
              </div>

              <div className="min-w-0">
                <p className="text-sm font-semibold text-blue-900 truncate">
                  {item.title}
                </p>
                <p className="text-xs text-blue-500 truncate">{item.desc}</p>
              </div>
            </div>

            <p className="text-right text-sm font-bold text-blue-700 shrink-0">
              {item.amount}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EVBlueTransactionsMobile;
