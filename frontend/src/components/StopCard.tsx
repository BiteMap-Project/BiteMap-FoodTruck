import { Link } from "react-router-dom";
import type { Stop } from "../services/stops";
import { formatDistance, formatStopTime } from "../features/discover/format";

function StopCard({ stop }: { stop: Stop }) {
  return (
    <article className="stop-card">
      <h2>{stop.vendor.name}</h2>
      <p>{stop.vendor.category}</p>
      <p>
        <strong>{stop.venueName}</strong> · {stop.address}
      </p>
      <p>{formatStopTime(stop.startsAt, stop.endsAt, stop.timeZone)}</p>
      {stop.status === "serving" && <p className="badge">Serving now</p>}
      {stop.distanceMeters !== null && <p>{formatDistance(stop.distanceMeters)}</p>}
      <Link to={`/trucks/${stop.vendor.id}`}>View Profile &amp; Menu</Link>
    </article>
  );
}

export default StopCard;
