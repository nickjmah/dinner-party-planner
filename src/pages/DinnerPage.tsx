import { useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, BookOpen, CalendarClock, Check, ChefHat, ChevronDown, ChevronLeft, CircleGauge, CookingPot, ExternalLink, FileDown, GripVertical, Menu, MoreHorizontal, Plus, Printer, Share2, ShoppingBasket, Trash2, Upload, Users, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Button, Card, EmptyState, ErrorState, LoadingState, SaveState } from '../components/ui';
import { useDinner, useUpdateDinnerRow } from '../hooks/useDinner';
import { deleteRecipe, invokeOwnerFunction } from '../lib/api';
import { formatQuantity, recipeScale, remainingComponents, remainingQuantity } from '../lib/quantity';
import { normalizeDayOrder, reflowDayTimes, sortTimeline, taskDayLabel } from '../lib/timeline';
import type { DinnerDetail, Recipe, ShoppingItem, TimelineTask } from '../types';

type View = 'overview' | 'recipes' | 'shopping' | 'prep' | 'cooking';
const NAV: Array<{ id: View; label: string; icon: typeof BookOpen }> = [
  { id: 'overview', label: 'Overview', icon: CircleGauge }, { id: 'recipes', label: 'Recipes', icon: BookOpen },
  { id: 'shopping', label: 'Shopping', icon: ShoppingBasket }, { id: 'prep', label: 'Prep', icon: CalendarClock },
  { id: 'cooking', label: 'Cooking', icon: CookingPot },
];

export function DinnerPage() {
  const { dinnerId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const detail = useDinner(dinnerId);
  const update = useUpdateDinnerRow(dinnerId);
  const [railOpen, setRailOpen] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const view = (params.get('view') as View) || 'overview';

  if (detail.isLoading) return <LoadingState label="Preparing your dinner…" />;
  if (detail.error || !detail.data) return <ErrorState message={detail.error?.message || 'Dinner not found.'} retry={() => detail.refetch()} />;
  const data = detail.data;
  const setView = (next: View) => setParams(next === 'overview' ? {} : { view: next });

  return (
    <div className={`planner-shell ${railOpen ? '' : 'rail-collapsed'}`}>
      <aside className="rail">
        <div className="rail-brand"><Link to="/app"><ChefHat size={24} /><span>Service</span></Link><button aria-label="Collapse navigation" onClick={() => setRailOpen(false)}><ChevronLeft /></button></div>
        <div className="rail-dinner"><p className="eyebrow">{data.dinner.cuisine || 'Dinner party'}</p><strong>{data.dinner.title}</strong><span>{format(parseISO(`${data.dinner.event_date}T12:00:00`), 'MMM d')} · {data.dinner.guest_count} guests</span></div>
        <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon size={19} /><span>{label}</span></button>)}</nav>
        <div className="rail-actions"><Button variant="soft" onClick={() => setShowShare(true)}><Share2 size={18} />Share night</Button><Button variant="ghost" onClick={() => navigate(`/app/dinners/${dinnerId}/print`)}><Printer size={18} />Print dinner</Button></div>
      </aside>
      {!railOpen && <button className="rail-reopen" aria-label="Open navigation" onClick={() => setRailOpen(true)}><Menu /></button>}
      <main className="planner-main">
        <header className="planner-header"><div><p className="eyebrow">{NAV.find((item) => item.id === view)?.label}</p><h1>{data.dinner.title}</h1></div><div className="header-actions"><SaveState pending={update.isPending} saved={update.isSuccess} />{view === 'recipes' && <Button onClick={() => setShowImport(true)}><Plus size={18} />Add recipe</Button>}<Button variant="ghost" className="desktop-only" onClick={() => setShowShare(true)}><Share2 size={18} />Share</Button></div></header>
        {view === 'overview' && <Overview detail={data} />}
        {view === 'recipes' && <Recipes detail={data} update={update.mutate} refresh={() => detail.refetch()} />}
        {view === 'shopping' && <Shopping detail={data} update={update.mutate} />}
        {view === 'prep' && <Timeline detail={data} update={update.mutateAsync} refresh={() => detail.refetch()} />}
        {view === 'cooking' && <Cooking detail={data} update={update.mutate} />}
      </main>
      <nav className="mobile-nav">{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon /><span>{label}</span></button>)}</nav>
      {showImport && <ImportRecipe dinnerId={dinnerId} close={() => setShowImport(false)} completed={() => { setShowImport(false); detail.refetch(); }} />}
      {showShare && <ShareDinner dinnerId={dinnerId} close={() => setShowShare(false)} />}
    </div>
  );
}

