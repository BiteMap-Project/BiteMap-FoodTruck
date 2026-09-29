import { Link } from "react-router-dom";
import type { Vendor } from "../services/vendors";
import { PinIcon } from "./icons";

function FoodTruckCard({ id, name, category, location }: Vendor) {
  return (
    <article className="card">
      <div className="card-head">
        <h2>{name}</h2>
      </div>
      <p className="chip">{category}</p>
      <p className="card-line"><PinIcon />Location: {location}</p>
      <Link className="card-link" to={`/trucks/${id}`}>View Profile &amp; Menu</Link>
    </article>
  );
}

export default FoodTruckCard;
