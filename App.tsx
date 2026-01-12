
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
  
  const [savedProfile, setSavedProfile] = useState<{roblox: string, callsign: string, type: UnitType} | null>(null);

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
  const [isAssigningUnit, setIsAssigningUnit] = useState(false);
  const [newUnitData, setNewUnitData] = useState({ callsign: '', type: UnitType.POLICE });
  
  const [newCallDept, setNewCallDept] = useState<UnitType>(UnitType.POLICE);
  const [newCallType, setNewCallType] = useState(DEPARTMENT_CALL_TYPES[UnitType.POLICE][0]);
  const [newLocation, setNewLocation] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM);

  useEffect(() => {
    if (DEPARTMENT_CALL_TYPES[newCallDept]) {
      setNewCallType(DEPARTMENT_CALL_TYPES[newCallDept][0]);
    }
  }, [newCallDept]);

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VIEW_MODE, viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_DRAFT_ONBOARDING, JSON.stringify(onboardingData));
  }, [onboardingData]);

  const effectiveIsMobile = useMemo(() => {
    if (viewMode === 'MOBILE') return true;
    if (viewMode === 'DESKTOP') return false;
    return screenWidth < 1024;
  }, [viewMode, screenWidth]);

  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_AUTO_REFRESH);
    return saved === null ? true : saved === 'true';
  });
  
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

  useEffect(() => {
    setTimeLeft(currentInterval);
  }, [session, currentInterval]);

  const handleManualRefresh = useCallback(() => {
    setIsRefreshing(true);
    setLastSyncTime(Date.now());
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }, []);

  const isInputtingAction = useMemo(() => {
    return activeIncidentId !== null || isCreatingCall || isAddingUnit || isAssigningUnit || showRefreshSettings;
  }, [activeIncidentId, isCreatingCall, isAddingUnit, isAssigningUnit, showRefreshSettings]);

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
    localStorage.setItem(STORAGE_KEY_AUTO_REFRESH, autoRefreshEnabled.toString());
  }, [autoRefreshEnabled]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_REFRESH_INTERVAL, refreshInterval.toString());
  }, [refreshInterval]);

  const logInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const profile = localStorage.getItem(STORAGE_KEY_PROFILE);
    const dispatchAuth = localStorage.getItem(STORAGE_KEY_DISPATCH_AUTH);
    const sessionType = localStorage.getItem(STORAGE_KEY_SESSION_TYPE);
    
    if (profile) setSavedProfile(JSON.parse(profile));
    if (dispatchAuth === '10-4') setHasPersistentDispatch(true);

    if (sessionType === 'DISPATCH' && dispatchAuth === '10-4') {
      setSession({ role: 'DISPATCH' });
    } else if (sessionType === 'UNIT' && profile) {
      const data = JSON.parse(profile);
      setSession({ role: 'UNIT', username: data.roblox, callsign: data.callsign.toUpperCase(), unitType: data.type });
    }
  }, []);

  useEffect(() => {
    if (activeIncidentId) localStorage.setItem(STORAGE_KEY_ACTIVE_INCIDENT, activeIncidentId);
    else localStorage.removeItem(STORAGE_KEY_ACTIVE_INCIDENT);
  }, [activeIncidentId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_MOBILE_TAB, mobileTab);
  }, [mobileTab]);

  useEffect(() => {
    const root = gun.get('nexus_cad_v7_final').get(roomId);

    root.get('units').map().on((data: any, id: string) => {
      setLastSyncTime(Date.now());
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
      setLastSyncTime(Date.now());
      setIncidentsMap(prev => {
        if (!data) {
          const newState = { ...prev };
          delete newState[id];
          return newState;
        }
        return { ...prev, [id]: data };
      });
    });

    return () => {
      root.get('units').off();
      root.get('incidents').off();
    };
  }, [roomId]);

  const handleLoginDispatch = () => {
    if (hasPersistentDispatch || dispatchPass === '10-4') {
      localStorage.setItem(STORAGE_KEY_DISPATCH_AUTH, '10-4');
      localStorage.setItem(STORAGE_KEY_SESSION_TYPE, 'DISPATCH');
      setSession({ role: 'DISPATCH' });
    } else {
      alert("Unauthorized. Correct Dispatch code required (10-4)");
    }
  };

  const handleSignOut = useCallback(() => {
    if (session?.callsign) {
       gun.get('nexus_cad_v7_final').get(roomId).get('units').get(session.callsign).get('status').put(UnitStatus.OUT_OF_SERVICE);
    }
    localStorage.removeItem(STORAGE_KEY_SESSION_TYPE);
    localStorage.removeItem(STORAGE_KEY_ACTIVE_INCIDENT);
    localStorage.removeItem(STORAGE_KEY_MOBILE_TAB);
    setSession(null);
  }, [session, roomId]);

  useEffect(() => {
    if (session?.role === 'UNIT' && session.callsign) {
      const rosterEntries = Object.keys(unitsMap);
      if (rosterEntries.length > 0) {
        if (!unitsMap[session.callsign]) {
          console.warn("Unit identity purged from roster. Redirecting to login.");
          handleSignOut();
        }
      }
    }
  }, [unitsMap, session, handleSignOut]);

  const performJoin = (data: {roblox: string, callsign: string, type: UnitType}) => {
    const callsign = data.callsign.toUpperCase();
    setSession({ role: 'UNIT', username: data.roblox, callsign, unitType: data.type });
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEY_SESSION_TYPE, 'UNIT');
    localStorage.removeItem(STORAGE_KEY_DRAFT_ONBOARDING);

    const newUnit: Unit = {
      id: callsign,
      name: callsign,
      type: data.type,
      status: UnitStatus.AVAILABLE,
      robloxUser: data.roblox,
      lastUpdated: new Date().toISOString(),
    };
    
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(callsign).put(newUnit);
  };

  const handleJoinUnit = () => {
    if (!onboardingData.roblox || !onboardingData.callsign) return;
    performJoin(onboardingData);
  };

  const handleQuickJoin = () => {
    if (savedProfile) {
      performJoin(savedProfile);
    }
  };

  const handleManualAddUnit = () => {
    if (!newUnitData.callsign) return;
    const callsign = newUnitData.callsign.toUpperCase();
    const newUnit: Unit = {
      id: callsign,
      name: callsign,
      type: newUnitData.type,
      status: UnitStatus.AVAILABLE,
      robloxUser: 'MANUAL ENTRY',
      lastUpdated: new Date().toISOString(),
    };
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(callsign).put(newUnit);
    setNewUnitData({ callsign: '', type: UnitType.POLICE });
    setIsAddingUnit(false);
  };

  const updateUnitStatus = (unitId: string, status: UnitStatus) => {
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(unitId).get('status').put(status);
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(unitId).get('lastUpdated').put(new Date().toISOString());
  };

  const createIncident = async () => {
    if (!newLocation) return;
    const id = `INC-${Math.floor(Math.random() * 9000) + 1000}`;
    const initialLogs: IncidentLog[] = [{ 
      id: '1', 
      timestamp: new Date().toLocaleTimeString(), 
      sender: session?.role === 'DISPATCH' ? 'DISPATCH' : (session?.callsign || 'UNIT'), 
      message: `Incident Initialized for [${newCallDept}]: ${newCallType}` 
    }];

    const newIncident: Incident = {
      id,
      callType: newCallType,
      location: newLocation,
      priority: newPriority,
      status: 'ACTIVE',
      assignedUnits: JSON.stringify([]),
      logs: JSON.stringify(initialLogs),
      startTime: new Date().toISOString(),
    };
    
    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(id).put(newIncident);
    setActiveIncidentId(id);
    setIsCreatingCall(false);
    if (effectiveIsMobile) setMobileTab('ACTIVE');
  };

  const handleAddLog = async () => {
    if (!logInput || !activeIncidentId) return;
    const currentIncident = incidentsMap[activeIncidentId];
    if (currentIncident) {
      let logs: IncidentLog[] = [];
      try { logs = JSON.parse(currentIncident.logs); } catch(e) { logs = []; }
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

  const handleAssignUnit = (unitId: string) => {
    if (!activeIncidentId) return;
    const incident = incidentsMap[activeIncidentId];
    let assigned: string[] = [];
    try { assigned = JSON.parse(incident.assignedUnits); } catch(e) { assigned = []; }
    
    if (!assigned.includes(unitId)) {
      const newList = [...assigned, unitId];
      gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).get('assignedUnits').put(JSON.stringify(newList));
      updateUnitStatus(unitId, UnitStatus.EN_ROUTE);
      
      let logs: IncidentLog[] = [];
      try { logs = JSON.parse(incident.logs); } catch(e) { logs = []; }
      const newLog = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        sender: 'DISPATCH',
        message: `Unit ${unitId} assigned to scene.`
      };
      gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).get('logs').put(JSON.stringify([...logs, newLog]));
    }
    setIsAssigningUnit(false);
  };

  const handleDetachUnit = (unitId: string) => {
    if (!activeIncidentId) return;
    const incident = incidentsMap[activeIncidentId];
    let assigned: string[] = [];
    try { assigned = JSON.parse(incident.assignedUnits); } catch(e) { assigned = []; }
    
    const newList = assigned.filter(id => id !== unitId);
    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).get('assignedUnits').put(JSON.stringify(newList));
    updateUnitStatus(unitId, UnitStatus.AVAILABLE);

    let logs: IncidentLog[] = [];
    try { logs = JSON.parse(incident.logs); } catch(e) { logs = []; }
    const newLog = {
      id: Date.now().toString(),
      timestamp: new Date().toLocaleTimeString(),
      sender: 'DISPATCH',
      message: `Unit ${unitId} cleared from scene (Signal 10-98).`
    };
    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).get('logs').put(JSON.stringify([...logs, newLog]));
  };

  const handleMinimizeIncident = () => {
    setActiveIncidentId(null);
    if (effectiveIsMobile) setMobileTab('INCIDENTS');
  };

  const handlePurgeIncident = () => {
    if (!activeIncidentId) return;
    let assigned: string[] = [];
    try { assigned = JSON.parse(incidentsMap[activeIncidentId].assignedUnits); } catch(e) {}
    assigned.forEach(uid => updateUnitStatus(uid, UnitStatus.AVAILABLE));

    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).put(null);
    setActiveIncidentId(null);
    if (effectiveIsMobile) setMobileTab('INCIDENTS');
  };

  const removeUnit = (id: string) => {
    if (confirm(`Confirm removal of unit ${id} from roster?`)) {
        gun.get('nexus_cad_v7_final').get(roomId).get('units').get(id).put(null);
    }
  };

  const toggleViewMode = () => {
    setViewMode(prev => {
      if (prev === 'AUTO') return 'MOBILE';
      if (prev === 'MOBILE') return 'DESKTOP';
      return 'AUTO';
    });
  };

  const renderUnitCard = (unit: Unit) => {
    let isAssignedToThis = false;
    if (activeIncidentId && incidentsMap[activeIncidentId]) {
      try {
        const assigned = JSON.parse(incidentsMap[activeIncidentId].assignedUnits);
        isAssignedToThis = assigned.includes(unit.id);
      } catch(e) {}
    }

    const deptBorderColor = 
      unit.type === UnitType.POLICE ? 'border-blue-500/60' : 
      unit.type === UnitType.FIRE ? 'border-red-500/60' : 
      'border-yellow-500/60';

    return (
      <div key={unit.id} className={`p-4 rounded-3xl border-2 transition-all ${deptBorderColor} ${unit.name === session?.callsign ? 'bg-slate-800/20 shadow-xl' : 'bg-slate-900/40 hover:bg-slate-900/60'} ${isAssignedToThis ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-slate-950' : ''}`}>
          <div className="flex justify-between mb-3 items-center">
            <div className="flex items-center gap-2">
              <div className={unit.type === UnitType.POLICE ? 'text-blue-400' : unit.type === UnitType.FIRE ? 'text-red-400' : 'text-yellow-400'}>
                {unit.type === UnitType.POLICE ? <Icons.Police /> : unit.type === UnitType.FIRE ? <Icons.Fire /> : <Icons.DOT />}
              </div>
              <span className="font-mono font-black text-sm tracking-tight">{unit.name}</span>
            </div>
            <div className={`text-[8px] px-2 py-0.5 rounded-lg border font-black ${STATUS_COLORS[unit.status]}`}>{unit.status.replace(/_/g, ' ')}</div>
          </div>
          {(session?.role === 'DISPATCH' || unit.name === session?.callsign) && (
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {Object.values(UnitStatus).map(s => <button key={s} onClick={() => updateUnitStatus(unit.id, s)} title={s} className={`text-[10px] py-3 rounded-lg border font-black transition-colors ${unit.status === s ? 'bg-slate-800 border-slate-600 text-white shadow-inner' : 'bg-slate-950/40 border-slate-800 text-slate-700 hover:text-slate-500'}`}>{s.charAt(0)}</button>)}
            </div>
          )}
          <div className="flex items-center justify-between text-[8px] font-mono uppercase italic">
              <span className="text-slate-700 truncate pr-2">Op: {unit.robloxUser}</span>
              {session?.role === 'DISPATCH' && (
                <button onClick={() => removeUnit(unit.id)} className="text-red-900 hover:text-red-500 transition-all p-2 -mr-2 hover:scale-125">
                  <Icons.Trash />
                </button>
              )}
          </div>
      </div>
    );
  };

  if (!session) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-4 text-slate-100 relative overflow-hidden">
        <div className="absolute top-4 right-4 flex items-center gap-2 bg-slate-950/60 p-2 rounded-xl border border-slate-800 z-50">
           <div className={`w-2 h-2 rounded-full ${autoRefreshEnabled ? 'bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]' : 'bg-slate-700'}`}></div>
           <span className="text-[9px] font-black font-mono text-slate-500">{autoRefreshEnabled ? `${Math.floor(timeLeft / 60)}m ${timeLeft % 60}s` : 'SYNC: OFF'}</span>
        </div>

        <div className="z-10 w-full max-w-5xl flex flex-col items-center max-h-full overflow-y-auto py-10 px-4 custom-scrollbar">
          <div className="bg-blue-600 p-5 rounded-[2.5rem] shadow-2xl mb-8 border border-blue-400/30 shrink-0"><Icons.Police /></div>
          <h1 className="text-4xl md:text-6xl font-black tracking-widest mb-4 uppercase text-center shrink-0">NEXUS<span className="text-blue-500">CAD</span></h1>
          <div className="flex gap-3 mb-12 text-[10px] font-mono uppercase text-slate-600 shrink-0 tracking-[0.3em]">Frequency: <span className="text-blue-400 font-bold">{roomId}</span></div>
          <div className="grid lg:grid-cols-3 gap-6 w-full max-w-6xl">
            <div className="bg-slate-900/40 border border-slate-800 p-8 md:p-10 rounded-[2.5rem] backdrop-blur-xl flex flex-col hover:border-blue-500/50 transition-all shadow-xl">
              <h2 className="text-xl font-black mb-6 uppercase flex items-center gap-3"><Icons.Send /> Dispatch</h2>
              {hasPersistentDispatch ? (
                  <div className="mb-6 p-5 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex flex-col items-center justify-center">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Authenticated</span>
                  </div>
              ) : (
                <input type="password" placeholder="Passcode (10-4)" value={dispatchPass} onChange={(e) => setDispatchPass(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 mb-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              )}
              <button onClick={handleLoginDispatch} className="w-full bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all mt-auto active:scale-95">Establish Comms</button>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 p-8 md:p-10 rounded-[2.5rem] backdrop-blur-xl flex flex-col hover:border-emerald-500/50 transition-all shadow-xl">
              <h2 className="text-xl font-black mb-6 uppercase flex items-center gap-3"><Icons.Police /> Field Join</h2>
              <div className="space-y-4 mb-6">
                <input type="text" placeholder="Roblox Name" value={onboardingData.roblox} onChange={(e) => setOnboardingData(p => ({...p, roblox: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner" />
                <input type="text" placeholder="Callsign" value={onboardingData.callsign} onChange={(e) => setOnboardingData(p => ({...p, callsign: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 uppercase font-mono outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner" />
                <div className="grid grid-cols-3 gap-2">
                    {[UnitType.POLICE, UnitType.FIRE, UnitType.DOT].map(t => (
                        <button key={t} onClick={() => setOnboardingData(p => ({...p, type: t}))} className={`py-3 rounded-xl border text-[9px] font-black transition-all ${onboardingData.type === t ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-700'}`}>{t}</button>
                    ))}
                </div>
              </div>
              <button onClick={handleJoinUnit} className="w-full bg-emerald-600 hover:bg-emerald-500 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95">Initialize Node</button>
            </div>
            <div className={`bg-slate-900/40 border-2 ${savedProfile ? 'border-blue-500/50 shadow-blue-500/20' : 'border-slate-800/20'} p-8 md:p-10 rounded-[2.5rem] backdrop-blur-xl flex flex-col transition-all relative overflow-hidden shadow-xl min-h-[300px]`}>
               {!savedProfile && <div className="absolute inset-0 bg-slate-950/40 backdrop-grayscale flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-800 italic">No Cached Session</div>}
               <h2 className="text-xl font-black mb-6 uppercase flex items-center gap-3 text-blue-400">Quick Join</h2>
               {savedProfile && (
                 <div className="flex flex-col h-full animate-in zoom-in-95">
                    <div className="bg-slate-950/60 p-6 rounded-2xl border border-slate-800 mb-6 shadow-inner">
                        <div className="text-[10px] font-black text-slate-700 uppercase mb-1 tracking-widest">Active ID</div>
                        <div className="text-3xl font-black tracking-tight text-white mb-1">{savedProfile.callsign}</div>
                        <div className="text-xs font-mono text-slate-500 uppercase">{savedProfile.type} // {savedProfile.roblox}</div>
                    </div>
                    <button onClick={handleQuickJoin} className="w-full bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all mt-auto active:scale-95 flex items-center justify-center gap-3">
                        <Icons.Refresh /> Resume Comms
                    </button>
                    <button onClick={() => {localStorage.removeItem(STORAGE_KEY_PROFILE); setSavedProfile(null);}} className="text-[9px] text-slate-700 mt-4 font-black uppercase hover:text-red-500 transition-colors text-center">Wipe Cache</button>
                 </div>
               )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const headerBorderColor = session.role === 'DISPATCH' ? 'border-blue-500/20' : 
                          session.unitType === UnitType.FIRE ? 'border-red-500/20' :
                          session.unitType === UnitType.DOT ? 'border-yellow-500/20' : 'border-blue-500/20';

  const brandIconBg = session.role === 'DISPATCH' ? 'bg-blue-600' : 
                      session.unitType === UnitType.FIRE ? 'bg-red-600' :
                      session.unitType === UnitType.DOT ? 'bg-yellow-600' : 'bg-blue-600';

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#020617] text-slate-100 font-sans selection:bg-blue-500/30">
      <header className={`h-16 shrink-0 bg-slate-900/50 ${headerBorderColor} border-b flex items-center justify-between px-4 md:px-8 backdrop-blur-xl z-20`}>
        <div className="flex items-center gap-3 md:gap-6">
          <div className={`${brandIconBg} p-2 rounded-xl border border-white/20 shadow-lg`}>
            {session.unitType === UnitType.FIRE ? <Icons.Fire /> : session.unitType === UnitType.DOT ? <Icons.DOT /> : <Icons.Police />}
          </div>
          <h1 className="text-base md:text-xl font-black uppercase tracking-tighter truncate max-w-[120px] sm:max-w-none">
            Nexus
            <span className={
              session.role === 'DISPATCH' ? 'text-blue-500' : 
              session.unitType === UnitType.FIRE ? 'text-red-500' : 
              session.unitType === UnitType.DOT ? 'text-yellow-500' : 'text-blue-500'
            }>
              {session.role === 'DISPATCH' ? ' Dispatch' : (
                session.unitType === UnitType.POLICE ? ' PD' :
                session.unitType === UnitType.FIRE ? ' Fire' :
                session.unitType === UnitType.DOT ? ' Dot' : ' Unit'
              )}
            </span>
          </h1>
        </div>
        <div className="flex items-center gap-2 md:gap-4 relative">
          <div className="flex items-center gap-0.5 bg-slate-950/40 border border-slate-800 rounded-xl p-0.5 pr-2">
            <button title={`Current: ${viewMode} - Click to Cycle`} onClick={toggleViewMode} className="p-2 rounded-lg hover:bg-slate-800 text-slate-500 transition-all flex items-center gap-2">
               {viewMode === 'DESKTOP' ? <Icons.Monitor /> : viewMode === 'MOBILE' ? <Icons.Smartphone /> : <div className="relative"><Icons.Monitor /><div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full"></div></div>}
               <span className="text-[8px] font-black uppercase hidden lg:inline">{viewMode}</span>
            </button>
            <div className="w-px h-4 bg-slate-800 mx-1 hidden sm:block"></div>
            <button title="Manual Sync" onClick={handleManualRefresh} className={`p-2 rounded-lg hover:bg-slate-800 text-slate-500 transition-all ${isRefreshing ? 'animate-spin text-blue-500' : ''}`}><Icons.Refresh /></button>
            <div className="flex flex-col items-center justify-center min-w-[3rem]"><span className={`text-[9px] font-black font-mono leading-none ${isInputtingAction ? 'text-amber-500' : autoRefreshEnabled ? 'text-blue-400' : 'text-slate-700'}`}>{isInputtingAction ? 'PAUSED' : autoRefreshEnabled ? `${timeLeft}s` : '--'}</span></div>
            <button onClick={() => setShowRefreshSettings(!showRefreshSettings)} className={`p-2 rounded-lg hover:bg-slate-800 transition-all ${showRefreshSettings ? 'text-blue-500' : 'text-slate-500'}`} title="Auto-Refresh Settings"><Icons.Cpu /></button>
          </div>
          <button onClick={() => setIsCreatingCall(true)} className="bg-blue-600 hover:bg-blue-500 px-3 md:px-6 py-2.5 rounded-xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">Broadcast</button>
        </div>
      </header>
      
      <div className="flex-1 flex overflow-hidden">
        <aside className={`${effectiveIsMobile ? (mobileTab === 'UNITS' ? 'flex w-full' : 'hidden') : 'w-80 flex'} border-r border-slate-800/60 bg-slate-950/40 flex-col shrink-0 overflow-hidden`}>
          <div className="p-6 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Node Roster</h2>
            {session.role === 'DISPATCH' && <button onClick={() => setIsAddingUnit(true)} className="bg-slate-800 hover:bg-slate-700 p-2 rounded-lg transition-all text-slate-300"><Icons.Plus /></button>}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-8 custom-scrollbar pb-24">
            {groupedUnits.field.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-[9px] font-black text-emerald-500/60 uppercase tracking-widest px-2">Active Field Assets ({groupedUnits.field.length})</h3>
                    {groupedUnits.field.map(u => renderUnitCard(u))}
                </div>
            )}
            {groupedUnits.offDuty.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-2">Out of Service ({groupedUnits.offDuty.length})</h3>
                    {groupedUnits.offDuty.map(u => renderUnitCard(u))}
                </div>
            )}
          </div>
        </aside>

        <section className={`flex-1 flex flex-col bg-[#020617] overflow-hidden ${effectiveIsMobile && mobileTab !== 'INCIDENTS' && mobileTab !== 'ACTIVE' ? 'hidden' : 'flex'}`}>
          <div className={`h-40 sm:h-44 shrink-0 border-b border-slate-800/60 p-4 sm:p-6 gap-4 sm:gap-6 overflow-x-auto items-center custom-scrollbar flex ${effectiveIsMobile && mobileTab !== 'INCIDENTS' ? 'hidden' : 'flex'}`}>
            {incidents.map(incident => (
              <div key={incident.id} onClick={() => { setActiveIncidentId(incident.id); if (effectiveIsMobile) setMobileTab('ACTIVE'); }} className={`w-72 sm:w-80 shrink-0 p-5 sm:p-6 rounded-[2.5rem] border cursor-pointer transition-all relative ${activeIncidentId === incident.id ? 'bg-blue-900/5 border-blue-500 shadow-2xl scale-[1.02]' : 'bg-slate-900/30 border-slate-800/50 hover:bg-slate-900/40 hover:border-slate-700'}`}>
                <div className="flex justify-between items-start mb-3 sm:mb-4"><span className="text-[10px] font-mono font-bold text-slate-600">{incident.id}</span><div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div><span className={`text-[10px] uppercase font-black tracking-widest ${PRIORITY_COLORS[incident.priority]}`}>{incident.priority}</span></div></div>
                <div className="font-black text-xs sm:text-sm truncate uppercase tracking-wide">{incident.callType}</div>
                <div className="text-[10px] sm:text-[11px] text-slate-500 truncate mb-3 sm:mb-5 italic">Loc: {incident.location}</div>
              </div>
            ))}
            {incidents.length === 0 && <div className="flex-1 flex items-center justify-center opacity-20 text-[10px] font-black uppercase tracking-[0.5em] italic">Operational Silence</div>}
          </div>

          <div className="flex-1 flex overflow-hidden">
            {activeIncidentId && incidentsMap[activeIncidentId] ? (
              <div className="flex-1 flex overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <div className="flex-1 flex flex-col p-4 sm:p-6 md:p-8 overflow-hidden">
                  <div className="flex justify-between items-start mb-4 sm:mb-6 shrink-0 gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl sm:text-3xl md:text-5xl font-black text-white uppercase tracking-tighter mb-1 sm:mb-2 truncate leading-tight">{incidentsMap[activeIncidentId].callType}</h2>
                      <div className="text-[9px] sm:text-[11px] text-slate-500 uppercase tracking-[0.2em] sm:tracking-[0.3em] font-black italic truncate">Target: {incidentsMap[activeIncidentId].location}</div>
                    </div>
                    <div className="flex gap-1.5 sm:gap-2 shrink-0">
                      <button onClick={handleMinimizeIncident} className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 sm:py-3 rounded-2xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all border border-slate-700 flex items-center gap-1.5 sm:gap-2 shadow-xl active:scale-95"><Icons.X /> <span className="hidden xs:inline">Hide</span></button>
                      {session?.role === 'DISPATCH' && <button onClick={handlePurgeIncident} className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-3 py-2 sm:py-3 rounded-2xl font-black text-[9px] sm:text-[10px] uppercase tracking-widest transition-all border border-red-500/20 shadow-xl flex items-center gap-1.5 sm:gap-2 active:scale-95"><Icons.Trash /> <span className="hidden xs:inline">Purge</span></button>}
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col bg-slate-950/40 rounded-[2rem] border border-slate-800/40 overflow-hidden shadow-3xl backdrop-blur-xl">
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 font-mono text-[11px] sm:text-sm custom-scrollbar">
                      {(() => {
                        let logs: IncidentLog[] = [];
                        try { logs = JSON.parse(incidentsMap[activeIncidentId].logs); } catch(e) {}
                        return logs.map((log, idx) => (
                          <div key={idx} className="flex gap-2 sm:gap-4 group"><span className="text-slate-800 font-black text-[9px] sm:text-[10px] mt-1 shrink-0">[{log.timestamp}]</span><div className="flex-1"><span className={`font-black mr-2 uppercase tracking-widest ${log.sender.includes('DISPATCH') ? 'text-blue-500' : 'text-emerald-500'}`}>{log.sender}:</span><span className="text-slate-400 break-words">{log.message}</span></div></div>
                        ));
                      })()}
                    </div>
                    <div className="p-4 sm:p-6 bg-slate-950/60 border-t border-slate-800/40 flex gap-2 sm:gap-4">
                      <input ref={logInputRef} type="text" value={logInput} onChange={(e) => setLogInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddLog()} placeholder="Enter report..." className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 text-xs sm:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 text-white shadow-inner" />
                      <button onClick={handleAddLog} className="bg-blue-600 hover:bg-blue-500 p-3 sm:p-4 rounded-2xl shadow-xl transition-all shrink-0 active:scale-95"><Icons.Send /></button>
                    </div>
                  </div>
                </div>

                <div className={`${effectiveIsMobile ? 'hidden' : 'w-80'} border-l border-slate-800 bg-slate-900/20 p-6 flex flex-col shrink-0 overflow-hidden`}>
                   <div className="flex items-center justify-between mb-6">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tactical Roster</h3>
                      {session?.role === 'DISPATCH' && <button onClick={() => setIsAssigningUnit(true)} className="p-2 bg-blue-600 rounded-lg hover:bg-blue-500 transition-all text-white active:scale-95"><Icons.Plus /></button>}
                   </div>
                   <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-2">
                      {(() => {
                        let assigned: string[] = [];
                        try { assigned = JSON.parse(incidentsMap[activeIncidentId].assignedUnits); } catch(e) {}
                        return assigned.map(uid => {
                          const u = unitsMap[uid];
                          if (!u) return null;
                          const iconColor = u.type === UnitType.POLICE ? 'text-blue-400' : u.type === UnitType.FIRE ? 'text-red-400' : 'text-yellow-400';
                          return (
                            <div key={uid} className={`bg-slate-950/60 border-2 ${u.type === UnitType.POLICE ? 'border-blue-500/40' : u.type === UnitType.FIRE ? 'border-red-500/40' : 'border-yellow-500/40'} p-4 rounded-2xl animate-in fade-in zoom-in-95`}>
                               <div className="flex justify-between items-center mb-2">
                                  <div className="flex items-center gap-2">
                                     <div className={iconColor}>{u.type === UnitType.POLICE ? <Icons.Police /> : u.type === UnitType.FIRE ? <Icons.Fire /> : <Icons.DOT />}</div>
                                     <span className="font-mono font-black text-xs text-white">{u.name}</span>
                                  </div>
                                  {session?.role === 'DISPATCH' && <button onClick={() => handleDetachUnit(uid)} className="text-slate-700 hover:text-red-500 p-1 active:scale-125 transition-all"><Icons.X /></button>}
                               </div>
                               <div className="flex items-center justify-between">
                                  <span className={`text-[8px] px-2 py-0.5 rounded border font-black ${STATUS_COLORS[u.status]}`}>{u.status}</span>
                                  <span className="text-[8px] text-slate-700 italic">OP: {u.robloxUser}</span>
                               </div>
                            </div>
                          );
                        });
                      })()}
                   </div>
                </div>
              </div>
            ) : <div className="flex-1 flex flex-col items-center justify-center opacity-10"><Icons.Police /><div className="text-xl sm:text-2xl font-black uppercase tracking-[0.5em] text-white mt-8 text-center px-4">System Idle</div></div>}
          </div>
        </section>
      </div>

      {effectiveIsMobile && (
        <nav className="h-20 bg-slate-900 border-t border-slate-800 flex items-center justify-around px-4 shrink-0 z-30 pb-2">
          <button onClick={() => setMobileTab('UNITS')} className={`flex flex-col items-center gap-1.5 transition-all w-20 ${mobileTab === 'UNITS' ? 'text-blue-400 scale-110' : 'text-slate-600'}`}>
            <Icons.Police />
            <span className="text-[10px] font-black uppercase tracking-widest">Units</span>
          </button>
          <button onClick={() => setMobileTab('INCIDENTS')} className={`flex flex-col items-center gap-1.5 transition-all w-20 ${mobileTab === 'INCIDENTS' ? 'text-blue-400 scale-110' : 'text-slate-600'}`}>
            <Icons.Fire />
            <span className="text-[10px] font-black uppercase tracking-widest">Calls</span>
          </button>
          <button onClick={() => setMobileTab('ACTIVE')} className={`flex flex-col items-center gap-1.5 transition-all w-20 ${mobileTab === 'ACTIVE' ? 'text-emerald-400 scale-110' : 'text-slate-600'} ${!activeIncidentId ? 'opacity-20 grayscale cursor-not-allowed' : ''}`}>
            <Icons.Send />
            <span className="text-[10px] font-black uppercase tracking-widest">Action</span>
          </button>
        </nav>
      )}

      {isAssigningUnit && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#020617]/95 backdrop-blur-xl p-4">
           <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-6 sm:p-8 w-full max-w-[calc(100vw-2rem)] md:max-w-lg space-y-6 sm:space-y-8 animate-in zoom-in-95 shadow-3xl max-h-[85vh] flex flex-col">
              <h2 className="text-lg sm:text-xl font-black uppercase tracking-widest text-white shrink-0">Attach Asset</h2>
              <div className="flex-1 overflow-y-auto space-y-2 p-1 custom-scrollbar">
                 {groupedUnits.field.filter(u => {
                    let assigned: string[] = [];
                    try { assigned = JSON.parse(incidentsMap[activeIncidentId || '']?.assignedUnits || '[]'); } catch(e) {}
                    return !assigned.includes(u.id);
                 }).map(u => (
                   <button key={u.id} onClick={() => handleAssignUnit(u.id)} className={`w-full bg-slate-950 hover:bg-slate-800 border-2 ${u.type === UnitType.POLICE ? 'border-blue-500/30' : u.type === UnitType.FIRE ? 'border-red-500/30' : 'border-yellow-500/30'} p-4 rounded-2xl flex items-center justify-between transition-all group active:scale-[0.98]`}>
                      <div className="flex items-center gap-4">
                         <div className={u.type === UnitType.POLICE ? 'text-blue-500' : u.type === UnitType.FIRE ? 'text-red-500' : 'text-yellow-500'}>
                            {u.type === UnitType.POLICE ? <Icons.Police /> : u.type === UnitType.FIRE ? <Icons.Fire /> : <Icons.DOT />}
                         </div>
                         <div className="text-left">
                            <div className="font-black text-white text-sm">{u.name}</div>
                            <div className="text-[9px] text-slate-600 uppercase font-mono">{u.status}</div>
                         </div>
                      </div>
                      <Icons.Plus />
                   </button>
                 ))}
                 {groupedUnits.field.length === 0 && <div className="text-center py-10 opacity-30 text-[10px] font-black uppercase italic">No Units Available</div>}
              </div>
              <button onClick={() => setIsAssigningUnit(false)} className="w-full py-4 text-slate-500 font-black text-[11px] uppercase tracking-widest hover:text-white shrink-0 active:scale-95">Cancel</button>
           </div>
        </div>
      )}

      {isAddingUnit && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/95 backdrop-blur-xl p-4">
           <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-8 md:p-12 w-full max-w-[calc(100vw-2rem)] md:max-w-lg space-y-8 animate-in zoom-in-95 shadow-3xl">
              <h2 className="text-xl font-black uppercase tracking-widest text-white flex items-center gap-3"><Icons.Plus /> Manual Entry</h2>
              <div className="space-y-6">
                 <div className="space-y-2"><label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Callsign</label><input type="text" value={newUnitData.callsign} onChange={(e) => setNewUnitData(p => ({...p, callsign: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 uppercase font-mono text-white outline-none focus:ring-2 focus:ring-emerald-500 text-lg" placeholder="E.G. 1L-10" /></div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Unit Type</label>
                    <div className="grid grid-cols-3 gap-2">
                        {[UnitType.POLICE, UnitType.FIRE, UnitType.DOT].map(t => (
                            <button key={t} onClick={() => setNewUnitData(p => ({...p, type: t}))} className={`py-4 rounded-xl border text-[10px] font-black transition-all active:scale-95 ${newUnitData.type === t ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>{t}</button>
                        ))}
                    </div>
                 </div>
              </div>
              <div className="flex gap-4 pt-4"><button onClick={() => setIsAddingUnit(false)} className="flex-1 font-black text-[11px] text-slate-500 uppercase tracking-widest hover:text-white active:scale-95">Cancel</button><button onClick={handleManualAddUnit} className="flex-[2] bg-emerald-600 hover:bg-emerald-500 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-2xl transition-all active:scale-95">Add Unit</button></div>
           </div>
        </div>
      )}

      {isCreatingCall && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[#020617]/95 backdrop-blur-xl p-4 md:p-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-6 sm:p-10 md:p-12 w-full max-w-[calc(100vw-2rem)] md:max-w-2xl space-y-6 sm:space-y-8 animate-in zoom-in-95 shadow-3xl max-h-[90vh] overflow-y-auto custom-scrollbar">
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                <div className="space-y-3 sm:space-y-4">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Responding Agency</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setNewCallDept(UnitType.POLICE)} className={`py-4 rounded-xl border text-[10px] font-black transition-all active:scale-95 ${newCallDept === UnitType.POLICE ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-700'}`}>POLICE</button>
                    <button onClick={() => setNewCallDept(UnitType.FIRE)} className={`py-4 rounded-xl border text-[10px] font-black transition-all active:scale-95 ${newCallDept === UnitType.FIRE ? 'bg-red-600 border-red-400 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-700'}`}>FIRE</button>
                    <button onClick={() => setNewCallDept(UnitType.DOT)} className={`py-4 rounded-xl border text-[10px] font-black transition-all active:scale-95 ${newCallDept === UnitType.DOT ? 'bg-yellow-600 border-yellow-400 text-white shadow-lg' : 'bg-slate-950 border-slate-800 text-slate-700'}`}>DOT</button>
                  </div>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Call Scenario</label>
                  <select value={newCallType} onChange={(e) => setNewCallType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 font-black text-white text-sm outline-none appearance-none cursor-pointer shadow-inner">
                    {DEPARTMENT_CALL_TYPES[newCallDept]?.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                <div className="space-y-3 sm:space-y-4">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Location Coordinates</label>
                  <input type="text" placeholder="STREET / POI / POSTAL" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} list="loc-suggestions" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 sm:p-5 font-black outline-none focus:ring-2 focus:ring-blue-500 text-white shadow-inner transition-all placeholder:text-slate-800 text-sm" />
                  <datalist id="loc-suggestions">{ERLC_LOCATIONS.map(l => <option key={l} value={l} />)}</datalist>
                </div>
                <div className="space-y-3 sm:space-y-4">
                  <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Response Code</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.values(Priority).map(p => (
                      <button key={p} onClick={() => setNewPriority(p)} className={`py-4 rounded-xl border text-[11px] font-black uppercase transition-all tracking-tighter active:scale-95 ${newPriority === p ? 'bg-slate-700 text-white shadow-lg border-slate-500' : 'bg-slate-950 text-slate-800 border-slate-800'}`}>{p}</button>
                    ))}
                  </div>
                </div>
             </div>

             <div className="flex gap-4 sm:gap-6 pt-4">
                <button onClick={() => setIsCreatingCall(false)} className="flex-1 font-black text-[11px] text-slate-500 uppercase tracking-widest hover:text-white transition-colors active:scale-95 py-4">Discard</button>
                <button onClick={createIncident} className="flex-[3] bg-blue-600 hover:bg-blue-500 text-white py-5 sm:py-6 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all text-sm">Broadcast Call</button>
             </div>
          </div>
        </div>
      )}

      <footer className="h-10 md:h-12 bg-slate-950 border-t border-slate-900 flex items-center px-4 md:px-8 justify-between shrink-0 text-[10px] font-mono tracking-widest text-slate-700 uppercase font-black z-20">
        <div className="flex gap-4 md:gap-10 items-center"><div className="flex items-center gap-2 md:gap-3"><div key={lastSyncTime} className={`w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse`}></div>SYNC_STATUS: ACTIVE</div><div className="hidden sm:flex items-center gap-3 text-slate-800 italic uppercase">FREQ_ID: {roomId}</div></div>
      </footer>
    </div>
  );
};

export default App;
