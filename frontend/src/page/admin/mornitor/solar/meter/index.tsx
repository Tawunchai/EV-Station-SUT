// src/pages/admin/meter/index.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FiArrowLeft,
  FiActivity,
  FiSun,
  FiWifi,
  FiAlertTriangle,
  FiRefreshCw,
  FiSearch,
  FiDownload,
  FiCopy,
  FiTrash2,
  FiX,
} from "react-icons/fi";
import { message } from "antd";
import type { SolarInterface } from "../../../../../interface/ISolar";

// ✅ your services
import {
  ListDataMeterBySolarPoint,
  connectMeterSocket,
  ListMeterRealtimeData,
  DeleteMeterRealtimeDataByIDs, // ✅ use this for bulk delete
} from "../../../../../services/meter";

type LocationState = {
  solarPoint?: string | null;
  solar?: SolarInterface | null;
};

type ConnState =
  | "idle"
  | "loading"
  | "connected"
  | "reconnecting"
  | "error"
  | "no_meter";

const isNonEmptyString = (v: any): v is string =>
  typeof v === "string" && v.trim() !== "";

const prettyNum = (v: any, digits = 2) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return n.toFixed(digits);
};

const toText = (v: any) => (v === null || v === undefined ? "" : String(v));

const safeIsoDate = (isoLike: any) => {
  if (!isoLike) return "—";
  const d = new Date(String(isoLike));
  if (Number.isNaN(d.getTime())) return String(isoLike);
  return d.toLocaleString();
};

const getTimeMs = (isoLike: any) => {
  if (!isoLike) return Date.now();
  const d = new Date(String(isoLike));
  const t = d.getTime();
  return Number.isFinite(t) ? t : Date.now();
};

const formatTimeHMSS = (ms: number) => {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
};

