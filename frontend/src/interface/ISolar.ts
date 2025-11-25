// interface/ISolar.ts
export interface SolarInterface {
  ID?: number;

  Name?: string;
  UrlWebsocket?: string;
  SolarPoint?: string;

  Description?: string;  
  Picture?: string;      
  Location?: string;     

  CreatedAt?: string;
  UpdatedAt?: string;
  DeletedAt?: string | null;
}
