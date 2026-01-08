// src/interface/IMeter.ts
export interface MeterInterface {
  ID?: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  DeletedAt?: string | null;

  name: string;
  url_websocket: string;
  meter_point: string;
  description?: string;
}
