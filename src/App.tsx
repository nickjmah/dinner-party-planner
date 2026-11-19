import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { Navigate, Route, Routes } from 'react-router-dom';
import { supabase } from './lib/supabase';
import { LoginPage } from './pages/LoginPage';
import { DinnersPage } from './pages/DinnersPage';
import { DinnerPage } from './pages/DinnerPage';
import { GuestPage } from './pages/GuestPage';
import { PrintDinnerPage, PrintRecipePage } from './pages/PrintPages';
import { EditorInvitePage } from './pages/EditorInvitePage';
import { pendingEditorInvite } from './lib/editor-invite';
import { AccessLinkPage } from './pages/AccessLinkPage';

function OwnerRoute({ session, children }: { session: Session | null; children: React.ReactNode }) {
  return session ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    let authChanged = false;
    let identity: string | undefined;
    const receive = (next: Session | null) => {
      if (!active) return;
      if (identity !== next?.user.id) queryClient.clear();
      identity = next?.user.id;
      setSession(next);
    };
    supabase.auth.getSession().then(({ data }) => { if (!authChanged) receive(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => { authChanged = true; receive(next); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [queryClient]);

  if (session === undefined) return <div className="app-loading"><span className="spinner" />Setting the table…</div>;
  const pendingInvite = session ? pendingEditorInvite() : '';

  return (
    <Routes key={session?.user.id || 'signed-out'}>
      <Route path="/login" element={session && !session.user.is_anonymous ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/app" element={<OwnerRoute session={session}><DinnersPage /></OwnerRoute>} />
      <Route path="/app/dinners/:dinnerId" element={<OwnerRoute session={session}><DinnerPage /></OwnerRoute>} />
      <Route path="/app/dinners/:dinnerId/print" element={<OwnerRoute session={session}><PrintDinnerPage /></OwnerRoute>} />
      <Route path="/app/dinners/:dinnerId/recipes/:recipeId/print" element={<OwnerRoute session={session}><PrintRecipePage /></OwnerRoute>} />
      <Route path="/d/:shareId" element={<GuestPage />} />
      <Route path="/join/:token" element={<EditorInvitePage session={session} />} />
      <Route path="/access/:token" element={<AccessLinkPage />} />
      <Route path="*" element={<Navigate to={pendingInvite ? `/join/${pendingInvite}` : session ? '/app' : '/login'} replace />} />
    </Routes>
  );
}

