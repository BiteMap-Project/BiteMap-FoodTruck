import { Routes, Route } from "react-router-dom";
import DiscoverPage from "./pages/DiscoverPage";
import TruckMenuPage from "./pages/TruckMenuPage";
import NotFoundPage from "./pages/NotFoundPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<DiscoverPage />} />
      <Route path="/trucks/:id" element={<TruckMenuPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;