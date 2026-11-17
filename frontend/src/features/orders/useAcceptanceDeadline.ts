import { useEffect, useState } from 'react';

/** Display-only clock: the backend decides whether acceptance is still allowed. */
export function useAcceptanceDeadline(status: string, deadline?: string | null) {
  const [now,setNow]=useState(Date.now);
  const timestamp=deadline ? Date.parse(deadline) : NaN;
  const active=status==='PLACED' && Number.isFinite(timestamp);
  useEffect(()=>{
    if(!active) return;
    const tick=()=>{ if(document.visibilityState==='visible') setNow(Date.now()); };
    const timer=window.setInterval(tick,15000);
    window.addEventListener('focus',tick);
    document.addEventListener('visibilitychange',tick);
    return ()=>{window.clearInterval(timer);window.removeEventListener('focus',tick);document.removeEventListener('visibilitychange',tick);};
  },[active,deadline]);
  return {active,expired:active && now>=timestamp,urgent:active && timestamp-now<=60000};
}
