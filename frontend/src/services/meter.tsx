// src/services/meter.ts
import axios from "axios";
import { apiUrl } from "./index"; // ✅ ปรับ path ให้ตรงโปรเจคคุณ (บางโปรเจคอยู่ที่ ../services)
import type { MeterInterface } from "../interface/IMeter";

const getAuthHeader = () => {
  const token = localStorage.getItem("token");
  const tokenType = localStorage.getItem("token_type");
  return { Authorization: `${tokenType} ${token}` };
};

/* =========================
   CREATE METER
   POST /create-meter
========================= */
export const CreateMeter = async (
  payload: Pick<MeterInterface, "name" | "url_websocket" | "meter_point" | "description">
): Promise<MeterInterface | null> => {
  try {
    const response = await axios.post(`${apiUrl}/create-meter`, payload, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    // backend อาจคืน {message, data} หรือคืน object ตรงๆ
    if (response.status === 201 || response.status === 200) {
      const data = response.data?.data ?? response.data;
      return data as MeterInterface;
    }

    console.error("Unexpected status:", response.status);
    return null;
  } catch (error) {
    console.error("Error creating meter:", error);
    return null;
  }
};

/* =========================
   UPDATE METER BY ID
   PATCH /update-meter/:id
========================= */
export const UpdateMeterByID = async (
  id: number,
  payload: Partial<Pick<MeterInterface, "name" | "url_websocket" | "meter_point" | "description">>
): Promise<MeterInterface | null> => {
  try {
    const response = await axios.patch(`${apiUrl}/update-meter/${id}`, payload, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      const data = response.data?.data ?? response.data;
      return data as MeterInterface;
    }

    console.error("Unexpected status:", response.status);
    return null;
  } catch (error) {
    console.error("Error updating meter:", error);
    return null;
  }
};

/* =========================
   DELETE METER BY ID
   DELETE /delete-meter/:id
========================= */
export const DeleteMeterByID = async (id: number): Promise<boolean> => {
  try {
    const response = await axios.delete(`${apiUrl}/delete-meter/${id}`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      return true;
    }

    console.error("Unexpected status:", response.status);
    return false;
  } catch (error) {
    console.error("Error deleting meter:", error);
    return false;
  }
};

export const ListMeter = async (): Promise<MeterInterface[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/meters`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      // backend อาจคืน array ตรงๆ หรือ {data: [...]}
      const data = response.data?.data ?? response.data;
      return data as MeterInterface[];
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching meter list:", error);
    return null;
  }
};

// websocket connection to meter

export type MeterSocketOptions = {
  /** เปิด log ใน console หรือไม่ (default: true) */
  debug?: boolean;
  /** auto reconnect หรือไม่ (default: true) */
  autoReconnect?: boolean;
  /** จำนวนครั้งสูงสุดในการ reconnect (default: Infinity) */
  maxReconnectAttempts?: number;
  /** หน่วงเวลาเริ่มต้นก่อน reconnect (ms) (default: 800) */
  reconnectBaseDelayMs?: number;
  /** หน่วงเวลาสูงสุดก่อน reconnect (ms) (default: 10000) */
  reconnectMaxDelayMs?: number;
  /** callback ตอนเชื่อมต่อสำเร็จ */
  onOpen?: () => void;
  /** callback ตอน disconnect */
  onClose?: (ev: CloseEvent) => void;
  /** callback ตอน error */
  onError?: (ev: Event) => void;
};

const buildWsUrl = (httpBase: string, pathWithQuery: string) => {
  // รองรับทั้ง http:// หรือ https://
  const base = httpBase.replace(/\/+$/, "");
  const isHttps = base.startsWith("https://");
  const isHttp = base.startsWith("http://");

  if (isHttps) return base.replace("https://", "wss://") + pathWithQuery;
  if (isHttp) return base.replace("http://", "ws://") + pathWithQuery;

  // เผื่อ apiUrl เป็นโดเมนล้วน ๆ
  return "ws://" + base + pathWithQuery;
};

export const connectMeterSocket = (
  onMessage: (data: any) => void,
  deviceId: string,
  options?: MeterSocketOptions
) => {
  const {
    debug = true,
    autoReconnect = true,
    maxReconnectAttempts = Number.POSITIVE_INFINITY,
    reconnectBaseDelayMs = 800,
    reconnectMaxDelayMs = 10000,
    onOpen,
    onClose,
    onError,
  } = options || {};

  let ws: WebSocket | null = null;
  let closedByUser = false;
  let reconnectAttempts = 0;

  const log = (...args: any[]) => {
    if (debug) console.log(...args);
  };
  const warn = (...args: any[]) => {
    if (debug) console.warn(...args);
  };
  const errLog = (...args: any[]) => {
    if (debug) console.error(...args);
  };

  const connect = () => {
    const url = buildWsUrl(apiUrl, `/meter/frontend?deviceID=${encodeURIComponent(deviceId)}`);
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      log(`✅ Connected to Go Meter WebSocket Server for device: ${deviceId}`);
      onOpen?.();
    };

    ws.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        log("⚡ Received Meter Data:", parsed);
        onMessage(parsed);
      } catch {
        log("📩 Raw Message (non-JSON):", event.data);
        onMessage(event.data);
      }
    };

    ws.onclose = (ev) => {
      warn("⚠️ Meter WebSocket disconnected", {
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
      });
      onClose?.(ev);

      if (!autoReconnect || closedByUser) return;
      if (reconnectAttempts >= maxReconnectAttempts) {
        warn("⛔ Stop reconnect: reached maxReconnectAttempts");
        return;
      }

      reconnectAttempts += 1;

      // backoff แบบค่อย ๆ เพิ่ม แต่ไม่เกิน max
      const delay = Math.min(
        reconnectMaxDelayMs,
        reconnectBaseDelayMs * Math.pow(1.6, reconnectAttempts - 1)
      );

      warn(`🔁 Reconnecting Meter WS in ${Math.round(delay)}ms... (attempt ${reconnectAttempts})`);
      window.setTimeout(() => {
        if (!closedByUser) connect();
      }, delay);
    };

    ws.onerror = (ev) => {
      errLog("❌ Meter WebSocket error:", ev);
      onError?.(ev);
      // ปล่อยให้ onclose จัดการ reconnect (บราวเซอร์ส่วนมากจะตามมาด้วย close)
    };

    return ws;
  };

  // connect ทันที
  connect();

  // return controller object ให้ใช้งานสะดวก
  return {
    /** ได้ socket instance ปัจจุบัน (อาจเป็น null ชั่วคราวตอน reconnect) */
    get socket() {
      return ws;
    },
    /** ปิดแบบผู้ใช้ตั้งใจ (จะไม่ reconnect ต่อ) */
    close: () => {
      closedByUser = true;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      ws = null;
    },
    /** สั่ง reconnect ใหม่เอง */
    reconnect: () => {
      closedByUser = false;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      ws = null;
      connect();
    },
  };
};

export const ListDataMeterBySolarPoint = async (
  solarPoint: string
): Promise<any> => {
  try {
    const response = await axios.get(
      `${apiUrl}/meters/by-solar-point/${encodeURIComponent(solarPoint)}`,
      {
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      }
    );

    if (response.status === 200) {
      return response.data; // ✅ จะได้ { solar_point, solars, meters }
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching meter by solar point:", error);
    return null;
  }
};

export const ListMeterRealtimeData = async (): Promise<any[] | null> => {
  try {
    const response = await axios.get(`${apiUrl}/meter-realtime-data`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
    });

    if (response.status === 200) {
      // backend อาจคืน array ตรงๆ หรือ {data: [...]}
      const data = response.data?.data ?? response.data;
      return data as any[];
    } else {
      console.error("Unexpected status:", response.status);
      return null;
    }
  } catch (error) {
    console.error("Error fetching meter realtime data:", error);
    return null;
  }
};

type DeleteMeterRealtimeDataResult = {
  message: string;
  ids: number[];
  deleted_rows: number;
  hard_delete: boolean;
  soft_delete: boolean;
  deleted_at_gorm?: string;
};

// ✅ ส่งแบบ JSON body {"ids":[...]} (แนะนำ)
export const DeleteMeterRealtimeDataByIDs = async (
  ids: number[],
  force = false
): Promise<DeleteMeterRealtimeDataResult | null> => {
  try {
    if (!Array.isArray(ids) || ids.length === 0) {
      console.error("DeleteMeterRealtimeDataByIDs: ids is empty");
      return null;
    }

    const response = await axios.delete(`${apiUrl}/delete-meter-realtime-data`, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      params: force ? { force: "true" } : undefined,
      data: { ids }, // ✅ สำคัญ: axios delete ต้องใส่ body ที่ config.data
    });

    if (response.status === 200) {
      return response.data as DeleteMeterRealtimeDataResult;
    }

    console.error("Unexpected status:", response.status);
    return null;
  } catch (error) {
    console.error("Error deleting meter realtime data by ids:", error);
    return null;
  }
};
