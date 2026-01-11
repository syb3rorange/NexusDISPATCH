
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import Gun from 'gun';
import { GoogleGenAI } from "@google/genai";

// --- TYPES ---
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

// --- CONSTANTS ---
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
  Search: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
  ),
  Sparkles: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
  ),
  Edit: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
  ),
  Trash: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
  )
};

// --- GEMINI SERVICE ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const assistDispatcher = async (notes: string) => {
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

  const [units, setUnits] = useState<Unit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  
  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [isManagingUnit, setIsManagingUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [logInput, setLogInput] = useState('');
  const [isAIAssisting, setIsAIAssisting] = useState(false);

  const [unitNameInput, setUnitNameInput] = useState('');
  const [unitTypeInput, setUnitTypeInput] = useState<UnitType>(UnitType.POLICE);
  const [newCallType, setNewCallType] = useState(CALL_TYPES[0]);
  const [newLocation, setNewLocation] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM);

  const activeIncident = useMemo(() => incidents.find(i => i.id === activeIncidentId), [incidents, activeIncidentId]);

  useEffect(() => {
    const room = gun.get('nexus_cad_rooms').get(roomId);
    room.get('state').on((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (parsed.units) setUnits(parsed.units);
          if (parsed.incidents) setIncidents(parsed.incidents);
        } catch (e) {}
      }
    });
    // Fix: Explicitly wrap the cleanup function to ensure it doesn't return the Gun chain object
    return () => {
      room.get('state').off();
    };
  }, [roomId]);

  const syncState = useCallback((newUnits: Unit[], newIncidents: Incident[]) => {
    if (session?.role === 'DISPATCH') {
      gun.get('nexus_cad_rooms').get(roomId).get('state').put(JSON.stringify({ units: newUnits, incidents: newIncidents }));
    }
  }, [session, roomId]);

  const handleLoginDispatch = () => {
    if (dispatchPass === '10-4') setSession({ role: 'DISPATCH' });
    else alert("Incorrect Code (Hint: 10-4)");
  };

  const handleJoinUnit = () => {
    if (!onboardingData.roblox || !onboardingData.callsign) return;
    const callsign = onboardingData.callsign.toUpperCase();
    setSession({ role: 'UNIT', username: onboardingData.roblox, callsign, unitType: onboardingData.type });
    const newUnit: Unit = {
      id: Math.random().toString(36).substr(2, 5),
      name: callsign,
      type: onboardingData.type,
      status: UnitStatus.AVAILABLE,
      robloxUser: onboardingData.roblox,
      lastUpdated: new Date().toISOString(),
    };
    const updatedUnits = [...units.filter(u => u.name !== callsign), newUnit];
    setUnits(updatedUnits);
    gun.get('nexus_cad_rooms').get(roomId).get('state').put(JSON.stringify({ units: updatedUnits, incidents }));
  };

  const updateUnitStatus = (unitId: string, status: UnitStatus) => {
    const nextUnits = units.map(u => u.id === unitId ? { ...u, status, lastUpdated: new Date().toISOString() } : u);
    setUnits(nextUnits);
    gun.get('nexus_cad_rooms').get(roomId).get('state').put(JSON.stringify({ units: nextUnits, incidents }));
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
      logs: [{ id: '1', timestamp: new Date().toLocaleTimeString(), sender: 'DISPATCH', message: `Incident Created: ${newCallType}` }],
      startTime: new Date().toISOString(),
    };
    const nextIncidents = [newIncident, ...incidents];
    setIncidents(nextIncidents);
    setActiveIncidentId(id);
    setIsCreatingCall(false);
    syncState(units, nextIncidents);
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
    syncState(units, nextIncidents);
  };

  if (!session) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-slate-100 overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="grid grid-cols-12 h-full w-full">{Array.from({ length: 144 }).map((_, i) => <div key={i} className="border border-slate-800/20" />)}</div>
        </div>
        <div className="z-10 w-full max-w-4xl flex flex-col items-center">
          <div className="bg-blue-600 p-5 rounded-3xl shadow-2xl mb-8 border border-blue-400/30"><Icons.Police /></div>
          <h1 className="text-6xl font-black tracking-widest mb-4">NEXUS<span className="text-blue-500">CAD</span></h1>
          <div className="flex gap-3 mb-16 text-[10px] font-mono uppercase text-slate-600">Terminal Node: <span className="text-blue-400">{roomId}</span></div>
          <div className="grid md:grid-cols-2 gap-10 w-full">
            <div className="bg-slate-900/40 border border-slate-800 p-10 rounded-[2.5rem] backdrop-blur-xl">
              <h2 className="text-2xl font-black mb-8 uppercase flex items-center gap-3"><Icons.Send /> Dispatch</h2>
              <input type="password" placeholder="Passcode (10-4)" value={dispatchPass} onChange={(e) => setDispatchPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleLoginDispatch()} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 mb-4 font-bold outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={handleLoginDispatch} className="w-full bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-blue-900/40">Enter Terminal</button>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 p-10 rounded-[2.5rem] backdrop-blur-xl">
              <h2 className="text-2xl font-black mb-8 uppercase flex items-center gap-3"><Icons.Police /> Unit</h2>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <input type="text" placeholder="Roblox ID" value={onboardingData.roblox} onChange={(e) => setOnboardingData(p => ({...p, roblox: e.target.value}))} className="bg-slate-950 border border-slate-800 rounded-2xl p-5 font-bold outline-none" />
                <input type="text" placeholder="Callsign" value={onboardingData.callsign} onChange={(e) => setOnboardingData(p => ({...p, callsign: e.target.value}))} className="bg-slate-950 border border-slate-800 rounded-2xl p-5 uppercase font-mono outline-none" />
              </div>
              <button onClick={handleJoinUnit} className="w-full bg-emerald-600 hover:bg-emerald-500 p-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-emerald-900/40">Join Network</button>
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
          <div className={`${session.role === 'DISPATCH' ? 'bg-blue-600' : 'bg-emerald-600'} p-2 rounded-xl border border-white/20 shadow-lg`}><Icons.Police /></div>
          <h1 className="text-xl font-black uppercase tracking-tighter">Nexus<span className={session.role === 'DISPATCH' ? 'text-blue-500' : 'text-emerald-500'}>{session.role}</span></h1>
        </div>
        <div className="flex items-center gap-6">
          {session.role === 'DISPATCH' && <button onClick={() => setIsCreatingCall(true)} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl">New Incident</button>}
          <button onClick={() => setSession(null)} className="text-[10px] font-black uppercase text-slate-600 hover:text-red-500 transition-colors">Logout</button>
        </div>
      </header>
      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-800/60 bg-slate-950/40 flex flex-col shrink-0">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between"><h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Personnel Status</h2></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {units.map(unit => (
              <div key={unit.id} className={`p-5 rounded-3xl border transition-all ${unit.name === session.callsign ? 'bg-emerald-500/5 border-emerald-500/40' : 'bg-slate-900/40 border-slate-800/50'}`}>
                <div className="flex justify-between mb-3">
                  <span className="font-mono font-black text-sm">{unit.name}</span>
                  <div className={`text-[9px] px-2.5 py-1 rounded-lg border font-black ${STATUS_COLORS[unit.status]}`}>{unit.status}</div>
                </div>
                {(session.role === 'DISPATCH' || unit.name === session.callsign) && (
                  <div className="grid grid-cols-5 gap-1.5">
                    {Object.values(UnitStatus).map(s => <button key={s} onClick={() => updateUnitStatus(unit.id, s)} className={`text-[10px] py-2 rounded-lg border font-black ${unit.status === s ? 'bg-slate-800 text-white' : 'bg-slate-950/40 text-slate-700'}`}>{s.charAt(0)}</button>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </aside>
        <section className="flex-1 flex flex-col bg-[#020617]">
          <div className="h-44 shrink-0 border-b border-slate-800/60 flex p-6 gap-6 overflow-x-auto items-center">
            {incidents.filter(i => i.status === 'ACTIVE').map(incident => (
              <div key={incident.id} onClick={() => setActiveIncidentId(incident.id)} className={`w-80 shrink-0 p-6 rounded-[2rem] border cursor-pointer transition-all ${activeIncidentId === incident.id ? 'bg-blue-900/5 border-blue-500 shadow-2xl' : 'bg-slate-900/30 border-slate-800/50'}`}>
                <div className="flex justify-between items-start mb-4"><span className="text-[10px] font-mono text-slate-600">{incident.id}</span><span className={`text-[10px] uppercase font-black ${PRIORITY_COLORS[incident.priority]}`}>{incident.priority}</span></div>
                <div className="font-black text-sm truncate uppercase">{incident.callType}</div>
                <div className="text-[11px] text-slate-500 truncate mb-5">LOC: {incident.location}</div>
              </div>
            ))}
          </div>
          {activeIncident ? (
            <div className="flex-1 flex flex-col p-8 overflow-hidden">
               <div className="flex justify-between items-start mb-10">
                  <div><h2 className="text-5xl font-black text-white uppercase tracking-tighter mb-4">{activeIncident.callType}</h2><div className="text-[11px] text-slate-500 uppercase tracking-widest font-black">Location: {activeIncident.location}</div></div>
                  {session.role === 'DISPATCH' && <button onClick={() => { setIncidents(incidents.map(i => i.id === activeIncident.id ? {...i, status: 'CLOSED'} : i)); setActiveIncidentId(null); syncState(units, incidents); }} className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-10 py-4 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest transition-all">Close Call</button>}
               </div>
               <div className="flex-1 flex flex-col bg-slate-950/40 rounded-[3rem] border border-slate-800/40 overflow-hidden shadow-3xl">
                  <div className="flex-1 overflow-y-auto p-10 space-y-6 font-mono text-sm custom-scrollbar">
                    {activeIncident.logs.map(log => (
                      <div key={log.id} className="flex gap-8"><span className="text-slate-800 font-black text-[10px] mt-1 shrink-0">[{log.timestamp}]</span><div className="flex-1"><span className={`font-black mr-4 uppercase ${log.sender === 'DISPATCH' ? 'text-blue-500' : 'text-emerald-500'}`}>{log.sender}:</span><span className="text-slate-400">{log.message}</span></div></div>
                    ))}
                  </div>
                  <div className="p-10 bg-slate-950/60 border-t border-slate-800/40">
                    <div className="flex gap-5">
                      <input type="text" value={logInput} onChange={(e) => setLogInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddLog()} placeholder="Enter log entry..." className="flex-1 bg-slate-950 border border-slate-800 rounded-[1.5rem] px-8 py-6 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 text-white" />
                      <button onClick={() => setIsAIAssisting(!isAIAssisting)} className={`p-6 rounded-[1.5rem] border transition-all ${isAIAssisting ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-900 border-slate-800 text-slate-600'}`}><Icons.Sparkles /></button>
                      <button onClick={handleAddLog} className="bg-blue-600 hover:bg-blue-500 p-6 rounded-[1.5rem] shadow-2xl transition-all active:scale-95"><Icons.Send /></button>
                    </div>
                  </div>
               </div>
            </div>
          ) : <div className="flex-1 flex items-center justify-center opacity-10 text-4xl font-black uppercase tracking-[0.5em]">System Ready</div>}
        </section>
      </main>
      {isCreatingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/95 backdrop-blur-xl p-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-12 w-full max-w-2xl space-y-10 animate-in zoom-in-95">
             <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4"><label className="text-[10px] font-black text-slate-600 uppercase">Type</label><select value={newCallType} onChange={(e) => setNewCallType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-black text-white outline-none appearance-none">{CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="space-y-4"><label className="text-[10px] font-black text-slate-600 uppercase">Priority</label><div className="grid grid-cols-2 gap-2">{Object.values(Priority).map(p => <button key={p} onClick={() => setNewPriority(p)} className={`py-4 rounded-xl border text-[10px] font-black uppercase ${newPriority === p ? 'bg-blue-600 text-white' : 'bg-slate-950 text-slate-700'}`}>{p}</button>)}</div></div>
             </div>
             <div className="space-y-4"><label className="text-[10px] font-black text-slate-600 uppercase">Location</label><input type="text" placeholder="123 MAIN ST" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 font-black outline-none" /></div>
             <div className="flex gap-6"><button onClick={() => setIsCreatingCall(false)} className="flex-1 font-black text-[11px] text-slate-500 uppercase">Discard</button><button onClick={createIncident} className="flex-[3] bg-blue-600 hover:bg-blue-500 text-white py-6 rounded-2xl font-black uppercase tracking-widest shadow-2xl">Broadcast Incident</button></div>
          </div>
        </div>
      )}
      <footer className="h-10 bg-slate-950 border-t border-slate-900 flex items-center px-8 justify-between shrink-0 text-[10px] font-mono tracking-widest text-slate-700 uppercase font-black z-20">
        <div>SYNC: ONLINE | NODE: {roomId.toUpperCase()}</div>
        <div>NEXUS v5.1.0</div>
      </footer>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>);
}
