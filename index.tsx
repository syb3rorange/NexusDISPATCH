
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import Gun from 'gun';
import { GoogleGenAI } from "@google/genai";

// --- TYPES & CONSTANTS ---
enum UnitStatus {
  AVAILABLE = 'AVAILABLE',
  EN_ROUTE = 'EN_ROUTE',
  ON_SCENE = 'ON_SCENE',
  BUSY = 'BUSY',
  OUT_OF_SERVICE = 'OUT_OF_SERVICE'
}

enum UnitType {
  POLICE = 'POLICE',
  FIRE = 'FIRE',
  EMS = 'EMS'
}

enum Priority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  EMERGENCY = 'EMERGENCY'
}

interface UserSession {
  role: 'DISPATCH' | 'UNIT';
  username?: string;
  callsign?: string;
  unitType?: UnitType;
}

interface Unit {
  id: string;
  name: string;
  type: UnitType;
  status: UnitStatus;
  robloxUser?: string;
  lastUpdated: string;
}

interface IncidentLog {
  id: string;
  timestamp: string;
  sender: string;
  message: string;
}

interface Incident {
  id: string;
  callType: string;
  location: string;
  priority: Priority;
  status: 'ACTIVE' | 'CLOSED';
  assignedUnits: string[];
  logs: IncidentLog[];
  startTime: string;
}

const CALL_TYPES = [
  '10-31 (Crime in Progress)',
  '10-50 (Vehicle Accident)',
  '10-52 (Resuscitation)',
  'Medical Emergency',
  'Structure Fire',
  'Domestic Dispute',
  'Traffic Stop',
  'Welfare Check',
  'Trespassing',
  'Armed Robbery'
];

const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
  EN_ROUTE: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  ON_SCENE: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  BUSY: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  OUT_OF_SERVICE: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-slate-400',
  MEDIUM: 'text-blue-400',
  HIGH: 'text-orange-400',
  EMERGENCY: 'text-red-500 font-bold animate-pulse',
};

const STORAGE_KEY = 'nexus_cad_profile';

const Icons = {
  Police: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>
  ),
  Fire: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
  ),
  EMS: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"/></svg>
  ),
  Plus: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
  ),
  Send: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>
  ),
  Sparkles: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
  ),
  Refresh: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M3 21v-5h5"/></svg>
  )
};

// --- GEMINI SERVICE ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

