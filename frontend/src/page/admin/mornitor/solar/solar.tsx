// src/page/admin/mornitor/solar/after-solar/index.tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  FiZap,
  FiBarChart2,
  FiBatteryCharging,
  FiSun,
  FiFilter,
  FiDownload,
  FiTrash2,
  FiSearch,
  FiActivity, // ✅ ADD (Meter icon)
} from "react-icons/fi";
import { FaCarSide } from "react-icons/fa";
import { useLocation, useNavigate } from "react-router-dom";
import { message, Modal } from "antd";
import { ExclamationCircleOutlined } from "@ant-design/icons";

import {
  connectSolarSocket,
  ListSolarRealtimeDataByDeviceID,
  DeleteSolarRealtimeDataByIDs,
} from "../../../../services";
import type { SolarInterface } from "../../../../interface/ISolar";

// ✅ Recharts สำหรับกราฟ Battery + Power In / Power Out (แบบ Area Chart)
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

/** ---------- Types ---------- */
type Parameter = {
  name: string;
  value: string;
  status: "ON" | "OFF";
  icon: React.ReactNode;
};

type SolarData = {
  device_id?: string;
  type?: string;
  payload?: {
    device_id?: string;
    timestamp?: string;
    data?: {
      power_in?: number;
      power_out?: number;
      battery_percentage?: number;
      battery_power?: number;
      voltage?: number;
      current?: number;
      solar_irradiance?: number;
      temperature?: number;
      status?: string;
      panel_temperature?: number;
      efficiency?: number;
      frequency?: number;
      daily_energy?: number;
      total_energy?: number;
      alerts?: any[];
      grid_power?: number;
    };
  };
};

interface SolarHistoryItem {
  ID?: number | string;
  id?: number | string;
  device_id?: string;
  CreatedAt?: string;
  created_at?: string;
  power_in?: number;
  power_out?: number;
  battery_percentage?: number;
  status?: string;
  Status?: string;
  solar_status?: string;
  voltage?: number;
  current?: number;
  solar_irradiance?: number;
  temperature?: number;
  panel_temperature?: number;
  grid_power?: number;
}

/** ---------- Column Keys สำหรับ Table + CSV ---------- */
type ColumnKey =
  | "index"
  | "time"
  | "power_in"
  | "power_out"
  | "grid_power"
  | "battery"
  | "voltage"
  | "current"
  | "irradiance"
  | "temp"
  | "panel_temp"
  | "status";

const ALL_COLUMNS: { key: ColumnKey; label: string; align?: "left" | "right" }[] =
  [
    { key: "index", label: "#", align: "left" },
    { key: "time", label: "Time", align: "left" },
    { key: "power_in", label: "Power In (W)", align: "right" },
    { key: "power_out", label: "Power Out (W)", align: "right" },
    { key: "grid_power", label: "Grid Power (W)", align: "right" },
    { key: "battery", label: "Battery (%)", align: "right" },
    { key: "voltage", label: "Voltage (V)", align: "right" },
    { key: "current", label: "Current (A)", align: "right" },
    { key: "irradiance", label: "Irradiance (W/m²)", align: "right" },
    { key: "temp", label: "Temp (°C)", align: "right" },
    { key: "panel_temp", label: "Panel Temp (°C)", align: "right" },
    { key: "status", label: "Status", align: "left" },
  ];

/** กลุ่มคอลัมน์แต่ละ Table */
const TABLE1_COLUMNS: ColumnKey[] = [
  "index",
  "time",
  "power_in",
  "power_out",
  "grid_power",
  "battery",
  "status",
];

const TABLE2_COLUMNS: ColumnKey[] = [
  "index",
  "time",
  "voltage",
  "current",
  "irradiance",
  "temp",
  "panel_temp",
];

/** ---------- LIMIT ต่าง ๆ ---------- */
// จำนวนแถวต่อหน้าในตาราง
const TABLE_PAGE_SIZE = 5;

// จำนวนจุดสูงสุดบนกราฟ (เช่น 10 ค่า ล่าสุด)
const CHART_POINT_LIMIT = 10;

/** format label บนแกนเวลาในกราฟ (✅ แสดงวินาทีด้วย) */
function formatTimeLabel(d: Date): string {
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const hour = d.getHours().toString().padStart(2, "0");
  const minute = d.getMinutes().toString().padStart(2, "0");
  const second = d.getSeconds().toString().padStart(2, "0");
  return `${day}/${month} ${hour}:${minute}:${second}`;
}

/** helper: คืน ID เป็น string จาก record */
function getRowId(item: SolarHistoryItem): string | null {
  if (typeof item.ID === "number") return String(item.ID);
  if (typeof item.id === "number") return String(item.id);
  if (typeof item.ID === "string" && item.ID.trim() !== "") return item.ID;
  if (typeof item.id === "string" && item.id.trim() !== "") return item.id;
  return null;
}

