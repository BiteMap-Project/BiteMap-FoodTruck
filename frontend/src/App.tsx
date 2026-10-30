import { Routes, Route, Navigate } from "react-router-dom";
import DiscoverPage from "./pages/DiscoverPage";
import TruckMenuPage from "./pages/TruckMenuPage";
import NotFoundPage from "./pages/NotFoundPage";
import OperatorHomePage from "./pages/OperatorHomePage";
import OperatorLoginPage from "./pages/OperatorLoginPage";
import OperatorRegisterPage from "./pages/OperatorRegisterPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import CartPage from "./pages/CartPage";
import FavoritesPage from "./pages/FavoritesPage";
import CustomerLoginPage from "./pages/CustomerLoginPage";
import PasswordRecoveryPage from "./pages/PasswordRecoveryPage";
import CustomerRegisterPage from "./pages/CustomerRegisterPage";
import OperatorOnboardingPage from "./pages/OperatorOnboardingPage";
import OrderConfirmationPage from "./pages/OrderConfirmationPage";
import CustomerOrdersPage from "./pages/CustomerOrdersPage";
import AdminApplicationsPage from "./pages/AdminApplicationsPage";
import AccountSettingsPage from "./pages/AccountSettingsPage";
import { RequireAccount, RequireAdmin, RequireOperator } from "./auth/RouteGuards";

function App() {
  return (
    <Routes>
      <Route path="/" element={<DiscoverPage />} />
      <Route path="/trucks" element={<DiscoverPage />} />
      <Route path="/stops" element={<DiscoverPage />} />

      <Route path="/trucks/:id" element={<TruckMenuPage />} />
      <Route path="/cart" element={<CartPage />} />
      <Route path="/favorites" element={<RequireAccount><FavoritesPage /></RequireAccount>} />
      <Route path="/customer/login" element={<CustomerLoginPage />} />
      <Route path="/forgot-password" element={<PasswordRecoveryPage key="forgot" />} />
      <Route path="/reset-password" element={<PasswordRecoveryPage key="reset" reset />} />
      <Route path="/customer/register" element={<CustomerRegisterPage />} />
      {/* Account-keyed guards discard private results and abort reads on session changes. */}
      <Route path="/orders/:id/confirmation" element={<RequireAccount><OrderConfirmationPage /></RequireAccount>} />
      <Route path="/orders" element={<RequireAccount><CustomerOrdersPage /></RequireAccount>} />
      <Route path="/account" element={<RequireAccount><AccountSettingsPage /></RequireAccount>} />
      <Route path="/owner" element={<RequireOperator><OperatorHomePage /></RequireOperator>} />
      <Route path="/operator" element={<RequireOperator><OperatorHomePage /></RequireOperator>} />
      <Route path="/operator/vendors/:vendorId/:section" element={<RequireOperator><OperatorHomePage /></RequireOperator>} />
      <Route path="/operator/login" element={<OperatorLoginPage />} />
      <Route path="/operator/register" element={<OperatorRegisterPage />} />
      <Route path="/operator/onboarding" element={<OperatorOnboardingPage />} />
      <Route path="/admin/owner-applications" element={<RequireAdmin><AdminApplicationsPage /></RequireAdmin>} />
      <Route path="/operator/analytics" element={<RequireOperator><AnalyticsPage /></RequireOperator>} />
      <Route path="/analytics" element={<Navigate to="/operator/analytics" replace />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
