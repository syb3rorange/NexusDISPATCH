
import React from 'react';

export const CALL_TYPES = [
  '10-01 Call Your Office',
  '10-02 Report To Your Office',
  '10-03 Call Dispatcher By Telephone',
  '10-04 Acknowledgment',
  '10-05 Repeat Message',
  '10-06 Stand By',
  '10-07 Verify Address',
  '10-10 Possible Crime',
  '10-11 Traffic Stop',
  '10-12 Police Officer Assist',
  '10-13 Assist Police Officer (URGENT)',
  '10-14 Verified Complaint (Non-Crime)',
  '10-20 Past Robbery',
  '10-21 Past Burglary',
  '10-22 Past Larceny',
  '10-24 Past Assault',
  '10-29 Past Other Crime',
  '10-30 Robbery in Progress',
  '10-31 Burglary in Progress',
  '10-32 Larceny in Progress',
  '10-33 Explosive Device or Threat',
  '10-34 Assault in Progress',
  '10-39 Other Crime in Progress',
  '10-44 Permission To Leave Post',
  '10-50 Disorderly Person/Group/Noise',
  '10-51 Roving Band',
  '10-52 Dispute (Family/Other)',
  '10-53 Vehicle Accident',
  '10-54 Ambulance Case',
  '10-55 Ambulance Case - No Siren',
  '10-58 Assist Ambulance',
  '10-59 Alarm of Fire',
  '10-61 Precision Policing',
  '10-62 Out of Service (Mechanical)',
  '10-63 Out of Service (Meal)',
  '10-65 Miscellaneous Police Requirement',
  '10-66 Escort',
  '10-67 Traffic Assignment',
  '10-68 See Officer',
  '10-69 Other Non-Criminal Incident',
  '10-75 On Scene (Major Incident)',
  '10-80 Cancel',
  '10-81 At Court',
  '10-82 Verification / Arrest Processing',
  '10-83 At Hospital',
  '10-84 Arrived at Scene',
  '10-85 Need Additional Unit',
  '10-86 Female in Custody',
  '10-87 Unit to Unit Transmission',
  '10-88 Vehicle Assignment',
  '10-89 Other (Hospital/Court/Verification)',
  '10-90 Unfounded',
  '10-91 Non-Crime Corrected',
  '10-92 Arrest Made',
  '10-93 Summons Served',
  '10-94 Vehicle Recovery',
  '10-95 Non-Crime Corrected (Hospital/Court)',
  '10-96 Medical Examiner Notified',
  '10-97 Patient in Custody',
  '10-98 Resumed Patrol',
  '10-99 Other Final Disposition'
];

export const STATUS_COLORS: Record<string, string> = {
  AVAILABLE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
  EN_ROUTE: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
  ON_SCENE: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
  BUSY: 'bg-purple-500/20 text-purple-400 border-purple-500/50',
  OUT_OF_SERVICE: 'bg-slate-500/20 text-slate-400 border-slate-500/50',
};

export const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'text-slate-400',
  MEDIUM: 'text-blue-400',
  HIGH: 'text-orange-400',
  EMERGENCY: 'text-red-500 font-bold animate-pulse',
};

export const Icons = {
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
  ),
  Refresh: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>
  ),
  Monitor: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
  ),
  Smartphone: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/></svg>
  ),
  AlertCircle: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
  )
};
