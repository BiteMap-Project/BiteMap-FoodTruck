import { useState } from "react";
import FoodTruckCard from "../components/FoodTruckCard";

function DiscoverPage() {
  const [search, setSearch] = useState("");

  const trucks = [
    {
      id: 1,
      name: "Soup Stop",
      category: "Soup",
      location: "CSUN",
      closingTime: "3:00 PM",
    },
    {
      id: 2,
      name: "Taco Mobile",
      category: "Tacos",
      location: "Northridge",
      closingTime: "5:00 PM",
    },
    {
      id: 3,
      name: "Coffee Cart",
      category: "Coffee",
      location: "Reseda",
      closingTime: "6:00 PM",
    },
  ];

  const filteredTrucks = trucks.filter((truck) => {
    const searchText = search.toLowerCase();

    return (
      truck.name.toLowerCase().includes(searchText) ||
      truck.category.toLowerCase().includes(searchText) ||
      truck.location.toLowerCase().includes(searchText)
    );
  });

  return (
    <div>
      <h1>BiteMap</h1>
      <p>Find mobile food near you.</p>

      <input
        type="text"
        placeholder="Search trucks, food, or location..."
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      <hr />

      {filteredTrucks.map((truck) => (
        <FoodTruckCard
          key={truck.id}
          id={truck.id}
          name={truck.name}
          category={truck.category}
          location={truck.location}
          closingTime={truck.closingTime}
        />
      ))}
    </div>
  );
}

export default DiscoverPage;