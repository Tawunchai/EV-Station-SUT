import React, { useEffect, useState } from "react";
import {
  ChartComponent,
  SeriesCollectionDirective,
  SeriesDirective,
  Inject,
  DateTime,
  Legend,
  Tooltip,
  ColumnSeries,
} from "@syncfusion/ej2-react-charts";
import { useStateContext } from "../../../../contexts/ContextProvider";
import { ListEVChargingPayments } from "../../../../services";
import { EVChargingPayListmentInterface } from "../../../../interface/IEV";

/* ============================================================
   TYPES + RANGE GUARDS
============================================================ */
type RangeType = "day" | "month" | "year";

const isDateRange = (v: any): v is [Date, Date] =>
  Array.isArray(v) &&
  v.length === 2 &&
  v.every((d) => d instanceof Date && !isNaN(d.getTime()));

const isMonthSel = (v: any): v is { month: string; year: string } =>
  v &&
  typeof v === "object" &&
  typeof v.month === "string" &&
  typeof v.year === "string";

const isYearRange = (v: any): v is [number, number] =>
  Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number");

/* ============================================================
   HELPERS
============================================================ */
const daysInMonth = (y: number, m1to12: number) =>
  new Date(y, m1to12, 0).getDate();

const firstDayOfMonth = (y: number, m0to11: number) => new Date(y, m0to11, 1);

const firstDayOfYear = (y: number) => new Date(y, 0, 1);

const kDay = (y: number, m1to12: number, d: number) =>
  `${y}-${String(m1to12).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const kMonth = (y: number, m1to12: number) =>
  `${y}-${String(m1to12).padStart(2, "0")}`;

/* ============================================================
   ✅ IMPORTANT: USED VALUE (คำนึง RemainingPower)
   - ใช้ไปแล้ว = เงินที่จ่าย (Price) - เงินที่เหลือตาม kWh ที่เหลือ
   - เงินที่เหลือ = RemainingPower * (EVcharging.Price บาท/kWh)
============================================================ */
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp0 = (v: number) => (v < 0 ? 0 : v);

/** เงินที่เหลือ (remain) */
const calcRemainBaht = (row: any) => {
  const remainingPower = clamp0(n(row?.RemainingPower)); // kWh เหลือ
  const paidBaht = clamp0(n(row?.Price)); // จ่ายจริง
  const rate = clamp0(n(row?.EVcharging?.Price)); // บาท/kWh

  let remainBaht = rate > 0 ? remainingPower * rate : 0;

  // กันไม่ให้เกินเงินจริงที่จ่าย
  if (paidBaht > 0 && remainBaht > paidBaht) remainBaht = paidBaht;

  return clamp0(remainBaht);
};

/** เงินที่ใช้ไปแล้ว (used) */
const calcUsedBaht = (row: any) => {
  const totalPower = n(row?.Power); // kWh ที่ซื้อ
  const remainingPower = clamp0(n(row?.RemainingPower)); // kWh ที่เหลือ
  const usedPower = clamp0(totalPower - remainingPower);

  const paidBaht = clamp0(n(row?.Price)); // เงินที่จ่าย
  const rate = clamp0(n(row?.EVcharging?.Price)); // บาท/kWh

  const remainBaht = calcRemainBaht(row);

  let usedBaht = 0;

  if (paidBaht > 0) {
    usedBaht = clamp0(paidBaht - remainBaht);
  } else if (rate > 0) {
    usedBaht = usedPower * rate;
  } else {
    usedBaht = 0;
  }

  return clamp0(usedBaht);
};

/* ============================================================
   TYPES
============================================================ */
type SeriesPoint = { x: Date; y: number };
type EvSeries = {
  name: string;
  evId: number;
  color: string;
  gradId: string;
  data: SeriesPoint[];
};

/* ------------------------------------------------------------
   COLOR PALETTE (minimal pastel เข้ม)
------------------------------------------------------------ */
/** Solar = ส้ม */
const SOLAR_COLOR = "#f97316"; // orange-500
/** Grid = ฟ้า */
const GRID_COLOR = "#3b82f6"; // blue-500
/** Summary (Used Total) = ม่วง */
const SUMMARY_COLOR = "#7c3aed"; // violet-600
/** Refund = เขียว */
const REFUND_COLOR = "#22c55e"; // green-500

/** สีสำหรับ EV อื่น ๆ */
const DEFAULT_PALETTE = [
  "#0ea5e9", // sky-500
  "#22c55e", // emerald-500
  "#14b8a6", // teal-500
  "#6366f1", // indigo-500
  "#facc15", // amber-400
  "#ec4899", // pink-500
  "#2dd4bf", // teal-400
  "#a855f7", // violet-500
];

/* ============================================================
   COLOR UTILS
============================================================ */
const hexToRgb = (hex: string) => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 37, g: 99, b: 235 };
  return {
    r: parseInt(m[1], 16),
    g: parseInt(m[2], 16),
    b: parseInt(m[3], 16),
  };
};

const lighten = (hex: string, pct = 0.35) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(
    ${Math.round(r + (255 - r) * pct)},
    ${Math.round(g + (255 - g) * pct)},
    ${Math.round(b + (255 - b) * pct)}
  )`;
};

