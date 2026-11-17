import { Link } from "react-router-dom";
import RatingBadge from "../features/reviews/RatingBadge";
import type { Stop } from "../services/stops";
import { formatDistance, formatStopTime } from "../features/discover/format";
import { ClockIcon, NavigationIcon, PinIcon } from "./icons";
import FavoriteButton from "../features/favorites/FavoriteButton";
import StopDirections from "./StopDirections";
import { directionsUrl } from "../features/discover/directions";

function StopCard({ stop, stale = false, selected = false, onShowMap }: { stop: Stop; stale?: boolean; selected?: boolean; onShowMap?: () => void }) {
  return (
    <article id={`stop-card-${stop.stopId}`} tabIndex={-1} className={`card${selected ? " stop-card-selected" : ""}`} aria-label={`${stop.vendor.name} at ${stop.venueName}`}>
      <div className="card-head">
        <h2>{stop.vendor.name}</h2>
        {stale ? <span className="badge">Status unconfirmed</span> : stop.status === "serving" && <span className="badge">Serving now</span>}
        <FavoriteButton vendorId={stop.vendor.id} vendorName={stop.vendor.name} />
      </div>
            <RatingBadge vendorId={stop.vendor.id} averageRating={stop.vendor.averageRating} reviewCount={stop.vendor.reviewCount} />
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
      <div className="stop-map-actions">
        {onShowMap && directionsUrl(stop.latitude, stop.longitude) && <button type="button" aria-pressed={selected} onClick={onShowMap}>Show on map</button>}
        <StopDirections latitude={stop.latitude} longitude={stop.longitude} />
      </div>
    </article>
  );
}

export default StopCard;
