import { Routes, Route, Navigate } from "react-router-dom";
import DiscoverPage from "./pages/DiscoverPage";
import TruckMenuPage from "./pages/TruckMenuPage";
import NotFoundPage from "./pages/NotFoundPage";
import OperatorHomePage from "./pages/OperatorHomePage";
import OperatorLoginPage from "./pages/OperatorLoginPage";
import OperatorRegisterPage from "./pages/OperatorRegisterPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import CartPage from "./pages/CartPage";
import CustomerLoginPage from "./pages/CustomerLoginPage";
import CustomerRegisterPage from "./pages/CustomerRegisterPage";
import OperatorOnboardingPage from "./pages/OperatorOnboardingPage";
import OrderConfirmationPage from "./pages/OrderConfirmationPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<DiscoverPage />} />
      <Route path="/trucks" element={<DiscoverPage />} />

      <Route path="/trucks/:id" element={<TruckMenuPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/customer/login" element={<CustomerLoginPage />} />
      <Route path="/customer/register" element={<CustomerRegisterPage />} />
      <Route path="/orders/:id/confirmation" element={<OrderConfirmationPage />} />
      <Route path="/owner" element={<OperatorHomePage />} />
      <Route path="/operator" element={<OperatorHomePage />} />
      <Route path="/operator/login" element={<OperatorLoginPage />} />
      <Route path="/operator/register" element={<OperatorRegisterPage />} />
      <Route path="/operator/onboarding" element={<OperatorOnboardingPage />} />
      <Route path="/operator/analytics" element={<AnalyticsPage />} />
      <Route path="/analytics" element={<Navigate to="/operator/analytics" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
