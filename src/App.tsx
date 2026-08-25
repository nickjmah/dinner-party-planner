import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';
import { DinnersPage } from './pages/DinnersPage';
import { DinnerPage } from './pages/DinnerPage';
import { GuestPage } from './pages/GuestPage';
import { PrintDinnerPage, PrintRecipePage } from './pages/PrintPages';

function OwnerRoute({ session, children }: { session: Session | null; children: React.ReactNode }) {
  return session ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="app-loading"><span className="spinner" />Setting the table…</div>;

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/app" element={<OwnerRoute session={session}><DinnersPage /></OwnerRoute>} />
      <Route path="/app/dinners/:dinnerId" element={<OwnerRoute session={session}><DinnerPage /></OwnerRoute>} />
      <Route path="/app/dinners/:dinnerId/print" element={<OwnerRoute session={session}><PrintDinnerPage /></OwnerRoute>} />
      <Route path="/app/dinners/:dinnerId/recipes/:recipeId/print" element={<OwnerRoute session={session}><PrintRecipePage /></OwnerRoute>} />
      <Route path="/d/:shareId" element={<GuestPage />} />
      <Route path="*" element={<Navigate to={session ? '/app' : '/login'} replace />} />
    </Routes>
  );
}

