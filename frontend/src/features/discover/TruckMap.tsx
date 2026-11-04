import { useEffect, useMemo, useRef, useState } from "react";
import { divIcon, latLngBounds } from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { Link } from "react-router-dom";
import type { Stop } from "../../services/stops";
import { formatStopTime } from "./format";
import "leaflet/dist/leaflet.css";
import "./truck-map.css";

type LocationGroup = { latitude: number; longitude: number; stops: Stop[] };

// Several trucks (or repeated visits) can share one parking spot. Keep them
// together so a marker never completely covers another marker at that spot.
export function groupStops(stops: Stop[]): LocationGroup[] {
  const groups = new Map<string, LocationGroup>();
  for (const stop of stops) {
    if (!Number.isFinite(stop.latitude) || !Number.isFinite(stop.longitude)
      || Math.abs(stop.latitude) > 90 || Math.abs(stop.longitude) > 180) continue;
    const key = `${stop.latitude},${stop.longitude}`;
    const group = groups.get(key);
    if (group) group.stops.push(stop);
    else groups.set(key, { latitude: stop.latitude, longitude: stop.longitude, stops: [stop] });
  }
  return [...groups.values()];
}

function FitStops({ coordinates, reset }: { coordinates: string; reset: number }) {
  const map = useMap();
  useEffect(() => {
    const positions: [number, number][] = JSON.parse(coordinates);
    if (positions.length) map.fitBounds(latLngBounds(positions), { padding: [36, 36], maxZoom: 16, animate: false });
  }, [map, coordinates, reset]);
  useEffect(() => {
    map.getContainer().setAttribute("aria-label", "Scheduled food truck locations");
    map.getContainer().setAttribute("role", "region");
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function TruckMap({ stops, page, total }: { stops: Stop[]; page: number; total: number }) {
  const apiKey = (import.meta.env.VITE_GEOAPIFY_API_KEY ?? "").trim();
  const groups = useMemo(() => groupStops(stops), [stops]);
  const coordinates = JSON.stringify(groups.map(group => [group.latitude, group.longitude]));
  const plotted = groups.reduce((count, group) => count + group.stops.length, 0);
  const [reset, setReset] = useState(0);
  const [tileAttempt, setTileAttempt] = useState(0);
  const [tileError, setTileError] = useState(false);
  const [tilesLoading, setTilesLoading] = useState(true);
  const failedTiles = useRef(false);

  useEffect(() => {
    if (!apiKey || !tilesLoading || tileError) return;
    const timeout = window.setTimeout(() => setTileError(true), 15_000);
    return () => window.clearTimeout(timeout);
  }, [apiKey, tilesLoading, tileError, tileAttempt]);

  return <section className="truck-map-panel" aria-label="Truck stop map">
    <div className="truck-map-heading">
      <div>
        <h3>Find your next stop</h3>
        <p>{plotted} of {total} matching stops plotted · Page {page + 1}</p>
      </div>
      {apiKey && <button type="button" disabled={!groups.length} onClick={() => setReset(value => value + 1)}>Fit pins</button>}
    </div>
    <p className="truck-map-note">Scheduled locations, not live GPS. Pins follow your filters and results page. Select a pin for truck details.</p>
    {plotted < stops.length && <p className="truck-map-notice">Some stops have no valid map coordinates. Their details are still in the list.</p>}
    {!apiKey ? <p role="status" className="truck-map-notice">The map is not configured yet. You can still browse the stop list.</p> : <>
      {tilesLoading && !tileError && <p role="status" className="truck-map-notice">Loading street map…</p>}
      {tileError && <div role="alert" className="truck-map-notice">
        <p>The street map could not load. Pins and the stop list are still available.</p>
        <button type="button" onClick={() => {
          failedTiles.current = false;
          setTilesLoading(true);
          setTileError(false);
          setTileAttempt(value => value + 1);
        }}>Retry map</button>
      </div>}
      <a className="truck-map-skip" href="#after-truck-map">Skip interactive map</a>
      <MapContainer className="truck-map-canvas" center={[34.2367, -118.5282]} zoom={11} minZoom={2} maxZoom={20}
        scrollWheelZoom={false}>
        <TileLayer key={tileAttempt}
          url={`https://maps.geoapify.com/v1/tile/osm-carto/{z}/{x}/{y}.png?apiKey=${encodeURIComponent(apiKey)}`}
          attribution={'Powered by <a href="https://www.geoapify.com/">Geoapify</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'}
          maxZoom={20} updateWhenIdle={true} keepBuffer={1}
          eventHandlers={{
            loading: () => { failedTiles.current = false; setTilesLoading(true); },
            tileerror: () => { failedTiles.current = true; setTileError(true); },
            load: () => {
              setTilesLoading(false);
              // Leaflet also emits load when failed tiles finish. Do not report
              // success unless this entire loading batch completed successfully.
              if (!failedTiles.current) setTileError(false);
            },
          }} />
        <FitStops coordinates={coordinates} reset={reset} />
        {groups.map((group, index) => {
          const title = group.stops.length === 1
            ? `${group.stops[0].vendor.name} at ${group.stops[0].venueName}`
            : `${group.stops.length} scheduled stops at this location`;
          return <Marker key={`${group.latitude},${group.longitude}`} position={[group.latitude, group.longitude]}
            title={title} alt={title} keyboard={true}
            eventHandlers={{ add: event => event.target.getElement()?.setAttribute("aria-label", title) }}
            icon={divIcon({ className: "truck-map-pin", html: `<span>${index + 1}</span>`, iconSize: [44, 44], iconAnchor: [22, 40], popupAnchor: [0, -38] })}>
            <Popup minWidth={180} maxWidth={220} maxHeight={260}>
              {group.stops.map(stop => <article className="truck-map-popup" key={stop.stopId}>
                <h4>{stop.vendor.name}</h4>
                <p>{stop.vendor.category} · {stop.status === "serving" ? "Serving" : "Scheduled"}</p>
                <p><strong>{stop.venueName}</strong><br />{stop.address}</p>
                <p>{formatStopTime(stop.startsAt, stop.endsAt, stop.timeZone)}</p>
                <Link to={`/trucks/${stop.vendor.id}`}>View truck &amp; menu →</Link>
              </article>)}
            </Popup>
          </Marker>;
        })}
      </MapContainer>
      <div id="after-truck-map" tabIndex={-1} className="truck-map-note">Use the stop list for all truck details. Map pins show this page only.</div>
    </>}
  </section>;
}