function Overview({ detail }: { detail: DinnerDetail }) {
  const unpurchased = detail.shopping.filter((item) => !item.purchased).length;
  const incomplete = detail.tasks.filter((task) => task.status !== 'done').length;
  const resources = [{ label: 'Burners', value: detail.dinner.burners }, { label: 'Ovens', value: detail.dinner.ovens }, { label: 'Fry stations', value: detail.dinner.fryers }, { label: 'Cooks', value: detail.dinner.cooks }];
  return <div className="view-stack"><section className="service-hero"><div><p className="eyebrow">Service at {detail.dinner.serve_time.slice(0, 5)}</p><h2>{format(parseISO(`${detail.dinner.event_date}T12:00:00`), 'EEEE, MMMM d, yyyy')}</h2><p>{detail.dinner.notes || 'A single working plan from shopping through service.'}</p></div><div className="guest-count"><Users /><span>{detail.dinner.guest_count}</span><small>guests</small></div></section><div className="metric-grid"><Metric value={detail.recipes.length} label="recipes" note="source-grounded" /><Metric value={unpurchased} label="items left" note={`${detail.shopping.length - unpurchased} purchased`} /><Metric value={incomplete} label="prep tasks" note={`${detail.tasks.length - incomplete} complete`} /></div><div className="overview-grid"><Card><p className="eyebrow">Kitchen capacity</p><h3>Equipment at a glance</h3><div className="resource-grid">{resources.map((resource) => <div key={resource.label}><strong>{resource.value}</strong><span>{resource.label}</span></div>)}</div></Card><Card><p className="eyebrow">Menu</p><h3>{detail.recipes.length ? 'Planned dishes' : 'No dishes yet'}</h3><ul className="menu-preview">{detail.recipes.slice(0, 6).map((recipe) => <li key={recipe.id}>{recipe.short_title || recipe.translated_title || recipe.title}<span>{recipe.target_servings || detail.dinner.guest_count} servings</span></li>)}</ul></Card></div></div>;
}

function Metric({ value, label, note }: { value: number; label: string; note: string }) { return <Card className="metric"><strong>{value}</strong><div><span>{label}</span><small>{note}</small></div></Card>; }

