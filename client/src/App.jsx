import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import LandingPage from "./LandingPage";
import AuthPage from "./AuthPage";
import Dashboard from "./Dashboard";
import useAuth from "./useAuth";
import useGameSocket from "./useGameSocket";
import "./App.css";
import "./arcade-theme.css";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const authState = useAuth({ navigate });
  const game = useGameSocket({ enabled: location.pathname === "/game" });

  return (
    <>
      <Routes>
        <Route
          path="/"
          element={<LandingPage account={authState.account} />}
        />
        <Route
          path="/auth"
          element={
            authState.account ? (
              <Navigate to="/game" replace />
            ) : (
              <AuthPage
                authMode={authState.authMode}
                setAuthMode={authState.setAuthMode}
                authUsername={authState.authUsername}
                setAuthUsername={authState.setAuthUsername}
                authEmail={authState.authEmail}
                setAuthEmail={authState.setAuthEmail}
                authPassword={authState.authPassword}
                setAuthPassword={authState.setAuthPassword}
                authBusy={authState.authBusy}
                authError={authState.authError}
                submitAuth={authState.submitAuth}
                onBack={() => navigate("/")}
              />
            )
          }
        />
        <Route
          path="/game"
          element={<Dashboard authState={authState} game={game} />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
