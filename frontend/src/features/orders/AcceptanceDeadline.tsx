import { useAcceptanceDeadline } from './useAcceptanceDeadline';
import './acceptance-deadline.css';

export default function AcceptanceDeadline({status,deadline,owner=false}:{status:string;deadline?:string|null;owner?:boolean}) {
  const state=useAcceptanceDeadline(status,deadline);
  if(!state.active || !deadline) return null;
  return <div className={`acceptance-deadline ${state.urgent?'is-urgent':''}`}>
    <strong>{owner?'Accept by':'Waiting for acceptance until'} <time dateTime={deadline}>{new Date(deadline).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</time></strong>
    <p>{state.expired ? 'Acceptance deadline passed. Waiting for the server to confirm the final status.'
      : owner ? state.urgent ? 'Less than a minute remaining. Unaccepted orders automatically cancel.' : 'Accept before this deadline to keep the order.'
        : 'If the truck does not accept in time, your order automatically cancels. Preparation time is separate.'}</p>
  </div>;
}