function Recipes({ detail, update, refresh }: { detail: DinnerDetail; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => void; refresh: () => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<Recipe | null>(null);
  if (!detail.recipes.length) return <EmptyState icon={<BookOpen />} title="Build the menu">Import a URL or PDF, or enter a recipe manually. Source wording is preserved.</EmptyState>;
  return <div className="recipe-list">{detail.recipes.map((recipe) => {
    const ingredients = detail.ingredients.filter((row) => row.recipe_id === recipe.id);
    const steps = detail.steps.filter((row) => row.recipe_id === recipe.id);
    const scale = recipeScale(recipe, detail.dinner.guest_count);
    return <Card className="recipe-card" key={recipe.id}><div className="recipe-card-head"><button className="recipe-expand" onClick={() => setExpanded(expanded === recipe.id ? null : recipe.id)}><div className="recipe-avatar">{(recipe.short_title || recipe.title).slice(0, 1)}</div><div><p className="eyebrow">{recipe.source_host || 'Manual recipe'}</p><h2>{recipe.short_title || recipe.translated_title || recipe.title}</h2><span>{ingredients.length} ingredients · {steps.length} steps</span></div><ChevronDown className={expanded === recipe.id ? 'rotated' : ''} /></button><div className="recipe-scale"><label>Recipe makes<input aria-label="Recipe makes" type="number" min="0.1" step="0.5" defaultValue={recipe.yield_servings || ''} onBlur={(event) => update({ table: 'recipes', id: recipe.id, patch: { yield_servings: Number(event.target.value) || null } })} /></label><span>→</span><label>Plan to make<input aria-label="Plan to make" type="number" min="0.1" step="0.5" defaultValue={recipe.target_servings || detail.dinner.guest_count} onBlur={(event) => update({ table: 'recipes', id: recipe.id, patch: { target_servings: Number(event.target.value) || null } })} /></label><small>{scale.toFixed(2).replace(/\.00$/, '')}× source</small></div><div className="action-menu"><button aria-label="Recipe actions" onClick={() => setMenu(menu === recipe.id ? null : recipe.id)}><MoreHorizontal /></button>{menu === recipe.id && <div className="popover"><button onClick={() => { const short = prompt('Short title', recipe.short_title || recipe.title); if (short !== null) update({ table: 'recipes', id: recipe.id, patch: { short_title: short.trim() } }); setMenu(null); }}>Short title</button>{recipe.source_type === 'manual' && <button onClick={() => { setEditing(recipe); setMenu(null); }}>Edit manual recipe</button>}<Link to={`/app/dinners/${detail.dinner.id}/recipes/${recipe.id}/print`}><FileDown />Save PDF</Link>{recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noreferrer"><ExternalLink />Publisher source</a>}<button className="danger" onClick={async () => { if (confirm(`Delete ${recipe.short_title || recipe.title}?`)) { await deleteRecipe(recipe.id, detail.dinner.id); refresh(); } }}><Trash2 />Delete</button></div>}</div></div>{expanded === recipe.id && <div className="recipe-detail"><div><p className="detail-label">Scaled ingredients <span>Planner calculation</span></p><ul className="ingredient-lines">{ingredients.map((ingredient) => <li key={ingredient.id}><strong>{ingredient.quantity == null ? '' : formatQuantity(ingredient.quantity * scale)} {ingredient.unit}</strong><span>{ingredient.translated_text || ingredient.item || ingredient.raw_text}</span><small title="Publisher source">{ingredient.raw_text}</small></li>)}</ul></div><div><p className="detail-label">Method <span>Publisher wording</span></p><ol className="step-lines">{steps.map((step) => <li key={step.id}>{step.translated_text || step.raw_text}{step.translated_text && <small>{step.raw_text}</small>}</li>)}</ol></div></div>}</Card>;
  })}{editing && <ManualRecipeEditor detail={detail} recipe={editing} close={() => setEditing(null)} completed={() => { setEditing(null); refresh(); }} />}</div>;
}

function Shopping({ detail, update }: { detail: DinnerDetail; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => void }) {
  const [showPurchased, setShowPurchased] = useState(true);
  const items = detail.shopping.filter((item) => showPurchased || !item.purchased);
  const grouped = items.reduce<Record<string, ShoppingItem[]>>((groups, item) => { (groups[item.category || 'Other'] ||= []).push(item); return groups; }, {});
  return <div className="view-stack"><div className="toolbar"><div><strong>{detail.shopping.filter((item) => !item.purchased).length} items remaining</strong><span>{detail.shopping.filter((item) => item.purchased).length} purchased</span></div><label className="switch"><input type="checkbox" checked={showPurchased} onChange={(event) => setShowPurchased(event.target.checked)} /><span />Show purchased</label></div><Card className="chef-notes"><ChefHat /><label>Chef’s shopping notes<textarea defaultValue={detail.dinner.shopping_chef_notes} placeholder="Who is picking up ice? Which market has the best fish?" onBlur={(event) => update({ table: 'dinners', id: detail.dinner.id, patch: { shopping_chef_notes: event.target.value } })} /></label></Card>{Object.entries(grouped).map(([category, rows]) => <section className="shopping-section" key={category}><h2>{category}<span>{rows?.length}</span></h2>{rows?.map((item) => <ShoppingRow key={item.id} item={item} update={update} />)}</section>)}</div>;
}

function ShoppingRow({ item, update }: { item: ShoppingItem; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => void }) {
  const components = remainingComponents(item);
  const remaining = remainingQuantity(item);
  return <div className={`shopping-row ${item.purchased ? 'purchased' : ''}`}><label className="check"><input type="checkbox" checked={item.purchased} onChange={(event) => update({ table: 'shopping_items', id: item.id, patch: { purchased: event.target.checked } })} /><span><Check /></span></label><div className="shopping-name"><strong>{item.item}</strong><small>{item.assignee ? `Assigned to ${item.assignee}` : item.raw_sources && Array.isArray(item.raw_sources) ? `${item.raw_sources.length} recipe source${item.raw_sources.length === 1 ? '' : 's'}` : ''}</small></div><div className="shopping-needed">{components.length ? components.map((component) => <strong key={component.key}>{formatQuantity(component.quantity)} {component.unit}</strong>) : <strong>{formatQuantity(remaining)} {item.unit}</strong>}<small>still needed</small></div><div className={`on-hand ${components.length > 1 ? 'mixed' : ''}`}>{components.length ? components.map((component) => <label key={component.key}>Already used / on hand ({component.unit})<input type="number" min="0" step="0.01" defaultValue={item.manual_covered_components[component.key] || ''} onBlur={(event) => update({ table: 'shopping_items', id: item.id, patch: { manual_covered_components: { ...item.manual_covered_components, [component.key]: Number(event.target.value) || 0 } } })} /></label>) : <label>Already used / on hand<input type="number" min="0" step="0.01" defaultValue={item.manual_covered_quantity || ''} onBlur={(event) => update({ table: 'shopping_items', id: item.id, patch: { manual_covered_quantity: Number(event.target.value) || 0 } })} /></label>}</div></div>;
}

function Timeline({ detail, update, refresh }: { detail: DinnerDetail; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => Promise<unknown>; refresh: () => void }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));
  const [planning, setPlanning] = useState(false);
  const sorted = useMemo(() => sortTimeline(detail.tasks), [detail.tasks]);
  const days = [...new Set(sorted.map((task) => task.day_offset))];
  async function dragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const active = sorted.find((task) => task.id === event.active.id)!;
    const over = sorted.find((task) => task.id === event.over!.id)!;
    if (active.day_offset !== over.day_offset) return;
    const dayTasks = sorted.filter((task) => task.day_offset === active.day_offset);
    const reordered = arrayMove(dayTasks, dayTasks.findIndex((task) => task.id === active.id), dayTasks.findIndex((task) => task.id === over.id));
    let merged = sorted.map((task) => { const index = reordered.findIndex((row) => row.id === task.id); return index >= 0 ? { ...task, sort_order: index + 1 } : task; });
    merged = reflowDayTimes(merged, active.day_offset, detail.dinner.serve_time);
    await Promise.all(merged.filter((task) => task.day_offset === active.day_offset).map((task) => update({ table: 'tasks', id: task.id, patch: { sort_order: task.sort_order, start_time: task.start_time } })));
  }
  return <div className="view-stack"><div className="toolbar"><div><strong>{sorted.length} prep tasks</strong><span>Manual days and ordering are preserved when the source steps still match.</span></div><Button variant="soft" disabled={planning || !detail.recipes.length} onClick={async () => { setPlanning(true); try { await invokeOwnerFunction('plan-timeline', { dinnerId: detail.dinner.id }); refresh(); } finally { setPlanning(false); } }}>{planning ? 'Planning…' : sorted.length ? 'Refresh suggestions' : 'Build prep plan'}</Button></div><Card className="chef-notes"><ChefHat /><label>Chef’s prep notes<textarea defaultValue={detail.dinner.timeline_chef_notes} placeholder="Leave the mandoline out. Ask Sam to bring sheet pans." onBlur={(event) => update({ table: 'dinners', id: detail.dinner.id, patch: { timeline_chef_notes: event.target.value } })} /></label></Card>{!sorted.length && <EmptyState icon={<CalendarClock />} title="No prep plan yet">Generate a source-grounded timeline after adding recipes.</EmptyState>}<DndContext sensors={sensors} onDragEnd={dragEnd}><SortableContext items={sorted.map((task) => task.id)} strategy={verticalListSortingStrategy}>{days.map((day) => <section className="timeline-day" key={day}><h2>{taskDayLabel(detail.dinner, day)}</h2>{sorted.filter((task) => task.day_offset === day).map((task) => <SortableTask key={task.id} task={task} detail={detail} update={update} />)}</section>)}</SortableContext></DndContext></div>;
}

