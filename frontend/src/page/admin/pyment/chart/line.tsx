import { useEffect, useState } from "react";
import { DatePicker, Select } from "antd";
import dayjs, { Dayjs } from "dayjs";
import { useStateContext } from "../../../../contexts/ContextProvider";
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
import { EVChargingPayListmentInterface } from "../../../../interface/IEV";
import "dayjs/locale/th";

const { RangePicker } = DatePicker;

const LinePrimaryYAxis = {
  labelFormat: "{value}฿",
  rangePadding: "None" as "None",
  lineStyle: { width: 0 },
  majorTickLines: { width: 1, color: "#CBD5E1" },
  minorTickLines: { width: 0 },
  labelStyle: {
    color: "#64748B",
    fontWeight: "600",
    fontFamily: "Inter, sans-serif",
  },
  majorGridLines: { width: 1, dashArray: "5,5", color: "#E2E8F0" },
};

// ================== HELPERS (คำนึง RemainingPower จริง) ==================
const n = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const clamp0 = (v: number) => (v < 0 ? 0 : v);

type UsedRemain = { usedBaht: number; remainBaht: number };

const calcUsedRemainBaht = (p: any): UsedRemain => {
  // โครงสร้างจาก backend ตัวอย่าง:
  // p.Power (kWh ที่ซื้อ), p.RemainingPower (kWh ที่เหลือ)
  // p.Price (เงินที่จ่ายของ type นี้), p.EVcharging.Price (บาท/kWh)
  const totalPower = n(p?.Power);
  const remainingPower = clamp0(n(p?.RemainingPower));
  const usedPower = clamp0(totalPower - remainingPower);

  const paidBaht = clamp0(n(p?.Price)); // เงินที่จ่ายของรายการนี้ (ของ type นี้)
  const rate = clamp0(n(p?.EVcharging?.Price)); // บาท/kWh

  // เงินคงเหลือ "ตาม kWh ที่เหลือ"
  let remainBaht = rate > 0 ? remainingPower * rate : 0;

  // กันกรณี remainBaht เกินเงินจริงที่จ่าย (เช่น backend ปัดเศษ/ข้อมูลเพี้ยน)
  if (paidBaht > 0 && remainBaht > paidBaht) remainBaht = paidBaht;

  // เงินที่ใช้ไปแล้ว
  let usedBaht = 0;

  if (paidBaht > 0) {
    // ใช้สูตรหลัก: used = paid - remain
    usedBaht = clamp0(paidBaht - remainBaht);
  } else if (rate > 0) {
    // fallback: ไม่มี Price ที่จ่ายมา → คิดจาก usedPower * rate
    usedBaht = usedPower * rate;
    // และ remain จาก remainingPower * rate (ที่คำนวณไว้แล้ว)
  } else {
    usedBaht = 0;
    remainBaht = 0;
  }

  // กันเลขติดลบ/NaN อีกชั้น
  return { usedBaht: clamp0(usedBaht), remainBaht: clamp0(remainBaht) };
};

