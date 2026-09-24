import { Link } from "react-router-dom";

type FoodTruckCardProps = {
  id: number;
  name: string;
  category: string;
  location: string;
  closingTime: string;
};

function FoodTruckCard({
  id,
  name,
  category,
  location,
  closingTime,
}: FoodTruckCardProps) {
  return (
    <div>
      <h2>{name}</h2>
      <p>{category}</p>
      <p>Location: {location}</p>
      <p>Open until {closingTime}</p>

      <Link to={`/trucks/${id}`}>
        <button>View Menu</button>
      </Link>
    </div>
  );
}

export default FoodTruckCard;