// ✅ CSV export (type-safe)
const downloadCsv = (filename: string, rows: Array<Record<string, any>>) => {
  if (!rows || rows.length === 0) return;

  const keySet = new Set<string>();
  rows.forEach((r) => Object.keys(r || {}).forEach((k) => keySet.add(k)));
  const keys = Array.from(keySet);

  const esc = (val: any) => {
    const s = val === null || val === undefined ? "" : String(val);
    const q = s.replace(/"/g, '""');
    if (/[",\n]/.test(q)) return `"${q}"`;
    return q;
  };

  const header = keys.map(esc).join(",");
  const body = rows.map((r) => keys.map((k) => esc(r?.[k])).join(",")).join("\n");
  const csv = "\uFEFF" + header + "\n" + body;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
};

// ==============================
// ✅ Full-width Line Chart (SVG) - with dots + hover tooltip + denser Y ticks
// ==============================
type ChartPoint = { t: number; y: number };

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

const FullWidthLineChart: React.FC<{
  title: string;
  points: ChartPoint[];
  height?: number;
  unit?: string;
}> = ({ title, points, height = 260, unit = "W" }) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // fixed viewBox width for consistent layout (responsive via CSS width:100%)
  const w = 1200;
  const h = height;

  // hover state
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState<number>(0);

  const ys = useMemo(
    () => points.map((p) => p.y).filter((n) => Number.isFinite(n)),
    [points]
  );

  const minY = ys.length ? Math.min(...ys) : 0;
  const maxY = ys.length ? Math.max(...ys) : 1;

  const pad = Math.max(1, (maxY - minY) * 0.15);
  const lo = ys.length ? minY - pad : 0;
  const hi = ys.length ? maxY + pad : 1;

  const n = Math.max(1, points.length - 1);

  const xOf = (i: number) => (i / n) * (w - 80) + 55; // more left padding for ticks
  const yOf = (val: number) => {
    const t = (val - lo) / (hi - lo || 1);
    return (1 - t) * (h - 46) + 18; // top/bottom padding
  };

  const path = useMemo(() => {
    return points
      .map((p, i) => {
        const x = xOf(i);
        const y = yOf(p.y);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, lo, hi, h]);

  const latest = points.length ? points[points.length - 1].y : null;

  // denser Y ticks
  const yTicks = useMemo(() => {
    // 6 lines => 7 labels (including ends)
    const steps = 6;
    const arr: Array<{ y: number; v: number }> = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const v = hi - (hi - lo) * t;
      const y = 18 + (h - 46) * t;
      arr.push({ y, v });
    }
    return arr;
  }, [lo, hi, h]);

  const onMouseMove = (e: React.MouseEvent) => {
    if (!wrapRef.current || points.length === 0) return;

    const rect = wrapRef.current.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    setMouseX(localX);

    const viewX = (localX / rect.width) * w;

    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dx = Math.abs(xOf(i) - viewX);
      if (dx < bestDist) {
        bestDist = dx;
        best = i;
      }
    }
    setHoverIdx(best);
  };

  const onMouseLeave = () => setHoverIdx(null);

  const hoverPoint = hoverIdx !== null ? points[hoverIdx] : null;
  const hoverX = hoverIdx !== null ? xOf(hoverIdx) : 0;
  const hoverY = hoverPoint ? yOf(hoverPoint.y) : 0;

  const tooltipLeft = useMemo(() => {
    if (!wrapRef.current) return 0;
    const rect = wrapRef.current.getBoundingClientRect();
    const raw = mouseX;
    return clamp(raw, 90, rect.width - 90);
  }, [mouseX]);

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
        <div>
          <div className="text-sm font-bold text-slate-800">{title}</div>
          <div className="text-[12px] text-slate-500 mt-1">
            Latest:{" "}
            <span className="font-semibold text-sky-800">
              {latest === null ? "—" : `${prettyNum(latest, 2)} ${unit}`}
            </span>{" "}
            • Points: <span className="font-semibold">{points.length}</span>
          </div>
        </div>

        <div className="text-[11px] text-slate-500">
          Scale: <span className="font-semibold">{prettyNum(lo, 0)}</span> →{" "}
          <span className="font-semibold">{prettyNum(hi, 0)}</span>
        </div>
      </div>

      <div
        ref={wrapRef}
        className="mt-4 relative overflow-hidden rounded-xl border border-slate-100 bg-slate-50"
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {hoverPoint && (
          <div
            className="absolute z-10 -translate-x-1/2"
            style={{ left: tooltipLeft, top: 10 }}
          >
            <div className="rounded-xl border border-slate-200 bg-white/95 shadow-md px-3 py-2 text-[12px] text-slate-700">
              <div className="font-semibold text-slate-900">
                {prettyNum(hoverPoint.y, 3)} {unit}
              </div>
              <div className="text-[11px] text-slate-500">
                {formatTimeHMSS(hoverPoint.t)}
              </div>
            </div>
          </div>
        )}

        <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[260px]">
          <line
            x1="55"
            y1={h - 28}
            x2={w - 16}
            y2={h - 28}
            stroke="rgba(100,116,139,0.35)"
          />
          <line
            x1="55"
            y1="18"
            x2="55"
            y2={h - 28}
            stroke="rgba(100,116,139,0.35)"
          />

          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1="55"
                y1={t.y}
                x2={w - 16}
                y2={t.y}
                stroke="rgba(100,116,139,0.14)"
              />
              <text
                x="8"
                y={t.y + 4}
                fontSize="12"
                fill="rgba(71,85,105,0.8)"
              >
                {prettyNum(t.v, 0)}
              </text>
            </g>
          ))}

          {points.length === 0 && (
            <text
              x={w / 2}
              y={h / 2}
              textAnchor="middle"
              fontSize="14"
              fill="rgba(71,85,105,0.75)"
            >
              No data yet
            </text>
          )}

          <path
            d={path || ""}
            fill="none"
            stroke="rgba(2,132,199,0.95)"
            strokeWidth="3"
          />

          {points.map((p, i) => {
            const cx = xOf(i);
            const cy = yOf(p.y);
            const active = hoverIdx === i;
            return (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={active ? 6 : 3.6}
                fill={active ? "rgba(2,132,199,0.98)" : "rgba(2,132,199,0.55)"}
              />
            );
          })}

          {hoverPoint && (
            <g>
              <line
                x1={hoverX}
                y1={18}
                x2={hoverX}
                y2={h - 28}
                stroke="rgba(2,132,199,0.25)"
              />
              <circle cx={hoverX} cy={hoverY} r="7" fill="rgba(2,132,199,0.12)" />
              <circle cx={hoverX} cy={hoverY} r="5" fill="rgba(2,132,199,0.95)" />
            </g>
          )}
        </svg>
      </div>

      <div className="mt-2 text-[11px] text-slate-500">
        Seed แรกเริ่มจาก 5 ค่า (ListMeterRealtimeData: W) แล้วไลฟ์ต่อจาก WebSocket
      </div>
    </div>
  );
};