// ================== MAIN COMPONENT ==================
const MonthlyRevenueChart = () => {
  // @ts-ignore
  const { currentMode } = useStateContext();

  const [chartDataSets, setChartDataSets] = useState<any[]>([]);

  // day / month / year
  const [rangeType, setRangeType] = useState<"day" | "month" | "year">("day");

  // range (Dayjs)
  const [startDate, setStartDate] = useState<Dayjs>(dayjs().subtract(7, "day"));
  const [endDate, setEndDate] = useState<Dayjs>(dayjs());

  useEffect(() => {
    const fetchChartData = async () => {
      const data = await ListEVChargingPayments();
      if (!Array.isArray(data)) {
        setChartDataSets([]);
        return;
      }

      // ✅ สะสม “ใช้ไปแล้ว” และ “คงเหลือ” แยก bucket เดียวกัน
      const usedMap: Record<string, number> = {};
      const remainMap: Record<string, number> = {};

      for (const raw of data as EVChargingPayListmentInterface[]) {
        const p: any = raw;

        // ✅ อิงวันที่จาก Payment.Date เป็นหลัก (ตรงกับวันที่ทำรายการ)
        const paymentDate = p?.Payment?.Date ?? p?.CreatedAt;
        if (!paymentDate) continue;

        const date = dayjs(paymentDate);
        if (!date.isValid()) continue;

        // filter ช่วงวันที่
        if (date.isBefore(startDate) || date.isAfter(endDate)) continue;

        // key ตามโหมด
        let key = "";
        if (rangeType === "day") key = date.format("YYYY-MM-DD");
        else if (rangeType === "month") key = date.format("YYYY-MM");
        else key = date.format("YYYY");

        // ✅ คำนวณจาก RemainingPower จริง
        const { usedBaht, remainBaht } = calcUsedRemainBaht(p);

        usedMap[key] = (usedMap[key] || 0) + usedBaht;
        remainMap[key] = (remainMap[key] || 0) + remainBaht;
      }

      // แปลงเป็น point สำหรับ Syncfusion
      const toPoint = (key: string, y: number) => {
        if (rangeType === "day") return { x: new Date(key), y };
        if (rangeType === "month") {
          const [yy, mm] = key.split("-").map(Number);
          return { x: new Date(yy, (mm || 1) - 1, 1), y };
        }
        const yy = Number(key);
        return { x: new Date(yy, 0, 1), y };
      };

      const usedPoints = Object.entries(usedMap)
        .map(([k, v]) => toPoint(k, v))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

      const remainPoints = Object.entries(remainMap)
        .map(([k, v]) => toPoint(k, v))
        .sort((a, b) => a.x.getTime() - b.x.getTime());

      // ถ้าไม่มีข้อมูลเลย ให้ยังคงแสดง series ว่าง (กัน UI เพี้ยน)
      setChartDataSets([
        {
          name:
            rangeType === "day"
              ? "Used revenue (daily)"
              : rangeType === "month"
              ? "Used revenue (monthly)"
              : "Used revenue (yearly)",
          dataSource: usedPoints,
          color: "rgba(34, 197, 94, 0.6)", // green
        },
        {
          name:
            rangeType === "day"
              ? "Remaining value (daily)"
              : rangeType === "month"
              ? "Remaining value (monthly)"
              : "Remaining value (yearly)",
          dataSource: remainPoints,
          color: "rgba(59, 130, 246, 0.65)", // blue
        },
      ]);
    };

    fetchChartData();
  }, [rangeType, startDate, endDate]);

  // ================== X Axis dynamic ==================
  const LinePrimaryXAxis =
    rangeType === "day"
      ? {
          valueType: "DateTime" as "DateTime",
          labelFormat: "dd MMM",
          intervalType: "Days" as "Days",
          edgeLabelPlacement: "Shift" as EdgeLabelPlacement,
          majorGridLines: { width: 0 },
          labelStyle: {
            color: "#64748B",
            fontWeight: "600",
            fontFamily: "Inter, sans-serif",
          },
        }
      : rangeType === "month"
      ? {
          valueType: "DateTime" as "DateTime",
          labelFormat: "MMM yyyy",
          intervalType: "Months" as "Months",
          edgeLabelPlacement: "Shift" as EdgeLabelPlacement,
          majorGridLines: { width: 0 },
          labelStyle: {
            color: "#64748B",
            fontWeight: "600",
            fontFamily: "Inter, sans-serif",
          },
        }
      : {
          valueType: "DateTime" as "DateTime",
          labelFormat: "yyyy",
          intervalType: "Years" as "Years",
          edgeLabelPlacement: "Shift" as EdgeLabelPlacement,
          majorGridLines: { width: 0 },
          labelStyle: {
            color: "#64748B",
            fontWeight: "600",
            fontFamily: "Inter, sans-serif",
          },
        };

  // ================== Date selector ==================
  const renderDateSelector = () => {
    if (rangeType === "day") {
      return (
        <RangePicker
          value={[startDate, endDate]}
          onChange={(dates) => {
            if (dates) {
              setStartDate(dates[0]!);
              setEndDate(dates[1]!);
            }
          }}
          format="DD/MM/YYYY"
          allowClear={false}
        />
      );
    }

    if (rangeType === "month") {
      return (
        <RangePicker
          picker="month"
          value={[startDate, endDate]}
          onChange={(dates) => {
            if (dates) {
              setStartDate(dates[0]!.startOf("month"));
              setEndDate(dates[1]!.endOf("month"));
            }
          }}
          format="MMM YYYY"
          allowClear={false}
        />
      );
    }

    return (
      <RangePicker
        picker="year"
        value={[startDate, endDate]}
        onChange={(dates) => {
          if (dates) {
            setStartDate(dates[0]!.startOf("year"));
            setEndDate(dates[1]!.endOf("year"));
          }
        }}
        format="YYYY"
        allowClear={false}
      />
    );
  };

  // ================== Default เมื่อเปลี่ยนโหมด ==================
  useEffect(() => {
    const now = dayjs();
    if (rangeType === "day") {
      setStartDate(now.subtract(7, "day"));
      setEndDate(now);
    } else if (rangeType === "month") {
      setStartDate(now.startOf("month"));
      setEndDate(now.endOf("month"));
    } else {
      setStartDate(now.startOf("year"));
      setEndDate(now.endOf("year"));
    }
  }, [rangeType]);

  return (
    <div className="bg-white dark:text-gray-200 dark:bg-secondary-dark-bg p-6 rounded-2xl w-full md:w-full">
      <div className="flex flex-wrap justify-between items-center gap-4 mb-10">
        <div>
          <p className="text-xl font-semibold">EV Charging Revenue Overview ({rangeType})</p>
          <p className="text-xs text-gray-500 mt-1">
            * Used = Price - (RemainingPower × EVcharging.Price), Remaining = RemainingPower × EVcharging.Price
          </p>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Select
            value={rangeType}
            onChange={(val) => setRangeType(val)}
            options={[
              { value: "day", label: "รายวัน" },
              { value: "month", label: "รายเดือน" },
              { value: "year", label: "รายปี" },
            ]}
          />
          {renderDateSelector()}
        </div>
      </div>

      <ChartComponent
        id="ev-used-remaining-revenue-chart"
        height="420px"
        width="100%"
        primaryXAxis={LinePrimaryXAxis}
        primaryYAxis={LinePrimaryYAxis}
        chartArea={{ border: { width: 0 } }}
        tooltip={{ enable: true }}
        background={currentMode === "Dark" ? "#33373E" : "#fff"}
        legendSettings={{ visible: true, position: "Bottom" }}
      >
        <Inject services={[LineSeries, DateTime, Legend, Tooltip]} />
        <SeriesCollectionDirective>
          {chartDataSets.map((item, index) => (
            <SeriesDirective
              key={index}
              dataSource={item.dataSource}
              xName="x"
              yName="y"
              name={item.name}
              width={3}
              fill={`${item.color}20`}
              border={{ width: 2, color: item.color }}
              marker={{
                visible: true,
                width: 10,
                height: 10,
                fill: item.color,
                border: { width: 1.5, color: item.color },
              }}
              type="Line"
              animation={{ enable: true, duration: 1000, delay: 0 }}
            />
          ))}
        </SeriesCollectionDirective>
      </ChartComponent>
    </div>
  );
};

export default MonthlyRevenueChart;
