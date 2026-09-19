import { describe, expect, it } from 'vitest';
import { applySavedTimelineState, durationFromText, moveTaskToDay, normalizeDayOrder, recommendedDayOffset, reflowDayTimes, sortTimeline, taskDayLabel } from '../src/lib/timeline';
import type { Dinner, TimelineTask } from '../src/types';

const task = (id: string, extras: Partial<TimelineTask> = {}) => ({ id, dinner_id: 'dinner_1', recipe_id: 'recipe_1', owner_id: 'owner', title: id, source_step_ids: [id.replace('task', 'step')], day_offset: 0, start_time: '10:00', duration_minutes: 15, active_minutes: 15, passive_minutes: 0, resource: 'counter', assignee: '', status: 'todo', provenance: {}, notes: '', timing_basis: '', storage_method: '', timing_note: '', freezer_suitable: false, sort_order: 1, ingredient_progress: [], created_at: '', updated_at: '', ...extras } as TimelineTask);

describe('timeline persistence', () => {
  it('sorts by selected day and manual order', () => expect(sortTimeline([task('task_b', { day_offset: 0, sort_order: 2 }), task('task_a', { day_offset: -2 }), task('task_c', { day_offset: 0, sort_order: 1 })]).map((row) => row.id)).toEqual(['task_a', 'task_c', 'task_b']));
  it('preserves layout and status when a generated task has the same source steps', () => {
    const prior = task('task_saved', { source_step_ids: ['step_b', 'step_a'], day_offset: -3, sort_order: 4, assignee: 'Nick', status: 'done' });
    const generated = task('task_new', { source_step_ids: ['step_a', 'step_b'] });
    expect(applySavedTimelineState([generated], [prior])[0]).toMatchObject({ id: 'task_saved', day_offset: -3, sort_order: 4, assignee: 'Nick', status: 'done' });
  });
  it('leaves new generated tasks alone', () => expect(applySavedTimelineState([task('task_new')], [task('task_other')])[0].id).toBe('task_new'));
  it('normalizes only the selected day', () => {
    const rows = normalizeDayOrder([task('task_a', { day_offset: -1, sort_order: 9 }), task('task_b', { day_offset: 0, sort_order: 9 }), task('task_c', { day_offset: -1, sort_order: 8 })], -1);
    expect(rows.map((row) => row.sort_order)).toEqual([1, 9, 2]);
  });
  it('reflows times after manual ordering without changing days', () => {
    const rows = reflowDayTimes([task('task_b', { sort_order: 2, active_minutes: 30 }), task('task_a', { sort_order: 1, active_minutes: 20 }), task('task_early', { day_offset: -1, start_time: '12:00' })], 0, '19:00');
    expect(rows.find((row) => row.id === 'task_a')?.start_time).toBe('18:10');
    expect(rows.find((row) => row.id === 'task_b')?.start_time).toBe('18:30');
    expect(rows.find((row) => row.id === 'task_early')?.start_time).toBe('12:00');
  });
  it('moves a task to another day, normalizes both days, and reflows both schedules', () => {
    const rows = moveTaskToDay([
      task('task_a', { day_offset: 0, sort_order: 1, active_minutes: 20 }),
      task('task_b', { day_offset: 0, sort_order: 2, active_minutes: 30 }),
      task('task_c', { day_offset: -1, sort_order: 7, active_minutes: 15 }),
    ], 'task_a', -1, '19:00');
    expect(rows.find((row) => row.id === 'task_b')).toMatchObject({ day_offset: 0, sort_order: 1, start_time: '18:30' });
    expect(rows.find((row) => row.id === 'task_c')).toMatchObject({ day_offset: -1, sort_order: 1, start_time: '10:00' });
    expect(rows.find((row) => row.id === 'task_a')).toMatchObject({ day_offset: -1, sort_order: 2, start_time: '10:15' });
  });
  it('runs independent resources in parallel when cooks and equipment are available', () => {
    const kitchen = { serve_time: '19:00', burners: 2, ovens: 1, fryers: 1, cooks: 2 } as Dinner;
    const rows = reflowDayTimes([
      task('task_burner', { recipe_id: 'recipe_a', resource: 'burner', duration_minutes: 30, active_minutes: 30, sort_order: 1 }),
      task('task_oven', { recipe_id: 'recipe_b', resource: 'oven', duration_minutes: 30, active_minutes: 10, sort_order: 2 }),
    ], 0, kitchen);
    expect(rows.map((row) => row.start_time)).toEqual(['18:30', '18:30']);
  });
  it('serializes tasks when the required equipment is at capacity', () => {
    const kitchen = { serve_time: '19:00', burners: 2, ovens: 1, fryers: 1, cooks: 2 } as Dinner;
    const rows = reflowDayTimes([
      task('task_oven_a', { recipe_id: 'recipe_a', resource: 'oven', duration_minutes: 30, active_minutes: 10, sort_order: 1 }),
      task('task_oven_b', { recipe_id: 'recipe_b', resource: 'oven', duration_minutes: 30, active_minutes: 10, sort_order: 2 }),
    ], 0, kitchen);
    expect(rows.map((row) => row.start_time)).toEqual(['18:00', '18:30']);
  });
  it('parses hour-and-minute durations', () => expect(durationFromText('Bake for 1 hour 30 minutes.')).toBe(90));
});

describe('make-ahead reasoning', () => {
  it('moves sturdy desserts two days ahead', () => expect(recommendedDayOffset('Bake and chill.', 'Basque cheesecake').dayOffset).toBe(-2));
  it('moves sauces a day ahead', () => expect(recommendedDayOffset('Blend the sauce and refrigerate.', 'Bravas').dayOffset).toBe(-1));
  it('recognizes freezer-friendly croquetas', () => expect(recommendedDayOffset('Form and bread.', 'Croquetas')).toMatchObject({ dayOffset: -3, freezerSuitable: true }));
  it('keeps final frying on party day', () => expect(recommendedDayOffset('Fry and serve immediately.', 'Fritters').dayOffset).toBe(0));
  it('shows actual calendar days', () => expect(taskDayLabel({ event_date: '2026-08-28' } as Dinner, -2)).toBe('Wednesday, August 26'));
  it('labels the event date party day', () => expect(taskDayLabel({ event_date: '2026-08-28' } as Dinner, 0)).toBe('Party day · Fri, Aug 28'));
});
