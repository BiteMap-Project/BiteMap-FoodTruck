import type { PickupDetails } from '../../services/orders';
import './pickup.css';

export function PickupLocation({ pickup }: { pickup?: PickupDetails | null }) {
  if (!pickup) return <p className="pickup-note">Pickup location was not recorded for this order.</p>;
  const format = new Intl.DateTimeFormat('en-US', { dateStyle:'medium', timeStyle:'short', timeZone:pickup.timeZone });
  const destination = encodeURIComponent(`${pickup.latitude},${pickup.longitude}`);
  return <section className="pickup-location" aria-label="Pickup location">
    <h2>Pickup location</h2>
    <strong>{pickup.venueName}</strong>
    <p>{pickup.address}</p>
    <p>Serving window: {format.format(new Date(pickup.startsAt))} – {format.format(new Date(pickup.endsAt))} ({pickup.timeZone})</p>
    <p className="pickup-note">Scheduled location, not live GPS. Serving hours are not an estimated ready time.</p>
    <a href={`https://www.google.com/maps/dir/?api=1&destination=${destination}`} target="_blank" rel="noopener noreferrer">Get directions</a>
  </section>;
}
