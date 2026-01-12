
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Unit, Incident, UnitStatus, UnitType, Priority, IncidentLog, UserSession } from './types';
import { CALL_TYPES, STATUS_COLORS, PRIORITY_COLORS, Icons, ERLC_LOCATIONS } from './constants';

const STORAGE_KEY_UNITS = 'nexus_cad_data_units_';
const STORAGE_KEY_INCIDENTS = 'nexus_cad_data_incidents_';
const STORAGE_KEY_SESSION = 'nexus_cad_auth_session';
const STORAGE_KEY_ROOM_ID = 'nexus_cad_active_room';

// SYNC_CHANNEL allows multiple tabs to talk to each other in real-time
const SYNC_CHANNEL = new BroadcastChannel('nexus_cad_sync');

const App: React.FC = () => {
  // 1. Core State
  const [session, setSession] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SESSION);
    return saved ? JSON.parse(saved) : null;
  });

  const [roomId, setRoomId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ROOM_ID);
  });

  const [units, setUnits] = useState<Unit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  // UI State
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [logInput, setLogInput] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [isMobileMode, setIsMobileMode] = useState(window.innerWidth < 1024);
  const [mobileTab, setMobileTab] = useState<'UNITS' | 'INCIDENTS' | 'ACTIVE'>('INCIDENTS');

  // Login Form State
  const [loginRole, setLoginRole] = useState<'DISPATCH' | 'POLICE' | 'FIRE' | null>(null);
  const [loginName, setLoginName] = useState(''); 
  const [robloxName, setRobloxName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // 2. Synchronization & Persistence
  
  // Handle Cross-Tab Sync
  useEffect(() => {
    const handleSync = (event: MessageEvent) => {
      const { type, payload, room } = event.data;
      if (room !== roomId) return;

      if (type === 'UPDATE_UNITS') setUnits(payload);
      if (type === 'UPDATE_INCIDENTS') setIncidents(payload);
      if (type === 'HEARTBEAT_REQUEST') {
        // If we are a unit, respond with our presence
        SYNC_CHANNEL.postMessage({ type: 'HEARTBEAT_PULSE', room: roomId });
      }
    };

    SYNC_CHANNEL.onmessage = handleSync;
    return () => { SYNC_CHANNEL.onmessage = null; };
  }, [roomId]);

  // Initial Load from Storage
  useEffect(() => {
    if (roomId) {
      const savedUnits = localStorage.getItem(STORAGE_KEY_UNITS + roomId);
      const savedIncidents = localStorage.getItem(STORAGE_KEY_INCIDENTS + roomId);
      const loadedUnits = savedUnits ? JSON.parse(savedUnits) : [];
      const loadedIncidents = savedIncidents ? JSON.parse(savedIncidents) : [];
      
      setUnits(loadedUnits);
      setIncidents(loadedIncidents);
      localStorage.setItem(STORAGE_KEY_ROOM_ID, roomId);

      // Heartbeat: If I am a unit, make sure I am in that list
      if (session?.role === 'UNIT' && session.callsign) {
        setUnits(prev => {
          const exists = prev.find(u => u.name === session.callsign);
          if (exists) return prev;
          const me: Unit = {
            id: `U-${Date.now()}`,
            name: session.callsign!,
            type: session.unitType!,
            status: UnitStatus.AVAILABLE,
            robloxUser: session.robloxUsername!,
            lastUpdated: new Date().toISOString(),
          };
          const next = [...prev, me];
          SYNC_CHANNEL.postMessage({ type: 'UPDATE_UNITS', payload: next, room: roomId });
          return next;
        });
      }
    } else {
      localStorage.removeItem(STORAGE_KEY_ROOM_ID);
      setUnits([]);
      setIncidents([]);
    }
  }, [roomId, session]);

  // Periodic Save and Broadcast
  useEffect(() => {
    if (roomId) {
      localStorage.setItem(STORAGE_KEY_UNITS + roomId, JSON.stringify(units));
      localStorage.setItem(STORAGE_KEY_INCIDENTS + roomId, JSON.stringify(incidents));
    }
  }, [units, incidents, roomId]);

  // Responsive UI
  useEffect(() => {
    const handleResize = () => setIsMobileMode(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Derived Data
  const activeIncident = useMemo(() => 
    incidents.find(i => i.id === activeIncidentId), 
    [incidents, activeIncidentId]
  );

  const myUnit = useMemo(() => 
    units.find(u => u.name === session?.callsign), 
    [units, session]
  );

  const assignedUnitsToActive = useMemo(() => {
    if (!activeIncident) return [];
    try {
      const assignedIds: string[] = JSON.parse(activeIncident.assignedUnits);
      return units.filter(u => assignedIds.includes(u.name));
    } catch {
      return [];
    }
  }, [units, activeIncident]);

  // 3. Handlers
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    // Force reload from storage and broadcast a heartbeat request
    const savedUnits = localStorage.getItem(STORAGE_KEY_UNITS + roomId);
    const savedIncidents = localStorage.getItem(STORAGE_KEY_INCIDENTS + roomId);
    if (savedUnits) setUnits(JSON.parse(savedUnits));
    if (savedIncidents) setIncidents(JSON.parse(savedIncidents));
    
    SYNC_CHANNEL.postMessage({ type: 'HEARTBEAT_REQUEST', room: roomId });
    
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleLogin = () => {
    if (!loginName || !loginRole) return;
    if (loginRole !== 'DISPATCH' && !robloxName) return;

    const callsign = loginName.toUpperCase();
    const rbx = robloxName.trim();
    
    const newSession: UserSession = loginRole === 'DISPATCH' 
      ? { role: 'DISPATCH', username: callsign }
      : { role: 'UNIT', callsign, robloxUsername: rbx, unitType: loginRole === 'POLICE' ? UnitType.POLICE : UnitType.FIRE };
    
    setSession(newSession);
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(newSession));
  };

  const createServer = () => {
    if (session?.role !== 'DISPATCH') return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(code);
    setUnits([]);
    setIncidents([]);
  };

  const joinServer = () => {
    if (!joinCodeInput) return;
    const code = joinCodeInput.toUpperCase();
    setRoomId(code);
  };

  const deleteServer = () => {
    if (!roomId) return;
    if (confirm("Wipe server data? This will clear all calls and units for this code on your device.")) {
      localStorage.removeItem(STORAGE_KEY_UNITS + roomId);
      localStorage.removeItem(STORAGE_KEY_INCIDENTS + roomId);
      setRoomId(null);
    }
  };

  const handleSignOut = () => {
    setSession(null);
    setRoomId(null);
    localStorage.removeItem(STORAGE_KEY_SESSION);
    localStorage.removeItem(STORAGE_KEY_ROOM_ID);
  };

  const updateStatus = (status: UnitStatus) => {
    if (!session?.callsign) return;
    const nextUnits = units.map(u => 
      u.name === session.callsign ? { ...u, status, lastUpdated: new Date().toISOString() } : u
    );
    setUnits(nextUnits);
    SYNC_CHANNEL.postMessage({ type: 'UPDATE_UNITS', payload: nextUnits, room: roomId });
  };

  const assignUnitToCall = (unitName: string, incidentId: string) => {
    const nextIncidents = incidents.map(inc => {
      if (inc.id === incidentId) {
        let assigned: string[] = [];
        try { assigned = JSON.parse(inc.assignedUnits); } catch { assigned = []; }
        if (!assigned.includes(unitName)) assigned.push(unitName);
        return { ...inc, assignedUnits: JSON.stringify(assigned) };
      }
      return inc;
    });
    setIncidents(nextIncidents);
    SYNC_CHANNEL.postMessage({ type: 'UPDATE_INCIDENTS', payload: nextIncidents, room: roomId });
  };

  const unassignUnitFromCall = (unitName: string, incidentId: string) => {
    const nextIncidents = incidents.map(inc => {
      if (inc.id === incidentId) {
        let assigned: string[] = [];
        try { assigned = JSON.parse(inc.assignedUnits); } catch { assigned = []; }
        assigned = assigned.filter(name => name !== unitName);
        return { ...inc, assignedUnits: JSON.stringify(assigned) };
      }
      return inc;
    });
    setIncidents(nextIncidents);
    SYNC_CHANNEL.postMessage({ type: 'UPDATE_INCIDENTS', payload: nextIncidents, room: roomId });
  };

  const createIncident = (type: string, loc: string, priority: Priority) => {
    const id = `INC-${Math.floor(Math.random() * 9000) + 1000}`;
    const newInc: Incident = {
      id,
      callType: type,
      location: loc,
      priority,
      status: 'ACTIVE',
      assignedUnits: JSON.stringify([]),
      logs: JSON.stringify([{ id: '1', timestamp: new Date().toLocaleTimeString(), sender: 'SYSTEM', message: 'CAD Broadcast Initiated' }]),
      startTime: new Date().toISOString(),
    };
    const nextIncidents = [...incidents, newInc];
    setIncidents(nextIncidents);
    SYNC_CHANNEL.postMessage({ type: 'UPDATE_INCIDENTS', payload: nextIncidents, room: roomId });
    setActiveIncidentId(id);
    setIsCreatingCall(false);
    if (isMobileMode) setMobileTab('ACTIVE');
  };

  const addLog = () => {
    if (!logInput || !activeIncidentId) return;
    const log: IncidentLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      sender: session?.role === 'DISPATCH' ? 'DISPATCH' : (session?.callsign || 'UNIT'),
      message: logInput
    };
    const nextIncidents = incidents.map(inc => {
      if (inc.id === activeIncidentId) {
        const logs = JSON.parse(inc.logs);
        return { ...inc, logs: JSON.stringify([...logs, log]) };
      }
      return inc;
    });
    setIncidents(nextIncidents);
    SYNC_CHANNEL.postMessage({ type: 'UPDATE_INCIDENTS', payload: nextIncidents, room: roomId });
    setLogInput('');
  };

  const closeIncident = () => {
    if (!activeIncidentId) return;
    const nextIncidents = incidents.map(inc => 
      inc.id === activeIncidentId ? { ...inc, status: 'CLOSED' } : inc
    );
    setIncidents(nextIncidents);
    SYNC_CHANNEL.postMessage({ type: 'UPDATE_INCIDENTS', payload: nextIncidents, room: roomId });
    setActiveIncidentId(null);
    if (isMobileMode) setMobileTab('INCIDENTS');
  };

  const copyRoomId = () => {
    if (roomId) {
      navigator.clipboard.writeText(roomId);
      alert('Room Code Copied to Clipboard!');
    }
  };

  // 4. Render Logic

  // Login Screen
  if (!session) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-8 md:p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl">
          <div className="flex justify-center mb-8">
            <div className="bg-blue-600 p-4 rounded-3xl shadow-xl"><Icons.Police /></div>
          </div>
          <h1 className="text-3xl font-black text-center tracking-tighter mb-10 uppercase italic">NEXUS<span className="text-blue-500">CAD</span></h1>
          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {(['DISPATCH', 'POLICE', 'FIRE'] as const).map(role => (
                <button 
                  key={role}
                  onClick={() => setLoginRole(role)}
                  className={`py-4 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${loginRole === role ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  {role}
                </button>
              ))}
            </div>
            {loginRole && (
              <div className="animate-in fade-in slide-in-from-top-2 space-y-4">
                {loginRole !== 'DISPATCH' && (
                  <input type="text" placeholder="Roblox Username" value={robloxName} onChange={(e) => setRobloxName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-700" />
                )}
                <input type="text" placeholder={loginRole === 'DISPATCH' ? "Operator ID" : "Callsign (e.g. 1A-10)"} value={loginName} onChange={(e) => setLoginName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-700" />
                <button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all">Confirm Identity</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Session Picker
  if (!roomId) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-[3rem] w-full max-w-lg shadow-2xl text-center">
          <h2 className="text-2xl font-black uppercase tracking-widest mb-2">Initialize Session</h2>
          <p className="text-slate-500 text-[10px] mb-10 font-mono uppercase tracking-[0.3em] font-black">{session.role} // {session.callsign || session.username}</p>
          <div className="space-y-8">
            <div className="space-y-4">
              <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest block text-left mb-1 px-4">Join Active Server</label>
              <input 
                type="text" 
                placeholder="000000" 
                value={joinCodeInput} 
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())} 
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 text-center text-5xl font-black tracking-[0.4em] outline-none focus:ring-2 focus:ring-blue-500 transition-all text-blue-500 placeholder:text-slate-900 shadow-inner" 
              />
              <button onClick={joinServer} className="w-full bg-blue-600 hover:bg-blue-500 py-6 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all">Connect to Frequency</button>
            </div>
            {session.role === 'DISPATCH' && (
              <>
                <div className="flex items-center gap-4 py-2"><div className="flex-1 h-px bg-slate-800"></div><span className="text-[10px] font-black text-slate-700 uppercase">OR</span><div className="flex-1 h-px bg-slate-800"></div></div>
                <button onClick={createServer} className="w-full bg-slate-800 hover:bg-slate-700 py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-slate-700">Initialize New HQ</button>
              </>
            )}
            <button onClick={handleSignOut} className="text-[10px] font-black uppercase text-slate-600 hover:text-red-500 mt-6 transition-colors">Abort & Sign Out</button>
          </div>
        </div>
      </div>
    );
  }

  const isDispatch = session.role === 'DISPATCH';
  const roleColor = session.unitType === UnitType.FIRE ? 'text-red-500' : 'text-blue-500';
  const roleBg = session.unitType === UnitType.FIRE ? 'bg-red-600' : 'bg-blue-600';

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-100 font-sans overflow-hidden">
      <header className="h-16 shrink-0 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between px-4 md:px-8 backdrop-blur-xl z-30">
        <div className="flex items-center gap-3 md:gap-4">
          <div className={`${isDispatch ? 'bg-emerald-600' : roleBg} p-2 rounded-xl shadow-lg`}><Icons.Police /></div>
          <h1 className="text-lg md:text-xl font-black uppercase tracking-tighter hidden xs:block">NEXUS<span className={isDispatch ? 'text-emerald-400' : roleColor}>{isDispatch ? 'HQ' : session.unitType}</span></h1>
          <div className="h-6 w-px bg-slate-800 mx-1 md:mx-2"></div>
          
          {/* HIGH VISIBILITY CODE BADGE */}
          <div 
            onClick={copyRoomId} 
            className="bg-emerald-500/10 border-2 border-emerald-500/30 px-4 py-2 rounded-xl flex items-center gap-3 cursor-pointer hover:bg-emerald-500/20 transition-all shadow-[0_0_15px_rgba(16,185,129,0.1)] active:scale-95 group"
            title="Click to Copy Room Code"
          >
            <span className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest hidden sm:block">NET_ID:</span>
            <span className="text-sm md:text-base font-black text-emerald-400 font-mono tracking-[0.2em]">{roomId}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={handleManualRefresh} 
            className={`p-2.5 rounded-xl bg-slate-800/50 border border-slate-700 hover:border-blue-500 text-slate-400 hover:text-blue-400 transition-all ${isRefreshing ? 'animate-spin' : ''}`}
            title="Resync Data"
          >
            <Icons.Refresh />
          </button>
          {isDispatch && (
            <>
              <button onClick={() => setIsCreatingCall(true)} className="bg-blue-600 hover:bg-blue-500 px-4 md:px-6 py-2.5 rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest shadow-lg transition-all">New Call</button>
              <button onClick={deleteServer} className="p-2.5 text-red-500 hover:bg-red-500/10 border border-slate-700 rounded-xl transition-all" title="Wipe Data"><Icons.Trash /></button>
            </>
          )}
          <button onClick={() => setRoomId(null)} className="text-[9px] md:text-[10px] font-black uppercase text-slate-500 hover:text-white px-2">Leave Session</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - Personnel Roster */}
        <aside className={`${isMobileMode ? (mobileTab === 'UNITS' ? 'flex w-full' : 'hidden') : 'w-80 flex'} border-r border-slate-800/60 bg-slate-950/40 flex-col shrink-0 overflow-y-auto custom-scrollbar-v z-10`}>
          <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#020617]/90 backdrop-blur-md z-10">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Personnel Roster</h2>
            <div className={`w-2 h-2 rounded-full animate-pulse ${myUnit?.status === UnitStatus.OUT_OF_SERVICE ? 'bg-red-500 shadow-[0_0_8px_red]' : 'bg-emerald-500 shadow-[0_0_8px_#10b981]'}`}></div>
          </div>
          <div className="p-4 space-y-6">
            {!isDispatch && (
              <div className="space-y-2">
                <h3 className="text-[9px] font-black text-slate-700 uppercase px-2 tracking-widest">Duty Status</h3>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.values(UnitStatus).map(s => (
                    <button key={s} onClick={() => updateStatus(s)} className={`w-full p-4 rounded-xl border font-black text-[10px] uppercase tracking-widest transition-all text-left flex justify-between items-center ${myUnit?.status === s ? 'bg-blue-600 border-blue-400 text-white shadow-lg scale-[1.02]' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}`}>
                      {s.replace(/_/g, ' ')}
                      {myUnit?.status === s && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {/* Show ALL units to everyone */}
            {[UnitType.POLICE, UnitType.FIRE, UnitType.EMS].map(type => {
              const typedUnits = units.filter(u => u.type === type);
              return (
                <div key={type} className="space-y-2">
                  <h3 className="text-[9px] font-black text-slate-700 uppercase px-2 tracking-widest">{type} UNITS ({typedUnits.length})</h3>
                  {typedUnits.map(unit => {
                    const statusColors = STATUS_COLORS[unit.status] || '';
                    const isAssigned = assignedUnitsToActive.some(au => au.name === unit.name);
                    return (
                      <div key={unit.id} className={`p-4 rounded-2xl bg-slate-900/40 border ${statusColors.split(' ')[2]} flex flex-col gap-2 relative group transition-all`}>
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col">
                            <span className="font-bold text-xs text-white">{unit.name}</span>
                            <span className="text-[8px] text-slate-500 italic uppercase">@{unit.robloxUser}</span>
                            <div className={`mt-1 inline-flex px-2 py-0.5 rounded text-[8px] font-black uppercase ${statusColors.split(' ')[0]} ${statusColors.split(' ')[1]}`}>{unit.status.replace(/_/g, ' ')}</div>
                          </div>
                          {isDispatch && <button onClick={() => {
                            const next = units.filter(u => u.id !== unit.id);
                            setUnits(next);
                            SYNC_CHANNEL.postMessage({ type: 'UPDATE_UNITS', payload: next, room: roomId });
                          }} className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-500 transition-all"><Icons.Trash /></button>}
                        </div>
                        {activeIncident && (isDispatch || unit.name === session.callsign) && (
                          <button onClick={() => isAssigned ? unassignUnitFromCall(unit.name, activeIncident.id) : assignUnitToCall(unit.name, activeIncident.id)} className={`w-full py-2 rounded-lg border text-[9px] font-black uppercase transition-all mt-1 ${isAssigned ? 'bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500 hover:text-white' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500 hover:text-white'}`}>
                            {isAssigned ? 'Detach Unit' : 'Attach Call'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                  {typedUnits.length === 0 && <div className="px-2 py-4 text-[9px] text-slate-800 uppercase font-bold italic">No {type} Units Active</div>}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className={`${isMobileMode ? (mobileTab === 'UNITS' ? 'hidden' : 'flex') : 'flex'} flex-1 flex-col bg-[#020617] overflow-hidden`}>
          {/* Incident Queue */}
          <div className={`${isMobileMode && mobileTab !== 'INCIDENTS' ? 'hidden' : 'flex'} h-44 shrink-0 border-b border-slate-800/60 p-6 flex gap-6 overflow-x-auto items-center custom-scrollbar`}>
            {incidents.filter(inc => inc.status === 'ACTIVE').map(incident => (
              <div key={incident.id} onClick={() => { setActiveIncidentId(incident.id); if (isMobileMode) setMobileTab('ACTIVE'); }} className={`w-80 shrink-0 p-6 rounded-[2rem] border cursor-pointer transition-all ${activeIncidentId === incident.id ? 'bg-blue-900/5 border-blue-500 shadow-xl scale-[1.02]' : 'bg-slate-900/30 border-slate-800/50 hover:bg-slate-900/40'}`}>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-mono font-bold text-slate-600">{incident.id}</span>
                  <span className={`text-[10px] uppercase font-black tracking-widest ${PRIORITY_COLORS[incident.priority]}`}>{incident.priority}</span>
                </div>
                <div className="font-black text-sm truncate uppercase tracking-wide">{incident.callType}</div>
                <div className="text-[11px] text-slate-500 truncate italic">LOC: {incident.location}</div>
                <div className="mt-2 flex gap-1 overflow-hidden">
                   {JSON.parse(incident.assignedUnits).length > 0 ? JSON.parse(incident.assignedUnits).map((u: string) => <span key={u} className="px-1.5 py-0.5 bg-slate-800 text-[7px] font-black rounded text-slate-400">{u}</span>) : <span className="text-[7px] font-black text-red-500 uppercase italic">UNASSIGNED</span>}
                </div>
              </div>
            ))}
            {incidents.filter(inc => inc.status === 'ACTIVE').length === 0 && <div className="flex-1 flex flex-col items-center justify-center opacity-10 uppercase font-black tracking-[0.5em] text-[10px]">No Active Broadcasts</div>}
          </div>

          {/* Call Editor / Active Detail */}
          <div className={`${isMobileMode && mobileTab !== 'ACTIVE' ? 'hidden' : 'flex'} flex-1 flex-col overflow-hidden relative`}>
            {activeIncident ? (
              <div className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                  <div className="space-y-1">
                    <h2 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tighter">{activeIncident.callType}</h2>
                    <div className="text-[10px] md:text-[11px] text-slate-500 uppercase tracking-[0.3em] font-black italic">POSTAL: {activeIncident.location}</div>
                  </div>
                  {isDispatch && <button onClick={closeIncident} className="w-full md:w-auto bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border border-red-500/20 shadow-xl">Close Incident</button>}
                </div>
                
                <div className="flex-1 flex flex-col bg-slate-950/40 rounded-[2rem] border border-slate-800/40 overflow-hidden shadow-3xl backdrop-blur-xl">
                  {/* Attached Units Bar */}
                  <div className="px-6 py-4 bg-slate-900/30 border-b border-slate-800/50 flex items-center gap-3 overflow-x-auto no-scrollbar">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest whitespace-nowrap">RESPONSE:</span>
                    <div className="flex gap-2">
                      {assignedUnitsToActive.length > 0 ? assignedUnitsToActive.map(au => (
                        <div key={au.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${STATUS_COLORS[au.status].split(' ')[2]} bg-slate-950/80`}>
                           <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[au.status].split(' ')[0]}`}></div>
                           <span className="text-[10px] font-black text-white">{au.name}</span>
                        </div>
                      )) : <span className="text-[9px] font-black text-red-500/50 uppercase animate-pulse">Waiting for Response...</span>}
                    </div>
                  </div>
                  
                  {/* Logs Section */}
                  <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-4 font-mono text-xs md:text-sm custom-scrollbar-v">
                    {JSON.parse(activeIncident.logs).map((log: IncidentLog, idx: number) => (
                      <div key={idx} className="flex gap-4 group animate-in fade-in slide-in-from-left-2">
                        <span className="text-slate-800 font-black text-[9px] shrink-0">[{log.timestamp}]</span>
                        <div className="flex-1"><span className={`font-black mr-4 uppercase tracking-widest ${log.sender.includes('DISPATCH') ? 'text-blue-500' : 'text-emerald-500'}`}>{log.sender}:</span><span className="text-slate-400">{log.message}</span></div>
                      </div>
                    ))}
                  </div>

                  {/* Input Transmission */}
                  <div className="p-4 md:p-8 bg-slate-950/60 border-t border-slate-800/40 flex gap-3">
                    <input type="text" value={logInput} onChange={(e) => setLogInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLog()} placeholder="Enter transmission..." className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-5 py-4 text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500 text-white transition-all placeholder:text-slate-800" />
                    <button onClick={addLog} className="bg-blue-600 hover:bg-blue-500 px-8 rounded-2xl shadow-xl transition-all active:scale-95"><Icons.Send /></button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-10 italic">
                <div className="w-24 h-24 mb-8 bg-slate-900 rounded-[2.5rem] flex items-center justify-center border border-slate-800 shadow-2xl"><Icons.Police /></div>
                <div className="text-2xl font-black uppercase tracking-[0.4em] text-white">Monitoring...</div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      {isMobileMode && (
        <nav className="h-16 bg-slate-950 border-t border-slate-900 grid grid-cols-3 shrink-0 z-30">
          <button onClick={() => setMobileTab('UNITS')} className={`flex flex-col items-center justify-center gap-1 ${mobileTab === 'UNITS' ? 'text-blue-400 font-black' : 'text-slate-700'}`}><Icons.Police /><span className="text-[8px] font-black uppercase">Roster</span></button>
          <button onClick={() => setMobileTab('INCIDENTS')} className={`flex flex-col items-center justify-center gap-1 ${mobileTab === 'INCIDENTS' ? 'text-blue-400 font-black' : 'text-slate-700'}`}><Icons.AlertCircle /><span className="text-[8px] font-black uppercase">Queue</span></button>
          <button onClick={() => setMobileTab('ACTIVE')} className={`flex flex-col items-center justify-center gap-1 ${mobileTab === 'ACTIVE' ? 'text-blue-400 font-black' : 'text-slate-700'}`}><Icons.Plus /><span className="text-[8px] font-black uppercase">Editor</span></button>
        </nav>
      )}

      {/* New Incident Overlay */}
      {isCreatingCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/95 backdrop-blur-md p-4"><NewCallForm onCreate={createIncident} onCancel={() => setIsCreatingCall(false)} /></div>
      )}

      {/* Persistence Footer */}
      <footer className="h-10 bg-slate-950 border-t border-slate-900 flex items-center px-4 md:px-8 justify-between shrink-0 text-[9px] font-mono tracking-widest text-slate-700 uppercase font-black z-20">
        <div className="flex gap-10 items-center">
          <div className="flex items-center gap-2">NET_LINK: <span className="text-emerald-500">{roomId}</span></div>
          <div className="hidden xs:block">PERSISTENCE: {isDispatch ? 'HQ_PRIMARY' : 'FIELD_LINKED'}</div>
        </div>
        <div className="italic hidden sm:block">NEXUS CAD // CROSS_TAB_SYNC_ENABLED // V2.4</div>
      </footer>
    </div>
  );
};

const NewCallForm: React.FC<{ onCreate: (type: string, loc: string, p: Priority) => void, onCancel: () => void }> = ({ onCreate, onCancel }) => {
  const [type, setType] = useState(CALL_TYPES[0]);
  const [loc, setLoc] = useState('');
  const [p, setP] = useState<Priority>(Priority.MEDIUM);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-6 md:p-12 w-full max-w-2xl space-y-6 animate-in zoom-in-95 shadow-2xl">
      <h3 className="text-xl font-black uppercase text-center tracking-widest">Incident Broadcast</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-600 uppercase">Call Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-black text-white outline-none appearance-none cursor-pointer">
            {CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black text-slate-600 uppercase">Priority Status</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(Priority).map(priority => (
              <button key={priority} onClick={() => setP(priority)} className={`py-4 rounded-xl border text-[9px] font-black uppercase transition-all ${p === priority ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-700'}`}>{priority}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <label className="text-[10px] font-black text-slate-600 uppercase">Postal / Landmark</label>
        <input type="text" placeholder="STREET / POSTAL / POI" value={loc} onChange={(e) => setLoc(e.target.value)} list="loc-suggestions" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-black outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder:text-slate-900" />
        <datalist id="loc-suggestions">{ERLC_LOCATIONS.map(l => <option key={l} value={l} />)}</datalist>
      </div>
      <div className="flex gap-4 pt-4">
        <button onClick={onCancel} className="flex-1 font-black text-[10px] text-slate-500 uppercase tracking-widest">Discard</button>
        <button onClick={() => onCreate(type, loc, p)} className="flex-[3] bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all text-xs">Authorize Broadcast</button>
      </div>
    </div>
  );
};

export default App;