// ==============================
// ✅ Value Cards (Latest Realtime)
// ==============================
const ValueCard: React.FC<{
  label: string;
  value: any;
  unit?: string;
  digits?: number;
  caps?: boolean;
  valueClassName?: string;
}> = ({ label, value, unit, digits = 2, caps = true, valueClassName }) => {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
      <div
        className={[
          "text-[11px] tracking-[0.18em] text-slate-500",
          caps ? "uppercase" : "",
        ].join(" ")}
      >
        {label}
      </div>
      <div
        className={[
          "mt-1 font-extrabold text-sky-800",
          valueClassName ? valueClassName : "text-2xl",
        ].join(" ")}
      >
        {prettyNum(value, digits)}
      </div>
      <div className="text-[12px] text-slate-500">{unit ?? ""}</div>
    </div>
  );
};

// ==============================
// ✅ Confirm Modal (English)
// ==============================
const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}> = ({
  open,
  title,
  description,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
  loading = false,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[999] flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/40"
        onClick={loading ? undefined : onCancel}
      />
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-slate-900">{title}</div>
            <div className="text-[12px] text-slate-500 mt-1">
              Please review before proceeding.
            </div>
          </div>
          <button
            onClick={loading ? undefined : onCancel}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
            title="Close"
          >
            <FiX className="text-slate-700" />
          </button>
        </div>

        <div className="p-5 text-sm text-slate-700">{description}</div>

        <div className="p-5 pt-0 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className={`px-4 py-2 rounded-xl border text-sm font-semibold transition ${
              loading
                ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {cancelText}
          </button>

          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition inline-flex items-center gap-2 ${
              loading ? "cursor-not-allowed opacity-70" : "hover:opacity-95 active:scale-[0.99]"
            } ${danger ? "bg-blue-600 text-white" : "bg-sky-600 text-white"}`}
          >
            {danger && <FiTrash2 />}
            {loading ? "Working..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==============================
// ✅ Page types
// ==============================
type MeterRealtimeRow = {
  ID: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  DeletedAt?: any;
  device_id: string;
  timestamp: string;
  w: number;
  var: number;
  va: number;
  vrms: number;
  irms: number;
};

const Meter: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state as LocationState | null) ?? null;

  const solarPoint = useMemo(() => {
    const raw = state?.solarPoint ?? state?.solar?.SolarPoint;
    return isNonEmptyString(raw) ? raw.trim() : null;
  }, [state]);

  const solarName = useMemo(() => {
    const raw = state?.solar?.Name;
    return isNonEmptyString(raw) ? raw.trim() : null;
  }, [state]);

  // -----------------------------
  // ✅ WS
  // -----------------------------
  const [connState, setConnState] = useState<ConnState>("idle");
  const [meterPoint, setMeterPoint] = useState<string | null>(null);
  const [lastData, setLastData] = useState<any>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const wsCtrlRef = useRef<ReturnType<typeof connectMeterSocket> | null>(null);

  // ✅ chart series
  const [wSeries, setWSeries] = useState<ChartPoint[]>([]);
  const wsHasDataRef = useRef(false);

  // -----------------------------
  // ✅ Realtime Data Table
  // -----------------------------
  const [rows, setRows] = useState<MeterRealtimeRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(false);
  const [rowsError, setRowsError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  // selection + delete modal
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMode, setConfirmMode] = useState<"selected" | "all">("selected");
  const [deleting, setDeleting] = useState(false);

  const stopSocket = () => {
    if (wsCtrlRef.current) {
      wsCtrlRef.current.close();
      wsCtrlRef.current = null;
    }
  };

  const startSocket = (deviceId: string) => {
    stopSocket();
    setConnState("loading");
    setErrorText(null);

    wsCtrlRef.current = connectMeterSocket(
      (data) => {
        wsHasDataRef.current = true;
        setLastData(data);

        const w = data?.w ?? data?.W ?? data?.power_w;
        const wNum = Number(w);
        const y = Number.isFinite(wNum) ? wNum : 0;

        setWSeries((prev) => {
          const next = [...prev, { t: Date.now(), y }];
          return next.slice(-120);
        });
      },
      deviceId,
      {
        debug: true,
        autoReconnect: true,
        onOpen: () => setConnState("connected"),
        onClose: () => setConnState((s) => (s === "connected" ? "reconnecting" : s)),
        onError: () => {
          setConnState("error");
          setErrorText("WebSocket error");
        },
      }
    );
  };

  // ✅ resolve meterPoint -> connect WS
  useEffect(() => {
    let alive = true;

    const run = async () => {
      if (!solarPoint) {
        setConnState("idle");
        setMeterPoint(null);
        setLastData(null);
        setWSeries([]);
        wsHasDataRef.current = false;
        return;
      }

      setConnState("loading");
      setErrorText(null);
      setMeterPoint(null);
      setLastData(null);
      setWSeries([]);
      wsHasDataRef.current = false;

      try {
        const res = await ListDataMeterBySolarPoint(solarPoint);
        if (!alive) return;

        const metersFromApi = res?.meters;
        const firstMeter =
          Array.isArray(metersFromApi) && metersFromApi.length > 0 ? metersFromApi[0] : null;

        const mp = firstMeter?.MeterPoint ?? firstMeter?.meter_point ?? null;

        if (!isNonEmptyString(mp)) {
          setConnState("no_meter");
          setErrorText("No MeterPoint found for this SolarPoint.");
          return;
        }

        const meterId = mp.trim();
        setMeterPoint(meterId);
        startSocket(meterId);
      } catch (e: any) {
        if (!alive) return;
        setConnState("error");
        setErrorText(e?.message || "Failed to load MeterPoint.");
      }
    };

    run();

    return () => {
      alive = false;
      stopSocket();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solarPoint]);

  // ✅ load realtime records
  const fetchRealtimeRows = useCallback(async () => {
    setLoadingRows(true);
    setRowsError(null);
    try {
      const res: any = await ListMeterRealtimeData();

      const list: MeterRealtimeRow[] = Array.isArray(res)
        ? res
        : Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.Data)
        ? res.Data
        : [];

      const sorted = [...list].sort((a, b) => {
        const ai = Number(a?.ID ?? 0);
        const bi = Number(b?.ID ?? 0);
        if (bi !== ai) return bi - ai;
        const at = new Date(a?.CreatedAt || 0).getTime();
        const bt = new Date(b?.CreatedAt || 0).getTime();
        return bt - at;
      });

      setRows(sorted);
      setSelectedIds(new Set());
    } catch (e: any) {
      setRowsError(e?.message || "Failed to load realtime data.");
      setRows([]);
      setSelectedIds(new Set());
    } finally {
      setLoadingRows(false);
    }
  }, []);

  useEffect(() => {
    fetchRealtimeRows();
  }, [fetchRealtimeRows]);

  // ✅ Seed chart with first 5 rows from service (W) BEFORE waiting for WebSocket
  useEffect(() => {
    if (wsHasDataRef.current) return;
    if (wSeries.length > 0) return;
    if (!rows || rows.length === 0) return;

    const base = meterPoint
      ? rows.filter((r) => toText(r?.device_id).trim() === meterPoint.trim())
      : rows;

    if (base.length === 0) return;

    const seed = base.slice(0, 5).reverse();

    const pts: ChartPoint[] = seed.map((r) => {
      const y = Number(r?.w);
      const yy = Number.isFinite(y) ? y : 0;
      const t = getTimeMs(r?.timestamp || r?.CreatedAt);
      return { t, y: yy };
    });

    setWSeries(pts.slice(-120));
  }, [rows, meterPoint, wSeries.length]);

  // ✅ pills
  const statusPill = useMemo(() => {
    const base =
      "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold border shadow-sm";
    if (connState === "connected") return `${base} bg-emerald-50 text-emerald-700 border-emerald-200`;
    if (connState === "reconnecting") return `${base} bg-amber-50 text-amber-700 border-amber-200`;
    if (connState === "loading") return `${base} bg-sky-50 text-sky-700 border-sky-200`;
    if (connState === "no_meter") return `${base} bg-red-50 text-red-700 border-red-200`;
    if (connState === "error") return `${base} bg-red-50 text-red-700 border-red-200`;
    return `${base} bg-slate-50 text-slate-700 border-slate-200`;
  }, [connState]);

  const statusText = useMemo(() => {
    switch (connState) {
      case "connected":
        return "Connected";
      case "reconnecting":
        return "Reconnecting...";
      case "loading":
        return "Loading...";
      case "no_meter":
        return "No Meter";
      case "error":
        return "Error";
      default:
        return "Idle";
    }
  }, [connState]);

  // ✅ latest summary from WS
  const summary = useMemo(() => {
    const d = lastData || {};
    const device = d?.device_id ?? d?.deviceId ?? meterPoint ?? "—";
    const ts = d?.timestamp ?? d?.time ?? d?.created_at ?? null;
    const w = d?.w ?? d?.W ?? d?.power_w ?? null;
    const va = d?.va ?? d?.VA ?? null;
    const varv = d?.var ?? d?.VAR ?? null;
    const vrms = d?.vrms ?? d?.Vrms ?? null;
    const irms = d?.irms ?? d?.Irms ?? null;

    return { device, ts, w, va, varv, vrms, irms };
  }, [lastData, meterPoint]);

  // ✅ filter
  const filteredRows = useMemo(() => {
    const qq = toText(q).trim().toLowerCase();
    if (!qq) return rows;

    return (rows || []).filter((r) => {
      const hay = `${toText(r?.ID)} ${toText(r?.CreatedAt)} ${toText(r?.device_id)} ${toText(
        r?.timestamp
      )} ${toText(r?.w)} ${toText(r?.va)} ${toText(r?.var)} ${toText(r?.vrms)} ${toText(
        r?.irms
      )}`
        .toLowerCase()
        .trim();
      return hay.includes(qq);
    });
  }, [rows, q]);

  // pagination
  const total = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredRows.slice(start, start + pageSize);
  }, [filteredRows, safePage, pageSize]);

  useEffect(() => setPage(1), [q, pageSize]);

  // selection helpers
  const isAllPageSelected = useMemo(() => {
    if (pagedRows.length === 0) return false;
    return pagedRows.every((r) => selectedIds.has(Number(r.ID)));
  }, [pagedRows, selectedIds]);

  const toggleRow = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const toggleAllPage = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pagedRows.forEach((r) => {
        const id = Number(r.ID);
        if (checked) next.add(id);
        else next.delete(id);
      });
      return next;
    });
  };

  const selectedCount = selectedIds.size;

  const openDeleteSelectedModal = () => {
    if (selectedCount <= 0) return;
    setConfirmMode("selected");
    setConfirmOpen(true);
  };

  const openDeleteAllModal = () => {
    if (!rows || rows.length === 0) return;
    setConfirmMode("all");
    setConfirmOpen(true);
  };

  const doDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setDeleting(true);
    try {
      const result = await DeleteMeterRealtimeDataByIDs(ids, false);
      if (!result) {
        message.error("Delete failed (no response).");
        return;
      }

      setConfirmOpen(false);
      message.success(`Delete ${ids.length} Data Success`);

      await fetchRealtimeRows();
      setSelectedIds(new Set());
      if (!wsHasDataRef.current) setWSeries([]);
    } catch (e: any) {
      message.error(e?.message || "Delete failed.");
    } finally {
      setDeleting(false);
    }
  };

  const doDeleteAll = async () => {
    const ids = (rows || []).map((r) => Number(r.ID)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) return;

    setDeleting(true);
    try {
      const result = await DeleteMeterRealtimeDataByIDs(ids, false);
      if (!result) {
        message.error("Delete failed (no response).");
        return;
      }

      setConfirmOpen(false);
      message.success("Delete All Data Success");

      await fetchRealtimeRows();
      setSelectedIds(new Set());
      if (!wsHasDataRef.current) setWSeries([]);
    } catch (e: any) {
      message.error(e?.message || "Delete all failed.");
    } finally {
      setDeleting(false);
    }
  };

  // UI: copy ws url
  const frontendWsUrl = useMemo(() => {
    if (!meterPoint) return null;
    return `${window.location.origin.replace(/^http/, "ws")}/meter/frontend?deviceID=${encodeURIComponent(
      meterPoint
    )}`;
  }, [meterPoint]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-white to-sky-100 text-gray-900 mt-14 sm:mt-0">
      {/* ✅ Header (blue like before) */}
      <header className="sticky top-0 z-20 bg-blue-600 text-white shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs sm:text-sm font-semibold text-white border border-white/20 hover:bg-white/15 active:scale-[0.99] transition"
            >
              <FiArrowLeft />
              Back
            </button>

            <div className="flex flex-col">
              <span className="text-[11px] uppercase tracking-[0.18em] text-blue-100">Meter</span>
              <span className="text-xs sm:text-sm font-semibold">
                {solarName ? `${solarName} • ` : ""}
                {solarPoint ?? "-"}
              </span>
              <span className="text-[11px] text-blue-100">
                MeterPoint: <span className="font-mono text-white">{meterPoint ?? "—"}</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] sm:text-xs">
            <span className={statusPill}>
              {connState === "connected" ? (
                <FiWifi />
              ) : connState === "reconnecting" ? (
                <FiRefreshCw />
              ) : connState === "error" ? (
                <FiAlertTriangle />
              ) : (
                <FiActivity />
              )}
              {statusText}
            </span>

            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/20">
              <FiSun className="text-yellow-300" />
              <span>SolarPoint</span>
            </span>

            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white text-blue-700 border-white/40 shadow-md shadow-black/10 ring-1 ring-white/60">
              <FiActivity className="text-[13px] text-blue-700" />
              <span className="font-semibold">{solarPoint ?? "—"}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        open={confirmOpen}
        danger
        loading={deleting}
        title={
          confirmMode === "all" ? "Delete ALL records?" : "Delete selected records?"
        }
        confirmText={
          confirmMode === "all"
            ? `Delete All (${rows.length})`
            : `Delete (${selectedCount})`
        }
        cancelText="Cancel"
        onCancel={() => {
          if (!deleting) setConfirmOpen(false);
        }}
        onConfirm={confirmMode === "all" ? doDeleteAll : doDeleteSelected}
        description={
          confirmMode === "all" ? (
            <div className="space-y-3">
              <div>
                You are about to delete <span className="font-semibold">{rows.length}</span>{" "}
                record(s) (ALL). This action cannot be undone.
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-100 p-3 text-[12px] text-blue-700">
                Tip: หากต้องการลบเฉพาะบางรายการ ให้เลือกแล้วกด Delete Selected
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                You are about to delete <span className="font-semibold">{selectedCount}</span>{" "}
                realtime record(s). This action cannot be undone.
              </div>

              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-[12px] text-slate-700">
                <div className="font-semibold mb-1">Selected IDs</div>
                <div className="max-h-28 overflow-auto font-mono">
                  {Array.from(selectedIds)
                    .sort((a, b) => a - b)
                    .join(", ")}
                </div>
              </div>
            </div>
          )
        }
      />

      <main className="max-w-screen-xl mx-auto px-4 sm:px-6 py-6 space-y-4">
        {/* Info Card */}
        <div className="rounded-2xl bg-white border border-sky-100 shadow-sm shadow-sky-100 p-5 md:p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-lg md:text-xl font-bold text-sky-800">Meter Monitor</h1>
              <p className="text-sm text-slate-600">
                Seed 5 ค่าแรกจาก <span className="font-mono">ListMeterRealtimeData</span> (W) แล้วไลฟ์ต่อจาก{" "}
                <span className="font-semibold">WebSocket</span>.
              </p>

              {errorText && (
                <div className="mt-3 rounded-xl bg-red-50 border border-red-100 p-3 text-sm text-red-700 flex items-start gap-2">
                  <FiAlertTriangle className="mt-0.5" />
                  <div>{errorText}</div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {meterPoint && (
                <button
                  onClick={() => startSocket(meterPoint)}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-100 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 active:scale-[0.99] transition"
                  title="Reconnect"
                >
                  <FiRefreshCw />
                  Reconnect WS
                </button>
              )}

              {meterPoint && (
                <button
                  onClick={async () => {
                    const ok = await copyToClipboard(meterPoint);
                    if (!ok) message.error("Copy failed.");
                    else message.success("Copied");
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.99] transition"
                  title="Copy MeterPoint"
                >
                  <FiCopy />
                  Copy MeterPoint
                </button>
              )}

              {frontendWsUrl && (
                <button
                  onClick={async () => {
                    const ok = await copyToClipboard(frontendWsUrl);
                    if (!ok) message.error("Copy failed.");
                    else message.success("Copied");
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.99] transition"
                  title="Copy WS URL (frontend subscribe)"
                >
                  <FiCopy />
                  Copy WS URL
                </button>
              )}
            </div>
          </div>
        </div>

        <FullWidthLineChart title="Realtime Power Chart" points={wSeries} unit="W" />

        {/* ✅ Latest Realtime Values */}
        <div className="rounded-2xl bg-white border border-sky-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-bold text-slate-800">Latest Realtime</div>
              <div className="text-[12px] text-slate-500 mt-1">
                Device: <span className="font-mono">{summary.device}</span> • Timestamp:{" "}
                <span className="font-semibold">{summary.ts ? safeIsoDate(summary.ts) : "—"}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <ValueCard label="W" value={summary.w} unit="Watt" digits={3} />
            <ValueCard label="Vrms" value={summary.vrms} unit="Volt" digits={2} caps={false} />
            <ValueCard label="Irms" value={summary.irms} unit="Ampere" digits={3} caps={false} />
            <ValueCard label="VA" value={summary.va} unit="Volt-Ampere" digits={3} />
            <ValueCard label="VAR" value={summary.varv} unit="Reactive" digits={3} />
            <ValueCard
              label="Status"
              value={statusText}
              unit="Connection"
              digits={0}
              valueClassName="text-base sm:text-lg"
            />
          </div>
        </div>

        {/* ✅ Realtime History */}
        <div className="rounded-2xl bg-white border border-sky-100 shadow-sm p-5">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Realtime History (MeterRealtimeData)</h2>
              <p className="text-[12px] text-slate-500">
                Data source: <span className="font-mono">ListMeterRealtimeData</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Search */}
              <div className="relative">
                <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search: id, Date & Time, device_id, timestamp, w, va, var, vrms, irms..."
                  className="w-[300px] max-w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
                />
              </div>

              {/* Page size */}
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="px-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
              >
                <option value={5}>5 / page</option>
                <option value={10}>10 / page</option>
                <option value={20}>20 / page</option>
                <option value={50}>50 / page</option>
              </select>

              {/* Refresh */}
              <button
                onClick={fetchRealtimeRows}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-50 border border-sky-100 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 active:scale-[0.99] transition"
              >
                <FiRefreshCw />
                Refresh
              </button>

              {/* Download CSV (filtered) - ✅ เปลี่ยน ID เป็น No + ลบ device_id/timestamp ออก */}
              <button
                onClick={() => {
                  const exportRows = filteredRows.map((r, idx) => ({
                    No: idx + 1,
                    "Date & Time": r.CreatedAt ?? "",
                    W: r.w,
                    VAR: r.var,
                    VA: r.va,
                    Vrms: r.vrms,
                    Irms: r.irms,
                  }));

                  downloadCsv(
                    `meter_realtime_${new Date().toISOString().slice(0, 10)}.csv`,
                    exportRows
                  );
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.99] transition"
              >
                <FiDownload />
                Download CSV
              </button>

              {/* ✅ Delete All */}
              <button
                onClick={openDeleteAllModal}
                disabled={!rows || rows.length === 0}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition border ${
                  !rows || rows.length === 0
                    ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-red-600 text-white border-red-600 hover:bg-red-700 active:scale-[0.99]"
                }`}
                title="Delete ALL data"
              >
                <FiTrash2 />
                Delete All
              </button>

              {/* Bulk delete selected */}
              <button
                onClick={openDeleteSelectedModal}
                disabled={selectedCount <= 0}
                className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition border ${
                  selectedCount <= 0
                    ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                    : "bg-red-50 border-red-100 text-red-700 hover:bg-red-100 active:scale-[0.99]"
                }`}
                title="Delete selected"
              >
                <FiTrash2 />
                Delete Selected ({selectedCount})
              </button>
            </div>
          </div>

          <div className="mt-4">
            {loadingRows ? (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-600">
                Loading realtime data...
              </div>
            ) : rowsError ? (
              <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-700 flex items-start gap-2">
                <FiAlertTriangle className="mt-0.5" />
                <div>{rowsError}</div>
              </div>
            ) : filteredRows.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-600">
                No realtime records found.
              </div>
            ) : (
              <>
                <div className="overflow-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-sm bg-white">
                    <thead>
                      <tr className="text-left text-[12px] text-slate-500 bg-slate-50 border-b">
                        <th className="py-3 px-3 w-[52px]">
                          <input
                            type="checkbox"
                            checked={isAllPageSelected}
                            onChange={(e) => toggleAllPage(e.target.checked)}
                            className="h-4 w-4 accent-sky-600"
                            aria-label="Select all on page"
                          />
                        </th>

                        <th className="py-3 px-3">No</th>
                        <th className="py-3 px-3">Date & Time</th>

                        <th className="py-3 px-3 text-right">W</th>
                        <th className="py-3 px-3 text-right">VAR</th>
                        <th className="py-3 px-3 text-right">VA</th>
                        <th className="py-3 px-3 text-right">Vrms</th>
                        <th className="py-3 px-3 text-right">Irms</th>
                        <th className="py-3 px-3 text-right">Copy</th>
                      </tr>
                    </thead>

                    <tbody>
                      {pagedRows.map((r, idx) => {
                        const realId = Number(r.ID);
                        const checked = selectedIds.has(realId);
                        const displayNo = (safePage - 1) * pageSize + idx + 1;

                        return (
                          <tr
                            key={String(realId)}
                            className="border-b last:border-b-0 hover:bg-sky-50/40"
                          >
                            <td className="py-3 px-3">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => toggleRow(realId, e.target.checked)}
                                className="h-4 w-4 accent-sky-600"
                                aria-label={`Select row id ${realId}`}
                              />
                            </td>

                            <td className="py-3 px-3 font-mono text-[12px] text-slate-700">
                              {displayNo}
                            </td>

                            <td className="py-3 px-3 text-[12px] text-slate-600">
                              {safeIsoDate(r.CreatedAt)}
                            </td>

                            <td className="py-3 px-3 text-right font-semibold text-slate-800">
                              {prettyNum(r.w, 3)}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-700">
                              {prettyNum(r.var, 3)}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-700">
                              {prettyNum(r.va, 3)}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-700">
                              {prettyNum(r.vrms, 2)}
                            </td>
                            <td className="py-3 px-3 text-right text-slate-700">
                              {prettyNum(r.irms, 3)}
                            </td>

                            <td className="py-3 px-3">
                              <div className="flex justify-end">
                                <button
                                  onClick={async () => {
                                    const payload = JSON.stringify(r, null, 2);
                                    const ok = await copyToClipboard(payload);
                                    if (!ok) message.error("Copy failed.");
                                    else message.success("Copied");
                                  }}
                                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                                  title="Copy row JSON"
                                >
                                  <FiCopy className="text-slate-600" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="text-[12px] text-slate-500">
                    Showing{" "}
                    <span className="font-semibold">{(safePage - 1) * pageSize + 1}</span> -{" "}
                    <span className="font-semibold">{Math.min(safePage * pageSize, total)}</span> of{" "}
                    <span className="font-semibold">{total}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={safePage <= 1}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold transition ${
                        safePage <= 1
                          ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Prev
                    </button>

                    <div className="text-xs text-slate-600">
                      Page <span className="font-semibold">{safePage}</span> /{" "}
                      <span className="font-semibold">{totalPages}</span>
                    </div>

                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={safePage >= totalPages}
                      className={`px-3 py-2 rounded-xl border text-xs font-semibold transition ${
                        safePage >= totalPages
                          ? "bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed"
                          : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="mt-3 text-[12px] text-slate-500">
                  Selected: <span className="font-semibold">{selectedCount}</span> record(s). Use
                  "Delete Selected" to remove them.
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default Meter;
