import { trucks } from "../data/trucks";
import { Link, useParams } from "react-router-dom";

function TruckMenuPage() {
  const { id } = useParams();

  const truck = trucks.find((truck) => truck.id === Number(id));

  if (!truck) {
    return <p>Truck not found.</p>;
  }

  return (
    <div>
      <Link to="/">← Back to trucks</Link>

      <h1>{truck.name}</h1>
      <p>Category: {truck.category}</p>
      <p>Location: {truck.location}</p>
      <p>Open until {truck.closingTime}</p>

      <h2>Menu</h2>

      {truck.menu.map((item) => (
        <p key={item.name}>
          {item.name} - {item.price}
        </p>
      ))}
    </div>
  );
}

export default TruckMenuPage;
