
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Unit, Incident, UnitStatus, UnitType, Priority, IncidentLog, UserSession } from './types';
import { CALL_TYPES, STATUS_COLORS, PRIORITY_COLORS, Icons, ERLC_LOCATIONS } from './constants';

const STORAGE_KEY_UNITS = 'nexus_cad_data_units_';
const STORAGE_KEY_INCIDENTS = 'nexus_cad_data_incidents_';
const STORAGE_KEY_SESSION = 'nexus_cad_auth_session';
const STORAGE_KEY_ROOM_ID = 'nexus_cad_active_room';

// BroadcastChannel for cross-tab communication on the same browser/machine
const SYNC_CHANNEL = new BroadcastChannel('nexus_cad_p2p_sync');

const App: React.FC = () => {
  // 1. Core State
  const [session, setSession] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SESSION);
    return saved ? JSON.parse(saved) : null;
  });

  const [roomId, setRoomId] = useState<string | null>(() => {
    const hash = window.location.hash.replace('#', '').toUpperCase();
    if (hash && hash.length === 6) return hash;
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

  const [loginRole, setLoginRole] = useState<'DISPATCH' | 'POLICE' | 'FIRE' | null>(null);
  const [loginName, setLoginName] = useState(''); 
  const [robloxName, setRobloxName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // 2. Peer-to-Peer Sync Engine
  
  // Broadcast a message with the current room context
  const broadcast = useCallback((type: string, payload: any) => {
    if (!roomId) return;
    SYNC_CHANNEL.postMessage({ type, payload, room: roomId, timestamp: Date.now() });
  }, [roomId]);

  // Handle incoming messages
  useEffect(() => {
    const handleSync = (event: MessageEvent) => {
      const { type, payload, room } = event.data;
      if (!roomId || room !== roomId) return;

      switch (type) {
        case 'SYNC_FULL_STATE':
          if (payload.units) setUnits(payload.units);
          if (payload.incidents) setIncidents(payload.incidents as Incident[]);
          break;
        case 'UPDATE_UNITS':
          setUnits(payload);
          break;
        case 'UPDATE_INCIDENTS':
          setIncidents(payload as Incident[]);
          break;
        case 'REPRO_REQUEST':
          // Another tab is asking "who is here?", broadcast our current full state
          broadcast('SYNC_FULL_STATE', { units, incidents });
          break;
      }
    };

    SYNC_CHANNEL.onmessage = handleSync;
    return () => { SYNC_CHANNEL.onmessage = null; };
  }, [roomId, units, incidents, broadcast]);

  // Maintain "Self-Presence" for Units
  // This ensures that if the state is overwritten by a sync, we put ourselves back in
  useEffect(() => {
    if (roomId && session?.role === 'UNIT' && session.callsign) {
      const me = units.find(u => u.name === session.callsign);
      if (!me) {
        const newMe: Unit = {
          id: `U-${Date.now()}`,
          name: session.callsign!,
          type: session.unitType!,
          status: UnitStatus.AVAILABLE,
          robloxUser: session.robloxUsername!,
          lastUpdated: new Date().toISOString(),
        };
        const nextUnits = [...units, newMe];
        setUnits(nextUnits);
        broadcast('UPDATE_UNITS', nextUnits);
      }
    }
  }, [units, roomId, session, broadcast]);

  // Initial Room Setup
  useEffect(() => {
    if (roomId) {
      window.location.hash = roomId;
      localStorage.setItem(STORAGE_KEY_ROOM_ID, roomId);
      
      const savedUnits = localStorage.getItem(STORAGE_KEY_UNITS + roomId);
      const savedIncidents = localStorage.getItem(STORAGE_KEY_INCIDENTS + roomId);
      
      if (savedUnits) setUnits(JSON.parse(savedUnits));
      if (savedIncidents) setIncidents(JSON.parse(savedIncidents));

      // Shout out to other tabs to get the most recent data
      broadcast('REPRO_REQUEST', {});
    } else {
      setUnits([]);
      setIncidents([]);
      window.location.hash = '';
    }
  }, [roomId, broadcast]);

  // Local Storage Persistence
  useEffect(() => {
    if (roomId) {
      localStorage.setItem(STORAGE_KEY_UNITS + roomId, JSON.stringify(units));
      localStorage.setItem(STORAGE_KEY_INCIDENTS + roomId, JSON.stringify(incidents));
    }
  }, [units, incidents, roomId]);

  // Resize Listener
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

  // 3. Action Handlers
  const handleManualRefresh = () => {
    setIsRefreshing(true);
    broadcast('REPRO_REQUEST', {});
    setTimeout(() => setIsRefreshing(false), 800);
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
  };

  const joinServer = () => {
    if (!joinCodeInput || joinCodeInput.length !== 6) return;
    setRoomId(joinCodeInput.toUpperCase());
  };

  const updateStatus = (status: UnitStatus) => {
    if (!session?.callsign) return;
    const nextUnits = units.map(u => 
      u.name === session.callsign ? { ...u, status, lastUpdated: new Date().toISOString() } : u
    );
    setUnits(nextUnits);
    broadcast('UPDATE_UNITS', nextUnits);
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
    broadcast('UPDATE_INCIDENTS', nextIncidents);
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
        const currentLogs = JSON.parse(inc.logs);
        return { ...inc, logs: JSON.stringify([...currentLogs, log]) };
      }
      return inc;
    });
    setIncidents(nextIncidents);
    broadcast('UPDATE_INCIDENTS', nextIncidents);
    setLogInput('');
  };

  const closeIncident = () => {
    if (!activeIncidentId) return;
    const nextIncidents = incidents.map(inc => 
      inc.id === activeIncidentId ? { ...inc, status: 'CLOSED' as const } : inc
    );
    setIncidents(nextIncidents);
    broadcast('UPDATE_INCIDENTS', nextIncidents);
    setActiveIncidentId(null);
    if (isMobileMode) setMobileTab('INCIDENTS');
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
    broadcast('UPDATE_INCIDENTS', nextIncidents);
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
    broadcast('UPDATE_INCIDENTS', nextIncidents);
  };

  // 4. View Rendering
  
  // Login View
  if (!session) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-8 md:p-12 rounded-[3rem] w-full max-w-lg shadow-2xl">
          <div className="flex justify-center mb-10">
            <div className="bg-blue-600 p-5 rounded-3xl shadow-xl animate-pulse"><Icons.Police /></div>
          </div>
          <h1 className="text-4xl font-black text-center tracking-tighter mb-12 uppercase italic">NEXUS<span className="text-blue-500">CAD</span></h1>
          <div className="space-y-8">
            <div className="grid grid-cols-3 gap-3">
              {(['DISPATCH', 'POLICE', 'FIRE'] as const).map(role => (
                <button 
                  key={role}
                  onClick={() => setLoginRole(role)}
                  className={`py-5 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-all ${loginRole === role ? 'bg-blue-600 border-blue-400 text-white shadow-xl' : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'}`}
                >
                  {role}
                </button>
              ))}
            </div>
            {loginRole && (
              <div className="animate-in fade-in slide-in-from-top-4 space-y-4">
                {loginRole !== 'DISPATCH' && (
                  <input type="text" placeholder="Roblox Username" value={robloxName} onChange={(e) => setRobloxName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-800" />
                )}
                <input type="text" placeholder={loginRole === 'DISPATCH' ? "Operator ID" : "Callsign (e.g. 1A-10)"} value={loginName} onChange={(e) => setLoginName(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-800" />
                <button onClick={handleLogin} className="w-full bg-blue-600 hover:bg-blue-500 py-6 rounded-2xl font-black text-xs uppercase tracking-[0.3em] shadow-2xl active:scale-95 transition-all">Enter System</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Room Picker View
  if (!roomId) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-10 md:p-14 rounded-[4rem] w-full max-w-lg shadow-2xl text-center">
          <h2 className="text-3xl font-black uppercase tracking-tighter mb-4">Initialize Session</h2>
          <p className="text-slate-500 text-[10px] mb-12 font-mono uppercase tracking-[0.4em] font-black">{session.role} // AUTH_ID: {session.callsign || session.username}</p>
          <div className="space-y-10">
            <div className="space-y-5">
              <label className="text-[11px] font-black text-slate-600 uppercase tracking-widest block text-left px-6">Room Code</label>
              <input 
                type="text" 
                placeholder="------" 
                maxLength={6}
                value={joinCodeInput} 
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())} 
                className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-8 text-center text-6xl font-black tracking-[0.4em] outline-none focus:ring-2 focus:ring-blue-500 transition-all text-blue-500 placeholder:text-slate-900 shadow-inner" 
              />
              <button onClick={joinServer} className="w-full bg-blue-600 hover:bg-blue-500 py-7 rounded-3xl font-black text-sm uppercase tracking-widest shadow-2xl transition-all">Connect to HQ</button>
            </div>
            {session.role === 'DISPATCH' && (
              <>
                <div className="flex items-center gap-6 py-2"><div className="flex-1 h-px bg-slate-800"></div><span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">OR</span><div className="flex-1 h-px bg-slate-800"></div></div>
                <button onClick={createServer} className="w-full bg-slate-800 hover:bg-slate-700 py-6 rounded-3xl font-black text-xs uppercase tracking-widest transition-all border border-slate-700">Generate New Room</button>
              </>
            )}
            <button onClick={() => { setSession(null); localStorage.removeItem(STORAGE_KEY_SESSION); }} className="text-[11px] font-black uppercase text-slate-600 hover:text-red-500">Sign Out</button>
          </div>
        </div>
      </div>
    );
  }

  // Main CAD View
  const isDispatch = session.role === 'DISPATCH';
  const roleColor = session.unitType === UnitType.FIRE ? 'text-red-500' : 'text-blue-500';
  const roleBg = session.unitType === UnitType.FIRE ? 'bg-red-600' : 'bg-blue-600';

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-100 font-sans overflow-hidden">
      <header className="h-20 shrink-0 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between px-6 md:px-10 backdrop-blur-2xl z-30">
        <div className="flex items-center gap-5">
          <div className={`${isDispatch ? 'bg-emerald-600' : roleBg} p-3 rounded-2xl shadow-xl`}><Icons.Police /></div>
          <h1 className="text-xl md:text-2xl font-black uppercase tracking-tighter hidden sm:block">NEXUS<span className={isDispatch ? 'text-emerald-400' : roleColor}>{isDispatch ? 'HQ' : session.unitType}</span></h1>
          <div className="h-8 w-px bg-slate-800 mx-2"></div>
          
          <div 
            onClick={() => { navigator.clipboard.writeText(window.location.href); alert('Invite link copied!'); }} 
            className="bg-emerald-500/10 border-2 border-emerald-500/30 px-5 py-2.5 rounded-2xl flex items-center gap-4 cursor-pointer hover:bg-emerald-500/20 transition-all shadow-[0_0_20px_rgba(16,185,129,0.1)] active:scale-95 group"
          >
            <span className="text-[10px] font-black text-emerald-500/60 uppercase tracking-widest hidden lg:block">SESSION_ID:</span>
            <span className="text-lg font-black text-emerald-400 font-mono tracking-[0.3em]">{roomId}</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={handleManualRefresh} 
            className={`p-3 rounded-2xl bg-slate-800/50 border border-slate-700 hover:border-blue-500 text-slate-400 hover:text-blue-400 transition-all ${isRefreshing ? 'animate-spin' : ''}`}
            title="Resync Data"
          >
            <Icons.Refresh />
          </button>
          {isDispatch && (
            <button onClick={() => setIsCreatingCall(true)} className="bg-blue-600 hover:bg-blue-500 px-6 py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-xl transition-all">New Incident</button>
          )}
          <button onClick={() => setRoomId(null)} className="text-[11px] font-black uppercase text-slate-600 hover:text-white px-4 transition-colors">Disconnect</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - Unit Roster */}
        <aside className={`${isMobileMode ? (mobileTab === 'UNITS' ? 'flex w-full' : 'hidden') : 'w-80 flex'} border-r border-slate-800/60 bg-slate-950/40 flex-col shrink-0 overflow-y-auto custom-scrollbar-v z-10`}>
          <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#020617]/90 backdrop-blur-md z-10">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Personnel Roster</h2>
            <div className={`w-2 h-2 rounded-full animate-pulse ${myUnit?.status === UnitStatus.OUT_OF_SERVICE ? 'bg-red-500 shadow-[0_0_10px_red]' : 'bg-emerald-500 shadow-[0_0_10px_#10b981]'}`}></div>
          </div>
          
          <div className="p-4 space-y-6">
            {!isDispatch && (
              <div className="space-y-3">
                <h3 className="text-[9px] font-black text-slate-700 uppercase px-3 tracking-widest">Update My Status</h3>
                <div className="grid grid-cols-1 gap-2">
                  {Object.values(UnitStatus).map(s => (
                    <button key={s} onClick={() => updateStatus(s)} className={`w-full p-5 rounded-2xl border font-black text-[11px] uppercase tracking-widest transition-all text-left flex justify-between items-center ${myUnit?.status === s ? 'bg-blue-600 border-blue-400 text-white shadow-xl scale-[1.02]' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}`}>
                      {s.replace(/_/g, ' ')}
                      {myUnit?.status === s && <div className="w-2 h-2 rounded-full bg-white animate-ping"></div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
            
            {[UnitType.POLICE, UnitType.FIRE, UnitType.EMS].map(type => {
              const typedUnits = units.filter(u => u.type === type);
              return (
                <div key={type} className="space-y-3">
                  <h3 className="text-[9px] font-black text-slate-700 uppercase px-3 tracking-widest">{type} UNITS ({typedUnits.length})</h3>
                  {typedUnits.map(unit => {
                    const colors = STATUS_COLORS[unit.status] || '';
                    const isAssigned = assignedUnitsToActive.some(au => au.name === unit.name);
                    return (
                      <div key={unit.id} className={`p-5 rounded-3xl bg-slate-900/40 border-2 ${colors.split(' ')[2]} flex flex-col gap-3 relative group transition-all`}>
                        <div className="flex justify-between items-start">
                          <div className="flex flex-col">
                            <span className="font-black text-sm text-white">{unit.name}</span>
                            <span className="text-[9px] text-slate-500 italic uppercase">@{unit.robloxUser}</span>
                            <div className={`mt-2 inline-flex px-3 py-1 rounded-xl text-[9px] font-black uppercase ${colors.split(' ')[0]} ${colors.split(' ')[1]}`}>{unit.status.replace(/_/g, ' ')}</div>
                          </div>
                          {isDispatch && (
                            <button onClick={() => {
                              const next = units.filter(u => u.id !== unit.id);
                              setUnits(next);
                              broadcast('UPDATE_UNITS', next);
                            }} className="opacity-0 group-hover:opacity-100 p-2.5 text-slate-600 hover:text-red-500 transition-all">
                              <Icons.Trash />
                            </button>
                          )}
                        </div>
                        {activeIncident && (isDispatch || unit.name === session.callsign) && (
                          <button onClick={() => isAssigned ? unassignUnitFromCall(unit.name, activeIncident.id) : assignUnitToCall(unit.name, activeIncident.id)} className={`w-full py-3 rounded-xl border-2 text-[10px] font-black uppercase transition-all ${isAssigned ? 'bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-600 hover:text-white' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500 hover:bg-emerald-600 hover:text-white'}`}>
                            {isAssigned ? 'Detach Duty' : 'Attach Call'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Area */}
        <main className={`${isMobileMode ? (mobileTab === 'UNITS' ? 'hidden' : 'flex') : 'flex'} flex-1 flex-col bg-[#020617] overflow-hidden`}>
          {/* Active Call Queue */}
          <div className={`${isMobileMode && mobileTab !== 'INCIDENTS' ? 'hidden' : 'flex'} h-52 shrink-0 border-b border-slate-800/60 p-8 flex gap-8 overflow-x-auto items-center custom-scrollbar`}>
            {incidents.filter(inc => inc.status === 'ACTIVE').map(incident => (
              <div key={incident.id} onClick={() => { setActiveIncidentId(incident.id); if (isMobileMode) setMobileTab('ACTIVE'); }} className={`w-96 shrink-0 p-8 rounded-[3rem] border-2 cursor-pointer transition-all ${activeIncidentId === incident.id ? 'bg-blue-900/5 border-blue-500 shadow-2xl scale-[1.03]' : 'bg-slate-900/30 border-slate-800/50 hover:bg-slate-900/40 hover:border-slate-700'}`}>
                <div className="flex justify-between items-start mb-5">
                  <span className="text-[11px] font-mono font-black text-slate-600">{incident.id}</span>
                  <span className={`text-[11px] uppercase font-black tracking-[0.2em] ${PRIORITY_COLORS[incident.priority]}`}>{incident.priority}</span>
                </div>
                <div className="font-black text-lg truncate uppercase tracking-tight text-white">{incident.callType}</div>
                <div className="text-xs text-slate-500 truncate italic mt-1 font-mono uppercase">LOC: {incident.location}</div>
              </div>
            ))}
            {incidents.filter(inc => inc.status === 'ACTIVE').length === 0 && <div className="flex-1 flex flex-col items-center justify-center opacity-10 uppercase font-black tracking-[0.8em] text-xs">Awaiting Incidents...</div>}
          </div>

          {/* Active Call Details */}
          <div className={`${isMobileMode && mobileTab !== 'ACTIVE' ? 'hidden' : 'flex'} flex-1 flex-col overflow-hidden relative`}>
            {activeIncident ? (
              <div className="flex-1 flex flex-col p-6 md:p-12 overflow-hidden animate-in fade-in slide-in-from-bottom-6">
                <div className="flex flex-col md:flex-row justify-between items-start mb-8 gap-6">
                  <div className="space-y-2">
                    <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter leading-none">{activeIncident.callType}</h2>
                    <div className="text-xs md:text-sm text-slate-500 uppercase tracking-[0.4em] font-black italic">POSTAL: {activeIncident.location}</div>
                  </div>
                  {isDispatch && <button onClick={closeIncident} className="w-full md:w-auto bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest transition-all border-2 border-red-500/20 shadow-2xl active:scale-95">Resolve Call</button>}
                </div>
                
                <div className="flex-1 flex flex-col bg-slate-950/50 rounded-[3rem] border-2 border-slate-800/40 overflow-hidden shadow-3xl backdrop-blur-2xl">
                  <div className="px-8 py-5 bg-slate-900/40 border-b border-slate-800/50 flex items-center gap-5 overflow-x-auto no-scrollbar">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] whitespace-nowrap">RESPONSE_TEAM:</span>
                    <div className="flex gap-3">
                      {assignedUnitsToActive.length > 0 ? assignedUnitsToActive.map(au => (
                        <div key={au.id} className={`flex items-center gap-3 px-4 py-2 rounded-2xl border-2 ${STATUS_COLORS[au.status].split(' ')[2]} bg-slate-950/90 shadow-lg`}>
                           <div className={`w-2 h-2 rounded-full ${STATUS_COLORS[au.status].split(' ')[0]}`}></div>
                           <span className="text-xs font-black text-white">{au.name}</span>
                        </div>
                      )) : <span className="text-[10px] font-black text-red-500/50 uppercase animate-pulse">Awaiting Assignment...</span>}
                    </div>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-8 md:p-12 space-y-6 font-mono text-sm custom-scrollbar-v">
                    {(JSON.parse(activeIncident.logs) as IncidentLog[]).map((log, idx) => (
                      <div key={idx} className="flex gap-6 group animate-in fade-in slide-in-from-left-4">
                        <span className="text-slate-800 font-black text-[10px] shrink-0 mt-1">[{log.timestamp}]</span>
                        <div className="flex-1">
                          <span className={`font-black mr-4 uppercase tracking-[0.2em] ${log.sender.includes('DISPATCH') ? 'text-blue-500' : 'text-emerald-500'}`}>{log.sender}:</span>
                          <span className="text-slate-300 leading-relaxed text-base">{log.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-6 md:p-10 bg-slate-950/80 border-t-2 border-slate-800/40 flex gap-5">
                    <input type="text" value={logInput} onChange={(e) => setLogInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addLog()} placeholder="Transmit Status Updates..." className="flex-1 bg-slate-950 border-2 border-slate-800 rounded-[2rem] px-8 py-6 text-base font-bold outline-none focus:ring-4 focus:ring-blue-500/20 text-white transition-all placeholder:text-slate-800 shadow-inner" />
                    <button onClick={addLog} className="bg-blue-600 hover:bg-blue-500 px-10 rounded-[2rem] shadow-[0_0_30px_rgba(37,99,235,0.3)] transition-all active:scale-90"><Icons.Send /></button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-10 grayscale">
                <div className="w-40 h-40 mb-12 bg-slate-900 rounded-[4rem] flex items-center justify-center border-2 border-slate-800 shadow-3xl"><Icons.Police /></div>
                <div className="text-3xl font-black uppercase tracking-[0.8em] text-white">Monitoring HQ...</div>
              </div>
            )}
          </div>
        </main>
      </div>

      {isMobileMode && (
        <nav className="h-20 bg-slate-950 border-t border-slate-900 grid grid-cols-3 shrink-0 z-30">
          <button onClick={() => setMobileTab('UNITS')} className={`flex flex-col items-center justify-center gap-2 ${mobileTab === 'UNITS' ? 'text-blue-400 font-black scale-110' : 'text-slate-700'}`}><Icons.Police /><span className="text-[9px] font-black uppercase">Roster</span></button>
          <button onClick={() => setMobileTab('INCIDENTS')} className={`flex flex-col items-center justify-center gap-2 ${mobileTab === 'INCIDENTS' ? 'text-blue-400 font-black scale-110' : 'text-slate-700'}`}><Icons.AlertCircle /><span className="text-[9px] font-black uppercase">Queue</span></button>
          <button onClick={() => setMobileTab('ACTIVE')} className={`flex flex-col items-center justify-center gap-2 ${mobileTab === 'ACTIVE' ? 'text-blue-400 font-black scale-110' : 'text-slate-700'}`}><Icons.Plus /><span className="text-[9px] font-black uppercase">Detail</span></button>
        </nav>
      )}

      {isCreatingCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/98 backdrop-blur-xl p-6 animate-in fade-in duration-300"><NewCallForm onCreate={createIncident} onCancel={() => setIsCreatingCall(false)} /></div>
      )}

      <footer className="h-12 bg-slate-950 border-t border-slate-900 flex items-center px-8 md:px-12 justify-between shrink-0 text-[10px] font-mono tracking-widest text-slate-800 uppercase font-black z-20">
        <div className="flex gap-12 items-center">
          <div className="flex items-center gap-3">NET_LINK: <span className="text-emerald-500 shadow-[0_0_10px_#10b98133]">{roomId}</span></div>
          <div className="hidden xs:block text-slate-700">STATUS: {isDispatch ? 'DISPATCH_CONNECTED' : 'FIELD_LINKED'}</div>
        </div>
        <div className="italic hidden sm:block text-slate-700 opacity-50">NEXUS CAD // SYNC_REPAIRED // V2.6_STABLE</div>
      </footer>
    </div>
  );
};

const NewCallForm: React.FC<{ onCreate: (type: string, loc: string, p: Priority) => void, onCancel: () => void }> = ({ onCreate, onCancel }) => {
  const [type, setType] = useState(CALL_TYPES[0]);
  const [loc, setLoc] = useState('');
  const [p, setP] = useState<Priority>(Priority.MEDIUM);
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[4rem] p-10 md:p-16 w-full max-w-3xl space-y-10 shadow-[0_0_100px_rgba(0,0,0,0.8)]">
      <h3 className="text-3xl font-black uppercase text-center tracking-widest text-white italic">Create Incident</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
        <div className="space-y-4">
          <label className="text-[11px] font-black text-slate-500 uppercase px-4">Broadcast Call Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full bg-slate-950 border-2 border-slate-800 rounded-3xl p-6 font-black text-white outline-none appearance-none cursor-pointer hover:border-blue-500 transition-colors shadow-inner">
            {CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-4">
          <label className="text-[11px] font-black text-slate-500 uppercase px-4">Tactical Priority</label>
          <div className="grid grid-cols-2 gap-3">
            {Object.values(Priority).map(priority => (
              <button key={priority} onClick={() => setP(priority)} className={`py-5 rounded-2xl border-2 text-[10px] font-black uppercase transition-all ${p === priority ? 'bg-blue-600 border-blue-400 text-white shadow-xl' : 'bg-slate-950 border-slate-800 text-slate-700 hover:text-slate-500'}`}>{priority}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-4">
        <label className="text-[11px] font-black text-slate-500 uppercase px-4">Target Location / Postal</label>
        <input type="text" placeholder="STREET / POSTAL / POI" value={loc} onChange={(e) => setLoc(e.target.value)} list="loc-suggestions" className="w-full bg-slate-950 border-2 border-slate-800 rounded-3xl p-6 font-black outline-none focus:ring-4 focus:ring-blue-500/20 text-white placeholder:text-slate-900 shadow-inner" />
        <datalist id="loc-suggestions">{ERLC_LOCATIONS.map(l => <option key={l} value={l} />)}</datalist>
      </div>
      <div className="flex gap-6 pt-6">
        <button onClick={onCancel} className="flex-1 font-black text-xs text-slate-600 uppercase tracking-[0.3em] hover:text-white transition-colors">Abort</button>
        <button onClick={() => onCreate(type, loc, p)} className="flex-[4] bg-blue-600 hover:bg-blue-500 py-7 rounded-[2.5rem] font-black uppercase tracking-[0.4em] shadow-2xl active:scale-95 transition-all text-sm text-white">Broadcast Call</button>
      </div>
    </div>
  );
};

export default App;