const Index: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // รับข้อมูล Solar จากหน้า BeforeSolar
  const solar =
    (location.state as { solar?: SolarInterface } | null)?.solar || null;

  // ---------- STATE: Realtime & History ---------- //
  const [solarData, setSolarData] = useState<SolarData | null>(null);
  const [isLive, setIsLive] = useState(false);

  // ✅ แยก state: apiHistoryData ใช้กับ Table/CSV เท่านั้น (fix จาก API)
  const [apiHistoryData, setApiHistoryData] = useState<SolarHistoryItem[] | null>(
    null
  );

  // ✅ chartHistoryData ใช้เฉพาะกับกราฟ (เริ่มจาก API แล้ว append realtime)
  const [chartHistoryData, setChartHistoryData] = useState<SolarHistoryItem[]>(
    []
  );

  const [displayStatus, setDisplayStatus] = useState<string>("Unknown");
  const [lastStatusTime, setLastStatusTime] = useState<Date | null>(null);
  const [isOffline, setIsOffline] = useState<boolean>(false);

  // ---------- STATE: Table Filter / UI ---------- //
  const [searchText, setSearchText] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>(""); // datetime-local
  const [dateTo, setDateTo] = useState<string>("");
  const [showDateRangePicker, setShowDateRangePicker] =
    useState<boolean>(false);

  // เก็บ ID เป็น string ล้วน
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState<boolean>(false);

  // Modal ลบข้อมูล (Selected)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // ✅ Modal ลบข้อมูลทั้งหมด (Filtered/ทั้งหมด)
  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // page
  const [currentPage, setCurrentPage] = useState<number>(1);

  // ---------- Helper ของ Table / Series ---------- //
  const getRecordDate = (item: SolarHistoryItem): Date | null => {
    const ts = item.CreatedAt ?? item.created_at;
    if (!ts) return null;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  };

  const getRecordTime = (item: SolarHistoryItem): string => {
    const d = getRecordDate(item);
    if (!d) return "-";
    return d.toLocaleString("th-TH");
  };

  const getRecordStatus = (item: SolarHistoryItem): string =>
    item.status ?? item.Status ?? item.solar_status ?? "normal";

  // ---------- CONNECT WEBSOCKET (Realtime) ---------- //
  useEffect(() => {
    if (!solar || !solar.SolarPoint) return;

    const deviceId = solar.SolarPoint;

    const socket = connectSolarSocket((data: SolarData) => {
      setSolarData(data);
      setIsLive(true);

      const realtimeStatus = data?.payload?.data?.status ?? "Unknown";
      const realtimeTsStr = data?.payload?.timestamp;
      const realtimeTs = realtimeTsStr ? new Date(realtimeTsStr) : new Date();

      setDisplayStatus(realtimeStatus);
      setLastStatusTime(realtimeTs);
      setIsOffline(false);

      console.log("Realtime solar data:", data);

      // ✅ อัปเดตเฉพาะ chartHistoryData ให้กราฟวิ่งตาม realtime
      setChartHistoryData((prev) => {
        const payload = data?.payload;
        const d = payload?.data;
        if (!d) return prev;

        const ts = payload?.timestamp || new Date().toISOString();

        const newItem: SolarHistoryItem = {
          device_id: payload.device_id ?? data.device_id,
          CreatedAt: ts,
          power_in: d.power_in,
          power_out: d.power_out,
          battery_percentage: d.battery_percentage,
          voltage: d.voltage,
          current: d.current,
          solar_irradiance: d.solar_irradiance,
          temperature: d.temperature,
          panel_temperature: d.panel_temperature,
          grid_power: d.grid_power,
          status: d.status ?? realtimeStatus,
        };

        // กัน duplicate ง่าย ๆ ถ้า timestamp เท่ากับตัวสุดท้าย ให้ merge ทับแทน
        if (prev && prev.length > 0) {
          const last = prev[prev.length - 1];
          const lastTs = last.CreatedAt ?? last.created_at;
          if (lastTs && lastTs === newItem.CreatedAt) {
            const mergedLast: SolarHistoryItem = { ...last, ...newItem };
            return [...prev.slice(0, prev.length - 1), mergedLast];
          }
        }

        const updated = prev ? [...prev, newItem] : [newItem];

        // จำกัดจำนวนจุดใน chartHistoryData ตาม CHART_POINT_LIMIT (แต่จะจัดในตอนใช้ก็ได้)
        return updated;
      });
    }, deviceId);

    return () => {
      try {
        socket?.close();
      } catch {
        // ignore
      }
      setIsLive(false);
    };
  }, [solar]);

  // ✅ Battery chart data (ใช้ chartHistoryData + จำกัด CHART_POINT_LIMIT ค่า ล่าสุด)
  const batteryChartData = useMemo(() => {
    if (!chartHistoryData || chartHistoryData.length === 0) return [];
    const sorted = [...chartHistoryData].sort((a, b) => {
      const da = getRecordDate(a)?.getTime() ?? 0;
      const db = getRecordDate(b)?.getTime() ?? 0;
      return da - db;
    });
    const chartStartIndex = Math.max(0, sorted.length - CHART_POINT_LIMIT);
    const limited = sorted.slice(chartStartIndex);
    return limited.map((item) => {
      const d = getRecordDate(item);
      return {
        timeLabel: d ? formatTimeLabel(d) : "",
        battery: item.battery_percentage ?? 0,
      };
    });
  }, [chartHistoryData]);

  // ✅ Power chart data (ใช้ chartHistoryData + จำกัด CHART_POINT_LIMIT ค่า ล่าสุด)
  const powerChartData = useMemo(() => {
    if (!chartHistoryData || chartHistoryData.length === 0) return [];
    const sorted = [...chartHistoryData].sort((a, b) => {
      const da = getRecordDate(a)?.getTime() ?? 0;
      const db = getRecordDate(b)?.getTime() ?? 0;
      return da - db;
    });
    const chartStartIndex = Math.max(0, sorted.length - CHART_POINT_LIMIT);
    const limited = sorted.slice(chartStartIndex);
    return limited.map((item) => {
      const d = getRecordDate(item);
      return {
        timeLabel: d ? formatTimeLabel(d) : "",
        power_in: item.power_in ?? 0,
        power_out: item.power_out ?? 0,
      };
    });
  }, [chartHistoryData]);

  const hasHistory =
    (batteryChartData && batteryChartData.length > 0) ||
    (powerChartData && powerChartData.length > 0);

  const lastBattery =
    batteryChartData.length > 0
      ? batteryChartData[batteryChartData.length - 1].battery
      : undefined;

  const lastPowerIn =
    powerChartData.length > 0
      ? powerChartData[powerChartData.length - 1].power_in
      : undefined;

  const lastPowerOut =
    powerChartData.length > 0
      ? powerChartData[powerChartData.length - 1].power_out
      : undefined;

  // ---------- LOAD HISTORY จาก API (ใช้ fix สำหรับ Table + initial chart) ---------- //
  useEffect(() => {
    if (!solar || !solar.SolarPoint) return;

    const deviceId = solar.SolarPoint;

    const fetchHistory = async () => {
      try {
        const res = await ListSolarRealtimeDataByDeviceID(deviceId);
        console.log("History solar data from API:", res);
        if (res && Array.isArray(res)) {
          // เรียงตามเวลาเก่า -> ใหม่
          const sorted = [...res].sort(
            (a: SolarHistoryItem, b: SolarHistoryItem) => {
              const da = getRecordDate(a)?.getTime() ?? 0;
              const db = getRecordDate(b)?.getTime() ?? 0;
              return da - db;
            }
          );

          // ✅ ใช้กับ Table/CSV (fix จาก API)
          setApiHistoryData(sorted);

          // ✅ ใช้เป็นฐานให้ chartHistoryData (แล้วค่อย append realtime ภายหลัง)
          setChartHistoryData(sorted);

          if (sorted.length > 0) {
            const lastRecord = sorted[sorted.length - 1] as SolarHistoryItem;
            const histStatus =
              lastRecord.status ??
              lastRecord.Status ??
              lastRecord.solar_status ??
              "Unknown";

            const createdAtStr =
              lastRecord.CreatedAt ?? lastRecord.created_at ?? null;
            const createdAt = createdAtStr ? new Date(createdAtStr) : null;

            setDisplayStatus(histStatus);
            if (createdAt) {
              setLastStatusTime(createdAt);
            }
          }
        }
      } catch (err) {
        console.error("Error fetching solar history:", err);
      }
    };

    fetchHistory();
  }, [solar]);

  // ---------- ตรวจจับ Offline ---------- //
  useEffect(() => {
    if (!lastStatusTime) return;

    const checkOffline = () => {
      const diffMs = Date.now() - lastStatusTime.getTime();
      const diffMin = diffMs / (1000 * 60);
      const offline = diffMin > 30;
      setIsOffline(offline);
      if (offline) {
        setIsLive(false);
      }
    };

    checkOffline();
    const interval = setInterval(checkOffline, 60 * 1000);

    return () => clearInterval(interval);
  }, [lastStatusTime]);

  // ---------- ถ้าไม่มี Solar (เข้าหน้านี้ตรง ๆ) ---------- //
  if (!solar) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-gray-900 mt-14 sm:mt-0">
        <header className="sticky top-0 z-20 bg-white border-b border-sky-100">
          <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center">
            <h1 className="text-sm sm:text-base font-semibold tracking-wide text-sky-900">
              Solar Monitor
            </h1>
          </div>
        </header>

        <div className="max-w-screen-xl mx-auto px-4 py-8">
          <p className="text-slate-600 mb-4">
            ไม่พบข้อมูล Solar ที่ส่งมาจากหน้าก่อนหน้า
          </p>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            ← กลับไปหน้าเลือก Solar
          </button>
        </div>
      </div>
    );
  }

  // ---------- Filtered Data สำหรับ Table (ใช้ apiHistoryData เท่านั้น) ---------- //
  const filteredHistoryData = useMemo(() => {
    if (!apiHistoryData) return [];
    const search = searchText.trim().toLowerCase();

    return apiHistoryData.filter((item) => {
      const d = getRecordDate(item);

      if (dateFrom) {
        const fromDate = new Date(dateFrom);
        if (!d || d < fromDate) return false;
      }

      if (dateTo) {
        const toDate = new Date(dateTo);
        if (!d || d > toDate) return false;
      }

      if (search) {
        const statusStr = getRecordStatus(item);
        const timeStr = getRecordTime(item);
        const fields = [
          statusStr,
          timeStr,
          String(item.power_in ?? ""),
          String(item.power_out ?? ""),
          String(item.grid_power ?? ""),
          String(item.battery_percentage ?? ""),
          String(item.voltage ?? ""),
          String(item.current ?? ""),
          String(item.solar_irradiance ?? ""),
          String(item.temperature ?? ""),
          String(item.panel_temperature ?? ""),
        ]
          .join(" ")
          .toLowerCase();

        if (!fields.includes(search)) return false;
      }

      return true;
    });
  }, [apiHistoryData, searchText, dateFrom, dateTo]);

  // ✅ Pagination (5 แถวต่อหน้า)
  const totalPages = Math.max(
    1,
    Math.ceil(filteredHistoryData.length / TABLE_PAGE_SIZE)
  );
  const startIndex = (currentPage - 1) * TABLE_PAGE_SIZE;
  const endIndex = Math.min(
    startIndex + TABLE_PAGE_SIZE,
    filteredHistoryData.length
  );

  const paginatedHistoryData = useMemo(
    () => filteredHistoryData.slice(startIndex, endIndex),
    [filteredHistoryData, startIndex, endIndex]
  );

  // reset page เมื่อ filter / history เปลี่ยน
  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, dateFrom, dateTo, apiHistoryData]);

  // ถ้า currentPage เกิน ให้ดึงกลับมาหน้า last
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // sync selectAll กับ paginatedHistoryData
  useEffect(() => {
    if (paginatedHistoryData.length === 0) {
      setSelectAll(false);
      return;
    }
    const pageIds = paginatedHistoryData
      .map((item) => getRowId(item))
      .filter((id): id is string => !!id);
    const allSelected =
      pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));
    setSelectAll(allSelected);
  }, [paginatedHistoryData, selectedIds]);

  // ✅ แถวที่ถูกเลือกไว้สำหรับ preview ใน Modal (ใช้ apiHistoryData)
  const selectedRowsForPreview = useMemo<SolarHistoryItem[]>(() => {
    if (!apiHistoryData || selectedIds.length === 0) return [];
    const idSet = new Set(selectedIds);
    return apiHistoryData.filter((item) => {
      const rid = getRowId(item);
      return rid && idSet.has(rid);
    });
  }, [apiHistoryData, selectedIds]);

  // ✅ เตรียมรายการ “ลบทั้งหมด” = ลบทั้งหมดตามผลกรอง (ถ้าไม่ได้กรองก็เท่ากับทั้งหมด)
  const deleteAllTargetRows = useMemo<SolarHistoryItem[]>(() => {
    return filteredHistoryData ?? [];
  }, [filteredHistoryData]);

  const deleteAllNumericIds = useMemo<number[]>(() => {
    if (!deleteAllTargetRows || deleteAllTargetRows.length === 0) return [];
    return deleteAllTargetRows
      .map((row) => getRowId(row))
      .filter((id): id is string => !!id)
      .map((id) => Number(id))
      .filter((n) => !Number.isNaN(n));
  }, [deleteAllTargetRows]);

  // ---------- Export CSV (เฉพาะ Filtered) ---------- //
  const exportToCsv = (rows: SolarHistoryItem[], fileName: string) => {
    if (!rows || rows.length === 0) {
      message.info("ไม่มีข้อมูลสำหรับดาวน์โหลด CSV");
      return;
    }

    const activeColumns = ALL_COLUMNS; // ใช้ทุกคอลัมน์

    const header = activeColumns.map((c) => `"${c.label}"`).join(",");

    const csvRows = rows.map((item, index) => {
      const d = getRecordDate(item);
      const timeStr = d ? d.toISOString() : "";
      const powerInVal = item.power_in ?? 0;
      const powerOutVal = item.power_out ?? 0;
      const gridPowerVal = item.grid_power ?? 0;
      const batteryVal = item.battery_percentage ?? 0;
      const voltageVal = item.voltage ?? 0;
      const currentVal = item.current ?? 0;
      const irVal = item.solar_irradiance ?? 0;
      const tempVal = item.temperature ?? 0;
      const panelTempVal = item.panel_temperature ?? 0;
      const statusStr = getRecordStatus(item);

      const values = activeColumns.map((col) => {
        switch (col.key) {
          case "index":
            return index + 1;
          case "time":
            return timeStr;
          case "power_in":
            return powerInVal.toFixed(2);
          case "power_out":
            return powerOutVal.toFixed(2);
          case "grid_power":
            return gridPowerVal.toFixed(2);
          case "battery":
            return batteryVal.toFixed(1);
          case "voltage":
            return voltageVal.toFixed(1);
          case "current":
            return currentVal.toFixed(2);
          case "irradiance":
            return irVal.toFixed(1);
          case "temp":
            return tempVal.toFixed(1);
          case "panel_temp":
            return panelTempVal.toFixed(1);
          case "status":
            return statusStr;
          default:
            return "";
        }
      });

      return values
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(",");
    });

    const csvContent = [header, ...csvRows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.setAttribute("download", fileName);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportFiltered = () => {
    exportToCsv(filteredHistoryData, "solar_realtime_filtered.csv");
  };

  // ---------- Delete Selected (เปิด Modal) ---------- //
  const handleToggleRowSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (!paginatedHistoryData || paginatedHistoryData.length === 0) return;

    const pageIds = paginatedHistoryData
      .map((item) => getRowId(item))
      .filter((id): id is string => !!id);

    if (selectAll) {
      setSelectedIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      setSelectAll(false);
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...pageIds])));
      setSelectAll(true);
    }
  };

  // เดิม: มี window.confirm ในฟังก์ชันนี้ → เปลี่ยนเป็นเปิด Modal แทน
  const handleDeleteSelected = () => {
    if (selectedIds.length === 0) {
      message.info("กรุณาเลือกแถวที่ต้องการลบก่อน");
      return;
    }
    setIsDeleteModalOpen(true);
  };

  // ✅ ลบทั้งหมด (ตามผลกรอง/ทั้งหมด)
  const handleDeleteAll = () => {
    if (!deleteAllNumericIds || deleteAllNumericIds.length === 0) {
      message.info("ไม่มีข้อมูลสำหรับลบ");
      return;
    }
    setIsDeleteAllModalOpen(true);
  };

  // ฟังก์ชันที่ถูกเรียกจริงตอนกด "ลบ" ใน Modal (Selected)
  const performDeleteSelected = async () => {
    if (selectedIds.length === 0) {
      message.info("กรุณาเลือกแถวที่ต้องการลบก่อน");
      setIsDeleteModalOpen(false);
      return;
    }

    const numericIds = selectedIds
      .map((id) => Number(id))
      .filter((n) => !Number.isNaN(n));

    if (numericIds.length === 0) {
      message.error("ไม่พบ ID ที่สามารถลบได้");
      setIsDeleteModalOpen(false);
      return;
    }

    try {
      setIsDeleting(true);
      const ok = await DeleteSolarRealtimeDataByIDs(numericIds);
      if (!ok) {
        message.error("Deletion failed");
        return;
      }

      message.success("Deletion Successful");

      const idsToDeleteStr = numericIds.map(String);

      // ✅ ลบออกจาก apiHistoryData (Table/CSV)
      setApiHistoryData((prev) => {
        if (!prev) return prev;
        const newData = prev.filter((item) => {
          const rid = getRowId(item);
          if (!rid) return true;
          return !idsToDeleteStr.includes(rid);
        });
        return newData;
      });

      // ✅ ลบออกจาก chartHistoryData ด้วย (ให้กราฟไม่แสดง record ที่ลบ)
      setChartHistoryData((prev) => {
        if (!prev) return prev;
        const newData = prev.filter((item) => {
          const rid = getRowId(item);
          if (!rid) return true;
          return !idsToDeleteStr.includes(rid);
        });
        return newData;
      });

      setSelectedIds([]);
      setSelectAll(false);
      setIsDeleteModalOpen(false);
    } catch (err) {
      console.error("Delete error:", err);
      message.error("เกิดข้อผิดพลาดระหว่างลบข้อมูล");
    } finally {
      setIsDeleting(false);
    }
  };

  // ✅ ฟังก์ชันที่ถูกเรียกจริงตอนกด "ลบทั้งหมด" ใน Modal (All)
  const performDeleteAll = async () => {
    if (!deleteAllNumericIds || deleteAllNumericIds.length === 0) {
      message.info("ไม่มีข้อมูลสำหรับลบ");
      setIsDeleteAllModalOpen(false);
      return;
    }

    try {
      setIsDeletingAll(true);
      const ok = await DeleteSolarRealtimeDataByIDs(deleteAllNumericIds);
      if (!ok) {
        message.error("Deletion failed");
        return;
      }

      message.success("Deletion ALL Successful");

      const idsToDeleteStr = deleteAllNumericIds.map(String);

      setApiHistoryData((prev) => {
        if (!prev) return prev;
        return prev.filter((item) => {
          const rid = getRowId(item);
          if (!rid) return true;
          return !idsToDeleteStr.includes(rid);
        });
      });

      setChartHistoryData((prev) => {
        if (!prev) return prev;
        return prev.filter((item) => {
          const rid = getRowId(item);
          if (!rid) return true;
          return !idsToDeleteStr.includes(rid);
        });
      });

      setSelectedIds([]);
      setSelectAll(false);
      setIsDeleteAllModalOpen(false);
    } catch (err) {
      console.error("Delete all error:", err);
      message.error("เกิดข้อผิดพลาดระหว่างลบข้อมูลทั้งหมด");
    } finally {
      setIsDeletingAll(false);
    }
  };

  // ---------- เตรียมค่าที่จะใช้แสดงจาก realtime ---------- //
  const payloadData = solarData?.payload?.data;

  const powerIn = payloadData?.power_in ?? 0;
  const battery = payloadData?.battery_percentage ?? 0;
  const batteryPower = payloadData?.battery_power ?? 0;
  const gridPower = payloadData?.grid_power ?? 0;
  const powerOut = payloadData?.power_out ?? 0;
  const solarIrradiance = payloadData?.solar_irradiance ?? 0;
  const temperature = payloadData?.temperature ?? 0;
  const voltage = payloadData?.voltage ?? 0;
  const current = payloadData?.current ?? 0;
  const panelTemperature = payloadData?.panel_temperature ?? 0;
  const efficiency = payloadData?.efficiency ?? 0;
  const frequency = payloadData?.frequency ?? 0;
  const dailyEnergy = payloadData?.daily_energy ?? 0;
  const totalEnergy = payloadData?.total_energy ?? 0;
  const alerts = payloadData?.alerts ?? [];

  const updatedTime = lastStatusTime
    ? lastStatusTime.toLocaleTimeString("th-TH")
    : solarData?.payload?.timestamp
      ? new Date(solarData.payload.timestamp).toLocaleTimeString("th-TH")
      : "Waiting...";

  const loadPower = powerOut;
  const batteryLabel = battery > 0 ? `${battery.toFixed(0)}%` : "None";

  const params: Parameter[] = [
    {
      name: "Power In",
      value: `${powerIn.toFixed(2)} W`,
      status: "ON",
      icon: <FiSun className="text-xl md:text-2xl text-amber-500" />,
    },
    {
      name: "Power Out",
      value: `${powerOut.toFixed(2)} W`,
      status: "ON",
      icon: <FiBarChart2 className="text-xl md:text-2xl text-emerald-500" />,
    },
    {
      name: "Battery %",
      value: `${battery.toFixed(1)}%`,
      status: "ON",
      icon: (
        <FiBatteryCharging className="text-xl md:text-2xl text-sky-500" />
      ),
    },
    {
      name: "Battery Power",
      value: `${batteryPower.toFixed(2)} W`,
      status: "ON",
      icon: <FiBatteryCharging className="text-xl md:text-2xl text-blue-500" />,
    },
    {
      name: "Voltage",
      value: `${voltage.toFixed(1)} V`,
      status: "ON",
      icon: <FiZap className="text-xl md:text-2xl text-sky-500" />,
    },
    {
      name: "Current",
      value: `${current.toFixed(2)} A`,
      status: "ON",
      icon: <FiBarChart2 className="text-xl md:text-2xl text-indigo-500" />,
    },
  ];

  // สรุปช่วงวันที่บนปุ่มเลือกช่วงเวลา
  const dateRangeLabel = useMemo(() => {
    if (!dateFrom && !dateTo) return "ทั้งหมด";
    const fmt = (s: string) => {
      if (!s) return "";
      const d = new Date(s);
      if (isNaN(d.getTime())) return "";
      return formatTimeLabel(d);
    };
    const start = dateFrom ? fmt(dateFrom) : "";
    const end = dateTo ? fmt(dateTo) : "";
    if (start && end) return `${start} - ${end}`;
    if (start) return `จาก ${start}`;
    if (end) return `ถึง ${end}`;
    return "ทั้งหมด";
  }, [dateFrom, dateTo]);

  // ---------- helper render cell table ---------- //
  const renderCellValue = (
    colKey: ColumnKey,
    item: SolarHistoryItem,
    index: number
  ): React.ReactNode => {
    const timeStr = getRecordTime(item);
    const powerInVal = item.power_in ?? 0;
    const powerOutVal = item.power_out ?? 0;
    const gridPowerVal = item.grid_power ?? 0;
    const batteryVal = item.battery_percentage ?? 0;
    const voltageVal = item.voltage ?? 0;
    const currentVal = item.current ?? 0;
    const irVal = item.solar_irradiance ?? 0;
    const tempVal = item.temperature ?? 0;
    const panelTempVal = item.panel_temperature ?? 0;
    const statusStr = getRecordStatus(item);
    const isError =
      statusStr.toLowerCase().includes("fault") ||
      statusStr.toLowerCase().includes("error");

    switch (colKey) {
      case "index":
        return index + 1;
      case "time":
        return timeStr;
      case "power_in":
        return powerInVal.toFixed(2);
      case "power_out":
        return powerOutVal.toFixed(2);
      case "grid_power":
        return gridPowerVal.toFixed(2);
      case "battery":
        return batteryVal.toFixed(1);
      case "voltage":
        return voltageVal.toFixed(1);
      case "current":
        return currentVal.toFixed(2);
      case "irradiance":
        return irVal.toFixed(1);
      case "temp":
        return tempVal.toFixed(1);
      case "panel_temp":
        return panelTempVal.toFixed(1);
      case "status":
        return (
          <span
            className={`px-2 py-1 rounded-full text-[10px] font-semibold ${isError
              ? "bg-red-50 text-red-700 border border-red-200"
              : "bg-emerald-50 text-emerald-700 border border-emerald-200"
              }`}
          >
            {statusStr}
          </span>
        );
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-gray-900 mt-14 sm:mt-0">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          {/* ซ้าย: ปุ่ม Back + ชื่อ Solar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center rounded-lg bg-white/10 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white border border-white/20 hover:bg-white/15 active:scale-[0.99] transition"
            >
              ← Back
            </button>

            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-[0.18em] text-blue-100">
                Solar Monitor
              </span>
              <span className="text-xs sm:text-sm font-semibold">
                {solar.Name}
                {solar.SolarPoint ? ` • ${solar.SolarPoint}` : ""}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] sm:text-xs">
            {/* ✅ Meter Button (Prominent - White) */}
            <button
              type="button"
              onClick={() =>
                navigate("/admin/meter", {
                  state: {
                    solarPoint: solar?.SolarPoint ?? null,
                    solar, // optional
                  },
                })
              }
              disabled={!solar?.SolarPoint}
              className={`relative inline-flex items-center gap-2 rounded-xl px-3 py-1.5 border font-semibold transition
    ${!solar?.SolarPoint
                  ? "bg-white/10 text-white/50 border-white/20 cursor-not-allowed"
                  : "bg-white text-blue-700 border-white/40 shadow-md shadow-black/10 ring-1 ring-white/60 hover:bg-white/95 hover:shadow-lg hover:shadow-black/15 active:scale-[0.98]"
                }`}
              title={!solar?.SolarPoint ? "ไม่พบ SolarPoint" : "ไปหน้า Meter"}
            >
              {/* จุดเด่นเล็ก ๆ (pulse) */}
              {solar?.SolarPoint && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                </span>
              )}

              <FiActivity className="text-[14px] text-blue-700" />
              <span>Meter</span>

              {/* badge เล็ก ๆ */}
              <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-blue-700 border border-blue-100">
                LIVE
              </span>
            </button>

            {/* เดิม: Online/Offline */}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
              <FiSun
                className={
                  isOffline
                    ? "text-red-300"
                    : isLive
                      ? "text-yellow-300"
                      : "text-blue-100"
                }
              />
              <span>
                {isOffline
                  ? "Offline"
                  : isLive
                    ? "Receiving data..."
                    : "Waiting signal..."}
              </span>
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 pt-5 pb-24 max-w-screen-xl mx-auto space-y-6">
        {/* SECTION 1: Status + Metrics + Power Flow */}
        <section className="grid grid-cols-1 xl:grid-cols-[1.3fr,1.1fr] gap-4 xl:gap-6">
          {/* LEFT: Status + Metrics */}
          <div className="space-y-4">
            {/* Status Card */}
            <div className="rounded-2xl border border-sky-100 bg-white shadow-sm shadow-sky-100 p-5 md:p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="text-sm md:text-base text-slate-500 font-semibold">
                    Realtime Solar Status
                  </p>
                  <p
                    className={`text-3xl md:text-4xl font-extrabold tracking-tight ${isOffline ? "text-red-500" : "text-sky-700"
                      }`}
                  >
                    {isOffline ? "Offline" : displayStatus}
                  </p>
                  <p className="text-[11px] md:text-xs text-slate-500">
                    Device:{" "}
                    <span className="text-slate-800 font-mono">
                      {solarData?.device_id ?? solar.SolarPoint ?? "-"}
                    </span>
                  </p>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-[11px] md:text-xs text-slate-500">
                    Last Updated
                  </p>
                  <p className="text-sm md:text-base font-semibold text-slate-800">
                    {updatedTime}
                  </p>
                  <p className="text-[11px] md:text-xs text-slate-500">
                    Mode:{" "}
                    <span className="text-sky-700">
                      {isLive ? "Realtime" : "History"}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {params.map((item) => (
                <div
                  key={item.name}
                  className="rounded-2xl bg-white border border-sky-100 shadow-sm shadow-sky-100 p-4"
                >
                  <div className="flex items-center justify-between">
                    <div className="inline-grid place-items-center h-9 w-9 md:h-10 md:w-10 rounded-xl bg-sky-50 border border-sky-100">
                      {item.icon}
                    </div>
                    <span
                      className={`text-[10px] md:text-xs px-2 py-1 rounded-full font-semibold ${item.status === "ON"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                        : "bg-slate-50 text-slate-500 border border-slate-200"
                        }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="text-[11px] md:text-xs text-slate-500">
                      {item.name}
                    </p>
                    <p className="text-xl md:text-2xl font-bold text-sky-800">
                      {item.value}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: Power Flow */}
          <div className="rounded-2xl bg-white border border-sky-100 shadow-sm shadow-sky-100 p-5 md:p-6 flex flex-col">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs md:text-sm text-slate-500">
                  Power Flow Diagram
                </p>
                <p className="text-lg md:text-xl font-bold text-sky-800">
                  Solar • Grid • Battery → EV
                </p>
              </div>
              <span className="text-[10px] md:text-xs px-2 py-1 rounded-full bg-sky-50 text-sky-800 border border-sky-100">
                EV Load
              </span>
            </div>

            <div className="mt-6 flex justify-center">
              <div className="relative w-64 h-64 md:w-72 md:h-72">
                <svg
                  viewBox="0 0 260 260"
                  className="absolute inset-0 w-full h-full pointer-events-none"
                >
                  <defs>
                    <path id="solarPath" d="M 130 30 L 130 130" fill="none" />
                    <path
                      id="gridPath"
                      d="M 43.4 180 L 130 130"
                      fill="none"
                    />
                    <path
                      id="batteryPath"
                      d="M 216.6 180 L 130 130"
                      fill="none"
                    />
                    <path
                      id="outerSolarBatteryPath"
                      d="M 130 30 A 100 100 0 0 1 216.6 180"
                      fill="none"
                    />
                  </defs>

                  {/* วงกลมใหญ่ */}
                  <circle
                    cx={130}
                    cy={130}
                    r={100}
                    fill="none"
                    stroke="rgba(59,130,246,0.35)"
                    strokeWidth={10}
                    strokeLinecap="round"
                  />

                  {/* เส้นเชื่อม */}
                  <g
                    stroke="rgba(148,163,184,0.95)"
                    strokeWidth={12}
                    strokeLinecap="round"
                    fill="none"
                  >
                    <use href="#solarPath" />
                    <use href="#gridPath" />
                    <use href="#batteryPath" />
                  </g>

                  {/* จุดวิ่ง Solar -> EV */}
                  <circle r={5} fill="#FACC15">
                    <animateMotion dur="2.0s" repeatCount="indefinite">
                      <mpath xlinkHref="#solarPath" />
                    </animateMotion>
                  </circle>

                  {/* จุดวิ่ง Grid -> EV */}
                  <circle r={5} fill="#38BDF8">
                    <animateMotion dur="2.4s" repeatCount="indefinite">
                      <mpath xlinkHref="#gridPath" />
                    </animateMotion>
                  </circle>

                  {/* จุดวิ่ง Battery -> EV */}
                  <circle r={5} fill="#22C55E">
                    <animateMotion dur="2.8s" repeatCount="indefinite">
                      <mpath xlinkHref="#batteryPath" />
                    </animateMotion>
                  </circle>

                  {/* จุดวิ่งรอบวงกลม Solar -> Battery */}
                  <circle r={5} fill="#FBBF24">
                    <animateMotion dur="3.4s" repeatCount="indefinite">
                      <mpath xlinkHref="#outerSolarBatteryPath" />
                    </animateMotion>
                  </circle>
                </svg>

                {/* CENTER EV */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center">
                    <FaCarSide className="text-sky-600 text-lg md:text-xl mb-1" />
                    <span className="text-[11px] md:text-xs text-slate-500">
                      EV Load
                    </span>
                    <span className="text-sm md:text-base font-bold text-sky-800">
                      {loadPower.toFixed(0)} W
                    </span>
                  </div>
                </div>

                {/* SOLAR */}
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    top: "11.5%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <span className="text-[10px] md:text-xs text-slate-500 mb-1">
                    Solar
                  </span>
                  <div className="w-16 h-16 rounded-full bg-white border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center">
                    <FiSun className="text-amber-500 text-base md:text-lg mb-0.5" />
                    <span className="text-[11px] md:text-xs font-semibold text-sky-800">
                      {powerIn.toFixed(0)}W
                    </span>
                  </div>
                </div>

                {/* GRID */}
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    top: "65%",
                    left: "18%",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <span className="text-[10px] md:text-xs text-slate-500 mb-1">
                    Grid
                  </span>
                  <div className="w-16 h-16 rounded-full bg-white border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center">
                    <FiZap className="text-sky-500 text-base md:text-lg mb-0.5" />
                    <span className="text-[11px] md:text-xs font-semibold text-sky-800">
                      {gridPower.toFixed(0)}W
                    </span>
                  </div>
                </div>

                {/* BATTERY */}
                <div
                  className="absolute flex flex-col items-center"
                  style={{
                    top: "65%",
                    left: "82%",
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <span className="text-[10px] md:text-xs text-slate-500 mb-1">
                    Battery
                  </span>
                  <div className="w-16 h-16 rounded-full bg-white border-2 border-slate-200 shadow-sm flex flex-col items-center justify-center">
                    <FiBatteryCharging className="text-emerald-500 text-base md:text-lg mb-0.5" />
                    <span className="text-[11px] md:text-xs font-semibold text-sky-800">
                      {batteryLabel}
                    </span>
                    <span className="text-[9px] md:text-[10px] text-slate-500">
                      {batteryPower.toFixed(0)}W
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Metrics ด้านล่าง PowerFlow */}
            <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px] md:text-xs">
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                <p className="text-slate-500">Grid Power</p>
                <p className="font-semibold text-sky-800">
                  {gridPower.toFixed(1)} W
                </p>
              </div>
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                <p className="text-slate-500">Solar Irradiance</p>
                <p className="font-semibold text-sky-800">
                  {solarIrradiance.toFixed(1)} W/m²
                </p>
              </div>
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                <p className="text-slate-500">Ambient Temp</p>
                <p className="font-semibold text-sky-800">
                  {temperature.toFixed(1)} °C
                </p>
              </div>
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                <p className="text-slate-500">Panel Temp</p>
                <p className="font-semibold text-sky-800">
                  {panelTemperature.toFixed(1)} °C
                </p>
              </div>
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                <p className="text-slate-500">Efficiency</p>
                <p className="font-semibold text-sky-800">
                  {efficiency.toFixed(1)} %
                </p>
              </div>
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                <p className="text-slate-500">Frequency</p>
                <p className="font-semibold text-sky-800">
                  {frequency.toFixed(1)} Hz
                </p>
              </div>
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                <p className="text-slate-500">Daily Energy</p>
                <p className="font-semibold text-sky-800">
                  {dailyEnergy.toFixed(1)} kWh
                </p>
              </div>
              <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2">
                <p className="text-slate-500">Total Energy</p>
                <p className="font-semibold text-sky-800">
                  {totalEnergy.toFixed(1)} kWh
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: กราฟใหญ่ Battery + Power In/Out รวมกัน (Area Charts) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs md:text-sm text-slate-500">
                Historical Charts
              </p>
              <p className="text-lg md:text-xl font-bold text-sky-800">
                Battery • Power In &amp; Out
              </p>
            </div>
            <div className="flex flex-col items-end text-[10px] md:text-xs text-slate-500">
              <span>Records: {apiHistoryData?.length ?? 0}</span>
              {alerts && alerts.length > 0 && (
                <span className="mt-1 text-red-500">
                  Alerts: {alerts.join(", ")}
                </span>
              )}
            </div>
          </div>

          {hasHistory ? (
            <div className="space-y-4">
              {/* ✅ Battery Area Chart */}
              <div className="rounded-2xl bg-white border border-sky-100 shadow-sm shadow-sky-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                    <span className="text-xs md:text-sm font-semibold text-amber-700">
                      Battery Percentage
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    Last:{" "}
                    {lastBattery !== undefined
                      ? `${lastBattery.toFixed(1)} %`
                      : "—"}
                  </span>
                </div>

                {batteryChartData.length > 0 ? (
                  <div className="w-full h-64 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={batteryChartData} margin={{ left: -10 }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(148,163,184,0.4)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="timeLabel"
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          tickMargin={8}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          tickMargin={8}
                          width={60}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            borderColor: "#e2e8f0",
                            fontSize: 11,
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                        <Area
                          type="monotone"
                          dataKey="battery"
                          name="Battery (%)"
                          stroke="#F97316"
                          strokeWidth={2.5}
                          fill="#FDBA74"
                          fillOpacity={0.2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-24 flex items-center justify-center text-xs text-slate-500">
                    ไม่มีข้อมูล Battery % สำหรับกราฟ
                  </div>
                )}
              </div>

              {/* ✅ Power In & Power Out Area Chart */}
              <div className="rounded-2xl bg-white border border-sky-100 shadow-sm shadow-sky-100 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rounded-full bg-sky-500" />
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-xs md:text-sm font-semibold text-sky-700">
                      Power In &amp; Power Out
                    </span>
                  </div>
                  <div className="flex flex-col items-end text-[11px] text-slate-500 gap-0.5">
                    <span>
                      Last In:{" "}
                      {lastPowerIn !== undefined
                        ? `${lastPowerIn.toFixed(2)} W`
                        : "—"}
                    </span>
                    <span>
                      Last Out:{" "}
                      {lastPowerOut !== undefined
                        ? `${lastPowerOut.toFixed(2)} W`
                        : "—"}
                    </span>
                  </div>
                </div>

                {powerChartData.length > 0 ? (
                  <div className="w-full h-64 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={powerChartData} margin={{ left: -10 }}>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(148,163,184,0.4)"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="timeLabel"
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          tickMargin={8}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          tickMargin={8}
                          width={60}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            borderColor: "#e2e8f0",
                            fontSize: 11,
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                        <Area
                          type="monotone"
                          dataKey="power_in"
                          name="Power In (W)"
                          stroke="#0EA5E9"
                          strokeWidth={2.5}
                          fill="#7DD3FC"
                          fillOpacity={0.2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                        <Area
                          type="monotone"
                          dataKey="power_out"
                          name="Power Out (W)"
                          stroke="#22C55E"
                          strokeWidth={2.5}
                          fill="#86EFAC"
                          fillOpacity={0.2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <div className="h-24 flex items-center justify-center text-xs text-slate-500">
                    ไม่มีข้อมูล Power In/Out สำหรับกราฟ
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl bg-white border border-sky-100 p-6 flex items-center justify-center text-sm text-slate-500">
              ยังไม่มีข้อมูลจาก API สำหรับกราฟ
            </div>
          )}
        </section>

        {/* SECTION 3: Table Data แยก 2 ตาราง */}
        <section className="rounded-2xl bg-white border border-sky-100 shadow-sm shadow-sky-100 p-4 md:p-5">
          {/* หัวข้อก่อน ตามด้วยสรุป/ปุ่ม */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
            <div>
              <p className="text-lg md:text-xl font-bold text-sky-800">
                Solar Data Table
              </p>
              <p className="text-[11px] md:text-xs text-slate-500">
                แสดงประวัติการอ่านค่าจาก Solar Realtime แยกเป็น 2 ตารางเพื่อให้อ่านง่าย
              </p>
            </div>

            {/* Controls: Search + DateRange + CSV + Delete */}
            <div className="flex flex-col md:flex-row gap-2 md:items-center">
              {/* Search */}
              <div className="flex items-center gap-1 border border-sky-100 bg-sky-50/60 rounded-lg px-2 py-1">
                <FiSearch className="text-sky-500 text-sm" />
                <input
                  type="text"
                  placeholder="ค้นหาตามสถานะ, เวลา, ค่า..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="bg-transparent text-[11px] md:text-xs outline-none text-slate-700 placeholder:text-slate-400 w-40 md:w-52"
                />
              </div>

              {/* ✅ Delete All (อยู่แถวเดียวกับ Search) */}
              <button
                type="button"
                onClick={handleDeleteAll}
                disabled={deleteAllNumericIds.length === 0}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] md:text-xs border ${deleteAllNumericIds.length === 0
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                  }`}
                title={
                  deleteAllNumericIds.length === 0
                    ? "ไม่มีข้อมูลสำหรับลบ"
                    : "ลบข้อมูลทั้งหมด (ตามผลกรอง/ทั้งหมด)"
                }
              >
                <FiTrash2 className="text-red-500" />
                ลบทั้งหมด ({deleteAllNumericIds.length})
              </button>

              {/* Date range selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowDateRangePicker((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-100 bg-white px-2 py-1 text-[11px] md:text-xs text-sky-700 hover:bg-sky-50"
                >
                  <FiFilter className="text-sky-500" />
                  <span>ช่วงเวลา</span>
                  <span className="max-w-[150px] truncate text-[10px] text-slate-500">
                    {dateRangeLabel}
                  </span>
                </button>
                {showDateRangePicker && (
                  <div className="absolute right-0 mt-1 w-72 rounded-xl border border-sky-100 bg-white shadow-lg shadow-sky-100 p-3 z-20">
                    <p className="text-[11px] text-slate-500 mb-2 font-semibold">
                      เลือกช่วงวันที่ (Start - End)
                    </p>
                    <div className="flex flex-col gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500">
                          Start
                        </span>
                        <input
                          type="datetime-local"
                          value={dateFrom}
                          onChange={(e) => setDateFrom(e.target.value)}
                          className="border border-sky-100 rounded-lg px-2 py-1 text-[11px] md:text-xs text-slate-700 bg-white"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-slate-500">End</span>
                        <input
                          type="datetime-local"
                          value={dateTo}
                          onChange={(e) => setDateTo(e.target.value)}
                          className="border border-sky-100 rounded-lg px-2 py-1 text-[11px] md:text-xs text-slate-700 bg-white"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setDateFrom("");
                            setDateTo("");
                          }}
                          className="text-[10px] text-slate-500 hover:text-slate-700"
                        >
                          ล้างตัวกรอง
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowDateRangePicker(false)}
                          className="px-2 py-1 rounded-lg bg-sky-600 text-white text-[11px] hover:bg-sky-700"
                        >
                          ใช้ช่วงเวลา
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CSV (Filtered only) */}
              <button
                type="button"
                onClick={handleExportFiltered}
                className="inline-flex items-center gap-1 rounded-lg border border-sky-100 bg-sky-50 px-2 py-1 text-[11px] md:text-xs text-sky-700 hover:bg-sky-100"
              >
                <FiDownload className="text-sky-500" />
                CSV (Filtered)
              </button>

              {/* Delete Selected */}
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={selectedIds.length === 0}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] md:text-xs border ${selectedIds.length === 0
                  ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                  : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
                  }`}
              >
                <FiTrash2 className="text-red-500" />
                ลบที่เลือก ({selectedIds.length})
              </button>
            </div>
          </div>

          {/* Tables: แยก 2 ตาราง */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* TABLE 1: Power / Battery / Status พร้อม checkbox เลือกแถว */}
            <div className="relative rounded-2xl border border-sky-100 bg-white overflow-hidden">
              <div className="px-3 pt-3 pb-1 text-[11px] md:text-xs font-semibold text-slate-600">
                ตารางที่ 1 – Power / Battery / Status
              </div>
              <div className="max-h-[320px] overflow-auto">
                <table className="min-w-full text-[11px] md:text-xs">
                  <thead className="bg-sky-50 sticky top-0 z-10">
                    <tr>
                      {/* Checkbox header */}
                      <th className="px-3 py-2 text-left border-b border-sky-100">
                        <input
                          type="checkbox"
                          checked={
                            paginatedHistoryData.length > 0 && selectAll === true
                          }
                          onChange={handleToggleSelectAll}
                          className="rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                        />
                      </th>
                      {TABLE1_COLUMNS.map((colKey) => {
                        const col = ALL_COLUMNS.find((c) => c.key === colKey)!;
                        return (
                          <th
                            key={col.key}
                            className={`px-3 py-2 font-semibold text-slate-700 border-b border-sky-100 ${col.align === "right"
                              ? "text-right"
                              : "text-left"
                              }`}
                          >
                            {col.label}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistoryData && paginatedHistoryData.length > 0 ? (
                      paginatedHistoryData.map((item, index) => {
                        const rowId = getRowId(item);
                        const idStr = rowId ?? `row-${index}`;
                        const checked =
                          rowId !== null && selectedIds.includes(rowId);

                        return (
                          <tr
                            key={idStr}
                            className="border-t border-sky-50 hover:bg-sky-50/70"
                          >
                            {/* row checkbox */}
                            <td className="px-3 py-2">
                              {rowId ? (
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => handleToggleRowSelect(rowId)}
                                  className="rounded border-sky-300 text-sky-600 focus:ring-sky-500"
                                />
                              ) : (
                                <input
                                  type="checkbox"
                                  disabled
                                  className="rounded border-slate-200 text-slate-300"
                                />
                              )}
                            </td>

                            {TABLE1_COLUMNS.map((colKey) => {
                              const col = ALL_COLUMNS.find(
                                (c) => c.key === colKey
                              )!;
                              const content = renderCellValue(
                                colKey,
                                item,
                                startIndex + index
                              );
                              const alignClass =
                                col.align === "right"
                                  ? "text-right"
                                  : "text-left";

                              return (
                                <td
                                  key={colKey}
                                  className={`px-3 py-2 text-slate-800 whitespace-nowrap ${alignClass}`}
                                >
                                  {content}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={1 + TABLE1_COLUMNS.length}
                          className="px-3 py-4 text-center text-sm text-slate-500"
                        >
                          ยังไม่มีข้อมูลจาก ListSolarRealtimeDataByDeviceID
                          หรือผลหลังกรองเป็นค่าว่าง
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* TABLE 2: Voltage / Current / Irradiance / Temp */}
            <div className="relative rounded-2xl border border-sky-100 bg-white overflow-hidden">
              <div className="px-3 pt-3 pb-1 text-[11px] md:text-xs font-semibold text-slate-600">
                ตารางที่ 2 – Voltage / Current / Environment
              </div>
              <div className="max-h-[320px] overflow-auto">
                <table className="min-w-full text-[11px] md:text-xs">
                  <thead className="bg-sky-50 sticky top-0 z-10">
                    <tr>
                      {TABLE2_COLUMNS.map((colKey) => {
                        const col = ALL_COLUMNS.find((c) => c.key === colKey)!;
                        return (
                          <th
                            key={col.key}
                            className={`px-3 py-2 font-semibold text-slate-700 border-b border-sky-100 ${col.align === "right"
                              ? "text-right"
                              : "text-left"
                              }`}
                          >
                            {col.label}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedHistoryData && paginatedHistoryData.length > 0 ? (
                      paginatedHistoryData.map((item, index) => {
                        const rowId = getRowId(item);
                        const idStr = rowId ?? `row2-${index}`;

                        return (
                          <tr
                            key={idStr}
                            className="border-t border-sky-50 hover:bg-sky-50/70"
                          >
                            {TABLE2_COLUMNS.map((colKey) => {
                              const col = ALL_COLUMNS.find(
                                (c) => c.key === colKey
                              )!;
                              const content = renderCellValue(
                                colKey,
                                item,
                                startIndex + index
                              );
                              const alignClass =
                                col.align === "right"
                                  ? "text-right"
                                  : "text-left";

                              return (
                                <td
                                  key={colKey}
                                  className={`px-3 py-2 text-slate-800 whitespace-nowrap ${alignClass}`}
                                >
                                  {content}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={TABLE2_COLUMNS.length}
                          className="px-3 py-4 text-center text-sm text-slate-500"
                        >
                          ยังไม่มีข้อมูลจาก ListSolarRealtimeDataByDeviceID
                          หรือผลหลังกรองเป็นค่าว่าง
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* ✅ Pagination Controls ด้านล่าง Table */}
          <div className="mt-4 flex items-center justify-between text-[11px] md:text-xs text-slate-600">
            <span>
              แสดง{" "}
              {filteredHistoryData.length === 0
                ? 0
                : endIndex - startIndex}{" "}
              จากทั้งหมด {filteredHistoryData.length} รายการ
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`px-3 py-1 rounded-lg border text-[11px] md:text-xs ${currentPage === 1
                  ? "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"
                  : "border-sky-200 text-sky-700 bg-white hover:bg-sky-50"
                  }`}
              >
                ย้อนกลับ
              </button>
              <span>
                หน้า {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() =>
                  setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                }
                disabled={
                  currentPage === totalPages || filteredHistoryData.length === 0
                }
                className={`px-3 py-1 rounded-lg border text-[11px] md:text-xs ${currentPage === totalPages || filteredHistoryData.length === 0
                  ? "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"
                  : "border-sky-200 text-sky-700 bg-white hover:bg-sky-50"
                  }`}
              >
                ถัดไป
              </button>
            </div>
          </div>
        </section>

        <div className="h-10" />
      </main>

      {/* ✅ Modal ยืนยันการลบข้อมูล (Selected) */}
      <Modal
        open={isDeleteModalOpen}
        onCancel={() => {
          if (!isDeleting) setIsDeleteModalOpen(false);
        }}
        onOk={performDeleteSelected}
        okText={
          selectedIds.length > 0 ? `ลบ ${selectedIds.length} รายการ` : "ลบข้อมูล"
        }
        okButtonProps={{
          type: "primary",
          danger: false,
          style: {
            backgroundColor: "#1677ff",
            borderColor: "#1677ff",
          },
        }}
        cancelText="ยกเลิก"
        confirmLoading={isDeleting}
        centered
        title={
          <div className="flex items-center gap-2">
            <ExclamationCircleOutlined className="text-blue-500" />
            <span>ยืนยันการลบข้อมูล Solar</span>
          </div>
        }
      >
        <div className="space-y-2 text-[12px] md:text-sm text-slate-700">
          <p>
            คุณกำลังจะลบข้อมูล Solar realtime จำนวน{" "}
            <span className="font-semibold text-blue-600">
              {selectedIds.length}
            </span>{" "}
            เรคคอร์ด
          </p>
          {selectedRowsForPreview.length > 0 && (
            <div className="mt-2 border border-sky-100 rounded-lg bg-sky-50/40 max-h-40 overflow-auto">
              <div className="px-3 py-2 text-[11px] font-semibold text-slate-600 border-b border-sky-100">
                รายการตัวอย่างที่เลือก
              </div>
              <ul className="text-[11px] text-slate-700 divide-y divide-sky-100">
                {selectedRowsForPreview.slice(0, 5).map((row, idx) => (
                  <li
                    key={idx}
                    className="px-3 py-1.5 flex justify-between gap-2"
                  >
                    <span className="truncate">
                      {getRecordTime(row)} — {getRecordStatus(row)}
                    </span>
                    <span className="flex-shrink-0 text-slate-500">
                      {typeof row.power_in === "number"
                        ? `${row.power_in.toFixed(1)} W`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {selectedRowsForPreview.length > 5 && (
                <div className="px-3 py-1 text-[10px] text-slate-500">
                  ...และอีก {selectedRowsForPreview.length - 5} รายการ
                </div>
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] text-blue-500">
            การลบนี้ไม่สามารถย้อนกลับได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการลบ
          </p>
        </div>
      </Modal>

      {/* ✅ Modal ยืนยันการลบข้อมูลทั้งหมด (All / Filtered) */}
      <Modal
        open={isDeleteAllModalOpen}
        onCancel={() => {
          if (!isDeletingAll) setIsDeleteAllModalOpen(false);
        }}
        onOk={performDeleteAll}
        okText={
          deleteAllNumericIds.length > 0
            ? `ลบทั้งหมด ${deleteAllNumericIds.length} รายการ`
            : "ลบทั้งหมด"
        }
        okButtonProps={{
          type: "primary",
          danger: false,
          style: {
            backgroundColor: "#1677ff",
            borderColor: "#1677ff",
          },
        }}
        cancelText="ยกเลิก"
        confirmLoading={isDeletingAll}
        centered
        title={
          <div className="flex items-center gap-2">
            <ExclamationCircleOutlined className="text-blue-500" />
            <span>ยืนยันการลบข้อมูลทั้งหมด</span>
          </div>
        }
      >
        <div className="space-y-2 text-[12px] md:text-sm text-slate-700">
          <p>
            คุณกำลังจะลบข้อมูล Solar realtime ทั้งหมดตามผลกรองจำนวน{" "}
            <span className="font-semibold text-blue-600">
              {deleteAllNumericIds.length}
            </span>{" "}
            เรคคอร์ด
          </p>

          {deleteAllTargetRows.length > 0 && (
            <div className="mt-2 border border-sky-100 rounded-lg bg-sky-50/40 max-h-40 overflow-auto">
              <div className="px-3 py-2 text-[11px] font-semibold text-slate-600 border-b border-sky-100">
                ตัวอย่างข้อมูลที่จะถูกลบ
              </div>
              <ul className="text-[11px] text-slate-700 divide-y divide-sky-100">
                {deleteAllTargetRows.slice(0, 5).map((row, idx) => (
                  <li
                    key={idx}
                    className="px-3 py-1.5 flex justify-between gap-2"
                  >
                    <span className="truncate">
                      {getRecordTime(row)} — {getRecordStatus(row)}
                    </span>
                    <span className="flex-shrink-0 text-slate-500">
                      {typeof row.power_in === "number"
                        ? `${row.power_in.toFixed(1)} W`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {deleteAllTargetRows.length > 5 && (
                <div className="px-3 py-1 text-[10px] text-slate-500">
                  ...และอีก {deleteAllTargetRows.length - 5} รายการ
                </div>
              )}
            </div>
          )}

          <p className="mt-2 text-[11px] text-blue-500">
            การลบนี้ไม่สามารถย้อนกลับได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการลบ
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default Index;
