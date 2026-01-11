
export enum UnitStatus {
  AVAILABLE = 'AVAILABLE',
  EN_ROUTE = 'EN_ROUTE',
  ON_SCENE = 'ON_SCENE',
  BUSY = 'BUSY',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE'
}

export enum UnitType {
  POLICE = 'POLICE',
  FIRE = 'FIRE',
  EMS = 'EMS'
}

export enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EMERGENCY = 'EMERGENCY'
}

export type Role = 'DISPATCH' | 'UNIT';

export interface UserSession {
  role: Role;
  username?: string; // Roblox Username
  callsign?: string; // Unit Name
  unitType?: UnitType;
}

export interface Unit {
  id: string;
  name: string;
  type: UnitType;
  status: UnitStatus;
  robloxUser?: string;
  lastUpdated: string;
}

export interface IncidentLog {
  id: string;
  timestamp: string;
  sender: string;
  message: string;
}

export interface Incident {
  id: string;
  callType: string;
  location: string;
  priority: Priority;
  status: 'ACTIVE' | 'CLOSED';
  assignedUnits: string[]; // Unit IDs
  logs: IncidentLog[];
  startTime: string;
}
