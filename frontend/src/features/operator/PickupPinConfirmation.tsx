import { useEffect, useState } from 'react';
import { MapContainer, CircleMarker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import type { ScheduleAddress } from './ScheduleAddressFields';
import 'leaflet/dist/leaflet.css';

function PinPosition({ value, onChange }: Props) {
  const map = useMap();
  useEffect(() => { map.panTo([value.latitude, value.longitude]); }, [map, value.latitude, value.longitude]);
  useMapEvents({ click(event) {
    const point = event.latlng.wrap();
    if (Math.abs(point.lat) <= 90) onChange({ ...value, latitude: point.lat, longitude: point.lng, confirmed: false });
  } });
  return <CircleMarker center={[value.latitude, value.longitude]} radius={12} pathOptions={{ color: '#b64b26', fillOpacity: 0.9 }} />;
}
type Props = { value: ScheduleAddress; onChange: (value: ScheduleAddress) => void };

export default function PickupPinConfirmation({ value, onChange }: Props) {
  const [failed, setFailed] = useState(false);
  const apiKey = import.meta.env.VITE_GEOAPIFY_API_KEY?.trim();
  const coordinates = `${value.latitude},${value.longitude}`;
  return <section className="sf-pin" aria-label="Confirm pickup location">
    <h3>Confirm your pickup pin</h3>
    <p>Check the customer pickup entrance, not just the street address. Click the map to adjust the pin, or enter coordinates below.</p>
    {apiKey && !failed ? <MapContainer center={[value.latitude, value.longitude]} zoom={17} scrollWheelZoom={false}
      style={{ height: 300, width: '100%' }}>
      <TileLayer url={`https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(apiKey)}`}
        attribution={'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}
        eventHandlers={{ tileerror: () => setFailed(true) }} />
      <PinPosition value={value} onChange={onChange} />
    </MapContainer> : <p role="status">Map preview unavailable. Open the external map to check the pin before confirming.
      {apiKey && <button type="button" onClick={() => setFailed(false)}>Retry map preview</button>}</p>}
    <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coordinates)}`} target="_blank" rel="noopener noreferrer">Check pickup pin in Google Maps (new tab)</a>
    <div className="sf-grid">
      {(['latitude', 'longitude'] as const).map(field => <label key={field}>{field === 'latitude' ? 'Pickup latitude' : 'Pickup longitude'}
        <input type="number" required step="any" min={field === 'latitude' ? -90 : -180} max={field === 'latitude' ? 90 : 180}
          value={value[field]} onChange={event => {
            const next = event.target.valueAsNumber;
            if (Number.isFinite(next) && Math.abs(next) <= (field === 'latitude' ? 90 : 180))
              onChange({ ...value, [field]: next, confirmed: false });
          }} />
      </label>)}
    </div>
    <label className="sf-pin-confirm"><input type="checkbox" checked={value.confirmed === true}
      onChange={event => onChange({ ...value, confirmed: event.target.checked })} />
      I checked the pin and confirm this is the customer pickup location.</label>
    <p className="sf-hint">Your confirmation is required each time you publish or edit a stop. BiteMap does not verify physical presence.</p>
  </section>;
}
