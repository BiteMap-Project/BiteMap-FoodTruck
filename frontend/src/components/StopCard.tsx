import { Link } from "react-router-dom";
import type { Stop } from "../services/stops";
import { formatDistance, formatStopTime } from "../features/discover/format";
import { ClockIcon, NavigationIcon, PinIcon } from "./icons";

function StopCard({ stop }: { stop: Stop }) {
  return (
    <article className="card">
      <div className="card-head">
        <h2>{stop.vendor.name}</h2>
        {stop.status === "serving" && <span className="badge">Serving now</span>}
      </div>
      <p className="chip">{stop.vendor.category}</p>
      <p className="card-line">
        <PinIcon />
        <span><strong>{stop.venueName}</strong><span className="card-sub">{stop.address}</span></span>
      </p>
      <p className="card-line"><ClockIcon />{formatStopTime(stop.startsAt, stop.endsAt, stop.timeZone)}</p>
      {stop.distanceMeters !== null && (
        <p className="card-line"><NavigationIcon />{formatDistance(stop.distanceMeters)}</p>
      )}
      <Link className="card-link" to={`/trucks/${stop.vendor.id}`}>View Profile &amp; Menu</Link>
    </article>
  );
}

export default StopCard;
