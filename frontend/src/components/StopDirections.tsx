import { directionsUrl } from "../features/discover/directions";

export default function StopDirections({ latitude, longitude }: { latitude: number; longitude: number }) {
  const href = directionsUrl(latitude, longitude);
  return href ? <a className="directions-link" href={href} target="_blank" rel="noopener noreferrer">Get directions ↗<span className="directions-provider"> Google Maps · new tab</span></a> : null;
}
