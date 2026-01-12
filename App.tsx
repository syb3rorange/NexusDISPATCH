
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Gun from 'gun';
import { Unit, Incident, UnitStatus, UnitType, Priority, IncidentLog, UserSession } from './types';
import { CALL_TYPES, STATUS_COLORS, PRIORITY_COLORS, Icons, ERLC_LOCATIONS } from './constants';
import { assistDispatcher, generateAutoDispatch } from './geminiService';

const gun = Gun([
  'https://gun-manhattan.herokuapp.com/gun', 
  'https://relay.peer.ooo/gun',
  'https://gun-ams1.marda.io/gun'
]);

const STORAGE_KEY_PROFILE = 'nexus_cad_profile_v7';
const STORAGE_KEY_DISPATCH_AUTH = 'nexus_cad_dispatch_v7';
const STORAGE_KEY_SESSION_TYPE = 'nexus_cad_session_type_v7';
const STORAGE_KEY_AUTO_CALLS = 'nexus_cad_auto_calls_v7';
const STORAGE_KEY_AUTO_DISPATCH = 'nexus_cad_auto_dispatch_v7';
const STORAGE_KEY_ERLC_KEY = 'nexus_cad_erlc_key_v7';

const ERLC_API_BASE = 'https://api.policeroleplay.community/v1';

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
  const [onboardingData, setOnboardingData] = useState({ roblox: '', callsign: '', type: UnitType.POLICE });
  const [savedProfile, setSavedProfile] = useState<{roblox: string, callsign: string, type: UnitType} | null>(null);

  // Automation & API State
  const [autoCallsEnabled, setAutoCallsEnabled] = useState(() => localStorage.getItem(STORAGE_KEY_AUTO_CALLS) === 'true');
  const [autoDispatchEnabled, setAutoDispatchEnabled] = useState(() => localStorage.getItem(STORAGE_KEY_AUTO_DISPATCH) === 'true');
  const [erlcApiKey, setErlcApiKey] = useState(() => localStorage.getItem(STORAGE_KEY_ERLC_KEY) || '');
  const [isAutomationOpen, setIsAutomationOpen] = useState(false);
  const [erlcStatus, setErlcStatus] = useState<{online: boolean, players: number}>({ online: false, players: 0 });

  const [unitsMap, setUnitsMap] = useState<Record<string, Unit>>({});
  const [incidentsMap, setIncidentsMap] = useState<Record<string, Incident>>({});
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  
  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [logInput, setLogInput] = useState('');
  const [isAIAssisting, setIsAIAssisting] = useState(false);
  const [isMobileMode, setIsMobileMode] = useState(window.innerWidth < 1024);
  const [mobileTab, setMobileTab] = useState<'UNITS' | 'INCIDENTS' | 'ACTIVE'>('INCIDENTS');
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [alertMessage, setAlertMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [newCallType, setNewCallType] = useState(CALL_TYPES[0]);
  const [newLocation, setNewLocation] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM);

  const logInputRef = useRef<HTMLInputElement>(null);

  const units = useMemo(() => (Object.values(unitsMap) as Unit[]).sort((a,b) => a.id.localeCompare(b.id)), [unitsMap]);
  const incidents = useMemo(() => (Object.values(incidentsMap) as Incident[]).filter(i => i && i.status === 'ACTIVE'), [incidentsMap]);
  const activeIncident = useMemo(() => incidentsMap[activeIncidentId || ''], [incidentsMap, activeIncidentId]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_AUTO_CALLS, String(autoCallsEnabled));
    localStorage.setItem(STORAGE_KEY_AUTO_DISPATCH, String(autoDispatchEnabled));
    localStorage.setItem(STORAGE_KEY_ERLC_KEY, erlcApiKey);
  }, [autoCallsEnabled, autoDispatchEnabled, erlcApiKey]);

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
    
    const handleResize = () => setIsMobileMode(window.innerWidth < 1024);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ER:LC API Integration Polling
  useEffect(() => {
    if (!erlcApiKey || !autoCallsEnabled || session?.role !== 'DISPATCH') {
      setErlcStatus({ online: false, players: 0 });
      return;
    }

    const pollERLC = async () => {
      try {
        // We use a CORS proxy because ER:LC API doesn't allow direct browser requests
        const proxyUrl = 'https://api.allorigins.win/raw?url=';
        const headers = { 'Server-Key': erlcApiKey };

        // 1. Fetch Server Status
        const serverResp = await fetch(`${proxyUrl}${encodeURIComponent(`${ERLC_API_BASE}/server`)}`, { headers });
        const serverData = await serverResp.json();
        
        if (serverData) {
          setErlcStatus({ online: true, players: serverData.CurrentPlayers || 0 });
        }

        // 2. Fetch Active Calls
        const callsResp = await fetch(`${proxyUrl}${encodeURIComponent(`${ERLC_API_BASE}/server/calls`)}`, { headers });
        const callsData = await callsResp.json();

        if (Array.isArray(callsData)) {
          callsData.forEach((call: any) => {
            const callId = `ERLC-${call.CallID || Math.random().toString(36).substr(2, 5)}`;
            // Only add if not already in incidentsMap
            if (!incidentsMap[callId]) {
              const incident: Incident = {
                id: callId,
                callType: call.Title || '911 Emergency',
                location: call.Description || 'Unknown Location',
                priority: Priority.HIGH,
                status: 'ACTIVE',
                assignedUnits: JSON.stringify([]),
                logs: JSON.stringify([{ 
                  id: '1', 
                  timestamp: new Date().toLocaleTimeString(), 
                  sender: 'ERLC-API', 
                  message: `LIVE FEED: Incoming ${call.Title}. Dispatch advised.` 
                }]),
                startTime: new Date().toISOString(),
              };
              gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(callId).put(incident);
            }
          });
        }
      } catch (err) {
        console.warn("ER:LC API Polling failed (likely CORS or Invalid Key):", err);
        setErlcStatus({ online: false, players: 0 });
      }
    };

    const interval = setInterval(pollERLC, 15000); // Poll every 15s
    pollERLC(); // Initial run
    return () => clearInterval(interval);
  }, [erlcApiKey, autoCallsEnabled, session?.role, roomId]);

  // Sync Logic
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
        const isNew = !prev[id] && data?.status === 'ACTIVE';
        if (isNew && autoDispatchEnabled && session?.role === 'DISPATCH') {
          setTimeout(() => {
            const currentIncident = incidentsMap[id] || data;
            const currentLogs = JSON.parse(currentIncident.logs || '[]');
            if (currentLogs.length <= 1) {
              handleAutoDispatchBroadcast(id, currentIncident.callType, currentIncident.location);
            }
          }, 3000);
        }

        if (!data) {
          const newState = { ...prev };
          delete newState[id];
          return newState;
        }

        if (session?.role === 'UNIT' && isNew) {
          setAlertMessage(`🚨 NEW CALL: ${data.callType} @ ${data.location}`);
          setTimeout(() => setAlertMessage(null), 5000);
          if (!activeIncidentId && (data.priority === Priority.EMERGENCY || data.priority === Priority.HIGH)) {
            setActiveIncidentId(id);
            if (isMobileMode) setMobileTab('ACTIVE');
          }
        }

        return { ...prev, [id]: data };
      });
    });

    return () => {
      root.get('units').off();
      root.get('incidents').off();
    };
  }, [roomId, session?.role, activeIncidentId, isMobileMode, autoDispatchEnabled]);

  useEffect(() => {
    if (activeIncidentId || mobileTab === 'ACTIVE') {
      const timer = setTimeout(() => {
        logInputRef.current?.focus();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeIncidentId, mobileTab]);

  const handleAutoDispatchBroadcast = async (incId: string, call: string, loc: string) => {
    const message = await generateAutoDispatch(call, loc);
    const incident = incidentsMap[incId];
    if (!incident) return;
    
    let logs: IncidentLog[] = [];
    try { logs = JSON.parse(incident.logs); } catch(e) { logs = []; }
    
    const newLog: IncidentLog = {
      id: `ai_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      sender: 'V-DISPATCH',
      message: message
    };

    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(incId).get('logs').put(JSON.stringify([...logs, newLog]));
  };

  const handleLoginDispatch = () => {
    if (hasPersistentDispatch || dispatchPass === '10-4') {
      localStorage.setItem(STORAGE_KEY_DISPATCH_AUTH, '10-4');
      localStorage.setItem(STORAGE_KEY_SESSION_TYPE, 'DISPATCH');
      setSession({ role: 'DISPATCH' });
    } else {
      alert("Unauthorized. Correct Dispatch code required (10-4)");
    }
  };

  const performJoin = (data: {roblox: string, callsign: string, type: UnitType}) => {
    const callsign = data.callsign.toUpperCase();
    setSession({ role: 'UNIT', username: data.roblox, callsign, unitType: data.type });
    localStorage.setItem(STORAGE_KEY_PROFILE, JSON.stringify(data));
    localStorage.setItem(STORAGE_KEY_SESSION_TYPE, 'UNIT');

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
    if (savedProfile) performJoin(savedProfile);
  };

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 800);
  };

  const handleSignOut = () => {
    localStorage.removeItem(STORAGE_KEY_SESSION_TYPE);
    setSession(null);
  };

  const updateUnitStatus = (unitId: string, status: UnitStatus) => {
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(unitId).get('status').put(status);
    gun.get('nexus_cad_v7_final').get(roomId).get('units').get(unitId).get('lastUpdated').put(new Date().toISOString());
  };

  const createIncident = async () => {
    if (!newLocation || session?.role !== 'DISPATCH') return;
    const id = `INC-${Math.floor(Math.random() * 9000) + 1000}`;
    const initialLogs: IncidentLog[] = [{ 
      id: '1', 
      timestamp: new Date().toLocaleTimeString(), 
      sender: 'DISPATCH', 
      message: `Incident Initialized: ${newCallType}` 
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
    if (isMobileMode) setMobileTab('ACTIVE');
  };

  const handleAddLog = async () => {
    if (!logInput || !activeIncidentId) {
      logInputRef.current?.focus();
      return;
    }
    
    let finalMessage = logInput;
    if (isAIAssisting) {
      setIsAIAssisting(false);
      finalMessage = await assistDispatcher(logInput);
    }

    const currentIncident = incidentsMap[activeIncidentId];
    if (currentIncident) {
      let logs: IncidentLog[] = [];
      try { logs = JSON.parse(currentIncident.logs); } catch(e) { logs = []; }
      
      const newLog: IncidentLog = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString(),
        sender: session?.role === 'DISPATCH' ? 'DISPATCH' : (session?.callsign || 'UNIT'),
        message: finalMessage
      };

      gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).get('logs').put(JSON.stringify([...logs, newLog]));
    }
    setLogInput('');
    requestAnimationFrame(() => {
      logInputRef.current?.focus();
    });
  };

  const handleCloseIncident = () => {
    if (!activeIncidentId || session?.role !== 'DISPATCH') return;
    gun.get('nexus_cad_v7_final').get(roomId).get('incidents').get(activeIncidentId).put(null);
    setActiveIncidentId(null);
    if (isMobileMode) setMobileTab('INCIDENTS');
  };

  if (!session) {
    return (
      <div className="h-screen w-screen bg-[#020617] flex flex-col items-center justify-center p-4 text-slate-100 relative overflow-hidden">
        <div className="z-10 w-full max-w-5xl flex flex-col items-center max-h-full overflow-y-auto py-10 px-4 custom-scrollbar">
          <div className="bg-blue-600 p-5 rounded-[2.5rem] shadow-2xl mb-8 border border-blue-400/30 shrink-0"><Icons.Police /></div>
          <h1 className="text-4xl md:text-6xl font-black tracking-widest mb-4 uppercase text-center shrink-0">NEXUS<span className="text-blue-500">CAD</span></h1>
          <div className="flex gap-3 mb-12 text-[10px] font-mono uppercase text-slate-600 shrink-0 tracking-[0.3em]">Frequency: <span className="text-blue-400 font-bold">{roomId}</span></div>
          <div className="grid lg:grid-cols-3 gap-6 w-full max-w-6xl">
            {/* Dispatch Login */}
            <div className="bg-slate-900/40 border border-slate-800 p-8 md:p-10 rounded-[2.5rem] backdrop-blur-xl flex flex-col hover:border-blue-500/50 transition-all shadow-xl">
              <h2 className="text-xl font-black mb-6 uppercase flex items-center gap-3"><Icons.Send /> Dispatch</h2>
              {hasPersistentDispatch ? (
                  <div className="mb-6 p-5 bg-blue-500/10 border border-blue-500/30 rounded-2xl flex flex-col items-center justify-center">
                    <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Authenticated</span>
                    <span className="text-xs text-slate-500 font-mono italic text-center">Identity verified. Tap below to resume.</span>
                  </div>
              ) : (
                <input type="password" placeholder="Passcode (10-4)" value={dispatchPass} onChange={(e) => setDispatchPass(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-5 mb-4 font-bold outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
              )}
              <button onClick={handleLoginDispatch} className="w-full bg-blue-600 hover:bg-blue-500 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg mt-auto active:scale-95">Establish Comms</button>
            </div>
            {/* Field Unit Login */}
            <div className="bg-slate-900/40 border border-slate-800 p-8 md:p-10 rounded-[2.5rem] backdrop-blur-xl flex flex-col hover:border-emerald-500/50 transition-all shadow-xl">
              <h2 className="text-xl font-black mb-6 uppercase flex items-center gap-3"><Icons.Police /> Field Join</h2>
              <div className="space-y-4 mb-6">
                <input type="text" placeholder="Roblox Name" value={onboardingData.roblox} onChange={(e) => setOnboardingData(p => ({...p, roblox: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-bold outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner" />
                <input type="text" placeholder="Callsign" value={onboardingData.callsign} onChange={(e) => setOnboardingData(p => ({...p, callsign: e.target.value}))} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 uppercase font-mono outline-none focus:ring-2 focus:ring-emerald-500 text-sm shadow-inner" />
                <div className="grid grid-cols-3 gap-2">
                    {[UnitType.POLICE, UnitType.FIRE, UnitType.EMS].map(t => (
                        <button key={t} onClick={() => setOnboardingData(p => ({...p, type: t}))} className={`py-3 rounded-xl border text-[9px] font-black transition-all ${onboardingData.type === t ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>{t}</button>
                    ))}
                </div>
              </div>
              <button onClick={handleJoinUnit} className="w-full bg-emerald-600 hover:bg-emerald-500 p-5 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg active:scale-95">Initialize Node</button>
            </div>
            {/* Quick Login */}
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

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#020617] text-slate-100 font-sans selection:bg-blue-500/30">
      <header className={`h-16 shrink-0 ${session.role === 'DISPATCH' ? 'bg-slate-900/50 border-blue-500/20' : 'bg-slate-900/50 border-emerald-500/20'} border-b flex items-center justify-between px-4 md:px-8 backdrop-blur-xl z-20`}>
        <div className="flex items-center gap-3 md:gap-6">
          <div className={`${session.role === 'DISPATCH' ? 'bg-blue-600 shadow-blue-500/40' : 'bg-emerald-600 shadow-emerald-500/40'} p-2 rounded-xl border border-white/20 shadow-lg`}><Icons.Police /></div>
          <h1 className="text-lg md:text-xl font-black uppercase tracking-tighter hidden sm:block">Nexus<span className={session.role === 'DISPATCH' ? 'text-blue-500' : 'text-emerald-500'}>{session.role}</span></h1>
          
          {erlcStatus.online && (
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className="text-[9px] font-black text-emerald-400 tracking-tighter">ER:LC LINK OK ({erlcStatus.players} PLAYER)</span>
            </div>
          )}

          {autoDispatchEnabled && !erlcStatus.online && (
            <div className="flex items-center gap-2 px-3 py-1 bg-blue-500/10 border border-blue-500/30 rounded-full animate-pulse">
              <Icons.Cpu />
              <span className="text-[9px] font-black text-blue-400 tracking-tighter">AI DISPATCH ACTIVE</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <button title="Automation Engine" onClick={() => setIsAutomationOpen(true)} className={`p-3 rounded-xl border border-slate-800 hover:border-blue-500/50 transition-all ${autoDispatchEnabled || autoCallsEnabled ? 'text-blue-400 border-blue-500/30' : 'text-slate-500'}`}><Icons.Cpu /></button>
          <button title="Tactical Sync" onClick={handleManualRefresh} className={`p-3 rounded-xl border border-slate-800 hover:border-blue-500/50 text-slate-500 transition-all ${isRefreshing ? 'animate-spin text-blue-500' : ''}`}><Icons.Refresh /></button>
          <button onClick={() => setIsMobileMode(!isMobileMode)} className="p-3 rounded-xl border border-slate-800 hover:border-blue-500/50 text-slate-500 transition-all">{isMobileMode ? <Icons.Monitor /> : <Icons.Smartphone />}</button>
          {session.role === 'DISPATCH' && <button onClick={() => setIsCreatingCall(true)} className="bg-blue-600 hover:bg-blue-500 px-4 md:px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg">New Broadcast</button>}
          <button onClick={handleSignOut} className="text-[10px] font-black uppercase text-slate-600 hover:text-red-500 px-2 transition-colors">Sign Out</button>
        </div>
      </header>

      {alertMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] animate-in slide-in-from-top-4">
          <div className="bg-red-600 text-white font-black text-[11px] uppercase tracking-[0.2em] px-8 py-4 rounded-full shadow-2xl border border-white/20 flex items-center gap-4">
             <div className="animate-ping w-2 h-2 rounded-full bg-white"></div>
             {alertMessage}
          </div>
        </div>
      )}
      
      <div className="flex-1 flex overflow-hidden">
        <aside className={`${isMobileMode ? (mobileTab === 'UNITS' ? 'flex w-full' : 'hidden') : 'w-80 flex'} border-r border-slate-800/60 bg-slate-950/40 flex-col shrink-0`}>
          <div className="p-6 border-b border-slate-800 flex items-center justify-between"><h2 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Personnel Online</h2></div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
            {units.map(unit => (
              <div key={unit.id} className={`p-5 rounded-3xl border transition-all ${unit.name === session.callsign ? 'bg-emerald-500/5 border-emerald-500/40 shadow-xl' : 'bg-slate-900/40 border-slate-800/50 hover:bg-slate-900/60'}`}>
                <div className="flex justify-between mb-3 items-center">
                  <span className="font-mono font-black text-sm tracking-tight">{unit.name}</span>
                  <div className={`text-[9px] px-2 py-0.5 rounded-lg border font-black ${STATUS_COLORS[unit.status]}`}>{unit.status.replace(/_/g, ' ')}</div>
                </div>
                {(session.role === 'DISPATCH' || unit.name === session.callsign) && (
                  <div className="grid grid-cols-5 gap-1">
                    {Object.values(UnitStatus).map(s => <button key={s} onClick={() => updateUnitStatus(unit.id, s)} className={`text-[10px] py-2 rounded-lg border font-black transition-colors ${unit.status === s ? 'bg-slate-800 border-slate-600 text-white shadow-inner' : 'bg-slate-950/40 border-slate-800 text-slate-700 hover:text-slate-500'}`}>{s.charAt(0)}</button>)}
                  </div>
                )}
                <div className="mt-3 text-[9px] text-slate-700 font-mono uppercase truncate italic">Op: {unit.robloxUser}</div>
              </div>
            ))}
          </div>
        </aside>

        <section className={`${isMobileMode ? (mobileTab === 'UNITS' ? 'hidden' : 'flex') : 'flex'} flex-1 flex-col bg-[#020617]`}>
          <div className={`${isMobileMode && mobileTab !== 'INCIDENTS' ? 'hidden' : 'flex'} h-44 shrink-0 border-b border-slate-800/60 p-6 gap-6 overflow-x-auto items-center custom-scrollbar`}>
            {incidents.map(incident => (
              <div key={incident.id} onClick={() => { setActiveIncidentId(incident.id); if (isMobileMode) setMobileTab('ACTIVE'); }} className={`w-80 shrink-0 p-6 rounded-[2.5rem] border cursor-pointer transition-all relative ${activeIncidentId === incident.id ? 'bg-blue-900/5 border-blue-500 shadow-2xl scale-[1.02]' : 'bg-slate-900/30 border-slate-800/50 hover:bg-slate-900/40 hover:border-slate-700'}`}>
                <div className="flex justify-between items-start mb-4">
                  <span className="text-[10px] font-mono font-bold text-slate-600">{incident.id}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                    <span className={`text-[10px] uppercase font-black tracking-widest ${PRIORITY_COLORS[incident.priority]}`}>{incident.priority}</span>
                  </div>
                </div>
                <div className="font-black text-sm truncate uppercase tracking-wide">{incident.callType}</div>
                <div className="text-[11px] text-slate-500 truncate mb-5 italic">Loc: {incident.location}</div>
              </div>
            ))}
            {incidents.length === 0 && <div className="flex-1 flex items-center justify-center opacity-20 text-[10px] font-black uppercase tracking-[0.5em] italic">Operational Silence</div>}
          </div>

          <div className={`${isMobileMode && mobileTab !== 'ACTIVE' ? 'hidden' : 'flex'} flex-1 flex-col overflow-hidden`}>
            {activeIncident ? (
              <div className="flex-1 flex flex-col p-4 md:p-8 overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                <div className="flex justify-between items-start mb-6 md:mb-10">
                    <div><h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tighter mb-2 md:mb-4 drop-shadow-2xl">{activeIncident.callType}</h2><div className="text-[11px] text-slate-500 uppercase tracking-[0.3em] font-black italic">Target: {activeIncident.location}</div></div>
                    {session.role === 'DISPATCH' && <button onClick={handleCloseIncident} className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-6 md:px-10 py-3 md:py-4 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest transition-all border border-red-500/20 shadow-xl">Purge</button>}
                </div>
                <div className="flex-1 flex flex-col bg-slate-950/40 rounded-[2rem] md:rounded-[3rem] border border-slate-800/40 overflow-hidden shadow-3xl backdrop-blur-xl" onClick={() => logInputRef.current?.focus()}>
                    <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-4 md:space-y-6 font-mono text-sm custom-scrollbar">
                      {(() => {
                        let logs: IncidentLog[] = [];
                        try { logs = JSON.parse(activeIncident.logs); } catch(e) { logs = []; }
                        return logs.map((log, idx) => (
                          <div key={idx} className="flex gap-4 md:gap-8 group"><span className="text-slate-800 font-black text-[10px] mt-1 shrink-0">[{log.timestamp}]</span><div className="flex-1"><span className={`font-black mr-2 md:mr-4 uppercase tracking-widest ${log.sender.includes('DISPATCH') || log.sender.includes('API') ? 'text-blue-500' : 'text-emerald-500'}`}>{log.sender}:</span><span className="text-slate-400 group-hover:text-slate-200 transition-colors">{log.message}</span></div></div>
                        ));
                      })()}
                    </div>
                    <div className="p-4 md:p-10 bg-slate-950/60 border-t border-slate-800/40">
                      <div className="flex gap-3 md:gap-5">
                        <input ref={logInputRef} type="text" autoFocus value={logInput} onChange={(e) => setLogInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddLog()} placeholder="Enter situational report..." className="flex-1 bg-slate-950 border border-slate-800 rounded-[1.2rem] md:rounded-[1.5rem] px-4 md:px-8 py-4 md:py-6 text-xs md:text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500 text-white placeholder:text-slate-900 shadow-inner" />
                        <button onClick={() => setIsAIAssisting(!isAIAssisting)} className={`p-4 md:p-6 rounded-[1.2rem] md:rounded-[1.5rem] border transition-all ${isAIAssisting ? 'bg-blue-600 text-white border-blue-400 shadow-xl' : 'bg-slate-900 border-slate-800 text-slate-600 hover:text-white'}`}><Icons.Sparkles /></button>
                        <button onClick={handleAddLog} className="bg-blue-600 hover:bg-blue-500 p-4 md:p-6 rounded-[1.2rem] md:rounded-[1.5rem] shadow-2xl transition-all active:scale-95 border border-white/10"><Icons.Send /></button>
                      </div>
                    </div>
                </div>
              </div>
            ) : <div className="flex-1 flex flex-col items-center justify-center opacity-10">
                  <div className="w-24 md:w-32 h-24 md:h-32 mb-6 md:mb-8 bg-slate-900 rounded-[2rem] md:rounded-[3rem] flex items-center justify-center border border-slate-800 shadow-2xl"><Icons.Police /></div>
                  <div className="text-2xl md:text-4xl font-black uppercase tracking-[0.5em] text-white">System Idle</div>
                </div>}
          </div>
        </section>
      </div>

      {isMobileMode && (
        <nav className="h-16 bg-slate-950 border-t border-slate-900 grid grid-cols-3 shrink-0 z-20">
          <button onClick={() => setMobileTab('UNITS')} className={`flex flex-col items-center justify-center gap-1 ${mobileTab === 'UNITS' ? 'text-blue-500' : 'text-slate-700'}`}><Icons.Police /><span className="text-[8px] font-black uppercase">Units</span></button>
          <button onClick={() => setMobileTab('INCIDENTS')} className={`flex flex-col items-center justify-center gap-1 ${mobileTab === 'INCIDENTS' ? 'text-blue-500' : 'text-slate-700'}`}><Icons.AlertCircle /><span className="text-[8px] font-black uppercase">Calls</span></button>
          <button onClick={() => setMobileTab('ACTIVE')} className={`flex flex-col items-center justify-center gap-1 ${mobileTab === 'ACTIVE' ? 'text-blue-500' : 'text-slate-700'}`}><Icons.Plus /><span className="text-[8px] font-black uppercase">Active</span></button>
        </nav>
      )}

      {/* Automation & ER:LC Settings Overlay */}
      {isAutomationOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/95 backdrop-blur-xl p-4 md:p-8 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-8 md:p-12 w-full max-w-xl space-y-6 animate-in zoom-in-95 shadow-3xl">
             <div className="text-center">
                <h3 className="text-2xl font-black uppercase tracking-widest text-white mb-2">ER:LC Command Link</h3>
                <p className="text-[10px] text-slate-500 font-mono">Live External API Integration</p>
             </div>
             
             <div className="space-y-4">
                <div className="p-6 bg-slate-950/40 border border-slate-800 rounded-3xl">
                   <div className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-3">ER:LC Server API Key</div>
                   <input 
                     type="password" 
                     placeholder="Enter Server-Key (From Game Settings)" 
                     value={erlcApiKey} 
                     onChange={(e) => setErlcApiKey(e.target.value)}
                     className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-white outline-none focus:ring-2 focus:ring-blue-500"
                   />
                   <div className="text-[8px] text-slate-600 mt-3 italic uppercase leading-relaxed">
                     Obtain this key from: In-Game -> Settings -> External API -> Copy Key.
                   </div>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-950 border border-slate-800 rounded-3xl">
                   <div>
                     <div className="font-black text-xs uppercase text-white">Live Call Syncing</div>
                     <div className="text-[9px] text-slate-500 italic mt-1">Poll server every 15s for new emergency calls.</div>
                   </div>
                   <button onClick={() => setAutoCallsEnabled(!autoCallsEnabled)} className={`w-14 h-8 rounded-full transition-all relative ${autoCallsEnabled ? 'bg-emerald-600' : 'bg-slate-800'}`}>
                     <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${autoCallsEnabled ? 'left-7' : 'left-1'}`}></div>
                   </button>
                </div>

                <div className="flex items-center justify-between p-6 bg-slate-950 border border-slate-800 rounded-3xl">
                   <div>
                     <div className="font-black text-xs uppercase text-white">AI Dispatch Response</div>
                     <div className="text-[9px] text-slate-500 italic mt-1">AI handles radio traffic for incoming ER:LC calls.</div>
                   </div>
                   <button onClick={() => setAutoDispatchEnabled(!autoDispatchEnabled)} className={`w-14 h-8 rounded-full transition-all relative ${autoDispatchEnabled ? 'bg-blue-600' : 'bg-slate-800'}`}>
                     <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${autoDispatchEnabled ? 'left-7' : 'left-1'}`}></div>
                   </button>
                </div>
             </div>
             
             <button onClick={() => setIsAutomationOpen(false)} className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all shadow-xl">Establish Uplink</button>
             <button onClick={() => { localStorage.removeItem(STORAGE_KEY_ERLC_KEY); setErlcApiKey(''); }} className="w-full text-[9px] font-black text-slate-700 uppercase hover:text-red-500 transition-colors">Wipe API Credentials</button>
          </div>
        </div>
      )}

      {isCreatingCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#020617]/95 backdrop-blur-xl p-4 md:p-8">
          <div className="bg-slate-900 border border-slate-800 rounded-[3rem] p-8 md:p-12 w-full max-w-2xl space-y-8 animate-in zoom-in-95 shadow-3xl max-h-[90vh] overflow-y-auto custom-scrollbar">
             <div className="grid md:grid-cols-2 gap-6 md:gap-8">
                <div className="space-y-4"><label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Incident Category</label><select value={newCallType} onChange={(e) => setNewCallType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 md:p-5 font-black text-white outline-none appearance-none cursor-pointer shadow-inner">{CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="space-y-4"><label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Priority Code</label><div className="grid grid-cols-2 gap-2">{Object.values(Priority).map(p => <button key={p} onClick={() => setNewPriority(p)} className={`py-3 md:py-4 rounded-xl border text-[10px] font-black uppercase transition-all tracking-tighter ${newPriority === p ? 'bg-blue-600 text-white shadow-lg border-blue-400' : 'bg-slate-950 text-slate-700 border-slate-800'}`}>{p}</button>)}</div></div>
             </div>
             <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Coordinates</label>
                <input type="text" placeholder="GRID / ZONE / STREET" value={newLocation} onChange={(e) => setNewLocation(e.target.value)} list="loc-suggestions" className="w-full bg-slate-950 border border-slate-800 rounded-2xl p-4 md:p-6 font-black outline-none focus:ring-2 focus:ring-blue-500 text-white shadow-inner transition-all placeholder:text-slate-800" />
                <datalist id="loc-suggestions">{ERLC_LOCATIONS.map(l => <option key={l} value={l} />)}</datalist>
             </div>
             <div className="flex gap-4 md:gap-6 pt-4">
                <button onClick={() => setIsCreatingCall(false)} className="flex-1 font-black text-[11px] text-slate-500 uppercase tracking-widest hover:text-white transition-colors">Discard</button>
                <button onClick={createIncident} className="flex-[3] bg-blue-600 hover:bg-blue-500 text-white py-4 md:py-6 rounded-2xl font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all">Broadcast Call</button>
             </div>
          </div>
        </div>
      )}

      <footer className="h-10 md:h-12 bg-slate-950 border-t border-slate-900 flex items-center px-4 md:px-8 justify-between shrink-0 text-[10px] font-mono tracking-widest text-slate-700 uppercase font-black z-20">
        <div className="flex gap-4 md:gap-10 items-center">
          <div className="flex items-center gap-2 md:gap-3">
             <div key={lastSyncTime} className={`w-2 h-2 rounded-full ${erlcStatus.online ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-slate-800'} animate-pulse`}></div>
             SYSTEM: {erlcStatus.online ? 'LINKED_TO_ERLC' : 'LOCAL_ONLY'}
          </div>
          <div className="hidden sm:flex items-center gap-3 text-slate-800 italic">FREQU_ID: {roomId.toUpperCase()}</div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-slate-800 font-black hidden xs:block">NEXUS v7.5.0 // OFFICIAL_API_INTEGRATION</div>
        </div>
      </footer>
    </div>
  );
};

export default App;
