
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Unit, Incident, UnitStatus, UnitType, Priority, IncidentLog, Role, UserSession } from './types';
import { CALL_TYPES, STATUS_COLORS, PRIORITY_COLORS, Icons } from './constants';
import { assistDispatcher, suggestUnits } from './geminiService';

// Initialize Sync Channel
const syncChannel = new BroadcastChannel('nexus_cad_sync');

const App: React.FC = () => {
  // Session State
  const [session, setSession] = useState<UserSession | null>(null);
  const [dispatchPass, setDispatchPass] = useState('');
  const [onboardingData, setOnboardingData] = useState({ roblox: '', callsign: '', type: UnitType.POLICE });

  // Global CAD State
  const [units, setUnits] = useState<Unit[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [activeIncidentId, setActiveIncidentId] = useState<string | null>(null);
  
  // UI States
  const [isCreatingCall, setIsCreatingCall] = useState(false);
  const [isManagingUnit, setIsManagingUnit] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Unit | null>(null);
  const [logInput, setLogInput] = useState('');
  const [isAIAssisting, setIsAIAssisting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);

  // Unit Management Form States
  const [unitNameInput, setUnitNameInput] = useState('');
  const [unitTypeInput, setUnitTypeInput] = useState<UnitType>(UnitType.POLICE);

  // New Call Form States
  const [newCallType, setNewCallType] = useState(CALL_TYPES[0]);
  const [newLocation, setNewLocation] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>(Priority.MEDIUM);

  // Derived state
  const activeIncident = useMemo(() => incidents.find(i => i.id === activeIncidentId), [incidents, activeIncidentId]);
  const myUnit = useMemo(() => session?.role === 'UNIT' ? units.find(u => u.name === session.callsign) : null, [units, session]);

  // Sync Logic
  const broadcast = (type: string, payload: any) => {
    syncChannel.postMessage({ type, payload, senderId: session?.callsign || 'DISPATCH' });
  };

  useEffect(() => {
    const handleSync = (event: MessageEvent) => {
      const { type, payload } = event.data;
      switch (type) {
        case 'STATE_UPDATE':
          setUnits(payload.units);
          setIncidents(payload.incidents);
          break;
        case 'HEARTBEAT_REQ':
          if (session?.role === 'DISPATCH') {
            broadcast('STATE_UPDATE', { units, incidents });
          }
          break;
      }
    };
    syncChannel.onmessage = handleSync;
    if (session) broadcast('HEARTBEAT_REQ', {});
    return () => { syncChannel.onmessage = null; };
  }, [session, units, incidents]);

  // Push updates if we are Dispatch
  useEffect(() => {
    if (session?.role === 'DISPATCH') {
      broadcast('STATE_UPDATE', { units, incidents });
    }
  }, [units, incidents]);

  // Handlers
  const handleLoginDispatch = () => {
    if (dispatchPass === '10-4') {
      setSession({ role: 'DISPATCH' });
    } else {
      alert("Invalid Dispatch Access Code (Hint: 10-4)");
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
    setUnits(prev => {
      const exists = prev.find(u => u.name === callsign);
      if (exists) return prev.map(u => u.name === callsign ? newUnit : u);
      return [...prev, newUnit];
    });
  };

  const handleOpenUnitModal = (unit?: Unit) => {
    if (unit) {
      setEditingUnit(unit);
      setUnitNameInput(unit.name);
      setUnitTypeInput(unit.type);
    } else {
      setEditingUnit(null);
      setUnitNameInput('');
      setUnitTypeInput(UnitType.POLICE);
    }
    setIsManagingUnit(true);
  };

  const handleSaveUnit = () => {
    if (!unitNameInput) return;
    const name = unitNameInput.toUpperCase();
    if (editingUnit) {
      setUnits(prev => prev.map(u => u.id === editingUnit.id ? { ...u, name, type: unitTypeInput, lastUpdated: new Date().toISOString() } : u));
    } else {
      const newUnit: Unit = {
        id: Math.random().toString(36).substr(2, 5),
        name,
        type: unitTypeInput,
        status: UnitStatus.AVAILABLE,
        lastUpdated: new Date().toISOString(),
      };
      setUnits(prev => [...prev, newUnit]);
    }
    setIsManagingUnit(false);
  };

  const deleteUnit = (id: string) => {
    if (confirm("Remove unit from system?")) {
      setUnits(prev => prev.filter(u => u.id !== id));
    }
  };

  const updateUnitStatus = (unitId: string, status: UnitStatus) => {
    setUnits(prev => prev.map(u => u.id === unitId ? { ...u, status, lastUpdated: new Date().toISOString() } : u));
  };

  const createIncident = async () => {
    if (!newLocation) return;
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
    setIncidents(prev => [newIncident, ...prev]);
    setActiveIncidentId(id);
    setNewLocation('');
    setIsCreatingCall(false);
  };

  const assignUnitToIncident = (unitId: string, incidentId: string) => {
    setIncidents(prev => prev.map(inc => {
      if (inc.id === incidentId) {
        if (inc.assignedUnits.includes(unitId)) return inc;
        return {
          ...inc,
          assignedUnits: [...inc.assignedUnits, unitId],
          logs: [...inc.logs, {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString(),
            sender: 'DISPATCH',
            message: `Unit ${units.find(u => u.id === unitId)?.name} assigned to call.`
          }]
        };
      }
      return inc;
    }));
    updateUnitStatus(unitId, UnitStatus.EN_ROUTE);
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
    setIncidents(prev => prev.map(inc => inc.id === activeIncidentId ? { ...inc, logs: [...inc.logs, newLog] } : inc));
    setLogInput('');
  };

  const closeIncident = (incidentId: string) => {
    setIncidents(prev => prev.map(inc => {
      if (inc.id === incidentId) {
        inc.assignedUnits.forEach(uId => updateUnitStatus(uId, UnitStatus.AVAILABLE));
        return { ...inc, status: 'CLOSED' };
      }
      return inc;
    }));
    if (activeIncidentId === incidentId) setActiveIncidentId(null);
  };

  if (!session) {
    return (
      <div className="h-screen w-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100 overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,_#1e293b_0%,_transparent_100%)] animate-pulse" />
          <div className="grid grid-cols-12 h-full w-full">
            {Array.from({ length: 144 }).map((_, i) => <div key={i} className="border border-slate-800/20" />)}
          </div>
        </div>
        <div className="z-10 w-full max-w-4xl flex flex-col items-center">
          <div className="bg-blue-600 p-4 rounded-2xl shadow-2xl shadow-blue-500/20 mb-6 border border-blue-400/30">
            <Icons.Police />
          </div>
          <h1 className="text-4xl font-black tracking-[0.25em] mb-2">NEXUS<span className="text-blue-500">CAD</span></h1>
          <p className="text-slate-500 font-mono text-xs uppercase tracking-widest mb-12">Universal Emergency Dispatch System</p>
          <div className="grid md:grid-cols-2 gap-8 w-full">
            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl backdrop-blur-md flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-slate-800 rounded-lg text-blue-400"><Icons.Send /></div>
                <h2 className="text-xl font-bold">DISPATCH COMMAND</h2>
              </div>
              <p className="text-sm text-slate-400 mb-6 flex-1">Access central operations. Manage units, create incidents, and coordinate response efforts.</p>
              <div className="space-y-4">
                <input 
                  type="password" 
                  placeholder="Dispatch Passcode" 
                  value={dispatchPass}
                  onChange={(e) => setDispatchPass(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLoginDispatch()}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                />
                <button 
                  onClick={handleLoginDispatch}
                  className="w-full bg-blue-600 hover:bg-blue-500 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-900/40"
                >
                  Authorize Terminal
                </button>
              </div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 p-8 rounded-2xl backdrop-blur-md flex flex-col">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-slate-800 rounded-lg text-emerald-400"><Icons.Police /></div>
                <h2 className="text-xl font-bold">FIELD OPERATIONS</h2>
              </div>
              <div className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-3">
                  <input 
                    type="text" 
                    placeholder="Roblox User" 
                    value={onboardingData.roblox}
                    onChange={(e) => setOnboardingData(prev => ({...prev, roblox: e.target.value}))}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                  <input 
                    type="text" 
                    placeholder="Callsign" 
                    value={onboardingData.callsign}
                    onChange={(e) => setOnboardingData(prev => ({...prev, callsign: e.target.value}))}
                    className="bg-slate-950 border border-slate-700 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-emerald-500 outline-none uppercase font-mono"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {[UnitType.POLICE, UnitType.FIRE, UnitType.EMS].map(t => (
                    <button 
                      key={t}
                      onClick={() => setOnboardingData(prev => ({...prev, type: t}))}
                      className={`py-2 rounded border text-[10px] font-bold uppercase transition-all ${onboardingData.type === t ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-slate-950 border-slate-800 text-slate-500'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                <button 
                  onClick={handleJoinUnit}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 py-3 rounded-lg font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/40"
                >
                  Establish Connection
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 selection:bg-blue-500/30">
      <header className={`h-14 ${session.role === 'DISPATCH' ? 'bg-slate-900 border-blue-500/30' : 'bg-slate-900 border-emerald-500/30'} border-b flex items-center justify-between px-6 shrink-0`}>
        <div className="flex items-center gap-3">
          <div className={`${session.role === 'DISPATCH' ? 'bg-blue-600' : 'bg-emerald-600'} p-1.5 rounded shadow-lg`}>
            <Icons.Police />
          </div>
          <h1 className="text-xl font-bold tracking-tight uppercase">Nexus<span className={session.role === 'DISPATCH' ? 'text-blue-500' : 'text-emerald-500'}>{session.role}</span></h1>
          <div className="h-4 w-px bg-slate-700 mx-2" />
          <div className="flex flex-col leading-none">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter">NODE_{session.role === 'DISPATCH' ? 'HQ' : 'FLD'}</span>
            <span className="text-xs font-mono text-slate-300">
              {session.role === 'DISPATCH' ? 'COMMAND_HUB' : `${session.callsign} | ${session.username}`}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <div className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Sync Time</div>
            <div className="text-sm font-mono font-medium">{new Date().toLocaleTimeString()}</div>
          </div>
          {session.role === 'DISPATCH' && (
            <button onClick={() => setIsCreatingCall(true)} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-md font-semibold text-sm shadow-lg shadow-blue-900/20">
              <Icons.Plus /> NEW CALL
            </button>
          )}
          <button onClick={() => setSession(null)} className="text-[10px] font-black uppercase text-slate-500 hover:text-red-400 transition-colors border-l border-slate-800 pl-4">LOGOUT</button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <aside className="w-80 border-r border-slate-800 bg-slate-900/50 flex flex-col shrink-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">Active Units</h2>
            {session.role === 'DISPATCH' && (
              <button onClick={() => handleOpenUnitModal()} className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded transition-colors text-slate-400"><Icons.Plus /></button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {units.map(unit => (
              <div key={unit.id} className={`p-3 rounded-lg border transition-all group ${unit.name === session.callsign ? 'bg-emerald-500/10 border-emerald-500' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'}`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">{unit.type === UnitType.POLICE ? <Icons.Police /> : unit.type === UnitType.FIRE ? <Icons.Fire /> : <Icons.EMS />}</span>
                    <span className="font-mono font-bold text-sm tracking-wide">{unit.name}</span>
                  </div>
                  <div className={`text-[10px] px-2 py-0.5 rounded-full border ${STATUS_COLORS[unit.status]}`}>{unit.status.replace(/_/g, ' ')}</div>
                </div>
                <div className="text-[9px] text-slate-600 font-mono flex items-center justify-between">
                   <span>ID: {unit.robloxUser || 'SYSTEM'}</span>
                   {session.role === 'DISPATCH' && (
                     <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleOpenUnitModal(unit)} className="hover:text-blue-400"><Icons.Edit /></button>
                        <button onClick={() => deleteUnit(unit.id)} className="hover:text-red-400"><Icons.Trash /></button>
                     </div>
                   )}
                </div>
                {(session.role === 'DISPATCH' || unit.name === session.callsign) && (
                  <div className="flex gap-1 overflow-x-auto mt-2 pt-2 border-t border-slate-800/50">
                    {Object.values(UnitStatus).map(s => (
                      <button key={s} onClick={() => updateUnitStatus(unit.id, s)} className={`text-[9px] px-1.5 py-1 rounded border whitespace-nowrap transition-all ${unit.status === s ? 'bg-slate-700 border-slate-500 text-white' : 'bg-slate-900 border-slate-800 text-slate-600 hover:text-slate-400'}`}>{s.charAt(0)}</button>
                    ))}
                  </div>
                )}
                {session.role === 'DISPATCH' && activeIncidentId && unit.status === UnitStatus.AVAILABLE && (
                  <button onClick={() => assignUnitToIncident(unit.id, activeIncidentId)} className="w-full mt-2 py-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 rounded border border-blue-500/30 text-[10px] font-black uppercase">Assign To Call</button>
                )}
              </div>
            ))}
          </div>
        </aside>

        <section className="flex-1 flex flex-col min-w-0 bg-slate-950">
          <div className="h-40 shrink-0 border-b border-slate-800 bg-slate-900/30 flex p-4 gap-4 overflow-x-auto items-center">
            {incidents.filter(i => i.status === 'ACTIVE').length === 0 && <div className="w-full text-center text-slate-500 italic text-sm">AWAITING DISPATCH SIGNAL...</div>}
            {incidents.filter(i => i.status === 'ACTIVE').map(incident => (
              <div key={incident.id} onClick={() => setActiveIncidentId(incident.id)} className={`w-72 shrink-0 p-4 rounded-xl border cursor-pointer transition-all ${activeIncidentId === incident.id ? 'bg-blue-900/20 border-blue-500 shadow-xl' : 'bg-slate-800/40 border-slate-700 hover:border-slate-600'}`}>
                <div className="flex justify-between items-start mb-2"><span className="text-[10px] font-mono font-bold text-slate-500">{incident.id}</span><span className={`text-[10px] uppercase font-black ${PRIORITY_COLORS[incident.priority]}`}>{incident.priority}</span></div>
                <div className="font-bold text-sm truncate mb-1 uppercase tracking-wide">{incident.callType}</div>
                <div className="text-xs text-slate-400 truncate mb-3">{incident.location}</div>
                <div className="flex flex-wrap gap-1">
                  {incident.assignedUnits.map(uId => <span key={uId} className="text-[9px] bg-slate-900 px-1.5 py-0.5 rounded border border-slate-700 font-mono text-slate-400">{units.find(u => u.id === uId)?.name || '...'}</span>)}
                </div>
              </div>
            ))}
          </div>
          {activeIncident ? (
            <div className="flex-1 flex flex-col p-8 overflow-hidden">
               <div className="flex justify-between items-start mb-8">
                  <div>
                    <div className="flex items-center gap-4 mb-2"><h2 className="text-3xl font-black text-white uppercase">{activeIncident.callType}</h2><span className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase ${PRIORITY_COLORS[activeIncident.priority]} border border-current`}>{activeIncident.priority} PRIORITY</span></div>
                    <div className="flex items-center gap-6 text-slate-400 font-bold uppercase tracking-widest text-xs"><span className="flex items-center gap-2"><Icons.Search /> {activeIncident.location}</span><span className="flex items-center gap-2 text-blue-500"><Icons.Police /> {activeIncident.assignedUnits.length} UNITS ATTACHED</span></div>
                  </div>
                  {session.role === 'DISPATCH' && <button onClick={() => closeIncident(activeIncident.id)} className="bg-red-600 hover:bg-red-500 text-white px-6 py-2.5 rounded-lg shadow-lg font-black text-xs tracking-widest transition-all">CLOSE INCIDENT</button>}
               </div>
               <div className="flex-1 flex flex-col bg-slate-900/40 rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
                  <div className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /><span className="text-xs font-black uppercase tracking-widest text-slate-400">Tactical Logs</span></div></div>
                  <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-sm leading-relaxed scroll-smooth">
                    {activeIncident.logs.map(log => (
                      <div key={log.id} className="flex gap-4 animate-in slide-in-from-left duration-200"><span className="text-slate-600 font-bold text-[10px] mt-1 shrink-0">{log.timestamp}</span><div className="flex-1"><span className={`font-black mr-2 uppercase ${log.sender === 'DISPATCH' ? 'text-blue-500' : 'text-emerald-500'}`}>{log.sender}:</span><span className="text-slate-200">{log.message}</span></div></div>
                    ))}
                  </div>
                  <div className="p-6 bg-slate-900 border-t border-slate-800"><div className="flex gap-3"><input type="text" value={logInput} onChange={(e) => setLogInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddLog()} placeholder="Enter update..." className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-5 py-4 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-white" /><button onClick={() => setIsAIAssisting(!isAIAssisting)} className={`p-4 rounded-xl border transition-all ${isAIAssisting ? 'bg-amber-500 text-white border-amber-400 shadow-xl' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'}`}><Icons.Sparkles /></button><button onClick={handleAddLog} className="bg-blue-600 hover:bg-blue-500 p-4 rounded-xl shadow-lg transition-colors"><Icons.Send /></button></div></div>
               </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center opacity-40"><div className="w-24 h-24 mb-6 bg-slate-900 rounded-3xl flex items-center justify-center border border-slate-800"><Icons.Police /></div><h3 className="text-2xl font-black text-white tracking-[0.2em] mb-2 uppercase">Standby</h3><p className="max-w-xs text-center text-sm font-mono text-slate-500 uppercase tracking-widest">Awaiting Command Orders.</p></div>
          )}
        </section>
      </main>

      {/* Unit Management Modal */}
      {isManagingUnit && session.role === 'DISPATCH' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/90 backdrop-blur-sm p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
             <div className="bg-slate-800 p-6 border-b border-slate-700 flex justify-between items-center">
                <h3 className="font-black text-white uppercase tracking-widest">{editingUnit ? 'Edit Commission' : 'New Unit Registration'}</h3>
                <button onClick={() => setIsManagingUnit(false)} className="text-slate-500 hover:text-white transition-colors"><Icons.Trash /></button>
             </div>
             <div className="p-8 space-y-6">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Callsign / Name</label>
                   <input type="text" value={unitNameInput} onChange={(e) => setUnitNameInput(e.target.value)} placeholder="UNIT-101" className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm font-bold text-white uppercase" />
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Department</label>
                   <div className="grid grid-cols-3 gap-2">
                      {Object.values(UnitType).map(t => (
                        <button key={t} onClick={() => setUnitTypeInput(t)} className={`py-3 rounded-lg border text-[10px] font-bold uppercase transition-all ${unitTypeInput === t ? 'bg-blue-600 border-blue-400' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>{t}</button>
                      ))}
                   </div>
                </div>
             </div>
             <div className="p-6 bg-slate-800/50 border-t border-slate-700 flex gap-4">
                <button onClick={() => setIsManagingUnit(false)} className="flex-1 font-black text-[10px] text-slate-500 uppercase">Cancel</button>
                <button onClick={handleSaveUnit} className="flex-[2] bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest">Confirm Sync</button>
             </div>
          </div>
        </div>
      )}

      {/* New Call Modal */}
      {isCreatingCall && session.role === 'DISPATCH' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-xl p-6">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden">
             <div className="bg-slate-800 p-6 border-b border-slate-700 flex justify-between items-center"><h3 className="text-lg font-black tracking-widest uppercase text-blue-500 flex items-center gap-3"><Icons.Plus /> Dispatch Call</h3><button onClick={() => setIsCreatingCall(false)} className="text-slate-500 hover:text-white p-2"><Icons.Trash /></button></div>
             <div className="p-8 space-y-6">
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Category</label><select value={newCallType} onChange={(e) => setNewCallType(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm font-bold outline-none">{CALL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Location</label><input type="text" placeholder="Location..." value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-4 text-sm font-bold outline-none" /></div>
                <div className="space-y-2"><label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Priority</label><div className="grid grid-cols-4 gap-2">{Object.values(Priority).map(p => <button key={p} onClick={() => setNewPriority(p)} className={`py-3 rounded-lg border text-[10px] font-black uppercase transition-all ${newPriority === p ? 'bg-blue-600 border-blue-400' : 'bg-slate-950 border-slate-800 text-slate-600'}`}>{p}</button>)}</div></div>
             </div>
             <div className="p-6 bg-slate-800/50 border-t border-slate-700 flex gap-4"><button onClick={() => setIsCreatingCall(false)} className="flex-1 font-black text-[10px] text-slate-500 uppercase">Abort</button><button onClick={createIncident} className="flex-[3] bg-blue-600 hover:bg-blue-500 text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest">Broadcast</button></div>
          </div>
        </div>
      )}
      <footer className="h-8 bg-slate-900 border-t border-slate-800 flex items-center px-4 justify-between shrink-0 text-[10px] font-mono tracking-widest text-slate-500 uppercase font-black">
        <div className="flex gap-6"><span>NODE: {session.role}</span><span className="text-emerald-500 flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" /> SYNC_OK</span></div>
        <div>NEXUS_CAD v5.1.0-DEPLOYED</div>
      </footer>
    </div>
  );
};

export default App;
