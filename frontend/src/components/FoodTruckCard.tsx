import type { Vendor } from "../services/vendors";

function FoodTruckCard({ name, category, location }: Vendor) {
  return (
    <article>
      <h2>{name}</h2>
      <p>{category}</p>
      <p>Location: {location}</p>
      <p>Menu coming soon</p>
    </article>
  );
}

export default FoodTruckCard;
