import { Routes, Route } from "react-router-dom";
import DiscoverPage from "./pages/DiscoverPage";
import TruckMenuPage from "./pages/TruckMenuPage";
import NotFoundPage from "./pages/NotFoundPage";
import OperatorHomePage from "./pages/OperatorHomePage";
import OperatorLoginPage from "./pages/OperatorLoginPage";
import OperatorRegisterPage from "./pages/OperatorRegisterPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<DiscoverPage />} />
      <Route path="/trucks/:id" element={<TruckMenuPage />} />
      <Route path="/operator" element={<OperatorHomePage />} />
      <Route path="/operator/login" element={<OperatorLoginPage />} />
      <Route path="/operator/register" element={<OperatorRegisterPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
