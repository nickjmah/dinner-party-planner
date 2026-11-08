import { type FormEvent, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ChefHat, KeyRound, UserPlus } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui';
import { acceptDinnerEditorInvite } from '../lib/api';
import { clearPendingEditorInvite, rememberEditorInvite } from '../lib/editor-invite';
import { supabase } from '../lib/supabase';

export function EditorInvitePage({ session }: { session: Session | null }) {
  const { token = '' } = useParams(); const navigate = useNavigate();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [message, setMessage] = useState('');

  useEffect(() => { rememberEditorInvite(token); }, [token]);

  async function authenticate(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    if (mode === 'signup') {
      const redirect = new URL(location.pathname, location.origin);
      redirect.searchParams.set('editorInvite', token);
      const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect.toString() } });
      if (authError) setError(authError.message); else if (!data.session) setMessage('Check your email to confirm the account, then return to this invite.');
    } else {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password }); if (authError) setError(authError.message);
    }
    setBusy(false);
  }

  async function accept() {
    setBusy(true); setError('');
    try { const dinnerId = await acceptDinnerEditorInvite(token); clearPendingEditorInvite(); navigate(`/app/dinners/${dinnerId}`, { replace: true }); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not accept this editor invite.'); }
    setBusy(false);
  }

  if (!session) return <main className="guest-unlock editor-invite-page"><div className="brand-mark"><ChefHat /><span>Service</span></div><form onSubmit={authenticate}><div className="login-icon"><UserPlus /></div><p className="eyebrow">Dinner editor invite</p><h1>Join the planning table</h1><p>Sign in, or create an account for this invitation. Access is limited to the dinner that was shared with you.</p><div className="segmented"><button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>Sign in</button><button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Create account</button></div><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" minLength={8} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="form-error">{error}</p>}{message && <p className="setup-notice">{message}</p>}<Button type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}</Button></form></main>;

  return <main className="guest-unlock editor-invite-page"><div className="brand-mark"><ChefHat /><span>Service</span></div><div className="editor-invite-accept"><div className="login-icon"><KeyRound /></div><p className="eyebrow">Dinner editor invite</p><h1>Ready to collaborate?</h1><p>Signed in as <strong>{session.user.email}</strong>. Accepting grants edit access only to this dinner.</p>{error && <p className="form-error">{error}</p>}<Button onClick={accept} disabled={busy}>{busy ? 'Joining…' : 'Accept editor invite'}</Button><Button variant="ghost" onClick={() => supabase.auth.signOut()}>Use a different account</Button></div></main>;
}
