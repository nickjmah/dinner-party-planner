import { describe, expect, it } from 'vitest';
import { invitationDate, invitationText, invitationTime } from '../src/lib/invite';

describe('invitation formatting', () => {
  it('formats local dinner dates and times without timezone shifts', () => {
    expect(invitationDate('2026-11-21')).toBe('Saturday, November 21, 2026');
    expect(invitationTime('19:30:00')).toBe('7:30 PM');
    expect(invitationTime('00:05')).toBe('12:05 AM');
  });

  it('creates a copyable invitation from saved dinner fields', () => {
    expect(invitationText({ title: 'Spanish Night', cuisine: 'Spanish', guest_count: 12, event_date: '2026-11-21', serve_time: '19:30', notes: 'Come ready to cook together.', dietary_notes: 'Tell me about allergies.' })).toBe("You're invited to Spanish Night\n\nSaturday, November 21, 2026 at 7:30 PM\n\nSpanish dinner\n\nCome ready to cook together.\n\nGuest note: Tell me about allergies.");
  });
});
