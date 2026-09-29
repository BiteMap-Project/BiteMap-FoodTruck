import { Link } from "react-router-dom";
import type { Vendor } from "../services/vendors";

function FoodTruckCard({ id, name, category, location }: Vendor) {
  return (
    <article>
      <h2>{name}</h2>
      <p>{category}</p>
      <p>Location: {location}</p>
      <Link to={`/trucks/${id}`}>View Profile &amp; Menu</Link>
    </article>
  );
}

export default FoodTruckCard;
