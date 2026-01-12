
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

export interface UserSession {
  role: 'DISPATCH' | 'UNIT';
  username?: string; // Operator ID for Dispatch
  robloxUsername?: string; // Roblox for Unit
  callsign?: string; // Callsign for Unit
  unitType?: UnitType;
}

export interface Unit {
  id: string;
  name: string;
  type: UnitType;
  status: UnitStatus;
  robloxUser?: string;
  lastUpdated: string;
  assignedIncidentId?: string | null;
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
  assignedUnits: string; // JSON stringified array of unit IDs (e.g., ["1A-10", "1A-12"])
  logs: string; // JSON stringified array of logs
  startTime: string;
}
