
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Gun from 'gun';
import { Unit, Incident, UnitStatus, UnitType, Priority, IncidentLog, Role, UserSession } from './types';
import { CALL_TYPES, STATUS_COLORS, PRIORITY_COLORS, Icons } from './constants';
import { assistDispatcher, suggestUnits } from './geminiService';

// Initialize Gun with public relays for real-time synchronization
const gun = Gun(['https://gun-manhattan.herokuapp.com/gun', 'https://relay.peer.ooo/gun']);

const App: React.FC = () => {
  // Session & Room Logic
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

  // Global CAD State (Synced via Gun)
  const [units, setUnits] = useState<Unit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  
  // UI States
  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [isManagingUnit, setIsManagingUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [logInput, setLogInput] = useState('');
  const [isAIAssisting, setIsAIAssisting] = useState(false);

  // Form States
  const [unitNameInput, setUnitNameInput] = useState('');
  const [unitTypeInput, setUnitTypeInput] = useState<UnitType>(UnitType.POLICE);
  const [newCallType, setNewCallType] = useState(CALL_TYPES[0]);
  const [newLocation, setNewLocation] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM);

  // Derived state
  const activeIncident = useMemo(() => incidents.find(i => i.id === activeIncidentId), [incidents, activeIncidentId]);

  // GUN Synchronization Layer
  useEffect(() => {
    const room = gun.get('nexus_cad_rooms').get(roomId);

    // Listen for state changes
    room.get('state').on((data) => {
      if (data) {
        try {
          const parsed = JSON.parse(data);
          if (parsed.units) setUnits(parsed.units);
          if (parsed.incidents) setIncidents(parsed.incidents);
        } catch (e) {
          console.error("Failed to sync state:", e);
        }
      }
    });

    return () => {
      room.get('state').off();
    };
  }, [roomId]);

  // Persistent broadcasting from Dispatcher
  const syncState = useCallback((newUnits: Unit[], newIncidents: Incident[]) => {
    if (session?.role === 'DISPATCH') {
      const room = gun.get('nexus_cad_rooms').get(roomId);
      room.get('state').put(JSON.stringify({ units: newUnits, incidents: newIncidents }));
    }
  }, [session, roomId]);

  // Handle URL changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash && hash !== roomId) {
        setRoomId(hash);
        setSession(null); 
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [roomId]);

  // Handlers
  const handleLoginDispatch = () => {
    if (dispatchPass === '10-4') {
      setSession({ role: 'DISPATCH' });
    } else {
      alert("Unauthorized. Correct Dispatch code required (Hint: 10-4)");
    }
  };

  const handleJoinUnit = () => {
    if (!onboardingData.roblox || !onboardingData.callsign) return;
    const callsign = onboardingData.callsign.toUpperCase();
    
    setSession({
      role: 'UNIT',
      username: onboardingData.roblox,
      callsign: callsign,
      unitType: onboardingData.type
    });

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
    const room = gun.get('nexus_cad_rooms').get(roomId);
    room.get('state').put(JSON.stringify({ units: updatedUnits, incidents }));
  };

  const updateUnitStatus = (unitId: string, status: UnitStatus) => {
    const nextUnits = units.map(u => u.id === unitId ? { ...u, status, lastUpdated: new Date().toISOString() } : u);
    setUnits(nextUnits);
    const room = gun.get('nexus_cad_rooms').get(roomId);
    room.get('state').put(JSON.stringify({ units: nextUnits, incidents }));
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
      logs: [{
        id: '1',
        timestamp: new Date().toLocaleTimeString(),
        sender: 'DISPATCH',
        message: `Call created: ${newCallType} @ ${newLocation}`
      }],
      startTime: new Date().toISOString(),
    };
    const nextIncidents = [newIncident, ...incidents];
    setIncidents(nextIncidents);
    setActiveIncidentId(id);
    setIsCreatingCall(false);
    syncState(units, nextIncidents);
  };

  const assignUnitToIncident = (unitId: string, incidentId: string) => {
    if (session?.role !== 'DISPATCH') return;
    const nextIncidents = incidents.map(inc => {
      if (inc.id === incidentId) {
        if (inc.assignedUnits.includes(unitId)) return inc;
        return {
          ...inc,
          assignedUnits: [...inc.assignedUnits, unitId],
          logs: [...inc.logs, {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString(),
            sender: 'DISPATCH',
            message: `Unit ${units.find(u => u.id === unitId)?.name} attached.`
          }]
        };
      }
      return inc;
    });
    const nextUnits = units.map(u => u.id === unitId ? { ...u, status: UnitStatus.EN_ROUTE, lastUpdated: new Date().toISOString() } : u);
    
    setIncidents(nextIncidents);
    setUnits(nextUnits);
    syncState(nextUnits, nextIncidents);
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

  const closeIncident = (incidentId: string) => {
    if (session?.role !== 'DISPATCH') return;
    const closedIncident = incidents.find(i => i.id === incidentId);
    if (!closedIncident) return;

    const nextUnits = units.map(u => closedIncident.assignedUnits.includes(u.id) ? { ...u, status: UnitStatus.AVAILABLE } : u);
    const nextIncidents = incidents.map(inc => inc.id === incidentId ? { ...inc, status: 'CLOSED' as const } : inc);
    
    setUnits(nextUnits);
    setIncidents(nextIncidents);
    if (activeIncidentId === incidentId) setActiveIncidentId(null);
    syncState(nextUnits, nextIncidents);
  };

  const handleSaveUnit = () => {
    if (!unitNameInput) return;
    const callsign = unitNameInput.toUpperCase();
    
    let updatedUnits: Unit[];
    if (editingUnit) {
      updatedUnits = units.map(u => u.id === editingUnit.id ? { 
        ...u, 
        name: callsign, 
        type: unitTypeInput, 
        lastUpdated: new Date().toISOString() 
      } : u);
    } else {
      const newUnit: Unit = {
        id: Math.random().toString(36).substr(2, 5),
        name: callsign,
        type: unitTypeInput,
        status: UnitStatus.AVAILABLE,
        lastUpdated: new Date().toISOString(),
      };
      updatedUnits = [...units, newUnit];
    }

    setUnits(updatedUnits);
    setIsManagingUnit(false);
    setUnitNameInput('');
    setEditingUnit(null);
    syncState(updatedUnits, incidents);
  };

  // Login Screen
  if (!session) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-slate-100 overflow-hidden relative">
        <div className="scanline"></div>
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,_#1e293b_0%,_transparent_100%)] animate-pulse" />
          <div className="grid grid-cols-12 h-full w-full">
            {Array.from({ length: 144 }).map((_, i) => <div key={i} className="border border-slate-800/20" />)}
          </div>
        </div>
        
        <div className="z-10 w-full max-w-4xl flex flex-col items-center">
          <div className="bg-blue-600 p-5 rounded-[2rem] shadow-2xl shadow-blue-500/20 mb-8 border border-blue-400/30">
            <Icons.Police />
          </div>
          <h1 className="text-6xl font-black tracking-[0.2em] mb-4 drop-shadow-2xl">NEXUS<span className="text-blue-500">CAD</span></h1>
          <div className="flex items-center gap-3 mb-16">
            <p className="text-slate-600 font-mono text-[10px] uppercase tracking-[0.3em]">SECURE ACCESS POINT: </p>
            <span className="px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-xs font-mono text-blue-400 shadow-inner">{roomId}</span>
          </div>

          <div className="grid md:grid-cols-2 gap-10 w-full">
            {/* Dispatcher Portal */}
            <div className="bg-slate-900/40 border border-slate-800/60 p-10 rounded-[2.5rem] backdrop-blur-2xl flex flex-col shadow-2xl hover:border-blue-500/30 transition-all group">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-blue-600/10 rounded-2xl text-blue-400 border border-blue-500/20 group-hover:bg-blue-600/20 transition-all"><Icons.Send /></div>
                <h2 className="text-2xl font-black tracking-tight uppercase">Communications</h2>
              </div>
              <p className="text-sm text-slate-500 mb-8 flex-1 leading-relaxed">Central Command Terminal. Verify identity to initialize operational oversight.</p>
              <div className="space-y-4">
                <input 
                  type="password" 
                  placeholder="AUTHORIZATION_CODE" 
                  value={dispatchPass}
                  onChange={(e) => setDispatchPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLoginDispatch()}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-6 py-5 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-800 font-bold tracking-widest"
                />
                <button 
                  onClick={handleLoginDispatch}
                  className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] transition-all shadow-xl shadow-blue-900/40 active:scale-95"
                >
                  INITIALIZE TERMINAL
                </button>
              </div>
            </div>

            {/* Field Unit Portal */}
            <div className="bg-slate-900/40 border border-slate-800/60 p-10 rounded-[2.5rem] backdrop-blur-2xl flex flex-col shadow-2xl hover:border-emerald-500/30 transition-all group">
              <div className="flex items-center gap-4 mb-8">
                <div className="p-4 bg-emerald-600/10 rounded-2xl text-emerald-400 border border-emerald-500/20 group-hover:bg-emerald-600/20 transition-all"><Icons.Police /></div>
                <h2 className="text-2xl font-black tracking-tight uppercase">Field Ops</h2>
              </div>
              <div className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-4">
                  <input 
                    type="text" 
                    placeholder="ROBLOX_ID" 
                    value={onboardingData.roblox}
                    onChange={(e) => setOnboardingData(prev => ({...prev, roblox: e.target.value}))}
                    className="bg-slate-950/80 border border-slate-800 rounded-2xl px-5 py-5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold placeholder:text-slate-800"
                  />
                  <input 
                    type="text" 
                    placeholder="CALLSIGN" 
                    value={onboardingData.callsign}
                    onChange={(e) => setOnboardingData(prev => ({...prev, callsign: e.target.value}))}
                    className="bg-slate-950/80 border border-slate-800 rounded-2xl px-5 py-5 text-sm focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono font-bold placeholder:text-slate-800"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {[UnitType.POLICE, UnitType.FIRE, UnitType.EMS].map(t => (
                    <button 
                      key={t}
                      onClick={() => setOnboardingData(prev => ({...prev, type: t}))}
                      className={`py-4 rounded-2xl border text-[10px] font-black uppercase transition-all tracking-widest ${onboardingData.type === t ? 'bg-emerald-600 border-emerald-400 text-white shadow-lg' : 'bg-slate-950/80 border-slate-800 text-slate-600 hover:border-slate-700'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={handleJoinUnit}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.3em] transition-all shadow-xl shadow-emerald-900/40 active:scale-95 mt-4"
                >
                  ESTABLISH UPLINK
                </button>
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => window.location.hash = Math.random().toString(36).substr(2, 9)}
            className="mt-12 text-[10px] font-black text-slate-700 hover:text-slate-400 uppercase tracking-[0.4em] transition-colors bg-slate-900/20 px-6 py-2 rounded-full border border-slate-800/40"
          >
            ROTATE PRIVATE FREQUENCY
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#020617] text-slate-100 selection:bg-blue-500/30">
      <header className={`h-16 ${session.role === 'DISPATCH' ? 'bg-slate-900/50 border-blue-500/20' : 'bg-slate-900/50 border-emerald-500/20'} border-b flex items-center justify-between px-8 shrink-0 backdrop-blur-xl z-20`}>
        <div className="flex items-center gap-6">
          <div className={`${session.role === 'DISPATCH' ? 'bg-blue-600 shadow-blue-500/40' : 'bg-emerald-600 shadow-emerald-500/40'} p-2 rounded-xl border border-white/20 shadow-lg`}>
            <Icons.Police />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-black tracking-tighter uppercase leading-none">Nexus<span className={session.role === 'DISPATCH' ? 'text-blue-500' : 'text-emerald-500'}>{session.role}</span></h1>
            <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mt-1">FREQ: {roomId}</span>
          </div>
          <div className="h-8 w-px bg-slate-800 mx-2" />
          <div className="flex flex-col leading-none">
            <span className="text-[10px] text-slate-600 font-black uppercase tracking-widest mb-1">Active Trace</span>
            <span className="text-xs font-mono font-bold text-slate-300">
              {session.role === 'DISPATCH' ? 'COMMS_LEAD' : `${session.callsign} [${session.username}]`}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-6">
          {session.role === 'DISPATCH' && (
            <button onClick={() => setIsCreatingCall(true)} className="flex items-center gap-3 bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl shadow-blue-900/40 transition-all active:scale-95">
              <Icons.Plus /> NEW_INCIDENT
            </button>
          )}
          <div className="h-8 w-px bg-slate-800 mx-2" />
          <button onClick={() => setSession(null)} className="text-[10px] font-black uppercase text-slate-600 hover:text-red-500 transition-colors tracking-[0.2em]">TERMINATE_SESSION</button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Side: Units Area */}
        <aside className="w-80 border-r border-slate-800/60 bg-slate-950/40 flex flex-col shrink-0 backdrop-blur-sm">
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Field Assets</h2>
            {session.role === 'DISPATCH' && (
              <button onClick={() => { setEditingUnit(null); setIsManagingUnit(true); }} className="p-2 bg-slate-900 border border-slate-800 hover:border-blue-500/50 rounded-xl text-slate-400 hover:text-blue-400 transition-all"><Icons.Plus /></button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {units.length === 0 && (
              <div className="text-center py-20 text-slate-800 font-mono text-[10px] uppercase tracking-[0.2em]">0 Assets Active</div>
            )}
            {units.map(unit => (
              <div key={unit.id} className={`p-5 rounded-[1.5rem] border transition-all group relative overflow-hidden ${unit.name === session.callsign ? 'bg-emerald-500/5 border-emerald-500/40 shadow-xl' : 'bg-slate-900/40 border-slate-800/50 hover:border-slate-700'}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-slate-600">{unit.type === UnitType.POLICE ? <Icons.Police /> : unit.type === UnitType.FIRE ? <Icons.Fire /> : <Icons.EMS />}</span>
                    <span className="font-mono font-black text-sm tracking-widest">{unit.name}</span>
                  </div>
                  <div className={`text-[9px] px-2.5 py-1 rounded-lg border font-black tracking-widest ${STATUS_COLORS[unit.status]}`}>{unit.status.replace(/_/g, ' ')}</div>
                </div>
                <div className="text-[10px] text-slate-600 font-mono flex items-center justify-between mb-4">
                   <span className="truncate max-w-[140px]">USR: {unit.robloxUser || 'AI_VIRTUAL'}</span>
                   {session.role === 'DISPATCH' && (
                     <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setEditingUnit(unit); setUnitNameInput(unit.name); setIsManagingUnit(true); }} className="hover:text-blue-400 transition-colors"><Icons.Edit /></button>
                        <button onClick={() => { if(confirm('Purge unit from system?')) setUnits(units.filter(u => u.id !== unit.id)); }} className="hover:text-red-500 transition-colors"><Icons.Trash /></button>
                     </div>
                   )}
                </div>
                
                {(session.role === 'DISPATCH' || unit.name === session.callsign) && (
                  <div className="grid grid-cols-5 gap-1.5">
                    {Object.values(UnitStatus).map(s => (
                      <button 
                        key={s} 
                        onClick={() => updateUnitStatus(unit.id, s)} 
                        title={s.replace(/_/g, ' ')}
                        className={`text-[10px] py-2 rounded-lg border transition-all flex items-center justify-center font-black ${unit.status === s ? 'bg-slate-800 border-slate-600 text-white shadow-inner' : 'bg-slate-950/40 border-slate-800 text-slate-700 hover:text-slate-400'}`}
                      >
                        {s.charAt(0)}
                      </button>
                    ))}
                  </div>
                )}

                {session.role === 'DISPATCH' && activeIncidentId && unit.status === UnitStatus.AVAILABLE && (
                  <button 
                    onClick={() => assignUnitToIncident(unit.id, activeIncidentId)} 
                    className="w-full mt-4 py-2.5 bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 rounded-xl border border-blue-500/20 text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    ATTACH TO INCIDENT
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        {/* Center: Main Dashboard */}
        <section className="flex-1 flex flex-col min-w-0 bg-[#020617]">
          {/* Active Call Strip */}
          <div className="h-44 shrink-0 border-b border-slate-800/60 bg-slate-950/20 flex p-6 gap-6 overflow-x-auto items-center custom-scrollbar">
            {incidents.filter(i => i.status === 'ACTIVE').length === 0 && (
              <div className="w-full text-center text-slate-800 font-mono text-[11px] uppercase tracking-[0.4em] opacity-40">Operational Silence - Monitoring Frequencies</div>
            )}
            {incidents.filter(i => i.status === 'ACTIVE').map(incident => (
              <div 
                key={incident.id} 
                onClick={() => setActiveIncidentId(incident.id)} 
                className={`w-80 shrink-0 p-6 rounded-[2rem] border cursor-pointer transition-all relative overflow-hidden ${activeIncidentId === incident.id ? 'bg-blue-900/5 border-blue-500 shadow-2xl scale-[1.02]' : 'bg-slate-900/30 border-slate-800/50 hover:border-slate-700 hover:bg-slate-900/50'}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-mono font-black text-slate-600">{incident.id}</span>
                  <span className={`text-[10px] uppercase font-black tracking-widest ${PRIORITY_COLORS[incident.priority]}`}>{incident.priority}</span>
                </div>
                <div className="font-black text-sm truncate mb-1 uppercase tracking-wider">{incident.callType}</div>
                <div className="text-[11px] text-slate-500 truncate mb-5 font-medium italic">LOC: {incident.location}</div>
                <div className="flex flex-wrap gap-2">
                  {incident.assignedUnits.map(uId => (
                    <span key={uId} className="text-[9px] bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg font-mono font-bold text-blue-400">
                      {units.find(u => u.id === uId)?.name || '...'}
                    </span>
                  ))}
                  {incident.assignedUnits.length === 0 && <span className="text-[9px] text-slate-700 font-mono uppercase tracking-widest">NO_ASSETS</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Incident Detail Pane */}
          {activeIncident ? (
            <div className="flex-1 flex flex-col p-8 overflow-hidden">
               <div className="flex justify-between items-start mb-10">
                  <div>
                    <div className="flex items-center gap-6 mb-4">
                      <h2 className="text-5xl font-black text-white uppercase tracking-tighter drop-shadow-xl">{activeIncident.callType}</h2>
                      <span className={`px-6 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] ${PRIORITY_COLORS[activeIncident.priority]} border-2 border-current bg-[#020617] shadow-xl`}>
                        {activeIncident.priority} PRIORITY
                      </span>
                    </div>
                    <div className="flex items-center gap-10 text-slate-600 font-black uppercase tracking-[0.3em] text-[11px]">
                      <span className="flex items-center gap-3"><Icons.Search /> <span className="text-slate-300">{activeIncident.location}</span></span>
                      <span className="flex items-center gap-3 text-blue-500/60"><Icons.Police /> {activeIncident.assignedUnits.length} UNITS ATTACHED</span>
                    </div>
                  </div>
                  {session.role === 'DISPATCH' && (
                    <button 
                      onClick={() => closeIncident(activeIncident.id)} 
                      className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-10 py-4 rounded-[1.5rem] shadow-2xl font-black text-[11px] tracking-[0.3em] transition-all border border-red-500/20 active:scale-95"
                    >
                      TERMINATE_INCIDENT
                    </button>
                  )}
               </div>

               <div className="flex-1 flex flex-col bg-slate-950/40 rounded-[3rem] border border-slate-800/40 overflow-hidden shadow-3xl backdrop-blur-xl">
                  <div className="bg-slate-900/60 border-b border-slate-800 p-6 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-3 h-3 rounded-full bg-blue-500 animate-pulse shadow-[0_0_15px_#3b82f6]" />
                      <span className="text-[11px] font-black uppercase tracking-[0.4em] text-slate-500">Live Mission Feed</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-700 uppercase tracking-widest">E2EE Uplink: {activeIncident.id}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto p-10 space-y-6 font-mono text-sm leading-relaxed scroll-smooth custom-scrollbar">
                    {activeIncident.logs.map(log => (
                      <div key={log.id} className="flex gap-8 animate-in slide-in-from-left duration-300 group">
                        <span className="text-slate-800 font-black text-[10px] mt-1 shrink-0">[{log.timestamp}]</span>
                        <div className="flex-1">
                           <span className={`font-black mr-4 uppercase tracking-widest ${log.sender === 'DISPATCH' ? 'text-blue-500' : 'text-emerald-500'}`}>{log.sender}:</span>
                           <span className="text-slate-400 group-hover:text-slate-100 transition-colors">{log.message}</span>
                        </div>
                      </div>
                    ))}
                    {activeIncident.logs.length === 0 && (
                      <div className="text-slate-900 uppercase font-mono text-[10px] text-center py-20 tracking-[0.5em]">No Logged Transmissions</div>
                    )}
                  </div>
                  <div className="p-10 bg-slate-950/60 border-t border-slate-800/40">
                    <div className="flex gap-5">
                      <input 
                        type="text" 
                        value={logInput} 
                        onChange={(e) => setLogInput(e.target.value)} 
                        onKeyDown={(e) => e.key === 'Enter' && handleAddLog()} 
                        placeholder="Log status update..." 
                        className="flex-1 bg-slate-950 border border-slate-800/80 rounded-[1.5rem] px-8 py-6 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder:text-slate-900 transition-all shadow-inner" 
                      />
                      <button 
                        onClick={() => setIsAIAssisting(!isAIAssisting)} 
                        className={`p-6 rounded-[1.5rem] border transition-all flex items-center justify-center ${isAIAssisting ? 'bg-blue-600 text-white border-blue-400 shadow-2xl' : 'bg-slate-900 border-slate-800 text-slate-600 hover:text-white hover:border-slate-700'}`}
                      >
                        <Icons.Sparkles />
                      </button>
                      <button 
                        onClick={handleAddLog} 
                        className="bg-blue-600 hover:bg-blue-500 p-6 rounded-[1.5rem] shadow-2xl shadow-blue-900/40 transition-all active:scale-95 border border-white/10"
                      >
                        <Icons.Send />
                      </button>
                    </div>
                    {isAIAssisting && (
                      <div className="mt-4 text-[10px] text-blue-400 font-black uppercase tracking-[0.3em] animate-pulse flex items-center gap-3">
                        <Icons.Sparkles /> Intelligent Support Enabled
                      </div>
                    )}
                  </div>
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-10 grayscale">
               <div className="w-40 h-40 mb-10 bg-slate-900 rounded-[3rem] flex items-center justify-center border border-slate-800 shadow-3xl">
                  <Icons.Police />
               </div>
               <h3 className="text-4xl font-black text-white tracking-[0.5em] mb-4 uppercase">Ops Standby</h3>
               <p className="max-w-md text-center text-xs font-mono text-slate-500 uppercase tracking-widest leading-loose">Monitoring dispatch protocols. Ready for incident initialization.</p>
            </div>
          )}
        </section>
      </main>

      {/* Modals & Overlays */}
      {isManagingUnit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#020617]/95 backdrop-blur-xl p-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] shadow-3xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-10 space-y-8">
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Asset Callsign</label>
                   <input 
                      type="text" 
                      value={unitNameInput} 
                      onChange={(e) => setUnitNameInput(e.target.value)} 
                      placeholder="ADAM-1" 
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-sm font-black text-white uppercase outline-none focus:ring-2 focus:ring-blue-500 transition-all" 
                    />
                </div>
                <div className="space-y-4">
                   <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Operational Category</label>
                   <div className="grid grid-cols-3 gap-3">
                      {Object.values(UnitType).map(t => (
                        <button key={t} onClick={() => setUnitTypeInput(t)} className={`py-5 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${unitTypeInput === t ? 'bg-blue-600 border-blue-400 text-white shadow-xl' : 'bg-slate-950 border-slate-800 text-slate-700 hover:border-slate-700'}`}>{t}</button>
                      ))}
                   </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button onClick={() => setIsManagingUnit(false)} className="flex-1 font-black text-[11px] text-slate-500 uppercase tracking-[0.3em]">Cancel</button>
                  <button onClick={handleSaveUnit} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl shadow-blue-900/30 transition-all">Establish_Asset</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {isCreatingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/95 backdrop-blur-xl p-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] shadow-3xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200">
             <div className="p-12 space-y-10">
                <div className="grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Incident Type</label>
                    <select value={newCallType} onChange={(e) => setNewCallType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-sm font-black outline-none focus:ring-2 focus:ring-blue-500 appearance-none text-white transition-all">{CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select>
                  </div>
                  <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Priority Code</label>
                    <div className="grid grid-cols-2 gap-2">
                      {Object.values(Priority).map(p => <button key={p} onClick={() => setNewPriority(p)} className={`py-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-widest ${newPriority === p ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-700'}`}>{p}</button>)}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em]">Coordinates / Location</label>
                  <input type="text" placeholder="123 MAIN ST / GRID-4" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 text-sm font-black outline-none focus:ring-2 focus:ring-blue-500 text-white transition-all shadow-inner" />
                </div>
                <div className="flex gap-6 pt-6">
                  <button onClick={() => setIsCreatingCall(false)} className="flex-1 font-black text-[11px] text-slate-500 uppercase tracking-[0.3em] hover:text-white transition-colors">Discard</button>
                  <button onClick={createIncident} className="flex-[3] bg-blue-600 hover:bg-blue-500 text-white py-6 rounded-2xl font-black text-sm uppercase tracking-[0.4em] shadow-2xl shadow-blue-500/20 active:scale-95 transition-all">Broadcast_Incident</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Footer System HUD */}
      <footer className="h-10 bg-slate-950 border-t border-slate-900 flex items-center px-8 justify-between shrink-0 text-[10px] font-mono tracking-[0.3em] text-slate-700 uppercase font-black z-20">
        <div className="flex gap-10">
          <span className="flex items-center gap-2"><div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_5px_#10b981]" /> SYNC: OK</span>
          <span className="hidden sm:inline">OPS_ROOM_{roomId.toUpperCase()}</span>
          <span>LATENCY: 4MS</span>
        </div>
        <div className="flex gap-6">
          <span className="hidden md:inline">ENCR: AES-256-GCM</span>
          <span className="text-slate-800">NEXUS_v5.1.0_PROD</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
