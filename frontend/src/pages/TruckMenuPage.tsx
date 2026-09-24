import { Link, useParams } from "react-router-dom";

function TruckMenuPage() {
  const { id } = useParams();

  return (
    <div>
      <Link to="/">← Back to trucks</Link>

      <h1>Food Truck Menu</h1>
      <p>Truck ID: {id}</p>

      <h2>Menu</h2>

      <p>Tomato Soup - $8.99</p>
      <p>Bread - $2.00</p>
      <p>Lemonade - $3.00</p>
    </div>
  );
}

export default TruckMenuPage;