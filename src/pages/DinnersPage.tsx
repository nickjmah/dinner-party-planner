import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, ChefHat, LogOut, Plus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Button, Card, EmptyState, ErrorState, LoadingState } from '../components/ui';
import { listDinners } from '../lib/api';
import { supabase } from '../lib/supabase';

export function DinnersPage() {
  const dinners = useQuery({ queryKey: ['dinners'], queryFn: listDinners });
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const createDinner = useMutation({
    mutationFn: async (form: FormData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in again.');
      const id = `dinner_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
      const { error } = await supabase.from('dinners').insert({
        id, owner_id: user.id, title: String(form.get('title')), cuisine: String(form.get('cuisine')),
        guest_count: Number(form.get('guestCount')), event_date: String(form.get('eventDate')),
        serve_time: String(form.get('serveTime')), burners: 4, ovens: 1, fryers: 1, cooks: 1,
      });
      if (error) throw error;
      return id;
    },
    onSuccess: () => { setShowForm(false); queryClient.invalidateQueries({ queryKey: ['dinners'] }); },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createDinner.mutate(new FormData(event.currentTarget));
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="brand-mark"><ChefHat size={24} /><span>Service</span></div>
        <Button variant="ghost" onClick={() => supabase.auth.signOut()}><LogOut size={18} />Sign out</Button>
      </header>
      <main className="dinners-main">
        <div className="page-heading"><div><p className="eyebrow">Your table</p><h1>Dinner nights</h1><p>Every menu, source, shop, and prep plan in one place.</p></div><Button onClick={() => setShowForm(true)}><Plus size={18} />New dinner</Button></div>
        {dinners.isLoading && <LoadingState label="Loading dinner nights…" />}
        {dinners.error && <ErrorState message={dinners.error.message} retry={() => dinners.refetch()} />}
        {dinners.data?.length === 0 && <EmptyState icon={<CalendarDays />} title="Plan the first night">Choose a date and cuisine. Recipes can come next.</EmptyState>}
        <div className="dinner-grid">
          {dinners.data?.map((dinner) => (
            <Link key={dinner.id} to={`/app/dinners/${dinner.id}`} className="dinner-link">
              <Card className="dinner-card">
                <p className="eyebrow">{dinner.cuisine || 'Dinner party'}</p><h2>{dinner.title}</h2>
                <div className="dinner-meta"><span><CalendarDays size={16} />{format(parseISO(`${dinner.event_date}T12:00:00`), 'EEE, MMM d')}</span><span><Users size={16} />{dinner.guest_count} guests</span></div>
                <div className="service-time"><span>Service</span><strong>{dinner.serve_time.slice(0, 5)}</strong></div>
              </Card>
            </Link>
          ))}
        </div>
      </main>
      {showForm && <div className="modal-backdrop" onMouseDown={() => setShowForm(false)}><form className="modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><p className="eyebrow">New dinner</p><h2>Set the table</h2><label>Dinner name<input name="title" required autoFocus placeholder="Spanish summer night" /></label><div className="form-row"><label>Cuisine<input name="cuisine" placeholder="Spanish" /></label><label>Guests<input name="guestCount" type="number" min="1" defaultValue="12" required /></label></div><div className="form-row"><label>Date<input name="eventDate" type="date" required /></label><label>Serve at<input name="serveTime" type="time" defaultValue="19:00" required /></label></div>{createDinner.error && <p className="form-error">{createDinner.error.message}</p>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button><Button type="submit" disabled={createDinner.isPending}>{createDinner.isPending ? 'Creating…' : 'Create dinner'}</Button></div></form></div>}
    </div>
  );
}

