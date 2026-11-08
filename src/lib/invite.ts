import { format, parseISO } from 'date-fns';
import type { Dinner } from '../types';

export type InvitationDraft = Pick<Dinner, 'title' | 'cuisine' | 'guest_count' | 'event_date' | 'serve_time' | 'notes' | 'dietary_notes'>;

export function invitationDate(value: string): string {
  if (!value) return 'Date to be decided';
  return format(parseISO(`${value}T12:00:00`), 'EEEE, MMMM d, yyyy');
}

export function invitationTime(value: string): string {
  if (!value) return 'Time to be decided';
  const [hours, minutes] = value.slice(0, 5).split(':').map(Number);
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${hours % 12 || 12}:${String(minutes || 0).padStart(2, '0')} ${suffix}`;
}

export function invitationText(dinner: InvitationDraft): string {
  return [
    `You're invited to ${dinner.title}`,
    `${invitationDate(dinner.event_date)} at ${invitationTime(dinner.serve_time)}`,
    dinner.cuisine ? `${dinner.cuisine} dinner` : 'Dinner party',
    dinner.notes.trim(),
    dinner.dietary_notes.trim() ? `Guest note: ${dinner.dietary_notes.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}
