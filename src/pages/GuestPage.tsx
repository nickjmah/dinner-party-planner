import { FormEvent, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, Check, ChefHat, Clock, CookingPot, KeyRound, ShoppingBasket, Users } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Button, Card, LoadingState } from '../components/ui';
import { getGuestDinner, unlockGuestDinner } from '../lib/api';
import { formatQuantity } from '../lib/quantity';
import { taskDayLabel } from '../lib/timeline';

export function GuestPage() {
  const { shareId = '' } = useParams();
  const [token, setToken] = useState(() => sessionStorage.getItem(`dinner-guest:${shareId}`) || '');
  const [code, setCode] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const dinner = useQuery({ queryKey: ['guest-dinner', shareId, token], queryFn: () => getGuestDinner(shareId, token), enabled: Boolean(token), retry: false });

  async function unlock(event: FormEvent) {
    event.preventDefault(); setUnlocking(true); setUnlockError('');
    try { setToken(await unlockGuestDinner(shareId, code)); } catch (error) { setUnlockError(error instanceof Error ? error.message : 'Unable to unlock dinner.'); }
    setUnlocking(false);
  }

  if (!token || dinner.error) return <main className="guest-unlock"><div className="brand-mark"><ChefHat /><span>Service</span></div><form onSubmit={unlock}><div className="login-icon"><KeyRound /></div><p className="eyebrow">You’re invited</p><h1>Open the dinner plan</h1><p>Enter the eight-character code your host shared with you.</p><label>Dinner code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={8} autoCapitalize="characters" autoFocus required /></label>{unlockError && <p className="form-error">{unlockError}</p>}<Button type="submit" disabled={unlocking || code.length !== 8}>{unlocking ? 'Checking…' : 'Open dinner'}</Button></form></main>;
  if (dinner.isLoading || !dinner.data) return <LoadingState label="Opening the dinner plan…" />;
  const data = dinner.data;
  const remaining = data.shopping.filter((item) => !item.purchased);
  const tasksByDay = data.tasks.reduce<Record<string, typeof data.tasks>>((groups, task) => { (groups[task.day_offset] ||= []).push(task); return groups; }, {});
  return <div className="guest-page"><header className="guest-header"><div className="brand-mark"><ChefHat /><span>Service</span></div><p>Shared by your host · Read only</p></header><main><section className="guest-hero"><div><p className="eyebrow">{data.dinner.cuisine || 'Dinner party'}</p><h1>{data.dinner.title}</h1><div className="guest-meta"><span><CalendarDays />{format(parseISO(`${data.dinner.event_date}T12:00:00`), 'EEEE, MMMM d')}</span><span><Clock />{data.dinner.serve_time.slice(0, 5)}</span><span><Users />{data.dinner.guest_count} guests</span></div></div></section><section><p className="eyebrow">The menu</p><div className="guest-menu">{data.recipes.map((recipe, index) => <Card key={`${recipe.title}-${index}`}><h2>{recipe.short_title || recipe.translated_title || recipe.title}</h2><p>{recipe.target_servings || data.dinner.guest_count} planned servings</p></Card>)}</div></section><section className="guest-columns"><div><h2><ShoppingBasket />Remaining shopping</h2>{remaining.length ? <ul className="guest-list">{remaining.map((item, index) => <li key={`${item.item}-${index}`}><span>{item.item}</span><strong>{item.component_requirements.length ? item.component_requirements.map((part) => `${formatQuantity(part.quantity)} ${part.unit}`).join(' + ') : `${formatQuantity(item.quantity)} ${item.unit}`}</strong></li>)}</ul> : <Card className="guest-complete"><Check />Shopping is complete</Card>}</div><div><h2><CookingPot />Prep plan</h2>{Object.entries(tasksByDay).sort(([a], [b]) => Number(a) - Number(b)).map(([day, tasks]) => <div className="guest-day" key={day}><h3>{taskDayLabel(data.dinner, Number(day))}</h3>{tasks.map((task, index) => <div className="guest-task" key={`${task.title}-${index}`}><time>{task.start_time.slice(0, 5)}</time><div><strong>{task.title}</strong><span>{task.duration_minutes} min · {task.resource}</span></div></div>)}</div>)}</div></section></main></div>;
}
