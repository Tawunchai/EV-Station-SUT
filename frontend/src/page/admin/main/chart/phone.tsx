import React, { useEffect, useMemo, useState } from "react";
import { useStateContext } from "../../../../contexts/ContextProvider";
import { DropDownListComponent } from "@syncfusion/ej2-react-dropdowns";
import {
  ChartComponent,
  SeriesCollectionDirective,
  SeriesDirective,
  Inject,
  LineSeries,
  DateTime,
  Legend,
  Tooltip,
} from "@syncfusion/ej2-react-charts";
import type { EdgeLabelPlacement } from "@syncfusion/ej2-react-charts";
import { ListEVChargingPayments } from "../../../../services";

// ---------------- Axis styles (mobile tone: blue) ----------------
const LinePrimaryYAxisBase = {
  labelFormat: "{value}฿",
  rangePadding: "None" as const,
  minimum: 0,
  interval: 1000, // maximum จะคำนวณไดนามิก
  lineStyle: { width: 0 },
  majorTickLines: { width: 1, color: "#BFDBFE" },
  minorTickLines: { width: 0 },
  labelStyle: {
    color: "#2563EB",
    fontWeight: "600",
    fontFamily: "Inter, sans-serif",
  },
  majorGridLines: { width: 1, dashArray: "4,4", color: "#DBEAFE" },
};

const LinePrimaryXAxis = {
  valueType: "DateTime" as const,
  labelFormat: "MMM yyyy",
  intervalType: "Months" as const,
  edgeLabelPlacement: "Shift" as EdgeLabelPlacement,
  majorGridLines: { width: 0 },
  background: "transparent",
  labelStyle: {
    color: "#2563EB",
    fontWeight: "600",
    fontFamily: "Inter, sans-serif",
  },
};

