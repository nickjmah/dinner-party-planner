import { FormEvent, useState } from 'react';
import { ChefHat, KeyRound } from 'lucide-react';
import { Button } from '../components/ui';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError('');
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) setError(authError.message);
    setLoading(false);
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="brand-mark"><ChefHat size={28} /><span>Service</span></div>
        <div>
          <p className="eyebrow">Dinner party planner</p>
          <h1>A calmer kitchen starts before anyone arrives.</h1>
          <p>Bring source-grounded recipes, shopping, prep, equipment, and the cooking handoff into one thoughtful service plan.</p>
        </div>
        <p className="login-footnote">Publisher wording stays intact. Calculations and recommendations remain clearly labeled.</p>
      </section>
      <section className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <div className="login-icon"><KeyRound /></div>
          <p className="eyebrow">Owner access</p>
          <h2>Welcome back</h2>
          <p className="muted">Sign in to plan and edit your dinners.</p>
          {!isSupabaseConfigured && <div className="setup-notice">Add the two Supabase values from <code>.env.example</code> before signing in.</div>}
          <label>Email<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
          <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
          {error && <p className="form-error">{error}</p>}
          <Button type="submit" disabled={loading || !isSupabaseConfigured}>{loading ? 'Signing in…' : 'Sign in'}</Button>
          <p className="small muted">This planner uses a single owner account. Public signup is disabled.</p>
        </form>
      </section>
    </main>
  );
}

