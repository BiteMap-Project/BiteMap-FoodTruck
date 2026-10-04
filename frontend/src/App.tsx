import { Routes, Route } from "react-router-dom";
import DiscoverPage from "./pages/DiscoverPage";
import TruckMenuPage from "./pages/TruckMenuPage";
import NotFoundPage from "./pages/NotFoundPage";
import OwnerDashboard from "./BiteMap-Owner-Dashboard/src/pages/OwnerDashboard";

function App() {
  return (
    <Routes>
      <Route path="/" element={<DiscoverPage />} />

      <Route path="/trucks/:id" element={<TruckMenuPage />} />
      
      <Route path="/owner" element={<OwnerDashboard />} />

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;