// ---------------- UI helpers ----------------
type MonthOption = { Id: number; Time: string }; // Id: -1=All, 0..11 = Jan..Dec
const MONTH_OPTIONS: MonthOption[] = [
  { Id: -1, Time: "All" },
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

const MonthDropDown: React.FC<{
  currentMode: string;
  value: number; // -1=All, 0..11
  onChange: (val: number) => void;
}> = ({ currentMode, value, onChange }) => (
  <div className="w-24 border border-blue-300 px-2 py-1 rounded-md bg-white">
    <DropDownListComponent
      id="month-mobile"
      fields={{ text: "Time", value: "Id" }}
      style={{
        border: "none",
        color: currentMode === "Dark" ? "white" : "#1E40AF",
      }}
      value={value}
      dataSource={MONTH_OPTIONS}
      popupHeight="220px"
      popupWidth="100px"
      change={(e: any) => typeof e?.value === "number" && onChange(e.value)}
    />
  </div>
);

// ---------------- Types ----------------
type Point = { x: Date; y: number };

// ✅ helper: format ช่วงเดือนให้ “ใช้ไปแล้ว” (คำนึง RemainingPower)
const calcUsedBahtFromEVItem = (item: any) => {
  const totalPower = Number(item?.Power) || 0; // kWh ซื้อ
  const remainingPower = Math.max(0, Number(item?.RemainingPower) || 0); // kWh เหลือ
  const usedPower = Math.max(0, totalPower - remainingPower);

  const rate = Number(item?.EVcharging?.Price) || 0; // บาท/kWh
  const paidBaht = Number(item?.Price) || 0; // บาทที่จ่ายของ type นี้

  let remainingBaht = rate > 0 ? remainingPower * rate : 0;
  if (paidBaht > 0 && remainingBaht > paidBaht) remainingBaht = paidBaht;

  let usedBaht = 0;
  if (paidBaht > 0) {
    usedBaht = Math.max(0, paidBaht - remainingBaht);
  } else if (rate > 0) {
    usedBaht = usedPower * rate;
  }

  return usedBaht;
};

const MonthlyRevenueChartMobile: React.FC = () => {
  const { currentMode } = useStateContext();

  const now = useMemo(() => new Date(), []);
  const [year] = useState<number>(now.getFullYear()); // ✅ ใช้ปีปัจจุบันอัตโนมัติ
  const [month, setMonth] = useState<number>(-1); // -1 = All (ทั้งปี)

  const [data, setData] = useState<Point[]>([]);
  const [yMax, setYMax] = useState<number>(5000);

  // โหลดและคำนวณข้อมูลตามเดือน (ปีปัจจุบัน) + คำนึง RemainingPower
  useEffect(() => {
    const run = async () => {
      const evPayments = await ListEVChargingPayments();
      if (!Array.isArray(evPayments)) {
        setData([]);
        setYMax(1000);
        return;
      }

      // ✅ รวม “Used Revenue” เป็นรายเดือนของ "ปีปัจจุบัน" (อิง Payment.Date ถ้ามี ไม่งั้น fallback CreatedAt)
      const monthlyMap = Array.from({ length: 12 }, () => 0);

      for (const item of evPayments) {
        const raw = item?.Payment?.Date ?? item?.CreatedAt;
        const d = new Date(raw!);
        if (isNaN(d.getTime()) || d.getFullYear() !== year) continue;

        const usedBaht = calcUsedBahtFromEVItem(item);
        monthlyMap[d.getMonth()] += usedBaht;
      }

      // All = 12 จุด, เลือกเดือน = 1 จุด
      let points: Point[] = [];
      if (month === -1) {
        points = monthlyMap.map((sum, m) => ({
          x: new Date(year, m, 1),
          y: sum,
        }));
      } else {
        points = [{ x: new Date(year, month, 1), y: monthlyMap[month] || 0 }];
      }

      points.sort((a, b) => a.x.getTime() - b.x.getTime());

      // yMax ไดนามิก (ขั้นละ 1,000 อย่างน้อย 1,000)
      const localMax = Math.max(0, ...points.map((p) => p.y));
      const roundedMax = Math.max(1000, Math.ceil(localMax / 1000) * 1000);

      setYMax(roundedMax);
      setData(points);
    };

    run();
  }, [year, month]);

  const monthLabel = useMemo(
    () => MONTH_OPTIONS.find((m) => m.Id === month)?.Time ?? "All",
    [month]
  );

  const lineCustomSeries = [
    {
      dataSource: data,
      xName: "x",
      yName: "y",
      name: "Used Revenue",
      width: "2",
      fill: "rgba(59,130,246,0.1)",
      border: { width: 2, color: "#2563EB" },
      marker: {
        visible: true,
        width: 8,
        height: 8,
        fill: "#3B82F6",
        border: { width: 2, color: "#1E40AF" },
      },
      type: "Line",
      animation: { enable: true, duration: 800 },
    },
  ];

  return (
    <div className="w-[94%] mx-auto bg-gradient-to-br from-blue-50 via-white to-blue-100 p-4 rounded-2xl shadow-sm border border-blue-200 text-blue-700">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div className="min-w-0">
          <p className="text-base font-semibold truncate">
            Monthly Revenue{" "}
            <span className="text-blue-500">
              ({monthLabel} {year})
            </span>
          </p>
          <p className="text-[11px] text-blue-500/80 mt-0.5">
            * Calculated from used power (Power - RemainingPower)
          </p>
        </div>

        {/* ✅ เลือกเฉพาะเดือน */}
        <MonthDropDown currentMode={currentMode} value={month} onChange={setMonth} />
      </div>

      {/* Chart */}
      <div className="overflow-x-auto">
        <ChartComponent
          id="mobile-monthly-revenue-chart"
          height="260px"
          primaryXAxis={LinePrimaryXAxis}
          primaryYAxis={{ ...LinePrimaryYAxisBase, maximum: yMax, interval: 1000 }}
          chartArea={{ border: { width: 0 } }}
          tooltip={{
            enable: true,
            format: "${point.x} : ${point.y}",
          }}
          margin={{ top: 10, bottom: 30, left: 10, right: 10 }}
          legendSettings={{
            visible: true,
            position: "Bottom",
            alignment: "Center",
            textStyle: { color: "#2563EB", fontWeight: "600" },
            background: "transparent",
          }}
          background={currentMode === "Dark" ? "#1E293B" : "transparent"}
        >
          <Inject services={[LineSeries, DateTime, Legend, Tooltip]} />
          <SeriesCollectionDirective>
            {lineCustomSeries.map((item: any, index: number) => (
              <SeriesDirective key={index} {...item} />
            ))}
          </SeriesCollectionDirective>
        </ChartComponent>
      </div>
    </div>
  );
};

export default MonthlyRevenueChartMobile;
