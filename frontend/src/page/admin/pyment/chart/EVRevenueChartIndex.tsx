// EVRevenueChartIndex.tsx
import React, { useState } from "react";
import { DropDownListComponent } from "@syncfusion/ej2-react-dropdowns";
import TimeRangeSelector from "./TimeRangeSelector";
import EVRevenueChart from "./EVRevenueChart";
import { useStateContext } from "../../../../contexts/ContextProvider";

const dropdownData = [
  { Id: "day", Time: "Day(s)" },
  { Id: "month", Time: "Month" },
  { Id: "year", Time: "Year(s)" },
];

// ตั้งค่า helper ให้ "day" = 7 วันย้อนหลัง
const initRangeFor = (type: "day" | "month" | "year") => {
  if (type === "day") {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date(end);
    // 7 วันย้อนหลัง (วันนี้ + ย้อนหลังไปอีก 6 วัน)
    start.setDate(end.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    return [start, end] as [Date, Date];
  }

  if (type === "month") {
    const now = new Date();
    return {
      month: String(now.getMonth() + 1).padStart(2, "0"),
      year: String(now.getFullYear()),
    };
  }

  const y = new Date().getFullYear();
  return [y, y] as [number, number];
};

const EVRevenueChartIndex: React.FC = () => {
  // @ts-ignore
  const { currentMode } = useStateContext();

  // ✅ default เปลี่ยนเป็น "day"
  const [timeRangeType, setTimeRangeType] =
    useState<"day" | "month" | "year">("day");

  // ✅ default range ใช้ initRangeFor("day") = 7 วันย้อนหลัง
  const [selectedRange, setSelectedRange] = useState<any>(() =>
    initRangeFor("day")
  );

  const handleTimeChange = (t: "day" | "month" | "year") => {
    setTimeRangeType(t);
    setSelectedRange(initRangeFor(t));
  };

  return (
    <div className="w-full">
      <div className="bg-white dark:bg-secondary-dark-bg dark:text-gray-200 p-4 rounded-2xl">
        <div className="flex flex-wrap gap-3 items-center mb-4">
          <div className="min-w-[120px]">
            <DropDownListComponent
              id="timeRange"
              fields={{ text: "Time", value: "Id" }}
              value={timeRangeType}
              dataSource={dropdownData}
              popupHeight="220px"
              popupWidth="140px"
              change={(e) => handleTimeChange(e.value)}
              style={{
                border: "none",
                background: "transparent",
                fontWeight: 500,
                color: currentMode === "Dark" ? "white" : "#0f766e",
              }}
            />
          </div>

          <div className="flex-1 min-w-[220px]">
            <TimeRangeSelector
              timeRangeType={timeRangeType}
              selectedValue={selectedRange}
              onChange={setSelectedRange}
            />
          </div>
        </div>

        {/* ใส่ key เพื่อ force remount ทุกครั้งที่โหมด/ช่วงเปลี่ยน */}
        <EVRevenueChart
          key={`${timeRangeType}-${JSON.stringify(selectedRange)}`}
          timeRangeType={timeRangeType}
          selectedRange={selectedRange}
        />
      </div>
    </div>
  );
};

export default EVRevenueChartIndex;