const assistDispatcher = async (notes: string) => {
  if (!process.env.API_KEY) return notes;
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a professional emergency dispatch AI. Convert this note into a concise dispatcher log entry: "${notes}"`,
    });
    return response.text?.trim() || notes;
  } catch (error) {
    return notes;
  }
};

// --- GUN DB ---
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun', 'https://relay.peer.ooo/gun']);

// --- AUDIO UTILITY ---
const playDispatchTone = () => {
  try {
    const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
    const context = new AudioContextClass();
    
    if (context.state === 'suspended') {
      context.resume();
    }

    const playTone = (freq: number, start: number, duration: number) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, context.currentTime + start);
      gain.gain.setValueAtTime(0, context.currentTime + start);
      gain.gain.linearRampToValueAtTime(0.3, context.currentTime + start + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.01, context.currentTime + start + duration);
      osc.connect(gain);
      gain.connect(context.destination);
      osc.start(context.currentTime + start);
      osc.stop(context.currentTime + start + duration);
    };
    
    playTone(850, 0, 0.5);
    playTone(650, 0.55, 0.8);
  } catch (e) {
    console.error("Audio error:", e);
  }
};

// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
  const [roomId, setRoomId] = useState<string>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    const newId = Math.random().toString(36).substr(2, 9);
    window.location.hash = newId;
    return newId;
  });

  const [session, setSession] = useState<UserSession | null>(null);
  const [dispatchPass, setDispatchPass] = useState('');
  const [onboardingData, setOnboardingData] = useState({ roblox: '', callsign: '', type: UnitType.POLICE });
  const [savedProfile, setSavedProfile] = useState<{roblox: string, callsign: string, type: UnitType} | null>(null);

  const [units, setUnits] = useState<Unit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  
  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [logInput, setLogInput] = useState('');
  const [isAIAssisting, setIsAIAssisting] = useState(false);
  const [lastSync, setLastSync] = useState<number>(Date.now());
  const [isSyncing, setIsSyncing] = useState(false);

  const [newCallType, setNewCallType] = useState(CALL_TYPES[0]);
  const [newLocation, setNewLocation] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM);

  // Use a Ref to track IDs of incidents we've already "heard"
  const knownIncidentIds = useRef<Set<string>>(new Set());

  // Derive the active incident from the list
  const activeIncident = useMemo(() => incidents.find(i => i.id === activeIncidentId), [incidents, activeIncidentId]);

  // Load saved profile on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSavedProfile(JSON.parse(stored));
      } catch (e) {}
    }
  }, []);

  // Broadcast function to update the shared Gun state
  const broadcastState = useCallback((newUnits: Unit[], newIncidents: Incident[]) => {
    gun.get('nexus_cad_rooms').get(roomId).get('state').put(JSON.stringify({ 
      units: newUnits, 
      incidents: newIncidents,
      timestamp: Date.now() 
    }));
  }, [roomId]);

  // Real-time Gun Listener
  useEffect(() => {
    const room = gun.get('nexus_cad_rooms').get(roomId);
    
    // Listen for updates from other peers
    room.get('state').on((data) => {
      if (!data) return;
      setIsSyncing(true);
      try {
        const parsed = JSON.parse(data);
        
        // Update units if they have changed
        if (parsed.units) {
          setUnits(parsed.units);
        }
        
        // Update incidents if they have changed
        if (parsed.incidents) {
          const activeIncs = (parsed.incidents as Incident[]).filter(i => i.status === 'ACTIVE');
          
          // Audio alert check: if a new incident ID exists that we haven't seen yet, play sound
          let newAlert = false;
          activeIncs.forEach(inc => {
            if (!knownIncidentIds.current.has(inc.id)) {
              knownIncidentIds.current.add(inc.id);
              newAlert = true;
            }
          });

          if (newAlert) {
            playDispatchTone();
          }

          setIncidents(parsed.incidents);
          
          // If the currently active incident was deleted/closed by someone else, deselect it
          if (activeIncidentId && !parsed.incidents.find((i: Incident) => i.id === activeIncidentId)) {
            setActiveIncidentId(null);
          }
        }
        
        setLastSync(Date.now());
      } catch (e) {
        console.error("Sync error:", e);
      } finally {
        setTimeout(() => setIsSyncing(false), 300);
      }
    });

    return () => { room.get('state').off(); };
  }, [roomId, activeIncidentId]);

  const handleLoginDispatch = () => {
    if (dispatchPass === '10-4') setSession({ role: 'DISPATCH' });
    else alert("Invalid Code. Try 10-4.");
  };

  const performJoin = (data: {roblox: string, callsign: string, type: UnitType}) => {
    const callsign = data.callsign.toUpperCase();
    setSession({ role: 'UNIT', username: data.roblox, callsign, unitType: data.type });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    const newUnit: Unit = {
      id: Math.random().toString(36).substr(2, 5),
      name: callsign,
      type: data.type,
      status: UnitStatus.AVAILABLE,
      robloxUser: data.roblox,
      lastUpdated: new Date().toISOString(),
    };
    
    const updatedUnits = [...units.filter(u => u.name !== callsign), newUnit];
    setUnits(updatedUnits);
    broadcastState(updatedUnits, incidents);
  };

  const handleJoinUnit = () => {
    if (!onboardingData.roblox || !onboardingData.callsign) return;
    performJoin(onboardingData);
  };

  const handleQuickJoin = () => {
    if (savedProfile) performJoin(savedProfile);
  };

  const updateUnitStatus = (unitId: string, status: UnitStatus) => {
    const nextUnits = units.map(u => u.id === unitId ? { ...u, status, lastUpdated: new Date().toISOString() } : u);
    setUnits(nextUnits);
    broadcastState(nextUnits, incidents);
  };

  const createIncident = async () => {
    if (!newLocation || session?.role !== 'DISPATCH') return;
    const id = `INC-${Math.floor(Math.random() * 9000) + 1000}`;
    const newIncident: Incident = {
      id,
      callType: newCallType,
      location: newLocation,
      priority: newPriority,
      status: 'ACTIVE',
      assignedUnits: [],
      logs: [{ id: '1', timestamp: new Date().toLocaleTimeString(), sender: 'DISPATCH', message: `Incident Broadcasted: ${newCallType}` }],
      startTime: new Date().toISOString(),
    };
    
    const nextIncidents = [newIncident, ...incidents];
    setIncidents(nextIncidents);
    setActiveIncidentId(id);
    setIsCreatingCall(false);
    
    // Broadcast the new call to everyone else (triggers tone)
    broadcastState(units, nextIncidents);
  };

  const handleAddLog = async () => {
    if (!logInput || !activeIncidentId) return;
    let finalMessage = logInput;
    if (isAIAssisting) {
      setIsAIAssisting(false);
      finalMessage = await assistDispatcher(logInput);
    }
    const newLog: IncidentLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      sender: session?.role === 'DISPATCH' ? 'DISPATCH' : (session?.callsign || 'UNIT'),
      message: finalMessage
    };
    const nextIncidents = incidents.map(inc => inc.id === activeIncidentId ? { ...inc, logs: [...inc.logs, newLog] } : inc);
    setIncidents(nextIncidents);
    setLogInput('');
    broadcastState(units, nextIncidents);
  };

  const handleCloseIncident = () => {
    if (!activeIncidentId || session?.role !== 'DISPATCH') return;
    // Purge the incident entirely from the logs/state
    const nextIncidents = incidents.filter(i => i.id !== activeIncidentId);
    setIncidents(nextIncidents);
    setActiveIncidentId(null);
    broadcastState(units, nextIncidents);
  };

  if (!session) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-slate-100 overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="grid grid-cols-12 h-full w-full">{Array.from({ length: 144 }).map((_, i) => <div key={i} className="border border-slate-800/20" />)}</div>
        </div>
        <div className="z-10 w-full max-w-5xl flex flex-col items-center animate-in fade-in duration-700">
          <div className="bg-blue-600 p-5 rounded-3xl shadow-2xl mb-8 border border-blue-400/30 shadow-blue-500/20"><Icons.Police /></div>
          <h1 className="text-6xl font-black tracking-widest mb-4 uppercase">NEXUS<span className="text-blue-500">CAD</span></h1>
          <div className="flex gap-3 mb-12 text-[10px] font-mono uppercase text-slate-600">Secure Uplink: <span className="text-blue-400 font-bold">{roomId}</span></div>
          
          <div className="grid lg:grid-cols-3 gap-8 w-full">
            <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2rem] backdrop-blur-xl flex flex-col hover:border-blue-500/50 transition-all">
              <h2 className="text-xl font-black mb-6 uppercase flex items-center gap-3"><Icons.Send /> Dispatch</h2>
              <input type="password" placeholder="Passcode (10-4)" value={dispatchPass} onChange={(e) => setDispatchPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLoginDispatch()} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 mb-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              <button onClick={handleLoginDispatch} className="w-full bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-blue-900/40 mt-auto">Enter Terminal</button>
            </div>

            <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2rem] backdrop-blur-xl flex flex-col hover:border-emerald-500/50 transition-all">
              <h2 className="text-xl font-black mb-6 uppercase flex items-center gap-3"><Icons.Police /> Officer</h2>
              <div className="space-y-4 mb-6">
                <input type="text" placeholder="Roblox ID" value={onboardingData.roblox} onChange={(e) => setOnboardingData(p => ({...p, roblox: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                <input type="text" placeholder="Callsign" value={onboardingData.callsign} onChange={(e) => setOnboardingData(p => ({...p, callsign: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 uppercase font-mono outline-none focus:ring-2 focus:ring-emerald-500 text-sm" />
                <div className="grid grid-cols-3 gap-2">
                    {[UnitType.POLICE, UnitType.FIRE, UnitType.EMS].map(t => (
                        <button key={t} onClick={() => setOnboardingData(p => ({...p, type: t}))} className={`py-3 rounded-xl border text-[9px] font-black tracking-tighter transition-all ${onboardingData.type === t ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-600 hover:text-slate-400'}`}>{t}</button>
                    ))}
                </div>
              </div>
              <button onClick={handleJoinUnit} className="w-full bg-emerald-600 hover:bg-emerald-500 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/40">Join Network</button>
            </div>

            <div className={`bg-slate-900/40 border-2 ${savedProfile ? 'border-blue-500/50 shadow-2xl shadow-blue-500/10' : 'border-slate-800/20'} p-8 rounded-[2rem] backdrop-blur-xl flex flex-col transition-all relative overflow-hidden group`}>
               {!savedProfile && <div className="absolute inset-0 bg-slate-950/40 backdrop-grayscale flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-800 italic">No Historical Data</div>}
               <h2 className="text-xl font-black mb-6 uppercase flex items-center gap-3 text-blue-400">Quick Login</h2>
               {savedProfile && (
                 <div className="flex flex-col h-full animate-in zoom-in-95">
                    <div className="bg-slate-950/60 p-5 rounded-2xl border border-slate-800 mb-6 group-hover:bg-slate-950 transition-colors">
                        <div className="text-[10px] font-black text-slate-700 uppercase mb-1">Previous Deployment</div>
                        <div className="text-3xl font-black tracking-tight text-white">{savedProfile.callsign}</div>
                        <div className="text-xs font-mono text-slate-500 mt-2 uppercase">{savedProfile.type} // {savedProfile.roblox}</div>
                    </div>
                    <button onClick={handleQuickJoin} className="w-full bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-xl shadow-blue-900/40 mt-auto flex items-center justify-center gap-3 active:scale-95">
                        <Icons.Refresh /> Establish Uplink
                    </button>
                    <button onClick={() => {localStorage.removeItem(STORAGE_KEY); setSavedProfile(null);}} className="text-[9px] text-slate-700 mt-4 font-black uppercase hover:text-red-500 transition-colors">Wipe Profile</button>
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#020617] text-slate-100">
      <header className={`h-16 ${session.role === 'DISPATCH' ? 'bg-slate-900/50 border-blue-500/20' : 'bg-slate-900/50 border-emerald-500/20'} border-b flex items-center justify-between px-8 shrink-0 backdrop-blur-xl z-20`}>
        <div className="flex items-center gap-6">
          <div className={`${session.role === 'DISPATCH' ? 'bg-blue-600 shadow-blue-500/40' : 'bg-emerald-600 shadow-emerald-500/40'} p-2 rounded-xl border border-white/20 shadow-lg`}><Icons.Police /></div>
          <h1 className="text-xl font-black uppercase tracking-tighter leading-none">Nexus<span className={session.role === 'DISPATCH' ? 'text-blue-500' : 'text-emerald-500'}>{session.role}</span></h1>
          <div className="h-8 w-px bg-slate-800 mx-2 hidden sm:block" />
          <div className="hidden sm:flex flex-col leading-none">
            <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Current Operator</span>
            <span className="text-[11px] font-mono text-slate-300 font-bold">{session.role === 'UNIT' ? session.callsign : 'DISPATCH_COMM'}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {session.role === 'DISPATCH' && <button onClick={() => setIsCreatingCall(true)} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl transition-all active:scale-95 border border-white/10">New Call</button>}
          <button onClick={() => setSession(null)} className="text-[10px] font-black uppercase text-slate-600 hover:text-red-500 transition-colors tracking-widest">Logout</button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-800/60 bg-slate-950/40 flex flex-col shrink-0">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between"><h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Personnel Status</h2></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {units.map(unit => (
              <div key={unit.id} className={`p-5 rounded-3xl border transition-all ${unit.name === session.callsign ? 'bg-emerald-500/5 border-emerald-500/40 shadow-xl' : 'bg-slate-900/40 border-slate-800/50'}`}>
                <div className="flex justify-between mb-3 items-center">
                  <span className="font-mono font-black text-sm tracking-tight">{unit.name}</span>
                  <div className={`text-[9px] px-2 py-0.5 rounded-lg border font-black ${STATUS_COLORS[unit.status]}`}>{unit.status.replace(/_/g, ' ')}</div>
                </div>
                {(session.role === 'DISPATCH' || unit.name === session.callsign) && (
                  <div className="grid grid-cols-5 gap-1">
                    {Object.values(UnitStatus).map(s => <button key={s} onClick={() => updateUnitStatus(unit.id, s)} className={`text-[10px] py-2 rounded-lg border font-black transition-colors ${unit.status === s ? 'bg-slate-800 border-slate-600 text-white shadow-inner' : 'bg-slate-950/40 border-slate-800 text-slate-700 hover:text-slate-500'}`}>{s.charAt(0)}</button>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="flex-1 flex flex-col bg-[#020617]">
          <div className="h-44 shrink-0 border-b border-slate-800/60 flex p-6 gap-6 overflow-x-auto items-center custom-scrollbar">
            {incidents.filter(i => i.status === 'ACTIVE').map(incident => (
              <div key={incident.id} onClick={() => setActiveIncidentId(incident.id)} className={`w-80 shrink-0 p-6 rounded-[2rem] border cursor-pointer transition-all relative ${activeIncidentId === incident.id ? 'bg-blue-900/5 border-blue-500 shadow-2xl scale-[1.02]' : 'bg-slate-900/30 border-slate-800/50 hover:bg-slate-900/40'}`}>
                <div className="flex justify-between items-start mb-4"><span className="text-[10px] font-mono font-bold text-slate-600">{incident.id}</span><span className={`text-[10px] uppercase font-black tracking-widest ${PRIORITY_COLORS[incident.priority]}`}>{incident.priority}</span></div>
                <div className="font-black text-sm truncate uppercase tracking-wide">{incident.callType}</div>
                <div className="text-[11px] text-slate-500 truncate mb-5">LOC: {incident.location}</div>
              </div>
            ))}
            {incidents.filter(i => i.status === 'ACTIVE').length === 0 && <div className="w-full text-center text-slate-800 font-black text-[11px] uppercase tracking-[0.4em] opacity-50">Operational Silence</div>}
          </div>

          {activeIncident ? (
            <div className="flex-1 flex flex-col p-8 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
               <div className="flex justify-between items-start mb-10">
                  <div><h2 className="text-5xl font-black text-white uppercase tracking-tighter mb-4 drop-shadow-2xl">{activeIncident.callType}</h2><div className="text-[11px] text-slate-500 uppercase tracking-[0.3em] font-black">Dispatch Location: {activeIncident.location}</div></div>
                  {session.role === 'DISPATCH' && <button onClick={handleCloseIncident} className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-10 py-4 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest transition-all border border-red-500/20 active:scale-95 shadow-xl">Purge Call</button>}
               </div>
               <div className="flex-1 flex flex-col bg-slate-950/40 rounded-[3rem] border border-slate-800/40 overflow-hidden shadow-3xl">
                  <div className="flex-1 overflow-y-auto p-10 space-y-6 font-mono text-sm custom-scrollbar">
                    {activeIncident.logs.map(log => (
                      <div key={log.id} className="flex gap-8 group"><span className="text-slate-800 font-black text-[10px] mt-1 shrink-0">[{log.timestamp}]</span><div className="flex-1"><span className={`font-black mr-4 uppercase tracking-widest ${log.sender === 'DISPATCH' ? 'text-blue-500' : 'text-emerald-500'}`}>{log.sender}:</span><span className="text-slate-400 group-hover:text-slate-200 transition-colors">{log.message}</span></div></div>
                    ))}
                  </div>
                  <div className="p-10 bg-slate-950/60 border-t border-slate-800/40">
                    <div className="flex gap-5">
                      <input type="text" value={logInput} onChange={(e) => setLogInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddLog()} placeholder="Situation update..." className="flex-1 bg-slate-950 border border-slate-800 rounded-[1.5rem] px-8 py-6 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder:text-slate-800 shadow-inner" />
                      <button onClick={() => setIsAIAssisting(!isAIAssisting)} className={`p-6 rounded-[1.5rem] border transition-all ${isAIAssisting ? 'bg-blue-600 text-white border-blue-400 shadow-xl' : 'bg-slate-900 border-slate-800 text-slate-600 hover:text-white'}`}><Icons.Sparkles /></button>
                      <button onClick={handleAddLog} className="bg-blue-600 hover:bg-blue-500 p-6 rounded-[1.5rem] shadow-2xl transition-all active:scale-95"><Icons.Send /></button>
                    </div>
                  </div>
               </div>
            </div>
          ) : <div className="flex-1 flex flex-col items-center justify-center opacity-10">
                <div className="w-32 h-32 mb-8 bg-slate-900 rounded-[3rem] flex items-center justify-center border border-slate-800"><Icons.Police /></div>
                <div className="text-4xl font-black uppercase tracking-[0.5em]">System Idle</div>
              </div>}
        </section>
      </main>

      {isCreatingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/95 backdrop-blur-xl p-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-12 w-full max-w-2xl space-y-10 animate-in zoom-in-95 shadow-3xl">
             <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4"><label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Type</label><select value={newCallType} onChange={(e) => setNewCallType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-black text-white outline-none appearance-none cursor-pointer">{CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="space-y-4"><label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Priority</label><div className="grid grid-cols-2 gap-2">{Object.values(Priority).map(p => <button key={p} onClick={() => setNewPriority(p)} className={`py-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-tighter ${newPriority === p ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-950 text-slate-700'}`}>{p}</button>)}</div></div>
             </div>
             <div className="space-y-4"><label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Location</label><input type="text" placeholder="Coordinates..." value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 font-black outline-none focus:ring-2 focus:ring-blue-500 shadow-inner" /></div>
             <div className="flex gap-6"><button onClick={() => setIsCreatingCall(false)} className="flex-1 font-black text-[11px] text-slate-500 uppercase tracking-widest hover:text-white transition-colors">Discard</button><button onClick={createIncident} className="flex-[3] bg-blue-600 hover:bg-blue-500 text-white py-6 rounded-2xl font-black uppercase tracking-[0.4em] shadow-2xl shadow-blue-900/40 active:scale-95 transition-all">Broadcast Call</button></div>
          </div>
        </div>
      )}

      <footer className="h-12 bg-slate-950 border-t border-slate-900 flex items-center px-8 justify-between shrink-0 text-[10px] font-mono tracking-widest text-slate-700 uppercase font-black z-20">
        <div className="flex gap-10 items-center">
          <div className="flex items-center gap-3">
             <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-blue-500 animate-ping' : 'bg-emerald-500 shadow-[0_0_10px_#10b981]'} transition-colors`}></div>
             NETWORK: {isSyncing ? 'SYNCING...' : 'ONLINE'}
          </div>
          <div className="flex items-center gap-3 text-slate-800">CHANNEL: {roomId.toUpperCase()}</div>
          <div className="hidden sm:block text-slate-800">LAST_UPDATE: {new Date(lastSync).toLocaleTimeString()}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-slate-800 font-black">NEXUS v5.2.1 // SEAMLESS_REALTIME</div>
        </div>
      </footer>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<App />);
}