const darken = (hex: string, pct = 0.18) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(
    ${Math.round(r * (1 - pct))},
    ${Math.round(g * (1 - pct))},
    ${Math.round(b * (1 - pct))}
  )`;
};

/**
 * เลือกสีตามชื่อ EV:
 * - ถ้ามีคำว่า "solar" → ส้ม
 * - ถ้ามีคำว่า "grid"  → ฟ้า
 * - อื่น ๆ → ใช้ DEFAULT_PALETTE ตาม index
 */
const getEvColor = (name: string, index: number) => {
  const lower = (name || "").toLowerCase();
  if (lower.includes("solar")) return SOLAR_COLOR;
  if (lower.includes("grid")) return GRID_COLOR;
  return DEFAULT_PALETTE[index % DEFAULT_PALETTE.length];
};

/**
 * เลือก id ของ gradient ให้แต่ละ EV
 */
const getEvGradientId = (name: string, index: number) => {
  const lower = (name || "").toLowerCase();
  if (lower.includes("solar")) return "grad-solar";
  if (lower.includes("grid")) return "grad-grid";
  return `grad-ev-${index}`;
};

/* ============================================================
   LOADER
============================================================ */
const Loader = () => (
  <div className="flex items-center justify-center h-80 text-slate-700">
    <span className="animate-spin border-4 border-slate-300 rounded-full border-t-transparent w-8 h-8 mr-3" />
    Loading...
  </div>
);

/* ============================================================
   GRADIENT DEFINITIONS (สำหรับ bar ทุกตัว)
============================================================ */
const GradientDefs: React.FC = () => (
  <svg width="0" height="0" style={{ position: "absolute" }}>
    <defs>
      {/* Solar (orange) */}
      <linearGradient id="grad-solar" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor={lighten(SOLAR_COLOR, 0.45)} />
        <stop offset="100%" stopColor={SOLAR_COLOR} />
      </linearGradient>

      {/* Grid (blue) */}
      <linearGradient id="grad-grid" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor={lighten(GRID_COLOR, 0.45)} />
        <stop offset="100%" stopColor={GRID_COLOR} />
      </linearGradient>

      {/* Summary (violet) */}
      <linearGradient id="grad-summary" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor={lighten(SUMMARY_COLOR, 0.5)} />
        <stop offset="100%" stopColor={SUMMARY_COLOR} />
      </linearGradient>

      {/* Refund (green) */}
      <linearGradient id="grad-refund" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor={lighten(REFUND_COLOR, 0.5)} />
        <stop offset="100%" stopColor={REFUND_COLOR} />
      </linearGradient>

      {/* Generic EV gradients */}
      {DEFAULT_PALETTE.map((c, i) => (
        <linearGradient
          key={i}
          id={`grad-ev-${i}`}
          x1="0%"
          y1="0%"
          x2="0%"
          y2="100%"
        >
          <stop offset="0%" stopColor={lighten(c, 0.4)} />
          <stop offset="100%" stopColor={c} />
        </linearGradient>
      ))}
    </defs>
  </svg>
);

/* ============================================================
   MAIN COMPONENT
============================================================ */
const EVRevenueChart: React.FC<{
  timeRangeType: RangeType;
  selectedRange: any;
}> = ({ timeRangeType, selectedRange }) => {
  // @ts-ignore
  const { currentMode } = useStateContext();

  const [seriesData, setSeriesData] = useState<any[]>([]);
  const [noData, setNoData] = useState(false);
  const [loading, setLoading] = useState(false);

  /* ============================================================
     FETCH + BUILD DATA
  ============================================================= */
  useEffect(() => {
    // Validate range type
    const valid =
      (timeRangeType === "day" && isDateRange(selectedRange)) ||
      (timeRangeType === "month" && isMonthSel(selectedRange)) ||
      (timeRangeType === "year" && isYearRange(selectedRange));

    if (!valid) {
      setSeriesData([]);
      setNoData(false);
      return;
    }

    const run = async () => {
      setLoading(true);

      try {
        const res = await ListEVChargingPayments();

        if (!res || res.length === 0) {
          setSeriesData([]);
          setNoData(true);
          return;
        }

        /* ========================================================
           FILTER BY RANGE (อิง Payment.Date)
        ========================================================= */
        const filtered = (res as any[]).filter((r) => {
          const iso = r?.Payment?.Date;
          if (!iso) return false;

          const d = new Date(iso);
          if (isNaN(d.getTime())) return false;

          if (timeRangeType === "day" && isDateRange(selectedRange)) {
            const [s0, e0] = selectedRange;
            const s = new Date(s0);
            const e = new Date(e0);
            s.setHours(0, 0, 0, 0);
            e.setHours(23, 59, 59, 999);
            return d >= s && d <= e;
          }

          if (timeRangeType === "month" && isMonthSel(selectedRange)) {
            return (
              d.getFullYear() === Number(selectedRange.year) &&
              d.getMonth() + 1 === Number(selectedRange.month)
            );
          }

          if (timeRangeType === "year" && isYearRange(selectedRange)) {
            const [ys, ye] = selectedRange;
            return d.getFullYear() >= ys && d.getFullYear() <= ye;
          }

          return false;
        });

        if (filtered.length === 0) {
          setSeriesData([]);
          setNoData(true);
          return;
        }

        /* ========================================================
           GROUP BY EV
        ========================================================= */
        type EvBucket = {
          name: string;
          items: EVChargingPayListmentInterface[];
        };

        const byEv: Record<number, EvBucket> = {};

        for (const r of filtered) {
          const evId = r.EVchargingID;
          const evName = r?.EVcharging?.Name || `EV #${evId}`;
          if (!byEv[evId]) byEv[evId] = { name: evName, items: [] };
          byEv[evId].items.push(r);
        }

        /* ========================================================
           SUM FUNCTIONS (USED + REFUND)
        ========================================================= */
        const sumDailyUsed = (rows: EVChargingPayListmentInterface[]) => {
          const map: Record<string, number> = {};
          for (const r of rows as any[]) {
            const iso = r?.Payment?.Date;
            if (!iso) continue;
            const d = new Date(iso);
            if (isNaN(d.getTime())) continue;

            const usedBaht = calcUsedBaht(r);
            const key = kDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
            map[key] = (map[key] || 0) + usedBaht;
          }
          return map;
        };

        const sumMonthlyUsed = (rows: EVChargingPayListmentInterface[]) => {
          const map: Record<string, number> = {};
          for (const r of rows as any[]) {
            const iso = r?.Payment?.Date;
            if (!iso) continue;
            const d = new Date(iso);
            if (isNaN(d.getTime())) continue;

            const usedBaht = calcUsedBaht(r);
            const key = kMonth(d.getFullYear(), d.getMonth() + 1);
            map[key] = (map[key] || 0) + usedBaht;
          }
          return map;
        };

        const sumYearlyUsed = (rows: EVChargingPayListmentInterface[]) => {
          const map: Record<string, number> = {};
          for (const r of rows as any[]) {
            const iso = r?.Payment?.Date;
            if (!iso) continue;
            const d = new Date(iso);
            if (isNaN(d.getTime())) continue;

            const usedBaht = calcUsedBaht(r);
            const key = String(d.getFullYear());
            map[key] = (map[key] || 0) + usedBaht;
          }
          return map;
        };
        //@ts-ignore
        // ✅ Refund = remainBaht รวมตามเวลาเดียวกับกราฟ
        const sumDailyRefund = (rows: EVChargingPayListmentInterface[]) => {
          const map: Record<string, number> = {};
          for (const r of rows as any[]) {
            const iso = r?.Payment?.Date;
            if (!iso) continue;
            const d = new Date(iso);
            if (isNaN(d.getTime())) continue;

            const refundBaht = calcRemainBaht(r);
            const key = kDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
            map[key] = (map[key] || 0) + refundBaht;
          }
          return map;
        };
        //@ts-ignore
        const sumMonthlyRefund = (rows: EVChargingPayListmentInterface[]) => {
          const map: Record<string, number> = {};
          for (const r of rows as any[]) {
            const iso = r?.Payment?.Date;
            if (!iso) continue;
            const d = new Date(iso);
            if (isNaN(d.getTime())) continue;

            const refundBaht = calcRemainBaht(r);
            const key = kMonth(d.getFullYear(), d.getMonth() + 1);
            map[key] = (map[key] || 0) + refundBaht;
          }
          return map;
        };
        //@ts-ignore
        const sumYearlyRefund = (rows: EVChargingPayListmentInterface[]) => {
          const map: Record<string, number> = {};
          for (const r of rows as any[]) {
            const iso = r?.Payment?.Date;
            if (!iso) continue;
            const d = new Date(iso);
            if (isNaN(d.getTime())) continue;

            const refundBaht = calcRemainBaht(r);
            const key = String(d.getFullYear());
            map[key] = (map[key] || 0) + refundBaht;
          }
          return map;
        };

        /* ========================================================
           BUILD EV SERIES (USED)
        ========================================================= */
        const buildUsedSeries = (): EvSeries[] => {
          const out: EvSeries[] = [];
          const evIds = Object.keys(byEv).map(Number);

          evIds.forEach((evId, idx) => {
            const bucket = byEv[evId];
            const color = getEvColor(bucket.name, idx);
            const gradId = getEvGradientId(bucket.name, idx);
            let data: SeriesPoint[] = [];

            if (timeRangeType === "day" && isDateRange(selectedRange)) {
              const [s0, e0] = selectedRange;
              const s = new Date(s0);
              s.setHours(0, 0, 0, 0);
              const e = new Date(e0);
              e.setHours(23, 59, 59, 999);

              const map = sumDailyUsed(bucket.items);
              const arr: SeriesPoint[] = [];
              const cur = new Date(s);
              while (cur <= e) {
                const key = kDay(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
                arr.push({ x: new Date(cur), y: map[key] || 0 });
                cur.setDate(cur.getDate() + 1);
              }
              data = arr;
            }

            if (timeRangeType === "month" && isMonthSel(selectedRange)) {
              const y = Number(selectedRange.year);
              const m = Number(selectedRange.month);

              const map = sumDailyUsed(bucket.items);
              const days = daysInMonth(y, m);

              const arr: SeriesPoint[] = [];
              for (let d = 1; d <= days; d++) {
                const key = kDay(y, m, d);
                arr.push({ x: new Date(y, m - 1, d), y: map[key] || 0 });
              }
              data = arr;
            }

            if (timeRangeType === "year" && isYearRange(selectedRange)) {
              const [ys, ye] = selectedRange;

              if (ys === ye) {
                const y = ys;
                const map = sumMonthlyUsed(bucket.items);
                const arr: SeriesPoint[] = [];
                for (let m = 1; m <= 12; m++) {
                  const key = kMonth(y, m);
                  arr.push({ x: firstDayOfMonth(y, m - 1), y: map[key] || 0 });
                }
                data = arr;
              } else {
                const map = sumYearlyUsed(bucket.items);
                const arr: SeriesPoint[] = [];
                for (let y = ys; y <= ye; y++) {
                  arr.push({ x: firstDayOfYear(y), y: map[String(y)] || 0 });
                }
                data = arr;
              }
            }

            out.push({
              name: bucket.name,
              evId,
              color,
              gradId,
              data: data.sort((a, b) => a.x.getTime() - b.x.getTime()),
            });
          });

          return out;
        };

        const usedSeriesAll = buildUsedSeries();

        /* ========================================================
           SUMMARY USED SERIES (รวมทุก EV)
        ========================================================= */
        const summaryUsedMap = new Map<number, number>();
        usedSeriesAll.forEach((s) => {
          s.data.forEach((p) => {
            const t = p.x.getTime();
            summaryUsedMap.set(t, (summaryUsedMap.get(t) || 0) + p.y);
          });
        });

        const summaryUsedData: SeriesPoint[] = Array.from(summaryUsedMap.entries())
          .map(([t, y]) => ({ x: new Date(t), y }))
          .sort((a, b) => a.x.getTime() - b.x.getTime());

        /* ========================================================
           REFUND SERIES (รวมทุก EV เป็นซีรีส์เดียว)  ✅ สีเขียว
           - “Refund” ที่แสดง = เงินที่เหลือตาม remainBaht
============================================================ */
        const buildRefundSummary = (): SeriesPoint[] => {
          // รวม refund ของทุก EV ให้เป็น Summary ตามเวลาเดียวกัน
          let map: Record<string, number> = {};

          if (timeRangeType === "day" && isDateRange(selectedRange)) {
            // รวมทุกแถว filtered
            map = {};
            for (const r of filtered as any[]) {
              const iso = r?.Payment?.Date;
              if (!iso) continue;
              const d = new Date(iso);
              if (isNaN(d.getTime())) continue;
              const key = kDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
              map[key] = (map[key] || 0) + calcRemainBaht(r);
            }

            const [s0, e0] = selectedRange;
            const s = new Date(s0);
            s.setHours(0, 0, 0, 0);
            const e = new Date(e0);
            e.setHours(23, 59, 59, 999);

            const arr: SeriesPoint[] = [];
            const cur = new Date(s);
            while (cur <= e) {
              const key = kDay(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());
              arr.push({ x: new Date(cur), y: map[key] || 0 });
              cur.setDate(cur.getDate() + 1);
            }
            return arr;
          }

          if (timeRangeType === "month" && isMonthSel(selectedRange)) {
            const y = Number(selectedRange.year);
            const m = Number(selectedRange.month);
            map = {};

            for (const r of filtered as any[]) {
              const iso = r?.Payment?.Date;
              if (!iso) continue;
              const d = new Date(iso);
              if (isNaN(d.getTime())) continue;
              const key = kDay(d.getFullYear(), d.getMonth() + 1, d.getDate());
              map[key] = (map[key] || 0) + calcRemainBaht(r);
            }

            const days = daysInMonth(y, m);
            const arr: SeriesPoint[] = [];
            for (let d = 1; d <= days; d++) {
              const key = kDay(y, m, d);
              arr.push({ x: new Date(y, m - 1, d), y: map[key] || 0 });
            }
            return arr;
          }

          // year
          if (timeRangeType === "year" && isYearRange(selectedRange)) {
            const [ys, ye] = selectedRange;

            // single year => monthly refund
            if (ys === ye) {
              const y = ys;
              map = {};

              for (const r of filtered as any[]) {
                const iso = r?.Payment?.Date;
                if (!iso) continue;
                const d = new Date(iso);
                if (isNaN(d.getTime())) continue;
                const key = kMonth(d.getFullYear(), d.getMonth() + 1);
                map[key] = (map[key] || 0) + calcRemainBaht(r);
              }

              const arr: SeriesPoint[] = [];
              for (let m = 1; m <= 12; m++) {
                const key = kMonth(y, m);
                arr.push({ x: firstDayOfMonth(y, m - 1), y: map[key] || 0 });
              }
              return arr;
            }

            // multi years => yearly refund
            map = {};
            for (const r of filtered as any[]) {
              const iso = r?.Payment?.Date;
              if (!iso) continue;
              const d = new Date(iso);
              if (isNaN(d.getTime())) continue;
              const key = String(d.getFullYear());
              map[key] = (map[key] || 0) + calcRemainBaht(r);
            }

            const arr: SeriesPoint[] = [];
            for (let y = ys; y <= ye; y++) {
              arr.push({ x: firstDayOfYear(y), y: map[String(y)] || 0 });
            }
            return arr;
          }

          return [];
        };

        const refundSummaryData = buildRefundSummary().sort(
          (a, b) => a.x.getTime() - b.x.getTime()
        );

        /* ========================================================
           BUILD FINAL SERIES DATA FOR CHART
        ========================================================= */
        const evSeriesForChart = usedSeriesAll.map((s) => {
          const borderColor = darken(s.color, 0.25);

          return {
            dataSource: s.data,
            xName: "x",
            yName: "y",
            name: s.name,
            type: "Column",
            width: 1.1,
            columnSpacing: 0.18,
            border: { width: 1.2, color: borderColor },
            fill: `url(#${s.gradId})`,
            cornerRadius: { topLeft: 7, topRight: 7 },
            marker: { visible: false },
            animation: { enable: true, duration: 800 },
          };
        });

        const summaryUsedSeriesForChart =
          summaryUsedData.length > 0
            ? [
              {
                dataSource: summaryUsedData,
                xName: "x",
                yName: "y",
                name: "Summary",
                type: "Column",
                width: 1.6,
                columnSpacing: 0.35,
                border: { width: 1.4, color: darken(SUMMARY_COLOR, 0.2) },
                fill: "url(#grad-summary)",
                cornerRadius: { topLeft: 9, topRight: 9 },
                marker: { visible: false },
                animation: { enable: true, duration: 900 },
              },
            ]
            : [];

        // ✅ Refund series สีเขียว (แสดงเป็นคอลัมน์อีกชุดหนึ่ง)
        const refundSeriesForChart =
          refundSummaryData.length > 0
            ? [
              {
                dataSource: refundSummaryData,
                xName: "x",
                yName: "y",
                name: "Refund",
                type: "Column",
                width: 1.35,
                columnSpacing: 0.28,
                border: { width: 1.4, color: darken(REFUND_COLOR, 0.18) },
                fill: "url(#grad-refund)",
                cornerRadius: { topLeft: 9, topRight: 9 },
                marker: { visible: false },
                animation: { enable: true, duration: 900 },
              },
            ]
            : [];

        // หมายเหตุ: ให้ Refund อยู่ท้าย เพื่อ legend ชัดเจน
        const finalSeries = [
          ...evSeriesForChart,
          ...summaryUsedSeriesForChart,
          ...refundSeriesForChart,
        ];

        setSeriesData(finalSeries);
        setNoData(finalSeries.every((s) => !s.dataSource || s.dataSource.length === 0));
      } catch {
        setSeriesData([]);
        setNoData(true);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [timeRangeType, selectedRange]);

  /* ============================================================
     AXIS SETTINGS
  ============================================================= */
  const isSingleYear =
    timeRangeType === "year" &&
    isYearRange(selectedRange) &&
    selectedRange[0] === selectedRange[1];

  const xLabelFormat =
    timeRangeType === "day"
      ? "dd/MM"
      : timeRangeType === "month"
        ? "dd MMM"
        : isSingleYear
          ? "MMM"
          : "yyyy";

  const xIntervalType =
    timeRangeType === "day"
      ? "Days"
      : timeRangeType === "month"
        ? "Days"
        : isSingleYear
          ? "Months"
          : "Years";

  /* ============================================================
     RENDER
  ============================================================= */
  return (
    <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 bg-white dark:bg-secondary-dark-bg rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 text-slate-900 dark:text-gray-100">
      {/* gradient defs สำหรับ bar ทั้งหมด */}
      <GradientDefs />

      <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-2">
        <div>
          <p className="text-base sm:text-lg font-semibold text-blue-900">
            EV Revenue Overview (Used)
          </p>
          <p className="text-[11px] text-slate-500">
            * คิด “ใช้ไปแล้ว” จาก Price - (RemainingPower × EVcharging.Price) และแสดง “Refund” (เงินคงเหลือ) สีเขียว
          </p>
        </div>

        <span className="text-xs sm:text-sm px-2 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 dark:bg-gray-700 dark:text-gray-100 dark:border-gray-600">
          {timeRangeType === "day" ? "Daily" : timeRangeType === "month" ? "Monthly" : "Yearly"}
        </span>
      </div>

      <div className="relative" style={{ minHeight: 440 }}>
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/70 dark:bg-gray-900/60">
            <Loader />
          </div>
        )}

        {!loading && noData ? (
          <div className="flex items-center justify-center h-80 text-red-500 font-bold">
            ไม่มีข้อมูลในช่วงเวลาที่เลือก
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ChartComponent
              id="ev-revenue-used"
              height="420px"
              width="100%"
              primaryXAxis={{
                valueType: "DateTime",
                labelFormat: xLabelFormat,
                intervalType: xIntervalType as any,
                edgeLabelPlacement: "Shift",
                majorGridLines: { width: 0 },
                labelStyle: {
                  color: currentMode === "Dark" ? "#e5e7eb" : "#6b7280",
                  fontWeight: "500",
                },
              }}
              primaryYAxis={{
                labelFormat: "{value} ฿",
                majorGridLines: {
                  width: 1,
                  dashArray: "4,4",
                  color: currentMode === "Dark" ? "#374151" : "#e5e7eb",
                },
                labelStyle: {
                  color: currentMode === "Dark" ? "#e5e7eb" : "#6b7280",
                  fontWeight: "500",
                },
              }}
              tooltip={{
                enable: true,
                shared: true,
                format: "<b>${series.name}</b> : ${point.y}",
              }}
              legendSettings={{
                visible: true,
                position: "Bottom",
                alignment: "Center",
                textStyle: {
                  color: currentMode === "Dark" ? "#e5e7eb" : "#4b5563",
                  fontWeight: "500",
                },
              }}
              background={currentMode === "Dark" ? "#111827" : "#ffffff"}
              chartArea={{ border: { width: 0 } }}
            >
              <Inject services={[ColumnSeries, DateTime, Legend, Tooltip]} />
              <SeriesCollectionDirective>
                {seriesData.map((s, i) => (
                  <SeriesDirective key={i} {...s} />
                ))}
              </SeriesCollectionDirective>
            </ChartComponent>
          </div>
        )}
      </div>
    </div>
  );
};

export default EVRevenueChart;
