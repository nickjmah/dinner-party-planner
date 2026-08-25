import { recommendedDayOffset } from '../_shared/domain/timeline.ts';
import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { assertOwnsDinner, authenticatedOwner } from '../_shared/supabase.ts';

const newId = () => `task_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
const planningText = (step: Record<string, unknown>) => String(step.translated_text || step.raw_text || '');
const resource = (text: string) => /fry|deep.?fry/i.test(text) ? 'fryer' : /bake|roast|broil|oven/i.test(text) ? 'oven' : /simmer|boil|saute|sauté|pan|skillet|saucepan/i.test(text) ? 'burner' : /chill|refrigerat/i.test(text) ? 'fridge' : /freez/i.test(text) ? 'freezer' : 'counter';
const duration = (text: string) => Math.min(720, Math.max(5, Number(text.match(/(\d+)\s*(?:minutes?|mins?)/i)?.[1] || (/bake|roast|simmer/i.test(text) ? 30 : 15))));
const phase = (text: string) => /serve|garnish|plate|drizzle/i.test(text) ? 'finish' : /bake|roast|broil|fry|simmer|boil|cook/i.test(text) ? 'cook' : /mix|whisk|blend|sauce|marinat/i.test(text) ? 'prepare' : /cut|chop|slice|peel|dice/i.test(text) ? 'cut' : 'assemble';

Deno.serve(async (request) => {
  const options = handleOptions(request); if (options) return options;
  try {
    const { user, client } = await authenticatedOwner(request); const { dinnerId } = await request.json(); await assertOwnsDinner(client, dinnerId);
    const [{ data: dinner }, { data: recipes }, { data: steps }, { data: previous }] = await Promise.all([
      client.from('dinners').select('*').eq('id', dinnerId).single(), client.from('recipes').select('id,title,short_title,translated_title').eq('dinner_id', dinnerId),
      client.from('steps').select('*').eq('dinner_id', dinnerId).order('position'), client.from('tasks').select('*').eq('dinner_id', dinnerId),
    ]);
    if (!dinner) throw new Error('Dinner not found.');
    const prior = new Map((previous || []).map((task) => [`${task.recipe_id}|${[...(task.source_step_ids || [])].sort().join(',')}`, task]));
    const generated: Record<string, unknown>[] = [];
    for (const recipe of recipes || []) {
      const sourceSteps = (steps || []).filter((step) => step.recipe_id === recipe.id && !/leftovers|nutrition|gather all/i.test(planningText(step)));
      const groups: Array<{ phase: string; steps: typeof sourceSteps }> = [];
      sourceSteps.forEach((step) => { const stepPhase = phase(planningText(step)); const last = groups.at(-1); if (last?.phase === stepPhase && last.steps.length < 3) last.steps.push(step); else groups.push({ phase: stepPhase, steps: [step] }); });
      for (const group of groups) {
        const text = group.steps.map(planningText).join(' '); const profile = recommendedDayOffset(text, recipe.title); const sourceIds = group.steps.map((step) => step.id); const identity = `${recipe.id}|${[...sourceIds].sort().join(',')}`; const saved = prior.get(identity);
        const neededResource = resource(text); const unavailable = (neededResource === 'oven' && dinner.ovens < 1) || (neededResource === 'burner' && dinner.burners < 1) || (neededResource === 'fryer' && dinner.fryers < 1);
        generated.push({ id: saved?.id || newId(), dinner_id: dinnerId, recipe_id: recipe.id, owner_id: user.id, title: `${recipe.short_title || recipe.translated_title || recipe.title} · ${group.phase === 'cut' ? 'Prep vegetables' : group.phase === 'cook' ? 'Cook' : group.phase === 'finish' ? 'Finish and serve' : group.phase === 'prepare' ? 'Prepare component' : 'Assemble'}`, source_step_ids: sourceIds, day_offset: saved?.day_offset ?? profile.dayOffset, start_time: saved?.start_time || '10:00', duration_minutes: duration(text), active_minutes: Math.min(duration(text), /chill|rest|marinat|bake|roast|simmer/i.test(text) ? 10 : duration(text)), passive_minutes: Math.max(0, duration(text) - (/chill|rest|marinat|bake|roast|simmer/i.test(text) ? 10 : duration(text))), resource: neededResource, assignee: saved?.assignee || '', status: saved?.status || 'todo', provenance: { rule: 'deterministic-source-grouping', sourceStepIds: sourceIds }, notes: saved?.notes || (unavailable ? `Equipment warning: this source step requires a ${neededResource}, but the dinner settings list none.` : ''), timing_basis: saved?.timing_basis || (unavailable ? 'equipment-warning' : 'planner-recommendation'), storage_method: saved?.storage_method || (profile.dayOffset < 0 ? 'refrigerated' : 'same-day'), timing_note: text, freezer_suitable: saved?.freezer_suitable ?? profile.freezerSuitable, sort_order: saved?.sort_order || generated.filter((task) => task.day_offset === (saved?.day_offset ?? profile.dayOffset)).length + 1, ingredient_progress: saved?.ingredient_progress || [] });
      }
    }
    const toMinutes = (value: string) => { const [hour, minute] = value.split(':').map(Number); return hour * 60 + minute; };
    const asTime = (value: number) => `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}:00`;
    for (const day of [...new Set(generated.map((task) => Number(task.day_offset)))]) {
      const dayTasks = generated.filter((task) => task.day_offset === day).sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
      const totalActive = dayTasks.filter((task) => !prior.has(`${task.recipe_id}|${[...(task.source_step_ids as string[])].sort().join(',')}`)).reduce((sum, task) => sum + Number(task.active_minutes), 0);
      let cursor = day === 0 ? toMinutes(String(dinner.serve_time).slice(0, 5)) - totalActive : 10 * 60;
      for (const task of dayTasks) {
        const wasSaved = prior.has(`${task.recipe_id}|${[...(task.source_step_ids as string[])].sort().join(',')}`);
        if (wasSaved) cursor = Math.max(cursor, toMinutes(String(task.start_time).slice(0, 5)) + Number(task.active_minutes));
        else { task.start_time = asTime(Math.max(0, cursor)); cursor += Number(task.active_minutes); }
      }
    }
    const ids = new Set(generated.map((task) => task.id as string));
    for (const old of previous || []) if (!ids.has(old.id)) { const { error: deleteError } = await client.from('tasks').delete().eq('id', old.id); if (deleteError) throw deleteError; }
    const { error } = await client.from('tasks').upsert(generated); if (error) throw error;
    return json({ tasks: generated.length, preserved: generated.filter((task) => prior.has(`${task.recipe_id}|${[...(task.source_step_ids as string[])].sort().join(',')}`)).length });
  } catch (error) { return errorResponse(error); }
});
