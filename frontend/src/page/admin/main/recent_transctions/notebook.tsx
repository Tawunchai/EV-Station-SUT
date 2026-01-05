import React, { useEffect, useMemo, useState } from "react";
import { BsCurrencyDollar } from "react-icons/bs";
import { FaCoins, FaUniversity, FaBolt } from "react-icons/fa";
import { useStateContext } from "../../../../contexts/ContextProvider";
import { DropDownListComponent } from "@syncfusion/ej2-react-dropdowns";
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

type EVRevenueRow = { name: string; usedBaht: number; usedKwh: number };

const MonthDropDown: React.FC<{
  currentMode: string;
  value: number;
  onChange: (val: number) => void;
}> = ({ currentMode, value, onChange }) => {
  return (
    <div className="w-32 border border-blue-200 px-2 py-1 rounded-md">
      <DropDownListComponent
        id="month"
        fields={{ text: "Time", value: "Id" }}
        style={{
          border: "none",
          color: currentMode === "Dark" ? "white" : undefined,
        }}
        value={value}
        dataSource={MONTH_OPTIONS}
        popupHeight="260px"
        popupWidth="140px"
        change={(e: any) => {
          if (typeof e?.value === "number") onChange(e.value);
        }}
      />
    </div>
  );
};

const Index: React.FC = () => {
  const { currentMode } = useStateContext();

  const now = useMemo(() => new Date(), []);
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear] = useState<number>(now.getFullYear());

  // ✅ PromptPay (Money Added) ต้องคำนึง RemainingPower → แสดง “ใช้ไปแล้ว” (net remaining)
  const [promptPayUsedAmount, setPromptPayUsedAmount] = useState<number>(0);

  const [totalCoins, setTotalCoins] = useState<number>(0);
  const [currentMonthTransactionCount, setCurrentMonthTransactionCount] =
    useState<number>(0);

  // ✅ EV “used revenue” แยกตามหัวชาร์จ
  const [evUsedByCharger, setEvUsedByCharger] = useState<EVRevenueRow[]>([]);

  const inSelectedMonth = (d: Date | string | null | undefined) => {
    if (!d) return false;
    const dd = typeof d === "string" ? new Date(d) : d;
    if (isNaN(dd.getTime())) return false;
    return dd.getMonth() === selectedMonth && dd.getFullYear() === selectedYear;
  };

  useEffect(() => {
    const fetchData = async () => {
      /* =========================================================
         1) Transactions Count (จาก Payments)
      ========================================================= */
      const payments = await ListPayments();
      if (Array.isArray(payments)) {
        const filtered = payments.filter((p: any) => inSelectedMonth(p?.Date));
        setCurrentMonthTransactionCount(filtered.length);
      } else {
        setCurrentMonthTransactionCount(0);
      }

      /* =========================================================
         2) Users coins (รวมทั้งหมด)
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
            ✅ คิด "ใช้ไปแล้ว" โดยคำนึง RemainingPower
            - usedKwh = max(0, Power - RemainingPower)
            - usedBaht:
              - ถ้ามี Price (บาทที่จ่ายของ type นี้) => usedBaht = Price - remainingBaht
              - remainingBaht = min(Price, RemainingPower * EVcharging.Price)
              - ถ้าไม่มี Price แต่มี rate => usedBaht = usedKwh * rate
      ========================================================= */
      const evPayments = await ListEVChargingPayments();
      if (Array.isArray(evPayments)) {
        const filteredEV = evPayments.filter((p: any) =>
          inSelectedMonth(p?.Payment?.Date ?? p?.CreatedAt)
        );

        // รวม PromptPay (Money Added) แบบ “ใช้ไปแล้ว”
        let usedBahtTotal = 0;

        // รวมแยกตามหัวชาร์จ
        const accMap: Record<string, { usedBaht: number; usedKwh: number }> = {};

        filteredEV.forEach((item: any) => {
          const name = item?.EVcharging?.Name ?? "Unknown EV";

          const totalPower = Number(item?.Power) || 0; // kWh ที่ซื้อ
          const remainingPower = Math.max(0, Number(item?.RemainingPower) || 0); // kWh เหลือ
          const usedPower = Math.max(0, totalPower - remainingPower); // ✅ ใช้ไปแล้ว

          const rate = Number(item?.EVcharging?.Price) || 0; // บาท/kWh
          const paidBaht = Number(item?.Price) || 0; // บาทที่จ่ายของ type นี้ (จาก backend)

          // เงินที่เหลือ (แปลงจาก RemainingPower * rate) และกันไม่ให้เกินเงินที่จ่ายจริง
          let remainingBaht = rate > 0 ? remainingPower * rate : 0;
          if (paidBaht > 0 && remainingBaht > paidBaht) remainingBaht = paidBaht;

          // ✅ เงินที่ “ใช้ไปแล้ว”
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

        const rows: EVRevenueRow[] = Object.entries(accMap).map(
          ([name, v]) => ({
            name,
            usedBaht: v.usedBaht,
            usedKwh: v.usedKwh,
          })
        );
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

  const recentTransactionsBase = [
    {
      icon: <BsCurrencyDollar />,
      // ✅ แสดง PromptPay แบบ “ใช้ไปแล้ว” (หัก remaining)
      amount: `${promptPayUsedAmount.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}฿`,
      title: "PromptPay",
      desc: "Money Added",
      iconColor: "#2563EB",
      iconBg: "#EFF6FF",
      pcColor: "blue-600",
    },
    {
      icon: <FaCoins />,
      amount: `${totalCoins.toLocaleString()}฿`,
      title: "Coins",
      desc: "All Payment",
      iconColor: "#3B82F6",
      iconBg: "#E0F2FE",
      pcColor: "blue-600",
    },
    {
      icon: <FaUniversity />,
      amount: `${currentMonthTransactionCount}`,
      title: "Transactions",
      desc: "Payment transactions",
      iconColor: "#1D4ED8",
      iconBg: "#DBEAFE",
      pcColor: "blue-600",
    },
  ];

  // ✅ EV Used rows (แสดง: "x.xx kWh • ฿y.yy")
  const evTransactions = evUsedByCharger.map((ev) => ({
    icon: <FaBolt />,
    amount: `${ev.usedKwh.toFixed(2)} kWh • ฿${ev.usedBaht.toFixed(2)}`,
    title: ev.name,
    desc: "Used energy revenue",
    iconColor: "#1E40AF",
    iconBg: "#E0E7FF",
    pcColor: "blue-700",
  }));

  const recentTransactions = [
    recentTransactionsBase[0],
    recentTransactionsBase[1],
    ...evTransactions,
    recentTransactionsBase[2],
  ];

  return (
    <div className="flex-1 bg-white dark:text-gray-200 dark:bg-secondary-dark-bg p-6 rounded-2xl border border-blue-100 shadow-sm">
      {/* Header */}
      <div className="flex justify-between items-center gap-2">
        <p className="text-xl font-semibold text-blue-800">
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
      <div className="mt-8 w-full md:w-[420px] lg:w-[460px] xl:w-[480px] 2xl:w-[500px]">
        {recentTransactions.map((item, idx) => (
          <div
            key={`${item.title}-${idx}`}
            className="flex justify-between items-center bg-gradient-to-r from-blue-50 to-white rounded-xl p-4 mb-3 hover:shadow-md transition-all"
          >
            <div className="flex gap-4 items-center">
              <button
                type="button"
                style={{
                  color: item.iconColor,
                  backgroundColor: item.iconBg,
                }}
                className="text-2xl rounded-lg p-4 hover:scale-105 transition-transform"
                aria-label={item.title}
              >
                {item.icon}
              </button>
              <div>
                <p className="text-md font-semibold text-blue-900">
                  {item.title}
                </p>
                <p className="text-sm text-blue-500">{item.desc}</p>
              </div>
            </div>

            <p className={`font-semibold text-${item.pcColor}`}>{item.amount}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Index;
