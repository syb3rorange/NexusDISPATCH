
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Gun from 'gun';
import { Unit, Incident, UnitStatus, UnitType, Priority, IncidentLog, UserSession } from './types';
import { DEPARTMENT_CALL_TYPES, STATUS_COLORS, PRIORITY_COLORS, Icons, ERLC_LOCATIONS } from './constants';

const gun = Gun([
  'https://gun-manhattan.herokuapp.com/gun', 
  'https://relay.peer.ooo/gun',
  'https://gun-ams1.marda.io/gun'
]);

const STORAGE_KEY_PROFILE = 'nexus_cad_profile_v7';
const STORAGE_KEY_DISPATCH_AUTH = 'nexus_cad_dispatch_v7';
const STORAGE_KEY_SESSION_TYPE = 'nexus_cad_session_type_v7';
const STORAGE_KEY_AUTO_REFRESH = 'nexus_cad_auto_refresh';
const STORAGE_KEY_REFRESH_INTERVAL = 'nexus_cad_refresh_interval';
const STORAGE_KEY_ACTIVE_INCIDENT = 'nexus_cad_active_incident_id';
const STORAGE_KEY_MOBILE_TAB = 'nexus_cad_mobile_tab';
const STORAGE_KEY_VIEW_MODE = 'nexus_cad_view_mode';
const STORAGE_KEY_DRAFT_ONBOARDING = 'nexus_cad_draft_onboarding';

