import { useEffect, useRef, useState } from 'react';
import { AuthApiError } from '../../services/auth';
import { cancelCustomerOrder, type CustomerOrder } from '../../services/orders';

export default function CustomerCancellation({order, loading, onSaved, onRefresh}: {
  order: CustomerOrder; loading: boolean; onSaved:(order:CustomerOrder)=>void; onRefresh:()=>void;
}) {
  const [confirming,setConfirming] = useState(false);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const lock = useRef(false);
  const mounted = useRef(false);
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
  return <section className="customer-cancellation" aria-label="Customer cancellation">
    <p>You can cancel only before the truck accepts your order.</p>
    {error && <p role="alert" className="cart-order-error">{error}</p>}
    {!confirming ? <button type="button" className="cart-primary" disabled={loading || !validVersion}
      aria-expanded={false} onClick={()=>setConfirming(true)}>Cancel order</button>
      : <form aria-label="Confirm order cancellation" onSubmit={event=>{event.preventDefault(); void cancel();}}>
        <h3>Cancel order #{order.id}?</h3><p>This cannot be undone. If the truck has already accepted, cancellation will be declined.</p>
        <div className="customer-cancellation-actions"><button className="cart-primary" disabled={busy || loading || !validVersion}>
          {busy ? 'Cancelling…' : 'Confirm cancellation'}</button>
          <button type="button" className="cart-primary" disabled={busy} onClick={()=>{setConfirming(false);setError('');}}>Keep order</button></div>
      </form>}
  </section>;
}
