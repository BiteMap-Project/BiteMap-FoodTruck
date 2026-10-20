import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./operator-auth.css";
import OperatorWorkspace from "../features/operator/OperatorWorkspace";
import { useAuth } from "../auth/authState";

function OperatorHomePage() {
  const navigate = useNavigate();
  const { account, signOut: logout } = useAuth();
  const [logoutError, setLogoutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = useCallback(async () => {
    setLogoutError("");
    setSigningOut(true);
    try {
      await logout();
      navigate("/operator/login", { replace: true });
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }, [logout, navigate]);

  if (!account) return null;
  return <OperatorWorkspace account={account} onSignOut={handleSignOut} signingOut={signingOut} logoutError={logoutError} />;
}

export default OperatorHomePage;