function SortableTask({ task, detail, update }: { task: TimelineTask; detail: DinnerDetail; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => Promise<unknown> }) {
  const sortable = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  const possibleDays = Array.from({ length: Math.max(detail.dinner.timeline_days, 7) + 1 }, (_, index) => index - Math.max(detail.dinner.timeline_days, 7));
  const selected = new Set((Array.isArray(task.ingredient_progress) ? task.ingredient_progress : []).map((value) => String(value).split(':')[0]));
  const candidates = detail.ingredients.filter((ingredient) => ingredient.recipe_id === task.recipe_id && (new RegExp(ingredient.item.split(/\s+/).filter((word) => word.length > 2).join('|'), 'i').test(task.timing_note) || detail.ingredients.filter((row) => row.recipe_id === task.recipe_id).length <= 8));
  return <Card ref={sortable.setNodeRef} style={style} className={`timeline-task ${task.status === 'done' ? 'done' : ''}`}><button className="drag-handle" {...sortable.attributes} {...sortable.listeners} aria-label="Reorder task"><GripVertical /></button><label className="check"><input type="checkbox" checked={task.status === 'done'} onChange={(event) => update({ table: 'tasks', id: task.id, patch: { status: event.target.checked ? 'done' : 'todo' } })} /><span><Check /></span></label><div className="task-copy"><strong>{task.title}</strong><p>{task.timing_note}</p>{task.notes && <p className="task-warning">{task.notes}</p>}<div><span>{task.start_time.slice(0, 5)}</span><span>{task.active_minutes} min active</span>{task.passive_minutes > 0 && <span>{task.passive_minutes} min passive</span>}<span>{task.resource}</span>{task.freezer_suitable && <span className="freezer">Freezer-friendly</span>}</div>{candidates.length > 0 && <details className="task-ingredients"><summary>Ingredients used / already prepared ({selected.size})</summary><div>{candidates.map((ingredient) => <label key={ingredient.id}><input type="checkbox" checked={selected.has(ingredient.id)} onChange={async (event) => { const next = new Set(selected); if (event.target.checked) next.add(ingredient.id); else next.delete(ingredient.id); await update({ table: 'tasks', id: task.id, patch: { ingredient_progress: [...next] } }); }} />{ingredient.translated_text || ingredient.raw_text}</label>)}</div><small>Each selection subtracts that recipe’s scaled amount from shopping. Repeated selections accumulate, then clamp at the original requirement.</small></details>}</div><label className="day-control">Day<select value={task.day_offset} onChange={async (event) => { const dayOffset = Number(event.target.value); const changed = normalizeDayOrder([...detail.tasks.map((row) => row.id === task.id ? { ...row, day_offset: dayOffset } : row)], dayOffset).find((row) => row.id === task.id)!; await update({ table: 'tasks', id: task.id, patch: { day_offset: dayOffset, sort_order: changed.sort_order } }); }}>{possibleDays.map((offset) => <option value={offset} key={offset}>{taskDayLabel(detail.dinner, offset)}</option>)}</select></label></Card>;
}

