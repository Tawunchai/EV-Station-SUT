// src/interface/IHardware.ts

export interface HardwareInterface {
  ID?: number;            // มาจาก gorm.Model
  Name: string;           // ชื่อ hardware เช่น "Solar Box 1"
  HardwarePoint: string;  // จุดอ้างอิง เช่น "hardware_001"
  UrlWebsocket: string;   // URL สำหรับ WebSocket เช่น "wss://.../hardware/"

  CreatedAt?: string;
  UpdatedAt?: string;
  DeletedAt?: string | null;
}