const App: React.FC = () => {
  const [roomId] = useState<string>(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash) return hash;
    const newId = Math.random().toString(36).substr(2, 9);
    window.location.hash = newId;
    return newId;
  });

  const [session, setSession] = useState<UserSession | null>(null);
  const [dispatchPass, setDispatchPass] = useState('');
  const [hasPersistentDispatch, setHasPersistentDispatch] = useState(false);
  
  const [onboardingData, setOnboardingData] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_DRAFT_ONBOARDING);
    return saved ? JSON.parse(saved) : { roblox: '', callsign: '', type: UnitType.POLICE };
  });
  
  const [unitsMap, setUnitsMap] = useState<Record<string, Unit>>({});
  const [incidentsMap, setIncidentsMap] = useState<Record<string, Incident>>({});
  
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(() => {
    return localStorage.getItem(STORAGE_KEY_ACTIVE_INCIDENT);
  });
  const [mobileTab, setMobileTab] = useState<'UNITS' | 'INCIDENTS' | 'ACTIVE'>(() => {
    return (localStorage.getItem(STORAGE_KEY_MOBILE_TAB) as any) || 'INCIDENTS';
  });

  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [isAddingUnit, setIsAddingUnit] = useState(false);
  const [newUnitData, setNewUnitData] = useState({ callsign: '', type: UnitType.POLICE });
  
  const [newCallDept, setNewCallDept] = useState<UnitType>(UnitType.POLICE);
  const [newCallType, setNewCallType] = useState(DEPARTMENT_CALL_TYPES[UnitType.POLICE][0]);
  const [newLocation, setNewLocation] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM);

  const [logInput, setLogInput] = useState('');
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [viewMode, setViewMode] = useState<'AUTO' | 'MOBILE' | 'DESKTOP'>(() => {
    return (localStorage.getItem(STORAGE_KEY_VIEW_MODE) as any) || 'AUTO';
  });
  const [screenWidth, setScreenWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => setScreenWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const effectiveIsMobile = useMemo(() => {
    if (viewMode === 'MOBILE') return true;
    if (viewMode === 'DESKTOP') return false;
    return screenWidth < 768; 
  }, [viewMode, screenWidth]);

  // --- REFRESH ENGINE LOGIC ---
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => {
    // Default to true as per request: turn back on if was off
    return true; 
  });
  
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_REFRESH_INTERVAL);
    return saved ? parseInt(saved, 10) : 20;
  });

  // Dynamic interval: 300s (5m) for login side, user-defined (default 20s) for app side
  const currentInterval = useMemo(() => {
    if (!session) return 300; 
    return refreshInterval;   
  }, [session, refreshInterval]);

  const [timeLeft, setTimeLeft] = useState<number>(currentInterval);
  const [showRefreshSettings, setShowRefreshSettings] = useState(false);

  // Manual refresh with restored spin animation
  const handleManualRefresh = useCallback(() => {
    setIsRefreshing(true);
    setLastSyncTime(Date.now());
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }, []);

  // Pause logic: pause if looking at a call, creating a call, or in settings
  const isInputtingAction = useMemo(() => {
    return activeIncidentId !== null || isCreatingCall || isAddingUnit || showRefreshSettings;
  }, [activeIncidentId, isCreatingCall, isAddingUnit, showRefreshSettings]);

  useEffect(() => {
    let timer: number;
    if (autoRefreshEnabled && !isInputtingAction) {
      timer = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            handleManualRefresh();
            return currentInterval;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [autoRefreshEnabled, currentInterval, handleManualRefresh, isInputtingAction]);

  // Reset timer when interval or session context changes
  useEffect(() => {
    setTimeLeft(currentInterval);
  }, [session, currentInterval]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_AUTO_REFRESH, autoRefreshEnabled.toString());
  }, [autoRefreshEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_REFRESH_INTERVAL, refreshInterval.toString());
  }, [refreshInterval]);
  // --- END REFRESH ENGINE LOGIC ---

  useEffect(() => {
    const profile = localStorage.getItem(STORAGE_KEY_PROFILE);
    const dispatchAuth = localStorage.getItem(STORAGE_KEY_DISPATCH_AUTH);
    const sessionType = localStorage.getItem(STORAGE_KEY_SESSION_TYPE);
    
    if (dispatchAuth === '10-4') setHasPersistentDispatch(true);

    if (sessionType === 'DISPATCH' && dispatchAuth === '10-4') {
      setSession({ role: 'DISPATCH' });
    } else if (sessionType === 'UNIT' && profile) {
      const data = JSON.parse(profile);
      setSession({ role: 'UNIT', username: data.roblox, callsign: data.callsign.toUpperCase(), unitType: data.type });
    }
  }, []);

  useEffect(() => {
    const root = gun.get('nexus_cad_v7_final').get(roomId);
    root.get('units').map().on((data: any, id: string) => {
      setUnitsMap(prev => {
        if (!data) {
          const newState = { ...prev };
          delete newState[id];
          return newState;
        }
        return { ...prev, [id]: data };
      });
    });
    root.get('incidents').map().on((data: any, id: string) => {
      setIncidentsMap(prev => {
        if (!data) {
          const newState = { ...prev };
          delete newState[id];
          return newState;
        }
        return { ...prev, [id]: data };
      });
    });
  }, [roomId]);

  const performJoin = useCallback((data: {roblox: string, callsign: string, type: UnitType}) => {
    const upperCallsign = data.callsign.toUpperCase();
    const unitData: Unit = {
      id: upperCallsign,
      name: upperCallsign,
      type: data.type,
      status: UnitStatus.AVAILABLE,
      robloxUser: data.roblox,
      lastUpdated: new Date().toISOString()
    };
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(upperCallsign).put(unitData);
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEY_SESSION_TYPE, 'UNIT');
    setSession({ role: 'UNIT', username: data.roblox, callsign: upperCallsign, unitType: data.type });
  }, [roomId]);

  const handleManualAddUnit = useCallback(() => {
    if (!newUnitData.callsign) return;
    const upperCallsign = newUnitData.callsign.toUpperCase();
    const unitData: Unit = {
      id: upperCallsign,
      name: upperCallsign,
      type: newUnitData.type,
      status: UnitStatus.AVAILABLE,
      robloxUser: 'MANUAL_ENTRY',
      lastUpdated: new Date().toISOString()
    };
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(upperCallsign).put(unitData);
    setIsAddingUnit(false);
    setNewUnitData({ callsign: '', type: UnitType.POLICE });
  }, [roomId, newUnitData]);

  const createIncident = useCallback(() => {
    const id = `CAD-${Math.floor(1000 + Math.random() * 9000)}`;
    const incident: Incident = {
      id,
      callType: newCallType,
      location: newLocation || 'UNKNOWN',
      priority: newPriority,
      status: 'ACTIVE',
      assignedUnits: JSON.stringify([]),
      logs: JSON.stringify([{
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        sender: 'SYSTEM',
        message: `Incident created: ${newCallType} at ${newLocation || 'UNKNOWN'}`
      }]),
      startTime: new Date().toISOString()
    };
    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(id).put(incident);
    setIsCreatingCall(false);
    setActiveIncidentId(id);
    if (effectiveIsMobile) setMobileTab('ACTIVE');
  }, [roomId, newCallType, newLocation, newPriority, effectiveIsMobile]);

  const handleSignOut = useCallback(() => {
    if (session?.callsign) {
       gun.get('nexus_cad_v7_final').get(roomId).get('units').get(session.callsign).get('status').put(UnitStatus.OUT_OF_SERVICE);
    }
    localStorage.removeItem(STORAGE_KEY_SESSION_TYPE);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_INCIDENT);
    setSession(null);
    setAutoRefreshEnabled(true); // Re-enable refresh system on logout
  }, [session, roomId]);

  const handleUpdateUnitStatus = (unitId: string, status: UnitStatus) => {
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(unitId).get('status').put(status);
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(unitId).get('lastUpdated').put(new Date().toISOString());
  };

  const handleAddLog = async () => {
    if (!logInput || !activeIncidentId) return;
    const currentIncident = incidentsMap[activeIncidentId];
    if (currentIncident) {
      let logs = []; try { logs = JSON.parse(currentIncident.logs); } catch(e) {}
      const newLog: IncidentLog = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        sender: session?.role === 'DISPATCH' ? 'DISPATCH' : (session?.callsign || 'UNIT'),
        message: logInput
      };
      gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).get('logs').put(JSON.stringify([...logs, newLog]));
    }
    setLogInput('');
  };

  const handlePurgeIncident = () => {
    if (!activeIncidentId) return;
    let assigned = []; try { assigned = JSON.parse(incidentsMap[activeIncidentId].assignedUnits); } catch(e) {}
    assigned.forEach((uid: string) => handleUpdateUnitStatus(uid, UnitStatus.AVAILABLE));
    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).put(null);
    setActiveIncidentId(null);
    if (effectiveIsMobile) setMobileTab('INCIDENTS');
  };

  const units = useMemo(() => (Object.values(unitsMap) as Unit[]).sort((a,b) => a.id.localeCompare(b.id)), [unitsMap]);
  const incidents = useMemo(() => (Object.values(incidentsMap) as Incident[]).filter(i => i && i.status === 'ACTIVE'), [incidentsMap]);
  const groupedUnits = useMemo(() => {
    const field: Unit[] = [];
    const offDuty: Unit[] = [];
    units.forEach(u => {
        if (u.status === UnitStatus.OUT_OF_SERVICE) offDuty.push(u);
        else field.push(u);
    });
    return { field, offDuty };
  }, [units]);

  const renderUnitCard = (unit: Unit) => {
    const isAssigned = activeIncidentId && incidentsMap[activeIncidentId] && 
                       JSON.parse(incidentsMap[activeIncidentId].assignedUnits).includes(unit.id);
    const borderClass = unit.type === UnitType.POLICE ? 'border-blue-500/50' : 
                        unit.type === UnitType.FIRE ? 'border-red-500/50' : 'border-yellow-500/50';
    return (
      <div key={unit.id} className={`p-3 rounded-2xl border ${borderClass} bg-slate-900/40 backdrop-blur-sm ${isAssigned ? 'ring-2 ring-blue-500 ring-offset-1 ring-offset-slate-950' : ''}`}>
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-1.5">
              <span className={unit.type === UnitType.POLICE ? 'text-blue-400' : unit.type === UnitType.FIRE ? 'text-red-400' : 'text-yellow-400'}>
                {unit.type === UnitType.POLICE ? <Icons.Police /> : unit.type === UnitType.FIRE ? <Icons.Fire /> : <Icons.DOT />}
              </span>
              <span className="font-mono font-black text-xs">{unit.name}</span>
            </div>
            <span className={`text-[7px] px-1.5 py-0.5 rounded-md border font-bold ${STATUS_COLORS[unit.status]}`}>{unit.status}</span>
          </div>
          {(session?.role === 'DISPATCH' || unit.name === session?.callsign) && (
            <div className="grid grid-cols-5 gap-1 mb-2">
              {Object.values(UnitStatus).map(s => (
                <button key={s} onClick={() => handleUpdateUnitStatus(unit.id, s)} className={`text-[9px] py-1.5 rounded-lg border font-black transition-all active:scale-90 ${unit.status === s ? 'bg-slate-700 text-white' : 'bg-slate-950/40 text-slate-600 border-slate-800'}`}>{s.charAt(0)}</button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-[7px] font-mono text-slate-600 italic">
              <span className="truncate pr-2">Op: {unit.robloxUser}</span>
              {session?.role === 'DISPATCH' && <button onClick={() => confirm('Remove unit?') && gun.get('nexus_cad_v7_final').get(roomId).get('units').get(unit.id).put(null)} className="text-red-900 hover:text-red-500"><Icons.Trash /></button>}
          </div>
      </div>
    );
  };

  if (!session) {
    return (
      <div className="h-[100dvh] w-screen bg-[#020617] flex flex-col items-center justify-center p-4 text-slate-100 overflow-y-auto relative">
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-950/60 p-2 rounded-xl border border-slate-800 z-50">
           <div className={`w-2 h-2 rounded-full ${autoRefreshEnabled ? 'bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]' : 'bg-slate-700'}`}></div>
           <span className="text-[9px] font-black font-mono text-slate-500 uppercase tracking-widest">{autoRefreshEnabled ? `${timeLeft}S` : 'OFF'}</span>
        </div>
        
        <div className="w-full max-w-lg flex flex-col items-center py-10 space-y-8">
          <div className="bg-blue-600 p-4 rounded-3xl shadow-2xl border border-white/20"><Icons.Police /></div>
          <h1 className="text-4xl font-black tracking-widest uppercase text-center">NEXUS<span className="text-blue-500">CAD</span></h1>
          <div className="grid grid-cols-1 gap-6 w-full">
            <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2rem] flex flex-col">
              <h2 className="text-lg font-black mb-4 uppercase flex items-center gap-2"><Icons.Send /> Dispatch Access</h2>
              <input type="password" placeholder="Passcode (10-4)" value={dispatchPass} onChange={(e) => setDispatchPass(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 mb-4 font-bold outline-none focus:ring-1 focus:ring-blue-500 text-sm" />
              <button onClick={() => dispatchPass === '10-4' ? (localStorage.setItem(STORAGE_KEY_SESSION_TYPE, 'DISPATCH'), setSession({role:'DISPATCH'})) : alert('ERR')} className="w-full bg-blue-600 py-4 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Establish Comms</button>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 p-8 rounded-[2rem] flex flex-col">
              <h2 className="text-lg font-black mb-4 uppercase flex items-center gap-2"><Icons.Police /> Unit Node</h2>
              <div className="space-y-3 mb-4">
                <input type="text" placeholder="Roblox Name" value={onboardingData.roblox} onChange={(e) => setOnboardingData(p => ({...p, roblox: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-bold" />
                <input type="text" placeholder="Callsign" value={onboardingData.callsign} onChange={(e) => setOnboardingData(p => ({...p, callsign: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-mono uppercase" />
                <div className="grid grid-cols-3 gap-1">
                    {[UnitType.POLICE, UnitType.FIRE, UnitType.DOT].map(t => (
                        <button key={t} onClick={() => setOnboardingData(p => ({...p, type: t}))} className={`py-2 rounded-lg border text-[8px] font-black transition-all ${onboardingData.type === t ? 'bg-emerald-600 text-white' : 'bg-slate-950 text-slate-700 border-slate-800'}`}>{t}</button>
                    ))}
                </div>
              </div>
              <button onClick={() => (onboardingData.roblox && onboardingData.callsign) && performJoin(onboardingData)} className="w-full bg-emerald-600 py-4 rounded-xl font-black text-xs uppercase tracking-widest active:scale-95 transition-all">Connect Asset</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#020617] text-slate-100 overflow-hidden select-none">
      <header className="h-14 sm:h-16 shrink-0 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between px-3 sm:px-6 backdrop-blur-md z-30">
        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
          <div className="p-1.5 sm:p-2 bg-blue-600 rounded-xl border border-white/10 shrink-0">
            {session.unitType === UnitType.FIRE ? <Icons.Fire /> : session.unitType === UnitType.DOT ? <Icons.DOT /> : <Icons.Police />}
          </div>
          <h1 className="text-[10px] sm:text-base font-black uppercase tracking-tight truncate">
            Nexus <span className={session.role === 'DISPATCH' ? 'text-blue-500' : session.unitType === UnitType.FIRE ? 'text-red-500' : session.unitType === UnitType.DOT ? 'text-yellow-500' : 'text-blue-500'}>
              {session.role === 'DISPATCH' ? 'Dispatch' : session.unitType === UnitType.POLICE ? 'PD' : session.unitType === UnitType.FIRE ? 'Fire' : 'Dot'}
            </span>
          </h1>
        </div>
        
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <div className="flex items-center bg-slate-950/60 border border-slate-800 rounded-lg p-0.5">
            <button onClick={() => setViewMode(prev => prev === 'AUTO' ? 'MOBILE' : prev === 'MOBILE' ? 'DESKTOP' : 'AUTO')} className="p-1.5 rounded-md hover:bg-slate-800 transition-all">
                {viewMode === 'MOBILE' ? <Icons.Smartphone /> : viewMode === 'DESKTOP' ? <Icons.Monitor /> : <div className="relative"><Icons.Monitor /><div className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blue-500 rounded-full"></div></div>}
            </button>
            <div className="w-px h-4 bg-slate-800 mx-0.5"></div>
            <button onClick={() => setShowRefreshSettings(!showRefreshSettings)} className={`p-1.5 rounded-md transition-all ${showRefreshSettings ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500'}`}><Icons.Cpu /></button>
          </div>
          <button onClick={() => setIsCreatingCall(true)} className="bg-blue-600 py-2 px-3 sm:px-4 rounded-lg font-black text-[9px] sm:text-[10px] uppercase tracking-wider active:scale-95 transition-all">Broadcast</button>
          <button onClick={handleSignOut} className="text-[9px] font-black uppercase text-slate-500 hover:text-red-500 p-2 ml-1">LOGOUT</button>
        </div>
      </header>

      {showRefreshSettings && (
        <div className="fixed top-16 right-4 w-60 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl z-50 animate-in slide-in-from-top-4">
            <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500 mb-4">Sync Engine</h3>
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Auto Refresh</span>
                <button 
                  onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)} 
                  className={`w-10 h-5 rounded-full relative transition-all ${autoRefreshEnabled ? 'bg-blue-600' : 'bg-slate-800'}`}
                >
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${autoRefreshEnabled ? 'left-5.5' : 'left-0.5'}`}></div>
                </button>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-[10px] font-bold">
                  <span className="text-slate-500">Sync Interval</span>
                  <span className="text-blue-400">{refreshInterval}s</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="60" 
                  step="5" 
                  value={refreshInterval} 
                  onChange={(e)=>setRefreshInterval(parseInt(e.target.value))} 
                  className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600" 
                />
              </div>
              <button onClick={()=>setShowRefreshSettings(false)} className="w-full py-2 bg-slate-800 rounded-lg text-[9px] font-black uppercase hover:bg-slate-700 transition-all">Save & Close</button>
            </div>
        </div>
      )}
      
      <main className="flex-1 flex overflow-hidden">
        <aside className={`${effectiveIsMobile ? (mobileTab === 'UNITS' ? 'flex w-full' : 'hidden') : 'w-72 flex'} border-r border-slate-800 bg-slate-950/40 flex-col shrink-0 overflow-hidden`}>
          <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-900/20">
            <span className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Node Roster</span>
            {session.role === 'DISPATCH' && <button onClick={() => setIsAddingUnit(true)} className="text-slate-400 p-1 hover:text-white"><Icons.Plus /></button>}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-6 custom-scrollbar pb-24">
            {groupedUnits.field.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-[8px] font-black text-emerald-500/50 uppercase px-1">Operational Assets ({groupedUnits.field.length})</h4>
                    {groupedUnits.field.map(u => renderUnitCard(u))}
                </div>
            )}
            {groupedUnits.offDuty.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-[8px] font-black text-slate-700 uppercase px-1">Out of Service ({groupedUnits.offDuty.length})</h4>
                    {groupedUnits.offDuty.map(u => renderUnitCard(u))}
                </div>
            )}
          </div>
        </aside>

        <section className={`flex-1 flex flex-col bg-[#020617] relative ${effectiveIsMobile && mobileTab !== 'INCIDENTS' && mobileTab !== 'ACTIVE' ? 'hidden' : 'flex'} overflow-hidden`}>
          <div className={`h-32 sm:h-40 shrink-0 border-b border-slate-800 p-3 flex gap-3 overflow-x-auto items-center custom-scrollbar ${effectiveIsMobile && mobileTab !== 'INCIDENTS' ? 'hidden' : 'flex'}`}>
            {incidents.map(inc => (
              <div key={inc.id} onClick={() => { setActiveIncidentId(inc.id); if (effectiveIsMobile) setMobileTab('ACTIVE'); }} className={`w-60 sm:w-72 shrink-0 p-4 rounded-3xl border transition-all ${activeIncidentId === inc.id ? 'bg-blue-900/10 border-blue-500' : 'bg-slate-900/30 border-slate-800 hover:border-slate-600'}`}>
                <div className="flex justify-between items-start mb-2"><span className="text-[9px] font-mono font-bold text-slate-600">{inc.id}</span><span className={`text-[9px] font-black uppercase tracking-widest ${PRIORITY_COLORS[inc.priority]}`}>{inc.priority}</span></div>
                <div className="font-black text-[11px] uppercase truncate mb-1">{inc.callType}</div>
                <div className="text-[9px] text-slate-500 italic truncate">Loc: {inc.location}</div>
              </div>
            ))}
            {incidents.length === 0 && <div className="flex-1 flex items-center justify-center opacity-10 text-[9px] font-black uppercase tracking-[0.5em] italic text-center">Operational Silence</div>}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {activeIncidentId && incidentsMap[activeIncidentId] ? (
              <div className="flex-1 flex flex-col p-4 sm:p-6 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
                <div className="flex justify-between items-start mb-4 gap-4 shrink-0">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-xl sm:text-2xl font-black uppercase leading-tight truncate">{incidentsMap[activeIncidentId].callType}</h2>
                    <p className="text-[9px] font-black text-slate-500 italic truncate uppercase tracking-tighter">TARGET: {incidentsMap[activeIncidentId].location}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => (setActiveIncidentId(null), effectiveIsMobile && setMobileTab('INCIDENTS'))} className="p-2 bg-slate-800 rounded-xl border border-slate-700 active:scale-90 transition-all hover:bg-slate-700"><Icons.X /></button>
                    {session.role === 'DISPATCH' && <button onClick={handlePurgeIncident} className="p-2 bg-red-600/20 text-red-500 rounded-xl border border-red-500/20 active:scale-90 transition-all hover:bg-red-600 hover:text-white"><Icons.Trash /></button>}
                  </div>
                </div>
                <div className="flex-1 flex flex-col bg-slate-950/40 rounded-3xl border border-slate-800/40 overflow-hidden shadow-2xl">
                  <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[10px] sm:text-xs custom-scrollbar">
                    {(() => {
                      let logs = []; try { logs = JSON.parse(incidentsMap[activeIncidentId].logs); } catch(e) {}
                      return logs.map((l: any, i: number) => (
                        <div key={i} className="flex gap-2 animate-in fade-in slide-in-from-left-2"><span className="text-slate-800 font-bold shrink-0">[{l.timestamp}]</span><span className={`font-black uppercase tracking-tight ${l.sender.includes('DISPATCH') || l.sender === 'SYSTEM' ? 'text-blue-500' : 'text-emerald-500'}`}>{l.sender}:</span><span className="text-slate-400 break-words">{l.message}</span></div>
                      ));
                    })()}
                  </div>
                  <div className="p-2 sm:p-4 bg-slate-950/60 border-t border-slate-800/40 flex gap-2 shrink-0">
                    <input value={logInput} onChange={e=>setLogInput(e.target.value)} onKeyDown={e=>e.key==='Enter' && handleAddLog()} placeholder="Tactical report..." className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-1 focus:ring-blue-500 text-white" />
                    <button onClick={handleAddLog} className="bg-blue-600 p-3 rounded-xl active:scale-95 shadow-lg hover:bg-blue-500 transition-all"><Icons.Send /></button>
                  </div>
                </div>
              </div>
            ) : <div className="flex-1 flex flex-col items-center justify-center opacity-10 p-10 text-center"><Icons.Police /><p className="text-lg font-black uppercase mt-4 tracking-widest">System Standby</p></div>}
          </div>
        </section>
      </main>

      {effectiveIsMobile && (
        <nav className="h-16 bg-slate-900 border-t border-slate-800 flex items-center justify-around px-2 z-40 pb-safe shrink-0">
          <button onClick={() => setMobileTab('UNITS')} className={`flex flex-col items-center gap-1 transition-all ${mobileTab === 'UNITS' ? 'text-blue-400' : 'text-slate-600'}`}><Icons.Police /><span className="text-[8px] font-black uppercase">Units</span></button>
          <button onClick={() => setMobileTab('INCIDENTS')} className={`flex flex-col items-center gap-1 transition-all ${mobileTab === 'INCIDENTS' ? 'text-blue-400' : 'text-slate-600'}`}><Icons.Fire /><span className="text-[8px] font-black uppercase">Calls</span></button>
          <button onClick={() => activeIncidentId && setMobileTab('ACTIVE')} className={`flex flex-col items-center gap-1 transition-all ${mobileTab === 'ACTIVE' ? 'text-emerald-400' : 'text-slate-600'} ${!activeIncidentId ? 'opacity-20' : ''}`}><Icons.Send /><span className="text-[8px] font-black uppercase">Action</span></button>
        </nav>
      )}

      {isAddingUnit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 w-full max-w-sm space-y-6 animate-in zoom-in-95 shadow-3xl">
            <h2 className="text-lg font-black uppercase">Register Node</h2>
            <div className="space-y-4">
              <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-500">Callsign</label><input type="text" value={newUnitData.callsign} onChange={e=>setNewUnitData(p=>({...p, callsign: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-mono uppercase text-white outline-none focus:ring-1 focus:ring-blue-500" placeholder="1L-20" /></div>
              <div className="space-y-1"><label className="text-[9px] font-black uppercase text-slate-500">Type</label>
                <div className="grid grid-cols-3 gap-1">{[UnitType.POLICE, UnitType.FIRE, UnitType.DOT].map(t => (
                  <button key={t} onClick={() => setNewUnitData(p => ({...p, type: t}))} className={`py-2 rounded-lg border text-[8px] font-black transition-all ${newUnitData.type === t ? 'bg-blue-600 text-white border-blue-400' : 'bg-slate-950 text-slate-600 border-slate-800'}`}>{t}</button>
                ))}</div>
              </div>
            </div>
            <div className="flex gap-2"><button onClick={()=>setIsAddingUnit(false)} className="flex-1 text-[10px] font-black uppercase text-slate-500 py-3 hover:text-white transition-all">Cancel</button><button onClick={handleManualAddUnit} className="flex-2 bg-blue-600 py-3 rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-blue-500 transition-all active:scale-95">Register</button></div>
          </div>
        </div>
      )}

      {isCreatingCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-[2rem] p-6 w-full max-w-md space-y-6 max-h-[85vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 shadow-3xl">
            <h2 className="text-xl font-black uppercase text-center">Dispatch Incident</h2>
            <div className="space-y-5">
              <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-500">Responding Agency</label>
                <div className="grid grid-cols-3 gap-1">{[UnitType.POLICE, UnitType.FIRE, UnitType.DOT].map(t => (
                  <button key={t} onClick={() => setNewCallDept(t)} className={`py-3 rounded-xl border text-[10px] font-black transition-all ${newCallDept === t ? 'bg-blue-600 border-blue-400 text-white shadow-md' : 'bg-slate-950 border-slate-800 text-slate-700'}`}>{t}</button>
                ))}</div>
              </div>
              <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-500">Scenario</label>
                <select value={newCallType} onChange={e=>setNewCallType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-black text-white outline-none cursor-pointer">
                  {DEPARTMENT_CALL_TYPES[newCallDept]?.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-500">Postal / Landmark</label>
                <input list="locs" value={newLocation} onChange={e=>setNewLocation(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm font-black text-white outline-none focus:ring-1 focus:ring-blue-500" placeholder="Springfield Bank..." />
                <datalist id="locs">{ERLC_LOCATIONS.map(l => <option key={l} value={l} />)}</datalist>
              </div>
              <div className="space-y-2"><label className="text-[10px] font-black uppercase text-slate-500">Response Code</label>
                <div className="grid grid-cols-2 gap-1">{Object.values(Priority).map(p => (
                  <button key={p} onClick={() => setNewPriority(p)} className={`py-2 rounded-xl border text-[10px] font-black uppercase transition-all ${newPriority === p ? 'bg-slate-700 text-white border-slate-500' : 'bg-slate-950 text-slate-800 border-slate-800'}`}>{p}</button>
                ))}</div>
              </div>
            </div>
            <div className="flex gap-4 pt-4"><button onClick={()=>setIsCreatingCall(false)} className="flex-1 text-[10px] font-black uppercase text-slate-500 py-3 hover:text-white transition-all">Discard</button><button onClick={createIncident} className="flex-3 bg-blue-600 py-4 rounded-xl text-[10px] font-black uppercase shadow-xl active:scale-95 hover:bg-blue-500 transition-all">Broadcast</button></div>
          </div>
        </div>
      )}

      <footer className="h-10 bg-slate-950 border-t border-slate-900 flex items-center px-4 justify-between shrink-0 text-[8px] font-mono text-slate-700 uppercase font-black z-30">
        <div className="flex items-center gap-2">
            <div className={`w-1.5 h-1.5 rounded-full ${autoRefreshEnabled ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-slate-700'}`}></div> 
            SYNC_ENG: {autoRefreshEnabled ? (isInputtingAction ? 'PAUSED' : `${timeLeft}S`) : 'OFF'}
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden xs:inline italic opacity-50">NODE: {roomId}</span>
          <button 
            onClick={handleManualRefresh} 
            className={`hover:text-white transition-all p-2 -mr-2 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`}
            title="Manual Sync"
          >
             <Icons.Refresh />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default App;
