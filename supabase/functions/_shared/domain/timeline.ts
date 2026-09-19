import type { Dinner, TimelineTask } from './types.ts';

type KitchenCapacity = Pick<Dinner, 'serve_time' | 'burners' | 'ovens' | 'fryers' | 'cooks'>;

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

function resourceCapacity(resource: TimelineTask['resource'], kitchen: KitchenCapacity): number {
  if (resource === 'burner') return Math.max(1, kitchen.burners);
  if (resource === 'oven') return Math.max(1, kitchen.ovens);
  if (resource === 'fryer') return Math.max(1, kitchen.fryers);
  return Number.POSITIVE_INFINITY;
}

function scheduleRelative(tasks: TimelineTask[], kitchen: KitchenCapacity): Map<string, number> {
  const starts = new Map<string, number>();
  const cookUse: number[] = []; const resourceUse = new Map<string, number[]>(); const recipeReady = new Map<string, number>();
  for (const task of sortTimeline(tasks)) {
    const active = Math.max(1, task.active_minutes || task.duration_minutes || 5);
    const duration = Math.max(active, task.duration_minutes || active);
    const resourceMinutes = ['burner', 'oven', 'fryer'].includes(task.resource) ? duration : 0;
    const capacity = resourceCapacity(task.resource, kitchen); const usage = resourceUse.get(task.resource) || [];
    let start = recipeReady.get(task.recipe_id || '') || 0;
    while (start < 2_880) {
      const cooksAvailable = Array.from({ length: active }, (_, offset) => cookUse[start + offset] || 0).every((used) => used < Math.max(1, kitchen.cooks));
      const resourceAvailable = !resourceMinutes || Array.from({ length: resourceMinutes }, (_, offset) => usage[start + offset] || 0).every((used) => used < capacity);
      if (cooksAvailable && resourceAvailable) break;
      start += 1;
    }
    starts.set(task.id, start);
    for (let offset = 0; offset < active; offset += 1) cookUse[start + offset] = (cookUse[start + offset] || 0) + 1;
    for (let offset = 0; offset < resourceMinutes; offset += 1) usage[start + offset] = (usage[start + offset] || 0) + 1;
    resourceUse.set(task.resource, usage);
    if (task.recipe_id) recipeReady.set(task.recipe_id, start + duration);
  }
  return starts;
}

export function reflowDayTimes(tasks: TimelineTask[], dayOffset: number, kitchenOrServeTime: KitchenCapacity | string): TimelineTask[] {
  const dayTasks = sortTimeline(tasks.filter((task) => task.day_offset === dayOffset));
  const kitchen: KitchenCapacity = typeof kitchenOrServeTime === 'string' ? { serve_time: kitchenOrServeTime, burners: 1, ovens: 1, fryers: 1, cooks: 1 } : kitchenOrServeTime;
  const relative = scheduleRelative(dayTasks, kitchen);
  const makespan = dayTasks.reduce((latest, task) => Math.max(latest, (relative.get(task.id) || 0) + Math.max(task.duration_minutes || 0, task.active_minutes || 0, 1)), 0);
  const [serveHour, serveMinute] = kitchen.serve_time.split(':').map(Number);
  const offset = dayOffset === 0 ? Math.max(0, serveHour * 60 + serveMinute - makespan) : 10 * 60;
  const times = new Map([...relative].map(([id, start]) => { const value = offset + start; return [id, `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`]; }));
  return tasks.map((task) => times.has(task.id) ? { ...task, start_time: times.get(task.id)! } : task);
}

export function moveTaskToDay(tasks: TimelineTask[], taskId: string, dayOffset: number, kitchenOrServeTime: KitchenCapacity | string): TimelineTask[] {
  const moving = tasks.find((task) => task.id === taskId);
  if (!moving || moving.day_offset === dayOffset) return tasks;
  const destinationOrder = tasks
    .filter((task) => task.day_offset === dayOffset)
    .reduce((highest, task) => Math.max(highest, task.sort_order), 0) + 1;
  let moved = tasks.map((task) => task.id === taskId ? { ...task, day_offset: dayOffset, sort_order: destinationOrder } : task);
  moved = normalizeDayOrder(sortTimeline(moved), moving.day_offset);
  moved = normalizeDayOrder(sortTimeline(moved), dayOffset);
  moved = reflowDayTimes(moved, moving.day_offset, kitchenOrServeTime);
  return reflowDayTimes(moved, dayOffset, kitchenOrServeTime);
}

export function durationFromText(text: string): number {
  const hour = Number(text.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b/i)?.[1] || 0);
  const minute = Number(text.match(/(\d+)\s*(?:minutes?|mins?|min)\b/i)?.[1] || 0);
  const explicit = Math.round(hour * 60 + minute);
  return Math.min(720, Math.max(5, explicit || (/bake|roast|simmer/i.test(text) ? 30 : 15)));
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
