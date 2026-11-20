import type { TimelineTask } from '../types';
export function cookingTasks(tasks: TimelineTask[]): TimelineTask[] {
  return tasks.filter(task => task.day_offset === 0).sort((a,b) => clockMinutes(a.start_time)-clockMinutes(b.start_time) || a.sort_order-b.sort_order || a.id.localeCompare(b.id));
}
export function clockMinutes(time: string): number {
  const [hour,minute]=time.split(':').map(Number);
  return hour*60+minute;
}
export function cookingTime(minutes: number): string {
  const hour=Math.floor(minutes/60)%24;
  return `${hour%12||12}:${String(minutes%60).padStart(2,'0')} ${hour>=12?'PM':'AM'}`;
}
export function cookingEnd(tasks: TimelineTask[]): string {
  return tasks.length ? cookingTime(Math.max(...tasks.map(task=>clockMinutes(task.start_time)+task.duration_minutes))) : '';
}
