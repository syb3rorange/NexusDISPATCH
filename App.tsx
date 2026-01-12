
import React, { useState, useEffect, useMemo } from 'react';
import { Unit, Incident, UnitStatus, UnitType, Priority, IncidentLog, UserSession } from './types';
import { CALL_TYPES, STATUS_COLORS, PRIORITY_COLORS, Icons, ERLC_LOCATIONS } from './constants';

const STORAGE_KEY_UNITS = 'nexus_cad_data_units_'; // Suffix with roomId
const STORAGE_KEY_INCIDENTS = 'nexus_cad_data_incidents_'; // Suffix with roomId
const STORAGE_KEY_SESSION = 'nexus_cad_auth_session';
const STORAGE_KEY_ROOM_ID = 'nexus_cad_active_room';

const App: React.FC = () => {
  // 1. Core State
  const [session, setSession] = useState<UserSession | null>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_SESSION);
    return saved ? JSON.parse(saved) : null;
  });

  const [roomId, setRoomId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ROOM_ID);
  });

  // CAD Data State (Refreshed based on Room ID)
  const [units, setUnits] = useState<Unit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);

  // UI State
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [logInput, setLogInput] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Mobile UI Logic
  const [isMobileMode, setIsMobileMode] = useState(window.innerWidth < 1024);
  const [mobileTab, setMobileTab] = useState<'UNITS' | 'INCIDENTS' | 'ACTIVE'>('INCIDENTS');

  // Login/Onboarding Form State
  const [loginRole, setLoginRole] = useState<'DISPATCH' | 'POLICE' | 'FIRE' | null>(null);
  const [loginName, setLoginName] = useState(''); 
  const [robloxName, setRobloxName] = useState('');
  const [joinCodeInput, setJoinCodeInput] = useState('');

  // 2. Lifecycle & Persistence
  useEffect(() => {
    const handleResize = () => setIsMobileMode(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load Room Data when Room ID changes
  useEffect(() => {
    if (roomId) {
      const savedUnits = localStorage.getItem(STORAGE_KEY_UNITS + roomId);
      const savedIncidents = localStorage.getItem(STORAGE_KEY_INCIDENTS + roomId);
      setUnits(savedUnits ? JSON.parse(savedUnits) : []);
      setIncidents(savedIncidents ? JSON.parse(savedIncidents) : []);
      localStorage.setItem(STORAGE_KEY_ROOM_ID, roomId);
    } else {
      localStorage.removeItem(STORAGE_KEY_ROOM_ID);
      setUnits([]);
      setIncidents([]);
    }
  }, [roomId]);

  // Sync Room Data to Storage
  useEffect(() => {
    if (roomId) {
      localStorage.setItem(STORAGE_KEY_UNITS + roomId, JSON.stringify(units));
      localStorage.setItem(STORAGE_KEY_INCIDENTS + roomId, JSON.stringify(incidents));
    }
  }, [units, incidents, roomId]);

  // Save Session
  useEffect(() => {
    if (session) {
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    } else {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    }
  }, [session]);

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
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const handleLogin = () => {
    if (!loginName || !loginRole) return;
    if (loginRole !== 'DISPATCH' && !robloxName) return;

    const callsign = loginName.toUpperCase();
    const rbx = robloxName.trim();
    
    if (loginRole === 'DISPATCH') {
      setSession({ role: 'DISPATCH', username: callsign });
    } else {
      const type = loginRole === 'POLICE' ? UnitType.POLICE : UnitType.FIRE;
      setSession({ role: 'UNIT', callsign, robloxUsername: rbx, unitType: type });
    }
  };

  const createServer = () => {
    // Only dispatch can create servers
    if (session?.role !== 'DISPATCH') return;

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    setRoomId(code);
    
    // Reset data for the new room
    setUnits([]);
    setIncidents([]);
  };

  const joinServer = () => {
    if (!joinCodeInput) return;
    const code = joinCodeInput.toUpperCase();
    setRoomId(code);

    // Register unit in the joined server
    if (session?.role === 'UNIT' && session.callsign) {
      // Small delay to allow the useEffect to load existing data first 
      // is not needed here because setUnits in joinServer will be overridden by the load Room Data useEffect 
      // if not careful. Instead, we rely on the state being loaded and then appending.
      setTimeout(() => {
        setUnits(prev => {
          if (prev.find(u => u.name === session.callsign)) return prev;
          const newUnit: Unit = {
            id: `U-${Date.now()}`,
            name: session.callsign!,
            type: session.unitType!,
            status: UnitStatus.AVAILABLE,
            robloxUser: session.robloxUsername!,
            lastUpdated: new Date().toISOString(),
          };
          return [...prev, newUnit];
        });
      }, 50);
    }
  };

  const deleteServer = () => {
    if (!roomId) return;
    if (confirm("Are you sure you want to delete this server? All data will be wiped.")) {
      localStorage.removeItem(STORAGE_KEY_UNITS + roomId);
      localStorage.removeItem(STORAGE_KEY_INCIDENTS + roomId);
      setRoomId(null);
    }
  };

  const handleSignOut = () => {
    setSession(null);
    setRoomId(null);
    setLoginRole(null);
    setLoginName('');
    setRobloxName('');
  };

  const updateStatus = (status: UnitStatus) => {
    if (!session?.callsign) return;
    setUnits(prev => prev.map(u => 
      u.name === session.callsign ? { ...u, status, lastUpdated: new Date().toISOString() } : u
    ));
  };

  const assignUnitToCall = (unitName: string, incidentId: string) => {
    setIncidents(prev => prev.map(inc => {
      if (inc.id === incidentId) {
        let assigned: string[] = [];
        try { assigned = JSON.parse(inc.assignedUnits); } catch { assigned = []; }
        if (!assigned.includes(unitName)) {
          assigned.push(unitName);
        }
        return { ...inc, assignedUnits: JSON.stringify(assigned) };
      }
      return inc;
    }));
  };

  const unassignUnitFromCall = (unitName: string, incidentId: string) => {
    setIncidents(prev => prev.map(inc => {
      if (inc.id === incidentId) {
        let assigned: string[] = [];
        try { assigned = JSON.parse(inc.assignedUnits); } catch { assigned = []; }
        assigned = assigned.filter(name => name !== unitName);
        return { ...inc, assignedUnits: JSON.stringify(assigned) };
      }
      return inc;
    }));
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
      logs: JSON.stringify([{
        id: '1',
        timestamp: new Date().toLocaleTimeString(),
        sender: 'SYSTEM',
        message: 'Call Initialized'
      }]),
      startTime: new Date().toISOString(),
    };
    setIncidents(prev => [...prev, newInc]);
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
    setIncidents(prev => prev.map(inc => {
      if (inc.id === activeIncidentId) {
        const logs = JSON.parse(inc.logs);
        return { ...inc, logs: JSON.stringify([...logs, log]) };
      }
      return inc;
    }));
    setLogInput('');
  };

  const closeIncident = () => {
    if (!activeIncidentId) return;
    setIncidents(prev => prev.map(inc => 
      inc.id === activeIncidentId ? { ...inc, status: 'CLOSED' } : inc
    ));
    setActiveIncidentId(null);
    if (isMobileMode) setMobileTab('INCIDENTS');
  };

  // 4. Render Logic

  // Screen 1: Login
  if (!session) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-8 md:p-10 rounded-[2rem] w-full max-w-lg shadow-2xl">
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
                  <input 
                    type="text" 
                    placeholder="Roblox Username"
                    value={robloxName}
                    onChange={(e) => setRobloxName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                  />
                )}
                <input 
                  type="text" 
                  placeholder={loginRole === 'DISPATCH' ? "Operator ID" : "Callsign (e.g. 1A-10)"}
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-bold text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                />
                <button 
                  onClick={handleLogin}
                  className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all"
                >
                  Confirm Identity
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Screen 2: Session/Room Picker
  if (!roomId) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-10 rounded-[2.5rem] w-full max-w-lg shadow-2xl text-center">
          <h2 className="text-2xl font-black uppercase tracking-widest mb-2">Initialize Session</h2>
          <p className="text-slate-500 text-xs mb-10 font-mono uppercase">Role: {session.role} // ID: {session.callsign || session.username}</p>
          
          <div className="space-y-8">
            <div className="space-y-4">
              <input 
                type="text" 
                placeholder="Enter 6-Digit Code"
                value={joinCodeInput}
                onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 text-center text-3xl font-black tracking-[0.5em] outline-none focus:ring-2 focus:ring-blue-500 transition-all text-white placeholder:text-slate-800"
              />
              <button 
                onClick={joinServer}
                className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl transition-all"
              >
                Join Active Session
              </button>
            </div>

            {session.role === 'DISPATCH' && (
              <>
                <div className="flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-slate-800"></div>
                  <span className="text-[10px] font-black text-slate-700 uppercase">OR</span>
                  <div className="flex-1 h-px bg-slate-800"></div>
                </div>

                <button 
                  onClick={createServer}
                  className="w-full bg-slate-800 hover:bg-slate-700 py-5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all border border-slate-700"
                >
                  Start New Server
                </button>
              </>
            )}

            <button onClick={handleSignOut} className="text-[10px] font-black uppercase text-slate-600 hover:text-red-500 mt-6 transition-colors">Sign Out</button>
          </div>
        </div>
      </div>
    );
  }

  // Screen 3: Main CAD
  const isDispatch = session.role === 'DISPATCH';
  const isFire = session.unitType === UnitType.FIRE;
  const isPolice = session.unitType === UnitType.POLICE;
  const themeColor = isFire ? 'text-red-500' : isPolice ? 'text-blue-500' : 'text-emerald-400';
  const themeBg = isFire ? 'bg-red-600' : isPolice ? 'bg-blue-600' : 'bg-emerald-600';

  return (
    <div className="flex flex-col h-screen bg-[#020617] text-slate-100 font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 shrink-0 bg-slate-900/80 border-b border-slate-800 flex items-center justify-between px-4 md:px-8 backdrop-blur-xl z-30">
        <div className="flex items-center gap-3 md:gap-4">
          <div className={`${themeBg} p-2 rounded-xl shadow-lg`}><Icons.Police /></div>
          <h1 className="text-lg md:text-xl font-black uppercase tracking-tighter hidden xs:block">NEXUS<span className={themeColor}>{session.role === 'DISPATCH' ? 'HQ' : session.unitType}</span></h1>
          <div className="h-6 w-px bg-slate-800 mx-1 md:mx-2"></div>
          <div className="text-[9px] md:text-[10px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-2">
            <span className="font-bold text-white">{session.callsign || session.username}</span>
            <span className="text-emerald-500 font-bold hidden sm:block">CODE: {roomId}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={handleManualRefresh}
            className={`p-2 rounded-lg border border-slate-800 hover:border-slate-600 transition-all ${isRefreshing ? 'animate-spin text-blue-500' : 'text-slate-500'}`}
          >
            <Icons.Refresh />
          </button>
          {isDispatch && (
            <>
              <button onClick={() => setIsCreatingCall(true)} className="bg-blue-600 hover:bg-blue-500 px-4 md:px-6 py-2 rounded-xl font-black text-[9px] md:text-[10px] uppercase tracking-widest shadow-lg transition-all">
                New Call
              </button>
              <button onClick={deleteServer} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-all" title="Wipe Server">
                <Icons.Trash />
              </button>
            </>
          )}
          <button onClick={() => setRoomId(null)} className="text-[9px] md:text-[10px] font-black uppercase text-slate-500 hover:text-white px-2">Leave</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <aside className={`${isMobileMode ? (mobileTab === 'UNITS' ? 'flex w-full' : 'hidden') : 'w-80 flex'} border-r border-slate-800/60 bg-slate-950/40 flex-col shrink-0 overflow-y-auto custom-scrollbar-v z-10`}>
          <div className="p-6 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-[#020617]/90 backdrop-blur-md z-10">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Personnel Status</h2>
            <div className={`w-2 h-2 rounded-full animate-pulse ${myUnit?.status === UnitStatus.OUT_OF_SERVICE ? 'bg-red-500' : 'bg-emerald-500'}`}></div>
          </div>
          
          <div className="p-4 space-y-6">
            {!isDispatch && (
              <div className="space-y-2">
                <h3 className="text-[9px] font-black text-slate-700 uppercase px-2 tracking-widest">Duty Status</h3>
                <div className="grid grid-cols-1 gap-1.5">
                  {Object.values(UnitStatus).map(s => (
                    <button 
                      key={s} 
                      onClick={() => updateStatus(s)}
                      className={`w-full p-4 rounded-xl border font-black text-[10px] uppercase tracking-widest transition-all text-left flex justify-between items-center ${myUnit?.status === s ? 'bg-blue-600 border-blue-400 text-white shadow-lg scale-[1.02]' : 'bg-slate-900 border-slate-800 text-slate-500 hover:bg-slate-800'}`}
                    >
                      {s.replace(/_/g, ' ')}
                      {myUnit?.status === s && <div className="w-1.5 h-1.5 rounded-full bg-white"></div>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {[UnitType.POLICE, UnitType.FIRE, UnitType.EMS].map(type => (
              <div key={type} className="space-y-2">
                <h3 className="text-[9px] font-black text-slate-700 uppercase px-2 tracking-widest">{type} UNITS</h3>
                {units.filter(u => u.type === type).map(unit => {
                  const statusColors = STATUS_COLORS[unit.status] || '';
                  const isAssigned = assignedUnitsToActive.some(au => au.name === unit.name);
                  
                  return (
                    <div key={unit.id} className={`p-4 rounded-2xl bg-slate-900/40 border ${statusColors.split(' ')[2]} flex flex-col gap-2 relative group`}>
                      <div className="flex justify-between items-start">
                        <div className="flex flex-col">
                          <span className="font-bold text-xs">{unit.name}</span>
                          <span className="text-[8px] text-slate-500 italic uppercase">@{unit.robloxUser}</span>
                          <div className={`mt-1 inline-flex px-2 py-0.5 rounded text-[8px] font-black uppercase ${statusColors.split(' ')[0]} ${statusColors.split(' ')[1]}`}>
                            {unit.status.replace(/_/g, ' ')}
                          </div>
                        </div>
                        {isDispatch && (
                          <button onClick={() => setUnits(prev => prev.filter(u => u.id !== unit.id))} className="opacity-0 group-hover:opacity-100 p-2 text-slate-600 hover:text-red-500 transition-all"><Icons.Trash /></button>
                        )}
                      </div>
                      
                      {activeIncident && (isDispatch || unit.name === session.callsign) && (
                        <button 
                          onClick={() => isAssigned ? unassignUnitFromCall(unit.name, activeIncident.id) : assignUnitToCall(unit.name, activeIncident.id)}
                          className={`w-full py-2 rounded-lg border text-[9px] font-black uppercase transition-all mt-1 ${isAssigned ? 'bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500' : 'bg-emerald-500/10 border-emerald-500/40 text-emerald-500 hover:bg-emerald-500 hover:text-white'}`}
                        >
                          {isAssigned ? 'Detach' : 'Attach Call'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content Area */}
        <main className={`${isMobileMode ? (mobileTab === 'UNITS' ? 'hidden' : 'flex') : 'flex'} flex-1 flex-col bg-[#020617] overflow-hidden`}>
          {/* Incident Queue - Updated to filter only active calls */}
          <div className={`${isMobileMode && mobileTab !== 'INCIDENTS' ? 'hidden' : 'flex'} h-44 shrink-0 border-b border-slate-800/60 p-6 flex gap-6 overflow-x-auto items-center custom-scrollbar`}>
            {incidents.filter(inc => inc.status === 'ACTIVE').map(incident => (
              <div 
                key={incident.id} 
                onClick={() => { setActiveIncidentId(incident.id); if (isMobileMode) setMobileTab('ACTIVE'); }}
                className={`w-80 shrink-0 p-6 rounded-[2rem] border cursor-pointer transition-all ${activeIncidentId === incident.id ? 'bg-blue-900/5 border-blue-500 shadow-xl scale-[1.02]' : 'bg-slate-900/30 border-slate-800/50 hover:bg-slate-900/40'}`}
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-mono font-bold text-slate-600">{incident.id}</span>
                  <span className={`text-[10px] uppercase font-black tracking-widest ${PRIORITY_COLORS[incident.priority]}`}>
                    {incident.priority}
                  </span>
                </div>
                <div className="font-black text-sm truncate uppercase tracking-wide">{incident.callType}</div>
                <div className="text-[11px] text-slate-500 truncate italic">LOC: {incident.location}</div>
                <div className="mt-2 flex gap-1 overflow-hidden">
                   {JSON.parse(incident.assignedUnits).length > 0 ? (
                     JSON.parse(incident.assignedUnits).map((u: string) => <span key={u} className="px-1.5 py-0.5 bg-slate-800 text-[7px] font-black rounded text-slate-400">{u}</span>)
                   ) : <span className="text-[7px] font-black text-red-500 uppercase italic">UNASSIGNED</span>}
                </div>
              </div>
            ))}
            {incidents.filter(inc => inc.status === 'ACTIVE').length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center opacity-10 uppercase font-black tracking-[0.5em] text-[10px]">No Active Incidents</div>
            )}
          </div>

          {/* Active Detail */}
          <div className={`${isMobileMode && mobileTab !== 'ACTIVE' ? 'hidden' : 'flex'} flex-1 flex-col overflow-hidden relative`}>
            {activeIncident ? (
              <div className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
                  <div className="space-y-1">
                    <h2 className="text-2xl md:text-4xl font-black text-white uppercase tracking-tighter">{activeIncident.callType}</h2>
                    <div className="text-[10px] md:text-[11px] text-slate-500 uppercase tracking-[0.3em] font-black italic">POSTAL: {activeIncident.location}</div>
                  </div>
                  {isDispatch && (
                    <button onClick={closeIncident} className="w-full md:w-auto bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-8 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all border border-red-500/20 shadow-xl">
                      Close Incident
                    </button>
                  )}
                </div>

                <div className="flex-1 flex flex-col bg-slate-950/40 rounded-[2rem] md:rounded-[3rem] border border-slate-800/40 overflow-hidden shadow-3xl backdrop-blur-xl">
                  {/* Status Bar */}
                  <div className="px-6 py-4 bg-slate-900/30 border-b border-slate-800/50 flex items-center gap-3 overflow-x-auto no-scrollbar">
                    <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest whitespace-nowrap">RESPONSE:</span>
                    <div className="flex gap-2">
                      {assignedUnitsToActive.length > 0 ? assignedUnitsToActive.map(au => (
                        <div key={au.id} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${STATUS_COLORS[au.status].split(' ')[2]} bg-slate-950/80`}>
                           <div className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[au.status].split(' ')[0]}`}></div>
                           <span className="text-[10px] font-black text-white">{au.name}</span>
                        </div>
                      )) : <span className="text-[9px] font-black text-red-500/50 uppercase animate-pulse">Pending...</span>}
                    </div>
                  </div>

                  {/* Logs */}
                  <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-4 md:space-y-6 font-mono text-xs md:text-sm custom-scrollbar-v">
                    {JSON.parse(activeIncident.logs).map((log: IncidentLog, idx: number) => (
                      <div key={idx} className="flex gap-4 md:gap-8 group">
                        <span className="text-slate-800 font-black text-[9px] md:text-[10px] mt-1 shrink-0">[{log.timestamp}]</span>
                        <div className="flex-1">
                          <span className={`font-black mr-2 md:mr-4 uppercase tracking-widest ${log.sender.includes('DISPATCH') ? 'text-blue-500' : 'text-emerald-500'}`}>{log.sender}:</span>
                          <span className="text-slate-400 leading-relaxed">{log.message}</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Input */}
                  <div className="p-4 md:p-8 bg-slate-950/60 border-t border-slate-800/40 flex gap-3 md:gap-5">
                    <input 
                      type="text" 
                      value={logInput} 
                      onChange={(e) => setLogInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addLog()}
                      placeholder="Transmission..." 
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-5 md:px-8 py-4 md:py-5 text-xs md:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 text-white transition-all"
                    />
                    <button onClick={addLog} className="bg-blue-600 hover:bg-blue-500 px-6 md:px-8 rounded-2xl shadow-xl transition-all active:scale-95"><Icons.Send /></button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-10">
                <div className="w-24 md:w-32 h-24 md:h-32 mb-8 bg-slate-900 rounded-[2.5rem] flex items-center justify-center border border-slate-800 shadow-2xl"><Icons.Police /></div>
                <div className="text-2xl md:text-3xl font-black uppercase tracking-[0.4em] text-white text-center px-6 italic">Tactical Idle</div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Mobile Nav */}
      {isMobileMode && (
        <nav className="h-16 bg-slate-950 border-t border-slate-900 grid grid-cols-3 shrink-0 z-30">
          <button onClick={() => setMobileTab('UNITS')} className={`flex flex-col items-center justify-center gap-1 ${mobileTab === 'UNITS' ? themeColor : 'text-slate-700'}`}><Icons.Police /><span className="text-[8px] font-black uppercase">Units</span></button>
          <button onClick={() => setMobileTab('INCIDENTS')} className={`flex flex-col items-center justify-center gap-1 ${mobileTab === 'INCIDENTS' ? themeColor : 'text-slate-700'}`}><Icons.AlertCircle /><span className="text-[8px] font-black uppercase">Queue</span></button>
          <button onClick={() => setMobileTab('ACTIVE')} className={`flex flex-col items-center justify-center gap-1 ${mobileTab === 'ACTIVE' ? themeColor : 'text-slate-700'}`}><Icons.Plus /><span className="text-[8px] font-black uppercase">Detail</span></button>
        </nav>
      )}

      {/* Modal - New Call */}
      {isCreatingCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/95 backdrop-blur-md p-4">
          <NewCallForm onCreate={createIncident} onCancel={() => setIsCreatingCall(false)} />
        </div>
      )}

      {/* Footer */}
      <footer className="h-10 bg-slate-950 border-t border-slate-900 flex items-center px-4 md:px-8 justify-between shrink-0 text-[9px] md:text-[10px] font-mono tracking-widest text-slate-700 uppercase font-black z-20">
        <div className="flex gap-4 md:gap-10 items-center">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
            LINK: {roomId}
          </div>
          <div className="text-slate-800 hidden xs:block">ROLE: {session.role} // V2.1</div>
        </div>
        <div className="text-slate-800 italic hidden sm:block">NEXUS CAD // LOCAL_PERSISTENCE</div>
      </footer>
    </div>
  );
};

// Subcomponent for Cleaner Modals
const NewCallForm: React.FC<{ onCreate: (type: string, loc: string, p: Priority) => void, onCancel: () => void }> = ({ onCreate, onCancel }) => {
  const [type, setType] = useState(CALL_TYPES[0]);
  const [loc, setLoc] = useState('');
  const [p, setP] = useState<Priority>(Priority.MEDIUM);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 md:p-12 w-full max-w-2xl space-y-6 animate-in zoom-in-95 shadow-2xl">
      <h3 className="text-xl font-black uppercase text-center tracking-widest">Broadcast Emergency</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Call Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-black text-white outline-none appearance-none">
            {CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-3">
          <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Priority</label>
          <div className="grid grid-cols-2 gap-2">
            {Object.values(Priority).map(priority => (
              <button key={priority} onClick={() => setP(priority)} className={`py-4 rounded-xl border text-[9px] font-black uppercase transition-all ${p === priority ? 'bg-blue-600 border-blue-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-700'}`}>{priority}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="space-y-3">
        <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Location / Postal</label>
        <input type="text" placeholder="STREET / POSTAL / POI" value={loc} onChange={(e) => setLoc(e.target.value)} list="loc-suggestions" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 font-black outline-none focus:ring-2 focus:ring-blue-500 text-white shadow-inner" />
        <datalist id="loc-suggestions">{ERLC_LOCATIONS.map(l => <option key={l} value={l} />)}</datalist>
      </div>
      <div className="flex gap-4 pt-4">
        <button onClick={onCancel} className="flex-1 font-black text-[10px] text-slate-500 uppercase tracking-widest">Discard</button>
        <button onClick={() => onCreate(type, loc, p)} className="flex-[3] bg-blue-600 hover:bg-blue-500 py-5 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all text-xs">Initialize Response</button>
      </div>
    </div>
  );
};

export default App;
