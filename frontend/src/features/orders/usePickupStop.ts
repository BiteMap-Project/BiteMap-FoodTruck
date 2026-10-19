import { useEffect, useState } from 'react';
import { getPickupStop, type PickupDetails } from '../../services/orders';

export function usePickupStop(vendorId?: number) {
  const [result, setResult] = useState<{ vendorId: number; revision: number; pickup: PickupDetails | null; error: string } | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (vendorId === undefined) return;
    const controller = new AbortController();
    let expiry: ReturnType<typeof setTimeout> | undefined;
    const timeout = setTimeout(() => {
      setResult({ vendorId, revision, pickup: null, error: 'Unable to load pickup details. Please try again.' });
      controller.abort();
    }, 15_000);
    getPickupStop(vendorId, controller.signal).then(stop => {
      if (controller.signal.aborted) return;
      const remaining = stop ? Date.parse(stop.endsAt) - Date.now() : 0;
      setResult({ vendorId, revision, pickup: remaining > 0 ? stop : null, error: '' });
      if (stop && remaining > 0) {
        // Re-check periodically for long-lived stops; never overflow a browser timer.
        expiry = setTimeout(() => setRevision(value => value + 1), Math.min(remaining, 60_000));
      }
    }).catch(() => {
      if (!controller.signal.aborted) setResult({ vendorId, revision, pickup: null, error: 'Unable to load pickup details. Please try again.' });
    }).finally(() => clearTimeout(timeout));
    return () => { controller.abort(); clearTimeout(expiry); clearTimeout(timeout); };
  }, [vendorId, revision]);
  const current = result && result.vendorId === vendorId && result.revision === revision ? result : null;
  return { pickup: current?.pickup ?? null, loading: !current, error: current?.error ?? '', refresh: () => setRevision(value => value + 1) };
}
