import { Link, useParams } from "react-router-dom";

function TruckMenuPage() {
  const { id } = useParams();

  const trucks = [
    {
      id: 1,
      name: "Soup Stop",
      menu: [
        { name: "Tomato Soup", price: "$8.99" },
        { name: "Bread", price: "$2.00" },
        { name: "Lemonade", price: "$3.00" },
      ],
    },
    {
      id: 2,
      name: "Taco Mobile",
      menu: [
        { name: "Chicken Taco", price: "$4.50" },
        { name: "Veggie Taco", price: "$4.00" },
        { name: "Horchata", price: "$3.50" },
      ],
    },
    {
      id: 3,
      name: "Coffee Cart",
      menu: [
        { name: "Latte", price: "$5.00" },
        { name: "Cold Brew", price: "$4.50" },
        { name: "Muffin", price: "$3.00" },
      ],
    },
  ];

  const truck = trucks.find((truck) => truck.id === Number(id));

  if (!truck) {
    return <p>Truck not found.</p>;
  }

  return (
    <div>
      <Link to="/">← Back to trucks</Link>

      <h1>{truck.name}</h1>
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