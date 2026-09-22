type FoodTruckCardProps = {
  name: string;
  category: string;
  location: string;
  closingTime: string;
};

function FoodTruckCard({
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
      <button>View Menu</button>
    </div>
  );
}

export default FoodTruckCard;