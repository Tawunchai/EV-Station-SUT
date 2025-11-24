// src/services/ocppClient.ts

import axios from "axios";

//const apiUrl = "http://10.0.14.228:8000";
const apiUrl = "https://payment-project-t4dj.onrender.com";
//const apiUrl = "http://192.168.1.141:8000";

export const connectOcppSocket = (onMessage: (data: any) => void): WebSocket => {
  const ws = new WebSocket(`${apiUrl}/frontend`);

  ws.onopen = () => {
    console.log("✅ Connected to Go OCPP Server (/frontend)");
  };

  ws.onmessage = (event) => {
    try {
      const parsed = JSON.parse(event.data);
      console.log("📩 OCPP Message:", parsed);
      onMessage(parsed);
    } catch {
      console.log("📩 Raw Message:", event.data);
      onMessage(event.data);
    }
  };

  ws.onclose = () => {
    console.log("⚠️ WebSocket (/frontend) disconnected");
  };

  ws.onerror = (err) => {
    console.error("❌ WebSocket (/frontend) error:", err);
  };

  return ws;
};

export const remoteStartCharging = async (params: {
  chargerId: string;
  connectorId: number;
  idTag: string;
}) => {
  const res = await axios.post(`${apiUrl}/ocpp/remote-start`, {
    chargerId: params.chargerId,
    connectorId: params.connectorId,
    idTag: params.idTag,
  });

  return res.data;
};

export const remoteStopCharging = async (params: { chargerId: string }) => {
  const res = await axios.post(`${apiUrl}/ocpp/remote-stop`, {
    chargerId: params.chargerId,
  });

  return res.data;
};

/** ==========================
 *  Get Charger Status (NEW)
 *  ========================== */

// ให้ตรงกับ struct ChargerStatus ใน Go
export interface ChargerStatus {
  chargerId: string;
  connectorId: number;
  status: string;      // Available, Preparing, Charging, ...
  errorCode: string;   // NoError, ...
  connected: boolean;  // true = online, false = disconnected
}

// response รูปแบบ { data: { ...ChargerStatus } }
interface ChargerStatusResponse {
  data: ChargerStatus;
}

// GET /ocpp/status/:chargerID
export const getChargerStatus = async (
  chargerId: string
): Promise<ChargerStatus> => {
  const res = await axios.get<ChargerStatusResponse>(
    `${apiUrl}/ocpp/status/${chargerId}`
  );
  return res.data.data;
};