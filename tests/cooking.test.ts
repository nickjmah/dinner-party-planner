import { describe, expect, it } from 'vitest';
import { cookingTasks, cookingTime, cookingEnd } from '../src/lib/cooking';
import type { TimelineTask } from '../src/types';
const task=(id:string,start_time:string,sort_order:number,day_offset=0)=>({id,start_time,sort_order,day_offset,duration_minutes:15} as TimelineTask);
describe('party-day cooking display',()=>{
 it('uses clock time rather than drag order, without changing the prep list',()=>{const tasks=[task('dessert','20:30:00',1),task('tagine','16:00:00',99),task('salads','18:55:00',2),task('friday','09:00:00',0,-1)];expect(cookingTasks(tasks).map(task=>task.id)).toEqual(['tagine','salads','dessert']);expect(tasks[0].id).toBe('dessert');expect(cookingEnd(cookingTasks(tasks))).toBe('8:45 PM');});
 it('formats AM and PM explicitly',()=>{expect(cookingTime(0)).toBe('12:00 AM');expect(cookingTime(720)).toBe('12:00 PM');expect(cookingTime(1140)).toBe('7:00 PM');expect(cookingEnd([])).toBe('');});
});
