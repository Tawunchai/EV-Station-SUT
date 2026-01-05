import { EmployeeInterface } from "./IEmployee";
import { StatusInterface } from "./IStatus";
import { TypeInterface } from "./IType";
import { EnergySourceInterface } from "./IEnergySource";

export interface EVCabinetInterface {
  ID?: number;
  CreatedAt?: string;
  UpdatedAt?: string;
  DeletedAt?: string | null;

  Name: string; 
  Description?: string; 
  Location?: string; 
  Status?: string; 

  Latitude?: number; 
  Longitude?: number; 
  Image?: string; 
}

export interface EVchargingInterface {
  ID: number;
  Name: string;
  Description: string;
  Price: number;
  Picture: string;

  Employee?: EmployeeInterface;
  Status?: StatusInterface;
  Type?: TypeInterface;
  EnergySource?:EnergySourceInterface;

  EmployeeID?: number;
  StatusID?: number;
  TypeID?: number;

  // ⭐ เปลี่ยนจาก 1 Cabinet → หลาย Cabinet
  Cabinets: EVCabinetInterface[];
}

export interface CreateEVInput {
  Name: string;
  Description: string;
  Price: number;
  EmployeeID: number;
  StatusID: number;
  TypeID: number;
}



export interface PaymentInterface {
  ID?: number;
  Date: string;
  Amount: number;
  ReferenceNumber?: string;
  Picture?: string;
  UserID?: number;
  MethodID?: number;
  CreatedAt?: string;
  UpdatedAt?: string;
}
export interface EVChargingPayListmentInterface {
  ID?: number;
  EVchargingID: number;
  PaymentID: number;
  Price: number;
  Quantity: number;
  Power: number; // kWh
  RemainingPower: number; // kWh ที่เหลือ
  CreatedAt?: string;
  UpdatedAt?: string;
  EVcharging?: EVchargingInterface;
  Payment?: PaymentInterface; // ✅ เพิ่มตรงนี้
}