function Cooking({ detail, update }: { detail: DinnerDetail; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => void }) {
  const partyTasks = sortTimeline(detail.tasks.filter((task) => task.day_offset === 0));
  return <div className="view-stack"><section className="cooking-banner"><div><p className="eyebrow">Party-day run of show</p><h2>Service at {detail.dinner.serve_time.slice(0, 5)}</h2></div><strong>{partyTasks.filter((task) => task.status !== 'done').length} remaining</strong></section>{partyTasks.map((task) => <Card className={`cook-task ${task.status === 'done' ? 'done' : ''}`} key={task.id}><time>{task.start_time.slice(0, 5)}</time><label className="check"><input type="checkbox" checked={task.status === 'done'} onChange={(event) => update({ table: 'tasks', id: task.id, patch: { status: event.target.checked ? 'done' : 'todo' } })} /><span><Check /></span></label><div><h3>{task.title}</h3><p>{task.timing_note}</p><span>{task.resource} · {task.duration_minutes} min</span></div></Card>)}</div>;
}

function ManualRecipeEditor({ detail, recipe, close, completed }: { detail: DinnerDetail; recipe: Recipe; close: () => void; completed: () => void }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const ingredients = detail.ingredients.filter((row) => row.recipe_id === recipe.id).map((row) => row.raw_text).join('\n');
  const steps = detail.steps.filter((row) => row.recipe_id === recipe.id).map((row) => row.raw_text).join('\n');
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); try { await invokeOwnerFunction('process-manual-recipe', { dinnerId: detail.dinner.id, recipeId: recipe.id, title: String(form.get('title')), yieldText: String(form.get('yieldText')), prepMinutes: String(form.get('prepMinutes')), cookMinutes: String(form.get('cookMinutes')), totalMinutes: String(form.get('totalMinutes')), ingredients: String(form.get('ingredients')), steps: String(form.get('steps')) }); completed(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save the recipe.'); } finally { setBusy(false); } }
  return <div className="modal-backdrop" onMouseDown={close}><form className="modal import-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={close}><X /></button><p className="eyebrow">Manual recipe</p><h2>Edit source lines</h2><label>Recipe title<input name="title" defaultValue={recipe.title} required /></label><div className="form-row"><label>Recipe makes<input name="yieldText" defaultValue={recipe.yield_text} /></label><label>Prep minutes<input name="prepMinutes" type="number" min="0" defaultValue={recipe.prep_minutes || ''} /></label></div><div className="form-row"><label>Cook minutes<input name="cookMinutes" type="number" min="0" defaultValue={recipe.cook_minutes || ''} /></label><label>Total minutes<input name="totalMinutes" type="number" min="0" defaultValue={recipe.total_minutes || ''} /></label></div><label>Ingredients<textarea name="ingredients" rows={8} defaultValue={ingredients} required /></label><label>Instructions<textarea name="steps" rows={8} defaultValue={steps} required /></label><p className="source-promise"><Archive />These lines are treated as your manual source. Automatic English translation remains one-to-one and number-preserving.</p>{error && <p className="form-error">{error}</p>}<div className="modal-actions"><Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save recipe'}</Button></div></form></div>;
}

function ImportRecipe({ dinnerId, close, completed }: { dinnerId: string; close: () => void; completed: () => void }) {
  const [mode, setMode] = useState<'url' | 'pdf' | 'manual'>('url');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget); try { if (mode === 'pdf' && form.get('file')) { const file = form.get('file') as File; const { data: { user } } = await (await import('../lib/supabase')).supabase.auth.getUser(); if (!user) throw new Error('Sign in again.'); const path = `${user.id}/${crypto.randomUUID()}-${file.name}`; const { error: uploadError } = await (await import('../lib/supabase')).supabase.storage.from('recipe-pdfs').upload(path, file); if (uploadError) throw uploadError; await invokeOwnerFunction('import-recipe', { dinnerId, storagePath: path }); } else if (mode === 'manual') { await invokeOwnerFunction('process-manual-recipe', { dinnerId, title: form.get('title'), yieldText: form.get('yieldText'), ingredients: form.get('ingredients'), steps: form.get('steps') }); } else { await invokeOwnerFunction('import-recipe', { dinnerId, url: form.get('url') }); } completed(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'Import failed.'); } finally { setBusy(false); } }
  return <div className="modal-backdrop" onMouseDown={close}><form className="modal import-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={close}><X /></button><p className="eyebrow">Add to the menu</p><h2>Import a source-grounded recipe</h2><div className="segmented"><button type="button" className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>Web link</button><button type="button" className={mode === 'pdf' ? 'active' : ''} onClick={() => setMode('pdf')}>PDF</button><button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>Manual</button></div>{mode === 'url' && <label>Recipe URL<input name="url" type="url" required placeholder="https://…" /></label>}{mode === 'pdf' && <><label>Public PDF or Google Drive link<input name="url" type="url" placeholder="https://…" /></label><div className="or"><span>or</span></div><label className="file-drop"><Upload /><span>Upload a private PDF</span><input name="file" type="file" accept="application/pdf" /></label></>}{mode === 'manual' && <><label>Recipe title<input name="title" required /></label><label>Recipe makes<input name="yieldText" placeholder="6 servings" /></label><label>Ingredients<textarea name="ingredients" rows={7} required placeholder="One source ingredient per line" /></label><label>Instructions<textarea name="steps" rows={7} required placeholder="One source step per line" /></label></>}<p className="source-promise"><Archive />Ingredients and steps must be traceable to the supplied source. AI may translate or group verified lines; it cannot invent recipe content.</p>{error && <p className="form-error">{error}</p>}<Button type="submit" disabled={busy}>{busy ? 'Reading source…' : 'Import recipe'}</Button></form></div>;
}

