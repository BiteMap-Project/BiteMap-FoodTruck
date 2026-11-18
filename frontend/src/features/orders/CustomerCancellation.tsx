import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { AuthApiError } from '../../services/auth';
import { cancelCustomerOrder, type CustomerOrder } from '../../services/orders';

export default function CustomerCancellation({order, loading, onSaved, onRefresh, statusHeading}: {
  order: CustomerOrder; loading: boolean; onSaved:(order:CustomerOrder)=>void; onRefresh:()=>void;
  statusHeading?: RefObject<HTMLHeadingElement | null>;
}) {
  const [confirming,setConfirming] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const lock = useRef(false);
  const mounted = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const moveFocus = useRef(false);
  const restoreStatusFocus = useRef(false);
  useLayoutEffect(() => {
    if (order.status !== 'PLACED' && restoreStatusFocus.current) {
      statusHeading?.current?.focus();
      restoreStatusFocus.current = false;
    }
  }, [order.status, statusHeading]);
  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    (confirming ? heading.current : trigger.current)?.focus();
    moveFocus.current = false;
  }, [confirming]);
  useEffect(() => {mounted.current=true; return () => {mounted.current=false;};},[]);
  const validVersion = Number.isSafeInteger(order.version) && order.version! >= 0;
  async function cancel() {
    if (lock.current || loading || !validVersion || !confirming) return;
    lock.current=true; setBusy(true); setError('');
    try {
      const result = await cancelCustomerOrder(order.id,order.version!);
      if (mounted.current) onSaved(result);
    } catch(cause) {
      if (!mounted.current) return;
      setError(cause instanceof AuthApiError ? cause.message
        : 'We could not confirm cancellation. Check the latest status; retrying cancellation will not cancel twice.');
      onRefresh();
    } finally {
      lock.current=false;
      if(mounted.current) setBusy(false);
    }
  }
  if (order.status !== 'PLACED') return null;
  return <section ref={panel} className="customer-cancellation" aria-label="Customer cancellation"
    onFocusCapture={() => {restoreStatusFocus.current=true;}}
    onBlurCapture={event => {if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) restoreStatusFocus.current=false;}}>
    <p>You can cancel only before the truck accepts your order.</p>
    {error && <p role="alert" className="cart-order-error">{error}</p>}
    {busy && <p className="a11y-only" role="status">Cancellation is being checked. Please wait.</p>}
    {!confirming ? <button ref={trigger} type="button" className="cart-primary" disabled={loading || !validVersion}
      aria-expanded={false} onClick={()=>{moveFocus.current=true;setConfirming(true);}}>Cancel order</button>
      : <form aria-label="Confirm order cancellation" onSubmit={event=>{event.preventDefault(); void cancel();}}>
        <h3 ref={heading} tabIndex={-1}>Cancel order #{order.id}?</h3><p>This cannot be undone. If the truck has already accepted, cancellation will be declined.</p>
        <div className="customer-cancellation-actions"><button className="cart-primary" disabled={busy || loading || !validVersion}>
          {busy ? 'Cancelling…' : 'Confirm cancellation'}</button>
          <button type="button" className="cart-primary" disabled={busy} onClick={()=>{moveFocus.current=true;setConfirming(false);setError('');}}>Keep order</button></div>
      </form>}
  </section>;
}
