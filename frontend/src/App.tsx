import { Routes, Route } from "react-router-dom";
import DiscoverPage from "./pages/DiscoverPage";
import TruckMenuPage from "./pages/TruckMenuPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<DiscoverPage />} />
      <Route path="/trucks/:id" element={<TruckMenuPage />} />
    </Routes>
  );
}

export default App;