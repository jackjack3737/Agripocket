import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { supabase, loadPratoProfilo } from "./lib/supabase";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Chat from "./pages/Chat";
import Home from "./pages/Home";

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 4000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) setSession(data.session);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null);
      return;
    }
    loadPratoProfilo(session.user.id)
      .then(setProfile)
      .catch(() => setProfile(null));
  }, [session]);

  if (loading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Caricamento…</p>
      </div>
    );
  }

  const needsOnboarding = session && (!profile || !profile.onboarding_completato);

  return (
    <Routes>
      <Route path="/" element={<Home session={session} />} />
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route
        path="/onboarding"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : (
            <Onboarding
              userId={session.user.id}
              onComplete={(p) => {
                setProfile(p);
              }}
            />
          )
        }
      />
      <Route
        path="/chat"
        element={
          !session ? (
            <Navigate to="/login" replace />
          ) : needsOnboarding ? (
            <Navigate to="/onboarding" replace />
          ) : (
            <Chat profile={profile} session={session} onProfileUpdate={setProfile} />
          )
        }
      />
      <Route
        path="*"
        element={
          <Navigate
            to={!session ? "/login" : needsOnboarding ? "/onboarding" : "/chat"}
            replace
          />
        }
      />
    </Routes>
  );
}
