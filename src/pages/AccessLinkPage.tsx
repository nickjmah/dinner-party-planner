import { useState } from 'react';
import { ChefHat, Link2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../components/ui';
import { redeemDinnerAccessLink } from '../lib/api';
import { supabase } from '../lib/supabase';

export function AccessLinkPage() {
  const { token = '' } = useParams(); const navigate = useNavigate();
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');

  async function openAccess() {
    setBusy(true); setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { const { error: signInError } = await supabase.auth.signInAnonymously(); if (signInError) throw signInError; }
      const dinnerId = await redeemDinnerAccessLink(token);
      navigate(`/app/dinners/${dinnerId}`, { replace: true });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not open this access link.'); }
    setBusy(false);
  }

  return <main className="guest-unlock editor-invite-page"><div className="brand-mark"><ChefHat /><span>Service</span></div><div className="editor-invite-accept"><div className="login-icon"><Link2 /></div><p className="eyebrow">30-day editor link</p><h1>Edit without an account</h1><p>This link grants editing access to one dinner for 30 days. No email or password is required.</p><p className="small muted">Anyone with this link can edit the dinner until it expires or the owner revokes it.</p>{error && <p className="form-error">{error}</p>}<Button onClick={openAccess} disabled={busy}>{busy ? 'Opening…' : 'Open dinner editor'}</Button></div></main>;
}