function ShareDinner({ dinnerId, close }: { dinnerId: string; close: () => void }) {
  const [code, setCode] = useState(''); const [link, setLink] = useState(''); const [error, setError] = useState('');
  async function rotate() { setError(''); const nextCode = code || Array.from(crypto.getRandomValues(new Uint8Array(8))).map((n) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join(''); const { data, error: rpcError } = await (await import('../lib/supabase')).supabase.rpc('rotate_dinner_share', { p_dinner_id: dinnerId, p_code: nextCode }); if (rpcError) { setError(rpcError.message); return; } const shareId = data?.[0]?.share_id; setCode(nextCode); setLink(`${location.origin}${location.pathname}#/d/${shareId}`); }
  return <div className="modal-backdrop" onMouseDown={close}><div className="modal share-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={close}><X /></button><p className="eyebrow">Guest access</p><h2>Share this dinner night</h2><p>Guests see only this dinner’s sanitized read-only page.</p><label>Eight-character guest code<input maxLength={8} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Leave blank to generate" /></label><Button onClick={rotate}>{link ? 'Regenerate link and revoke old access' : 'Create guest link'}</Button>{link && <div className="share-result"><label>Guest link<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label><label>Guest code<input readOnly value={code} onFocus={(event) => event.currentTarget.select()} /></label><Button variant="soft" onClick={() => navigator.clipboard.writeText(`${link}\nCode: ${code}`)}>Copy link and code</Button></div>}{error && <p className="form-error">{error}</p>}<p className="small muted">Regenerating the code immediately revokes previously unlocked guest sessions.</p></div></div>;
}
