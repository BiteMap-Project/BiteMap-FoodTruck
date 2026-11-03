import { useEffect, useRef, useState } from 'react';
import { subscribeOrderEvents, type UpdateConnection } from '../../services/orderEvents';

export function useOrderNotifications(accountId: number, vendorId: number | null) {
  const key = `${accountId}:${vendorId}`;
  const [state, setState] = useState({key:'', count:0, revision:0, connection:'connecting' as UpdateConnection});
  const seen = useRef(new Map<string, number>());
  const audio = useRef<AudioContext | null>(null);
  const [sound, setSound] = useState(false);
  const [soundError, setSoundError] = useState('');
  useEffect(() => () => { void audio.current?.close(); audio.current=null; }, [accountId]);
  function chime() {
    const context = audio.current;
    if (!context || context.state !== 'running') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.25);
    oscillator.start(); oscillator.stop(context.currentTime + 0.25);
    oscillator.onended = () => {oscillator.disconnect(); gain.disconnect();};
  }
  async function toggleSound() {
    if(audio.current) { const context=audio.current; audio.current=null; setSound(false); await context.close(); return; }
    try {
      const context = new AudioContext(); audio.current=context;
      await context.resume();
      if(audio.current!==context) { void context.close(); return; }
      if(context.state!=='running') throw new Error('Audio unavailable');
      setSound(true); setSoundError(''); chime(); // Explicit click unlocks and previews the alert.
    } catch { void audio.current?.close(); audio.current=null; setSound(false); setSoundError('Sound is unavailable. Visual order alerts remain enabled.'); }
  }
  useEffect(() => {
    if(vendorId===null) return;
    return subscribeOrderEvents(`/api/operator/vendors/${vendorId}/order-events`, signal => {
      const previous=seen.current.get(key);
      seen.current.set(key,signal.createdCount);
      if(seen.current.size>100) seen.current.delete(seen.current.keys().next().value!);
      // Baseline silently; cancellation/status updates never increase createdCount.
      if(previous!==undefined && signal.createdCount>previous && signal.placedCount>0) chime();
      setState(old=>({key,count:signal.placedCount,revision:old.revision+1,connection:'live'}));
    }, connection=>setState(old=>old.key===key && old.connection===connection ? old
      : {...old,key,count:old.key===key?old.count:0,connection}));
  }, [key,vendorId]);
  return { count:state.key===key?state.count:0, revision:state.key===key?state.revision:0,
    connection:state.key===key?state.connection:'connecting' as UpdateConnection,
    sound, soundError, toggleSound };
}
