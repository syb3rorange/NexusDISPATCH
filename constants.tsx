
import React from 'react';

export const ERLC_LOCATIONS = [
  'Springfield Bank',
  'River City Tool Store',
  'Beaufort Jewelry',
  'Postal 101: Gas Station',
  'Postal 204: Police Precinct',
  'Springfield Hospital',
  'River City Apartments',
  'Liberty County Airport',
  'The Farm',
  'Postal 305: Residential',
  'Forestry Lookout',
  'River City Dealership',
  'Springfield Mall',
  'Highway 10: Northbound',
  'Highway 10: Southbound'
];

export const CALL_TYPES = [
  // NYSP SIGNAL CODES
  'Signal B: Phone HQ',
  'Signal 7: Failure to pay toll',
  'Signal 55: What is your location',
  'Signal 90: Request for overtime',

  // NYSP FILE CODES
  'File 1: Stolen vehicle',
  'File 2: Motor vehicle registration check',
  'File 3: Report to division headquarters',
  'File 4: Hit & run',
  'File 5: Wanted person',
  'File 6: Missing person',
  'File 7: Burglary',
  'File 8: Robbery',
  'File 9: Lost/missing property',
  'File 10: Stolen property',
  'File 11: Assault',
  'File 12: Homicide',
  'File 13: General information',
  'File 14: Administrative message',
  'File 15: Request for information',
  'File 16: Lost/stolen license plates',
  'File 20: Criminal investigation',
  'File 28: Weather & road conditions',
  'File 44: Test messages follow',

  // NYSP GENERAL CODES
  'RED FLASH: Major Emergency (Clear Channel)',
  'AA: Automobile accident',
  'DV: Disabled vehicle',
  'F: Fatal',
  'PD: Property damage',
  'PI: Personal injury',
  'S&R: Suspension(s) & revocation(s)',

  // STANDARD APCO 10-CODES (Used by NYSP)
  '10-1: Unable to copy - Change location',
  '10-2: Signals good',
  '10-4: Acknowledgment (OK)',
  '10-7: Out of service',
  '10-8: In service',
  '10-9: Repeat',
  '10-10: Off duty',
  '10-11: Talking too rapidly',
  '10-13: Advise weather/road conditions',
  '10-18: Complete assignment quickly',
  '10-19: Return to station',
  '10-20: Location',
  '10-21: Call station by telephone',
  '10-22: Disregard',
  '10-23: Stand by',
  '10-25: Report to (person/place)',
  '10-28: Check motor vehicle registration',
  '10-29: Check for wants/warrants',
  '10-33: Emergency',
  '10-42: Ending tour of duty',
  '10-43: Information',
  '10-97: Arrived at scene',
  '10-98: Finished last assignment'
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
  Sparkles: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/></svg>
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
  ),
  Cpu: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/></svg>
  ),
  X: () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
  )
};
