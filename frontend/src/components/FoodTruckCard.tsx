import { Link } from "react-router-dom";
import RatingBadge from "../features/reviews/RatingBadge";
import type { Vendor } from "../services/vendors";
import { PinIcon } from "./icons";
import FavoriteButton from "../features/favorites/FavoriteButton";

function FoodTruckCard({ id, name, category, location, averageRating, reviewCount }: Vendor) {
  
  return (
    <article className="card">
      <div className="card-head">
        <h2>{name}</h2>
        <FavoriteButton vendorId={id} vendorName={name} />
      </div>
            <RatingBadge vendorId={id} averageRating={averageRating} reviewCount={reviewCount} />
      <p className="chip">{category}</p>
      <p className="card-line"><PinIcon />Location: {location}</p>
      <Link className="card-link" to={`/trucks/${id}`}>View Profile &amp; Menu</Link>
    </article>
  );
}

export default FoodTruckCard;
