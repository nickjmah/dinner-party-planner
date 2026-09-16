import type { Dinner, TimelineTask } from './types.ts';

const partyDayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

const advanceDayFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function sortTimeline(tasks: TimelineTask[]): TimelineTask[] {
  return [...tasks].sort((a, b) => a.day_offset - b.day_offset || a.sort_order - b.sort_order || a.title.localeCompare(b.title));
}

export function taskDayLabel(dinner: Pick<Dinner, 'event_date'>, dayOffset: number): string {
  const date = new Date(`${dinner.event_date}T12:00:00`);
  date.setDate(date.getDate() + dayOffset);
  if (dayOffset === 0) return `Party day · ${partyDayFormatter.format(date)}`;
  return advanceDayFormatter.format(date);
}

export function applySavedTimelineState(generated: TimelineTask[], previous: TimelineTask[]): TimelineTask[] {
  const priorBySource = new Map(previous.map((task) => [timelineIdentity(task), task]));
  return generated.map((task) => {
    const saved = priorBySource.get(timelineIdentity(task));
    if (!saved) return task;
    return {
      ...task,
      id: saved.id,
      day_offset: saved.day_offset,
      start_time: saved.start_time,
      sort_order: saved.sort_order,
      assignee: saved.assignee,
      status: saved.status,
      notes: saved.notes,
      ingredient_progress: saved.ingredient_progress,
    };
  });
}

function timelineIdentity(task: TimelineTask): string {
  return `${task.recipe_id || ''}|${[...task.source_step_ids].sort().join(',')}`;
}

export function normalizeDayOrder(tasks: TimelineTask[], dayOffset: number): TimelineTask[] {
  let order = 0;
  return tasks.map((task) => task.day_offset === dayOffset ? { ...task, sort_order: ++order } : task);
}

export function reflowDayTimes(tasks: TimelineTask[], dayOffset: number, serveTime: string): TimelineTask[] {
  const dayTasks = sortTimeline(tasks.filter((task) => task.day_offset === dayOffset));
  const [serveHour, serveMinute] = serveTime.split(':').map(Number);
  const totalMinutes = dayTasks.reduce((sum, task) => sum + Math.max(task.active_minutes || task.duration_minutes, 5), 0);
  let cursor = dayOffset === 0 ? serveHour * 60 + serveMinute - totalMinutes : 10 * 60;
  const times = new Map<string, string>();
  dayTasks.forEach((task) => {
    const hour = Math.floor(cursor / 60) % 24;
    const minute = cursor % 60;
    times.set(task.id, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
    cursor += Math.max(task.active_minutes || task.duration_minutes, 5);
  });
  return tasks.map((task) => times.has(task.id) ? { ...task, start_time: times.get(task.id)! } : task);
}

export function moveTaskToDay(tasks: TimelineTask[], taskId: string, dayOffset: number, serveTime: string): TimelineTask[] {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving || moving.day_offset === dayOffset) return tasks;
  const destinationOrder = tasks
    .filter((task) => task.day_offset === dayOffset)
    .reduce((highest, task) => Math.max(highest, task.sort_order), 0) + 1;
  let moved = tasks.map((task) => task.id === taskId ? { ...task, day_offset: dayOffset, sort_order: destinationOrder } : task);
  moved = normalizeDayOrder(sortTimeline(moved), moving.day_offset);
  moved = normalizeDayOrder(sortTimeline(moved), dayOffset);
  moved = reflowDayTimes(moved, moving.day_offset, serveTime);
  return reflowDayTimes(moved, dayOffset, serveTime);
}

export function recommendedDayOffset(text: string, recipeTitle: string): { dayOffset: number; reason: string; freezerSuitable: boolean } {
  const combined = `${recipeTitle} ${text}`.toLowerCase();
  if (/freeze|freezer|croquet|cookie dough|unbaked pastry/.test(combined)) {
    return { dayOffset: -3, reason: 'Freezer-friendly prep can be completed several days ahead.', freezerSuitable: true };
  }
  if (/cheesecake|cake|tart|custard|dessert/.test(combined) && !/fry|torch|serve immediately/.test(combined)) {
    return { dayOffset: -2, reason: 'The finished dessert benefits from chilling or resting.', freezerSuitable: false };
  }
  if (/sauce|marinade|pickle|chill|refrigerate|gazpacho|braise/.test(combined) && !/finish|drizzle|serve/.test(combined)) {
    return { dayOffset: -1, reason: 'This component holds safely and reduces party-day work.', freezerSuitable: false };
  }
  return { dayOffset: 0, reason: 'Keep this on party day for texture or freshness.', freezerSuitable: false };
}
