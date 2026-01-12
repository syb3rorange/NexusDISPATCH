
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
  const [isAssigningUnits, setIsAssigningUnits] = useState(false);
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
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);
  
  const [refreshInterval, setRefreshInterval] = useState<number>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_REFRESH_INTERVAL);
    return saved ? parseInt(saved, 10) : 20;
  });

  const currentInterval = useMemo(() => {
    if (!session) return 300; 
    return refreshInterval;   
  }, [session, refreshInterval]);

  const [timeLeft, setTimeLeft] = useState<number>(currentInterval);
  const [showRefreshSettings, setShowRefreshSettings] = useState(false);

  const handleManualRefresh = useCallback(() => {
    setIsRefreshing(true);
    setLastSyncTime(Date.now());
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }, []);

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

  useEffect(() => {
    setTimeLeft(currentInterval);
  }, [session, currentInterval]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_REFRESH_INTERVAL, refreshInterval.toString());
  }, [refreshInterval]);

  // --- DATA SYNC ---
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

  // --- HANDLERS ---
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

  const handleToggleUnitAssignment = useCallback((unitId: string) => {
    if (!activeIncidentId) return;
    const incident = incidentsMap[activeIncidentId];
    if (!incident) return;

    let assigned = [];
    try { assigned = JSON.parse(incident.assignedUnits); } catch(e) {}

    const isCurrentlyAssigned = assigned.includes(unitId);
    let newAssigned;

    if (isCurrentlyAssigned) {
      newAssigned = assigned.filter((id: string) => id !== unitId);
      handleUpdateUnitStatus(unitId, UnitStatus.AVAILABLE);
    } else {
      newAssigned = [...assigned, unitId];
      handleUpdateUnitStatus(unitId, UnitStatus.EN_ROUTE);
    }

    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).get('assignedUnits').put(JSON.stringify(newAssigned));
    
    // Log the assignment
    const currentLogs = JSON.parse(incident.logs);
    const newLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      sender: 'SYSTEM',
      message: `${isCurrentlyAssigned ? 'Detached' : 'Attached'} Unit ${unitId}`
    };
    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).get('logs').put(JSON.stringify([...currentLogs, newLog]));
  }, [activeIncidentId, incidentsMap, roomId]);

  const handleSignOut = useCallback(() => {
    if (session?.callsign) {
       gun.get('nexus_cad_v7_final').get(roomId).get('units').get(session.callsign).get('status').put(UnitStatus.OUT_OF_SERVICE);
    }
    localStorage.removeItem(STORAGE_KEY_SESSION_TYPE);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_INCIDENT);
    setSession(null);
    setAutoRefreshEnabled(true); 
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
    const isAssignedToThisCall = activeIncidentId && incidentsMap[activeIncidentId] && 
                       JSON.parse(incidentsMap[activeIncidentId].assignedUnits).includes(unit.id);
    const borderClass = unit.type === UnitType.POLICE ? 'border-blue-500/50' : 
                        unit.type === UnitType.FIRE ? 'border-red-500/50' : 'border-yellow-500/50';
    return (
      <div key={unit.id} className={`p-5 rounded-2xl border ${borderClass} bg-slate-900/40 backdrop-blur-sm transition-all duration-300 ${isAssignedToThisCall ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-950 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : ''}`}>
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-3">
              <span className={unit.type === UnitType.POLICE ? 'text-blue-400' : unit.type === UnitType.FIRE ? 'text-red-400' : 'text-yellow-400'}>
                {unit.type === UnitType.POLICE ? <Icons.Police /> : unit.type === UnitType.FIRE ? <Icons.Fire /> : <Icons.DOT />}
              </span>
              <span className="font-mono font-black text-lg">{unit.name}</span>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-md border font-bold tracking-wide ${STATUS_COLORS[unit.status]}`}>{unit.status}</span>
          </div>
          {(session?.role === 'DISPATCH' || unit.name === session?.callsign) && (
            <div className="grid grid-cols-5 gap-2 mb-4">
              {Object.values(UnitStatus).map(s => (
                <button key={s} onClick={() => handleUpdateUnitStatus(unit.id, s)} className={`text-xs py-2.5 rounded-lg border font-black transition-all active:scale-90 ${unit.status === s ? 'bg-slate-700 text-white' : 'bg-slate-950/40 text-slate-500 border-slate-800'}`}>{s.charAt(0)}</button>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 italic">
              <span className="truncate pr-2 uppercase">OPERATOR: {unit.robloxUser}</span>
              {session?.role === 'DISPATCH' && <button onClick={() => confirm('Remove unit?') && gun.get('nexus_cad_v7_final').get(roomId).get('units').get(unit.id).put(null)} className="text-red-900 hover:text-red-500 transition-colors p-1"><Icons.Trash /></button>}
          </div>
      </div>
    );
  };

  if (!session) {
    return (
      <div className="h-[100dvh] w-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-slate-100 overflow-y-auto relative">
        <div className="absolute top-6 right-6 flex items-center gap-3 bg-slate-950/60 p-4 rounded-xl border border-slate-800 z-50">
           <div className={`w-3 h-3 rounded-full ${autoRefreshEnabled ? 'bg-blue-500 animate-pulse shadow-[0_0_10px_#3b82f6]' : 'bg-slate-700'}`}></div>
           <span className="text-sm font-black font-mono text-slate-500 uppercase tracking-widest">{autoRefreshEnabled ? `${timeLeft}S` : 'OFF'}</span>
        </div>
        
        <div className="w-full max-w-2xl flex flex-col items-center py-12 space-y-12">
          <div className="bg-blue-600 p-6 rounded-[2rem] shadow-2xl border border-white/20"><Icons.Police /></div>
          <h1 className="text-6xl font-black tracking-widest uppercase text-center">NEXUS<span className="text-blue-500">CAD</span></h1>
          <div className="grid grid-cols-1 gap-10 w-full">
            <div className="bg-slate-900/40 border border-slate-800 p-12 rounded-[3rem] flex flex-col shadow-inner">
              <h2 className="text-2xl font-black mb-8 uppercase flex items-center gap-4"><Icons.Send /> Dispatch Control</h2>
              <input type="password" placeholder="Passcode (10-4)" value={dispatchPass} onChange={(e) => setDispatchPass(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 mb-6 font-bold outline-none focus:ring-4 focus:ring-blue-500/20 text-xl" />
              <button onClick={() => dispatchPass === '10-4' ? (localStorage.setItem(STORAGE_KEY_SESSION_TYPE, 'DISPATCH'), setSession({role:'DISPATCH'})) : alert('ERR')} className="w-full bg-blue-600 py-6 rounded-2xl font-black text-base uppercase tracking-widest active:scale-95 transition-all shadow-xl hover:bg-blue-500">Establish Comms</button>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 p-12 rounded-[3rem] flex flex-col shadow-inner">
              <h2 className="text-2xl font-black mb-8 uppercase flex items-center gap-4"><Icons.Police /> Tactical Unit Login</h2>
              <div className="space-y-6 mb-8">
                <input type="text" placeholder="Roblox Username" value={onboardingData.roblox} onChange={(e) => setOnboardingData(p => ({...p, roblox: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-lg font-bold" />
                <input type="text" placeholder="Callsign (e.g. 1L-20)" value={onboardingData.callsign} onChange={(e) => setOnboardingData(p => ({...p, callsign: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 text-lg font-mono uppercase" />
                <div className="grid grid-cols-3 gap-3">
                    {[UnitType.POLICE, UnitType.FIRE, UnitType.DOT].map(t => (
                        <button key={t} onClick={() => setOnboardingData(p => ({...p, type: t}))} className={`py-4 rounded-2xl border text-sm font-black transition-all ${onboardingData.type === t ? 'bg-emerald-600 text-white border-emerald-400 shadow-lg' : 'bg-slate-950 text-slate-600 border-slate-800'}`}>{t}</button>
                    ))}
                </div>
              </div>
              <button onClick={() => (onboardingData.roblox && onboardingData.callsign) && performJoin(onboardingData)} className="w-full bg-emerald-600 py-6 rounded-2xl font-black text-base uppercase tracking-widest active:scale-95 transition-all shadow-xl hover:bg-emerald-500">Connect tactical node</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-[#020617] text-slate-100 overflow-hidden select-none">
      <header className="h-20 sm:h-24 shrink-0 bg-slate-900/50 border-b border-slate-800 flex items-center justify-between px-6 sm:px-10 backdrop-blur-md z-30">
        <div className="flex items-center gap-4 sm:gap-8 overflow-hidden">
          <div className="p-3 sm:p-4 bg-blue-600 rounded-2xl border border-white/10 shrink-0 shadow-lg">
            {session.unitType === UnitType.FIRE ? <Icons.Fire /> : session.unitType === UnitType.DOT ? <Icons.DOT /> : <Icons.Police />}
          </div>
          <h1 className="text-lg sm:text-2xl font-black uppercase tracking-tight truncate">
            Nexus <span className={session.role === 'DISPATCH' ? 'text-blue-500' : session.unitType === UnitType.FIRE ? 'text-red-500' : session.unitType === UnitType.DOT ? 'text-yellow-500' : 'text-blue-500'}>
              {session.role === 'DISPATCH' ? 'Dispatch' : session.unitType === UnitType.POLICE ? 'POLICE' : session.unitType === UnitType.FIRE ? 'FIRE' : 'DOT'}
            </span>
          </h1>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          <div className="flex items-center bg-slate-950/60 border border-slate-800 rounded-2xl p-1.5">
            <button onClick={() => setViewMode(prev => prev === 'AUTO' ? 'MOBILE' : prev === 'MOBILE' ? 'DESKTOP' : 'AUTO')} className="p-3 rounded-xl hover:bg-slate-800 transition-all">
                {viewMode === 'MOBILE' ? <Icons.Smartphone /> : viewMode === 'DESKTOP' ? <Icons.Monitor /> : <div className="relative"><Icons.Monitor /><div className="absolute -top-1.5 -right-1.5 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-slate-900 shadow-sm"></div></div>}
            </button>
            <div className="w-px h-8 bg-slate-800 mx-2"></div>
            <button onClick={() => setShowRefreshSettings(!showRefreshSettings)} className={`p-3 rounded-xl transition-all ${showRefreshSettings ? 'text-blue-400 bg-blue-900/20' : 'text-slate-500 hover:text-white'}`}><Icons.Cpu /></button>
          </div>
          <button onClick={() => setIsCreatingCall(true)} className="bg-blue-600 py-3.5 px-6 sm:px-10 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wider active:scale-95 transition-all shadow-xl hover:bg-blue-500">Broadcast</button>
          <button onClick={handleSignOut} className="text-sm font-black uppercase text-slate-500 hover:text-red-500 p-4 ml-2 transition-colors">LOGOUT</button>
        </div>
      </header>

      {showRefreshSettings && (
        <div className="fixed top-24 right-6 w-80 bg-slate-900 border border-slate-800 rounded-[2.5rem] p-8 shadow-2xl z-50 animate-in slide-in-from-top-8">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-500 mb-6">Engine Controls</h3>
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <span className="text-base font-bold text-slate-300">Auto Refresh</span>
                <button 
                  onClick={() => setAutoRefreshEnabled(!autoRefreshEnabled)} 
                  className={`w-14 h-7 rounded-full relative transition-all ${autoRefreshEnabled ? 'bg-blue-600' : 'bg-slate-800'}`}
                >
                  <div className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-all ${autoRefreshEnabled ? 'left-8' : 'left-1'}`}></div>
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between text-sm font-bold">
                  <span className="text-slate-500">Sync Frequency</span>
                  <span className="text-blue-400">{refreshInterval}s</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="60" 
                  step="5" 
                  value={refreshInterval} 
                  onChange={(e)=>setRefreshInterval(parseInt(e.target.value))} 
                  className="w-full h-3 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-600" 
                />
              </div>
              <button onClick={()=>setShowRefreshSettings(false)} className="w-full py-4 bg-slate-800 rounded-2xl text-sm font-black uppercase hover:bg-slate-700 transition-all border border-slate-700 shadow-md">Apply & Close</button>
            </div>
        </div>
      )}
      
      <main className="flex-1 flex overflow-hidden">
        <aside className={`${effectiveIsMobile ? (mobileTab === 'UNITS' ? 'flex w-full' : 'hidden') : 'w-96 flex'} border-r border-slate-800 bg-slate-950/40 flex-col shrink-0 overflow-hidden`}>
          <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-900/20">
            <span className="text-sm font-black uppercase text-slate-500 tracking-widest">Active Roster</span>
            {session.role === 'DISPATCH' && <button onClick={() => setIsAddingUnit(true)} className="text-slate-400 p-2 hover:text-white transition-colors"><Icons.Plus /></button>}
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-10 custom-scrollbar pb-40">
            {groupedUnits.field.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-xs font-black text-emerald-500/60 uppercase px-2 tracking-[0.15em]">Field Assets ({groupedUnits.field.length})</h4>
                    {groupedUnits.field.map(u => renderUnitCard(u))}
                </div>
            )}
            {groupedUnits.offDuty.length > 0 && (
                <div className="space-y-4">
                    <h4 className="text-xs font-black text-slate-700 uppercase px-2 tracking-[0.15em]">Off-Duty ({groupedUnits.offDuty.length})</h4>
                    {groupedUnits.offDuty.map(u => renderUnitCard(u))}
                </div>
            )}
          </div>
        </aside>

        <section className={`flex-1 flex flex-col bg-[#020617] relative ${effectiveIsMobile && mobileTab !== 'INCIDENTS' && mobileTab !== 'ACTIVE' ? 'hidden' : 'flex'} overflow-hidden`}>
          <div className={`h-48 sm:h-56 shrink-0 border-b border-slate-800 p-5 flex gap-5 overflow-x-auto items-center custom-scrollbar ${effectiveIsMobile && mobileTab !== 'INCIDENTS' ? 'hidden' : 'flex'}`}>
            {incidents.map(inc => (
              <div key={inc.id} onClick={() => { setActiveIncidentId(inc.id); if (effectiveIsMobile) setMobileTab('ACTIVE'); }} className={`w-72 sm:w-96 shrink-0 p-6 rounded-[2.5rem] border transition-all ${activeIncidentId === inc.id ? 'bg-blue-900/10 border-blue-500 shadow-2xl scale-[1.02]' : 'bg-slate-900/30 border-slate-800 hover:border-slate-600'}`}>
                <div className="flex justify-between items-start mb-4"><span className="text-sm font-mono font-bold text-slate-500">{inc.id}</span><span className={`text-xs font-black uppercase tracking-widest ${PRIORITY_COLORS[inc.priority]}`}>{inc.priority}</span></div>
                <div className="font-black text-lg sm:text-xl uppercase truncate mb-3 leading-tight">{inc.callType}</div>
                <div className="text-sm text-slate-500 italic truncate tracking-tight uppercase">LOCATION: {inc.location}</div>
              </div>
            ))}
            {incidents.length === 0 && <div className="flex-1 flex items-center justify-center opacity-10 text-base font-black uppercase tracking-[0.6em] italic text-center">Operational Silence</div>}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {activeIncidentId && incidentsMap[activeIncidentId] ? (
              <div className="flex-1 flex flex-col p-6 sm:p-12 overflow-hidden animate-in fade-in slide-in-from-bottom-8">
                <div className="flex justify-between items-start mb-8 gap-8 shrink-0">
                  <div className="min-w-0 flex-1">
                    <h2 className="text-3xl sm:text-5xl font-black uppercase leading-tight truncate">{incidentsMap[activeIncidentId].callType}</h2>
                    <p className="text-sm sm:text-lg font-black text-slate-500 italic truncate uppercase tracking-tighter mt-2">ASSIGNED LOCATION: {incidentsMap[activeIncidentId].location}</p>
                  </div>
                  <div className="flex gap-3 shrink-0">
                    <button onClick={() => (setActiveIncidentId(null), effectiveIsMobile && setMobileTab('INCIDENTS'))} className="p-4 bg-slate-800 rounded-[1.5rem] border border-slate-700 active:scale-90 transition-all hover:bg-slate-700 shadow-md"><Icons.X /></button>
                    {session.role === 'DISPATCH' && <button onClick={handlePurgeIncident} className="p-4 bg-red-600/20 text-red-500 rounded-[1.5rem] border border-red-500/20 active:scale-90 transition-all hover:bg-red-600 hover:text-white shadow-md"><Icons.Trash /></button>}
                  </div>
                </div>

                <div className="flex-1 flex flex-col sm:flex-row gap-8 overflow-hidden mb-6">
                  <div className="flex-1 flex flex-col bg-slate-950/40 rounded-[3rem] border border-slate-800/40 overflow-hidden shadow-2xl">
                    <div className="p-5 border-b border-slate-800/40 bg-slate-900/20 flex justify-between items-center">
                        <span className="text-sm font-black uppercase tracking-widest text-slate-500">Tactical Operations Log</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-6 space-y-5 font-mono text-sm sm:text-base custom-scrollbar">
                      {(() => {
                        let logs = []; try { logs = JSON.parse(incidentsMap[activeIncidentId].logs); } catch(e) {}
                        return logs.map((l: any, i: number) => (
                          <div key={i} className="flex gap-4 animate-in fade-in slide-in-from-left-4">
                            <span className="text-slate-700 font-bold shrink-0">[{l.timestamp}]</span>
                            <span className={`font-black uppercase tracking-tight ${l.sender.includes('DISPATCH') || l.sender === 'SYSTEM' ? 'text-blue-500' : 'text-emerald-500'}`}>{l.sender}:</span>
                            <span className="text-slate-400 break-words leading-relaxed">{l.message}</span>
                          </div>
                        ));
                      })()}
                    </div>
                    <div className="p-6 sm:p-8 bg-slate-950/60 border-t border-slate-800/40 flex gap-4 shrink-0">
                      <input value={logInput} onChange={e=>setLogInput(e.target.value)} onKeyDown={e=>e.key==='Enter' && handleAddLog()} placeholder="Enter tactical update..." className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-6 py-4 text-base font-bold outline-none focus:ring-4 focus:ring-blue-500/20 text-white" />
                      <button onClick={handleAddLog} className="bg-blue-600 px-6 py-4 rounded-2xl active:scale-95 shadow-xl hover:bg-blue-500 transition-all"><Icons.Send /></button>
                    </div>
                  </div>

                  <div className="w-full sm:w-96 flex flex-col bg-slate-950/40 rounded-[3rem] border border-slate-800/40 overflow-hidden shrink-0">
                    <div className="p-5 border-b border-slate-800/40 bg-slate-900/20 flex justify-between items-center">
                        <span className="text-sm font-black uppercase tracking-widest text-slate-500">Attached Units</span>
                        {session.role === 'DISPATCH' && <button onClick={() => setIsAssigningUnits(true)} className="p-2.5 text-blue-400 hover:text-white transition-all"><Icons.Plus /></button>}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar max-h-80 sm:max-h-none">
                        {(() => {
                          let assigned: string[] = []; try { assigned = JSON.parse(incidentsMap[activeIncidentId].assignedUnits); } catch(e) {}
                          if (assigned.length === 0) return <div className="text-sm text-slate-600 italic text-center py-16 font-black tracking-widest">UNITS ON STANDBY</div>;
                          return assigned.map(uid => {
                            const unit = unitsMap[uid];
                            if (!unit) return null;
                            return (
                                <div key={uid} className="flex items-center justify-between p-5 bg-slate-900/60 border border-slate-800 rounded-[1.5rem] animate-in zoom-in-95 shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[unit.status].split(' ')[0]} bg-current shadow-md`}></div>
                                        <span className="text-sm font-black font-mono tracking-tight">{unit.name}</span>
                                    </div>
                                    {session.role === 'DISPATCH' && <button onClick={() => handleToggleUnitAssignment(uid)} className="text-red-900 hover:text-red-500 p-2 transition-colors"><Icons.X /></button>}
                                </div>
                            );
                          });
                        })()}
                    </div>
                  </div>
                </div>
              </div>
            ) : <div className="flex-1 flex flex-col items-center justify-center opacity-10 p-12 text-center"><Icons.Police /><p className="text-3xl font-black uppercase mt-8 tracking-[0.25em]">System Standby</p></div>}
          </div>
        </section>
      </main>

      {effectiveIsMobile && (
        <nav className="h-24 bg-slate-900 border-t border-slate-800 flex items-center justify-around px-4 z-40 pb-safe shrink-0 shadow-2xl">
          <button onClick={() => setMobileTab('UNITS')} className={`flex flex-col items-center gap-3 transition-all ${mobileTab === 'UNITS' ? 'text-blue-400 scale-110' : 'text-slate-600'}`}><Icons.Police /><span className="text-xs font-black uppercase tracking-widest">Units</span></button>
          <button onClick={() => setMobileTab('INCIDENTS')} className={`flex flex-col items-center gap-3 transition-all ${mobileTab === 'INCIDENTS' ? 'text-blue-400 scale-110' : 'text-slate-600'}`}><Icons.Fire /><span className="text-xs font-black uppercase tracking-widest">Calls</span></button>
          <button onClick={() => activeIncidentId && setMobileTab('ACTIVE')} className={`flex flex-col items-center gap-3 transition-all ${mobileTab === 'ACTIVE' ? 'text-emerald-400 scale-110' : 'text-slate-600'} ${!activeIncidentId ? 'opacity-20' : ''}`}><Icons.Send /><span className="text-xs font-black uppercase tracking-widest">Action</span></button>
        </nav>
      )}

      {/* Unit Assignment Modal */}
      {isAssigningUnits && activeIncidentId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-[3.5rem] p-10 w-full max-w-xl space-y-10 animate-in zoom-in-95 shadow-3xl">
            <h2 className="text-3xl font-black uppercase text-center tracking-[0.1em]">Attach Assets</h2>
            <div className="max-h-[60vh] overflow-y-auto space-y-4 custom-scrollbar pr-4">
                {units.filter(u => u.status !== UnitStatus.OUT_OF_SERVICE).map(unit => {
                    const assigned = JSON.parse(incidentsMap[activeIncidentId]?.assignedUnits || '[]');
                    const isAssigned = assigned.includes(unit.id);
                    return (
                        <div key={unit.id} className="flex items-center justify-between p-6 bg-slate-950 rounded-2xl border border-slate-800 hover:border-slate-700 transition-colors">
                            <div className="flex items-center gap-5">
                                <span className={unit.type === UnitType.POLICE ? 'text-blue-400' : unit.type === UnitType.FIRE ? 'text-red-400' : 'text-yellow-400'}><Icons.Police /></span>
                                <span className="text-lg font-black font-mono">{unit.name}</span>
                            </div>
                            <button 
                                onClick={() => handleToggleUnitAssignment(unit.id)}
                                className={`px-8 py-3.5 rounded-2xl text-sm font-black uppercase transition-all shadow-xl active:scale-95 ${isAssigned ? 'bg-red-900/40 text-red-500 border border-red-500/20' : 'bg-emerald-600 text-white border border-emerald-400/20'}`}
                            >
                                {isAssigned ? 'Detach' : 'Attach'}
                            </button>
                        </div>
                    );
                })}
            </div>
            <button onClick={()=>setIsAssigningUnits(false)} className="w-full bg-slate-800 py-5 rounded-[1.5rem] text-sm font-black uppercase tracking-[0.2em] hover:bg-slate-700 border border-slate-700 transition-all shadow-lg">Return to Ops</button>
          </div>
        </div>
      )}

      {isAddingUnit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-[3.5rem] p-10 w-full max-w-lg space-y-10 animate-in zoom-in-95 shadow-3xl">
            <h2 className="text-3xl font-black uppercase text-center tracking-tight">Register Tactical Asset</h2>
            <div className="space-y-8">
              <div className="space-y-3"><label className="text-sm font-black uppercase text-slate-500 tracking-widest ml-2">Node Callsign ID</label><input type="text" value={newUnitData.callsign} onChange={e=>setNewUnitData(p=>({...p, callsign: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 text-xl font-mono uppercase text-white outline-none focus:ring-4 focus:ring-blue-500/20" placeholder="e.g. 1L-20" /></div>
              <div className="space-y-3"><label className="text-sm font-black uppercase text-slate-500 tracking-widest ml-2">Asset Type</label>
                <div className="grid grid-cols-3 gap-3">{[UnitType.POLICE, UnitType.FIRE, UnitType.DOT].map(t => (
                  <button key={t} onClick={() => setNewUnitData(p => ({...p, type: t}))} className={`py-5 rounded-2xl border text-sm font-black transition-all ${newUnitData.type === t ? 'bg-blue-600 text-white border-blue-400 shadow-xl' : 'bg-slate-950 text-slate-600 border-slate-800'}`}>{t}</button>
                ))}</div>
              </div>
            </div>
            <div className="flex gap-6"><button onClick={()=>setIsAddingUnit(false)} className="flex-1 text-sm font-black uppercase text-slate-500 py-5 hover:text-white transition-all tracking-widest">Discard</button><button onClick={handleManualAddUnit} className="flex-2 bg-blue-600 py-5 rounded-2xl text-sm font-black uppercase shadow-2xl tracking-[0.2em] hover:bg-blue-500 transition-all active:scale-95">Establish Link</button></div>
          </div>
        </div>
      )}

      {isCreatingCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-6">
          <div className="bg-slate-900 border border-slate-800 rounded-[4rem] p-12 w-full max-w-2xl space-y-10 max-h-[92vh] overflow-y-auto custom-scrollbar animate-in zoom-in-95 shadow-3xl">
            <h2 className="text-4xl font-black uppercase text-center tracking-tight leading-none">Initiate Incident Loop</h2>
            <div className="space-y-8">
              <div className="space-y-3"><label className="text-sm font-black uppercase text-slate-500 tracking-[0.2em] ml-2">Assigned Agency</label>
                <div className="grid grid-cols-3 gap-4">{[UnitType.POLICE, UnitType.FIRE, UnitType.DOT].map(t => (
                  <button key={t} onClick={() => setNewCallDept(t)} className={`py-5 rounded-2xl border text-sm font-black transition-all shadow-sm ${newCallDept === t ? 'bg-blue-600 border-blue-400 text-white shadow-xl' : 'bg-slate-950 border-slate-800 text-slate-700 hover:text-slate-500'}`}>{t}</button>
                ))}</div>
              </div>
              <div className="space-y-3"><label className="text-sm font-black uppercase text-slate-500 tracking-[0.2em] ml-2">Scenario Category</label>
                <select value={newCallType} onChange={e=>setNewCallType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 text-lg font-black text-white outline-none cursor-pointer hover:bg-slate-900 transition-colors">
                  {DEPARTMENT_CALL_TYPES[newCallDept]?.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-3"><label className="text-sm font-black uppercase text-slate-500 tracking-[0.2em] ml-2">Tactical Location (Postal)</label>
                <input list="locs" value={newLocation} onChange={e=>setNewLocation(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-6 text-lg font-black text-white outline-none focus:ring-4 focus:ring-blue-500/20" placeholder="Target landmark or postal..." />
                <datalist id="locs">{ERLC_LOCATIONS.map(l => <option key={l} value={l} />)}</datalist>
              </div>
              <div className="space-y-3"><label className="text-sm font-black uppercase text-slate-500 tracking-[0.2em] ml-2">Response Level</label>
                <div className="grid grid-cols-2 gap-3">{Object.values(Priority).map(p => (
                  <button key={p} onClick={() => setNewPriority(p)} className={`py-4 rounded-2xl border text-sm font-black uppercase transition-all shadow-sm ${newPriority === p ? 'bg-slate-700 text-white border-slate-500 shadow-xl' : 'bg-slate-950 text-slate-800 border-slate-800'}`}>{p}</button>
                ))}</div>
              </div>
            </div>
            <div className="flex gap-6 pt-6"><button onClick={()=>setIsCreatingCall(false)} className="flex-1 text-sm font-black uppercase text-slate-500 py-6 hover:text-white transition-all tracking-[0.2em]">Discard</button><button onClick={createIncident} className="flex-3 bg-blue-600 py-7 rounded-[2rem] text-lg font-black uppercase shadow-2xl active:scale-95 hover:bg-blue-500 transition-all tracking-[0.15em]">Broadcast Incident</button></div>
          </div>
        </div>
      )}

      <footer className="h-14 bg-slate-950 border-t border-slate-900 flex items-center px-8 justify-between shrink-0 text-xs font-mono text-slate-600 uppercase font-black z-30">
        <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${autoRefreshEnabled ? 'bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]' : 'bg-slate-700'}`}></div> 
            SYNC_ENGINE: {autoRefreshEnabled ? (isInputtingAction ? 'LOOP_PAUSED' : `${timeLeft}S`) : 'OFFLINE'}
        </div>
        <div className="flex items-center gap-10">
          <span className="hidden md:inline italic opacity-40 tracking-[0.3em] font-mono">NODE_HASH: {roomId}</span>
          <button 
            onClick={handleManualRefresh} 
            className={`hover:text-white transition-all p-3 -mr-3 ${isRefreshing ? 'animate-spin text-blue-500' : ''}`}
            title="Force Global Sync"
          >
             <Icons.Refresh />
          </button>
        </div>
      </footer>
    </div>
  );
};

export default App;
