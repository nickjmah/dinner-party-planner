import { useMemo, useState } from 'react';
import { DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Archive, BookOpen, CalendarClock, Check, ChefHat, ChevronDown, ChevronLeft, CircleGauge, ClipboardList, CookingPot, ExternalLink, FileDown, FileText, GripVertical, Menu, MoreHorizontal, Plus, Printer, Share2, ShoppingBasket, Trash2, Upload, Users, X } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Button, Card, EmptyState, ErrorState, LoadingState, SaveState } from '../components/ui';
import { useDinner, useUpdateDinnerRow } from '../hooks/useDinner';
import { completePlannedRecipe, createPlannedMenu, deleteRecipe, invokeOwnerFunction } from '../lib/api';
import { choosePdfImportSource } from '../lib/import';
import { isPlannedRecipe, plannedMenuSection } from '../lib/menu';
import { formatQuantity, recipeScale, shoppingQuantityLabels } from '../lib/quantity';
import { moveTaskToDay, reflowDayTimes, sortTimeline, taskDayLabel } from '../lib/timeline';
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
  const [importTarget, setImportTarget] = useState<Recipe | 'new' | null>(null);
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
        <header className="planner-header"><div><p className="eyebrow">{NAV.find((item) => item.id === view)?.label}</p><h1>{data.dinner.title}</h1></div><div className="header-actions"><SaveState pending={update.isPending} saved={update.isSuccess} />{view === 'recipes' && <Button onClick={() => setImportTarget('new')}><Plus size={18} />Add to menu</Button>}<Button variant="ghost" className="desktop-only" onClick={() => setShowShare(true)}><Share2 size={18} />Share</Button></div></header>
        {view === 'overview' && <Overview detail={data} />}
        {view === 'recipes' && <Recipes detail={data} update={update.mutate} refresh={() => detail.refetch()} fillRecipe={setImportTarget} />}
        {view === 'shopping' && <Shopping detail={data} update={update.mutate} />}
        {view === 'prep' && <Timeline detail={data} update={update.mutateAsync} refresh={() => detail.refetch()} />}
        {view === 'cooking' && <Cooking detail={data} update={update.mutate} />}
      </main>
      <nav className="mobile-nav">{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)}><Icon /><span>{label}</span></button>)}</nav>
      {importTarget && <ImportRecipe dinnerId={dinnerId} guestCount={data.dinner.guest_count} plannedRecipe={importTarget === 'new' ? null : importTarget} close={() => setImportTarget(null)} completed={() => { setImportTarget(null); detail.refetch(); }} />}
      {showShare && <ShareDinner dinnerId={dinnerId} close={() => setShowShare(false)} />}
    </div>
  );
}

function Overview({ detail }: { detail: DinnerDetail }) {
  const unpurchased = detail.shopping.filter((item) => !item.purchased).length;
  const incomplete = detail.tasks.filter((task) => task.status !== 'done').length;
  const planned = detail.recipes.filter(isPlannedRecipe).length;
  const sourced = detail.recipes.length - planned;
  const resources = [{ label: 'Burners', value: detail.dinner.burners }, { label: 'Ovens', value: detail.dinner.ovens }, { label: 'Fry stations', value: detail.dinner.fryers }, { label: 'Cooks', value: detail.dinner.cooks }];
  return <div className="view-stack"><section className="service-hero"><div><p className="eyebrow">Service at {detail.dinner.serve_time.slice(0, 5)}</p><h2>{format(parseISO(`${detail.dinner.event_date}T12:00:00`), 'EEEE, MMMM d, yyyy')}</h2><p>{detail.dinner.notes || 'A single working plan from shopping through service.'}</p></div><div className="guest-count"><Users /><span>{detail.dinner.guest_count}</span><small>guests</small></div></section><div className="metric-grid"><Metric value={sourced} label="recipes" note={planned ? `${planned} menu item${planned === 1 ? '' : 's'} need recipes` : 'source-grounded'} /><Metric value={unpurchased} label="items left" note={`${detail.shopping.length - unpurchased} purchased`} /><Metric value={incomplete} label="prep tasks" note={`${detail.tasks.length - incomplete} complete`} /></div><div className="overview-grid"><Card><p className="eyebrow">Kitchen capacity</p><h3>Equipment at a glance</h3><div className="resource-grid">{resources.map((resource) => <div key={resource.label}><strong>{resource.value}</strong><span>{resource.label}</span></div>)}</div></Card><Card><p className="eyebrow">Menu</p><h3>{detail.recipes.length ? 'Planned dishes' : 'No dishes yet'}</h3><ul className="menu-preview">{detail.recipes.map((recipe) => <li key={recipe.id}>{recipe.short_title || recipe.translated_title || recipe.title}<span>{isPlannedRecipe(recipe) ? 'Recipe needed' : `${recipe.target_servings || detail.dinner.guest_count} servings`}</span></li>)}</ul></Card></div></div>;
}

function Metric({ value, label, note }: { value: number; label: string; note: string }) { return <Card className="metric"><strong>{value}</strong><div><span>{label}</span><small>{note}</small></div></Card>; }

function Recipes({ detail, update, refresh, fillRecipe }: { detail: DinnerDetail; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => void; refresh: () => void; fillRecipe: (recipe: Recipe) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<Recipe | null>(null);
  if (!detail.recipes.length) return <EmptyState icon={<BookOpen />} title="Build the menu">Start in planning mode with dish names only, or import a source-grounded recipe now.</EmptyState>;
  return <div className="recipe-list">{detail.recipes.map((recipe) => {
    const planned = isPlannedRecipe(recipe);
    const menuProvenance = recipe.provenance && typeof recipe.provenance === 'object' && !Array.isArray(recipe.provenance) ? recipe.provenance : {};
    const ingredients = detail.ingredients.filter((row) => row.recipe_id === recipe.id);
    const steps = detail.steps.filter((row) => row.recipe_id === recipe.id);
    const scale = recipeScale(recipe, detail.dinner.guest_count);
    if (planned) return <Card className="recipe-card planned-recipe-card" key={recipe.id}><div className="recipe-card-head"><div className="recipe-expand planned-recipe-copy"><div className="recipe-avatar"><ClipboardList /></div><div><p className="eyebrow">{plannedMenuSection(recipe) || 'Planning mode'}</p><h2>{recipe.title}</h2><span>Recipe needed · shopping and prep will wait</span></div></div><Button variant="soft" onClick={() => fillRecipe(recipe)}><BookOpen size={17} />Add recipe</Button><div className="action-menu"><button aria-label="Menu item actions" onClick={() => setMenu(menu === recipe.id ? null : recipe.id)}><MoreHorizontal /></button>{menu === recipe.id && <div className="popover"><button onClick={() => { const title = prompt('Menu item title', recipe.title); if (title?.trim()) update({ table: 'recipes', id: recipe.id, patch: { title: title.trim() } }); setMenu(null); }}>Rename menu item</button><button className="danger" onClick={async () => { if (confirm(`Remove ${recipe.title} from the menu?`)) { await deleteRecipe(recipe.id, detail.dinner.id); refresh(); } }}><Trash2 />Remove</button></div>}</div></div><label className="row-note planned-menu-note"><span>Menu note</span><textarea aria-label={`Menu note for ${recipe.title}`} rows={3} defaultValue={typeof menuProvenance.menu_notes === 'string' ? menuProvenance.menu_notes : ''} placeholder="Describe the dish, serving plans, or guest preferences" onBlur={(event) => { const menuNotes = event.target.value; if (menuNotes !== (menuProvenance.menu_notes || '')) update({ table: 'recipes', id: recipe.id, patch: { provenance: { ...menuProvenance, menu_notes: menuNotes } } }); }} /></label></Card>;
    return <Card className="recipe-card" key={recipe.id}><div className="recipe-card-head"><button className="recipe-expand" onClick={() => setExpanded(expanded === recipe.id ? null : recipe.id)}><div className="recipe-avatar">{(recipe.short_title || recipe.title).slice(0, 1)}</div><div><p className="eyebrow">{recipe.source_host || 'Manual recipe'}</p><h2>{recipe.short_title || recipe.translated_title || recipe.title}</h2><span>{ingredients.length} ingredients · {steps.length} steps</span></div><ChevronDown className={expanded === recipe.id ? 'rotated' : ''} /></button><div className="recipe-scale"><label>Recipe makes<input aria-label="Recipe makes" type="number" min="0.1" step="0.5" defaultValue={recipe.yield_servings || ''} onBlur={(event) => update({ table: 'recipes', id: recipe.id, patch: { yield_servings: Number(event.target.value) || null } })} /></label><span>→</span><label>Plan to make<input aria-label="Plan to make" type="number" min="0.1" step="0.5" defaultValue={recipe.target_servings || detail.dinner.guest_count} onBlur={(event) => update({ table: 'recipes', id: recipe.id, patch: { target_servings: Number(event.target.value) || null } })} /></label><small>{scale.toFixed(2).replace(/\.00$/, '')}× source</small></div><div className="action-menu"><button aria-label="Recipe actions" onClick={() => setMenu(menu === recipe.id ? null : recipe.id)}><MoreHorizontal /></button>{menu === recipe.id && <div className="popover"><button onClick={() => { const short = prompt('Short title', recipe.short_title || recipe.title); if (short !== null) update({ table: 'recipes', id: recipe.id, patch: { short_title: short.trim() } }); setMenu(null); }}>Short title</button>{recipe.source_type === 'manual' && <button onClick={() => { setEditing(recipe); setMenu(null); }}>Edit manual recipe</button>}<Link to={`/app/dinners/${detail.dinner.id}/recipes/${recipe.id}/print`}><FileDown />Save PDF</Link>{recipe.source_url && <a href={recipe.source_url} target="_blank" rel="noreferrer"><ExternalLink />Publisher source</a>}<button className="danger" onClick={async () => { if (confirm(`Delete ${recipe.short_title || recipe.title}?`)) { await deleteRecipe(recipe.id, detail.dinner.id); refresh(); } }}><Trash2 />Delete</button></div>}</div></div>{expanded === recipe.id && <div className="recipe-detail"><div><p className="detail-label">Scaled ingredients <span>Planner calculation</span></p><ul className="ingredient-lines">{ingredients.map((ingredient) => <li key={ingredient.id}><strong>{ingredient.quantity == null ? '' : formatQuantity(ingredient.quantity * scale)} {ingredient.unit}</strong><span>{ingredient.translated_text || ingredient.item || ingredient.raw_text}</span><small title="Publisher source">{ingredient.raw_text}</small></li>)}</ul></div><div><p className="detail-label">Method <span>Publisher wording</span></p><ol className="step-lines">{steps.map((step) => <li key={step.id}>{step.translated_text || step.raw_text}{step.translated_text && <small>{step.raw_text}</small>}</li>)}</ol></div></div>}</Card>;
  })}{editing && <ManualRecipeEditor detail={detail} recipe={editing} close={() => setEditing(null)} completed={() => { setEditing(null); refresh(); }} />}</div>;
}

function Shopping({ detail, update }: { detail: DinnerDetail; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => void }) {
  const [showPurchased, setShowPurchased] = useState(true);
  const items = detail.shopping.filter((item) => showPurchased || !item.purchased);
  const grouped = items.reduce<Record<string, ShoppingItem[]>>((groups, item) => { (groups[item.category || 'Other'] ||= []).push(item); return groups; }, {});
  return <div className="view-stack"><div className="toolbar"><div><strong>{detail.shopping.filter((item) => !item.purchased).length} items remaining</strong><span>{detail.shopping.filter((item) => item.purchased).length} purchased</span></div><label className="switch"><input type="checkbox" checked={showPurchased} onChange={(event) => setShowPurchased(event.target.checked)} /><span />Show purchased</label></div>{Object.entries(grouped).map(([category, rows]) => <section className="shopping-section" key={category}><h2>{category}<span>{rows?.length}</span></h2>{rows?.map((item) => <ShoppingRow key={item.id} item={item} update={update} />)}</section>)}</div>;
}

function ShoppingRow({ item, update }: { item: ShoppingItem; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => void }) {
  const labels = shoppingQuantityLabels(item);
  const components = item.component_requirements;
  return <div className={`shopping-row ${item.purchased ? 'purchased' : ''}`}><label className="check"><input type="checkbox" checked={item.purchased} onChange={(event) => update({ table: 'shopping_items', id: item.id, patch: { purchased: event.target.checked } })} /><span><Check /></span></label><div className="shopping-name"><strong>{item.item}</strong><small>{item.assignee ? `Assigned to ${item.assignee}` : item.raw_sources && Array.isArray(item.raw_sources) ? `${item.raw_sources.length} recipe source${item.raw_sources.length === 1 ? '' : 's'}` : ''}</small></div><div className="shopping-needed">{labels.map((label, index) => <strong key={`${label}-${index}`}>{index ? '+ ' : ''}{label}</strong>)}<small>still needed</small></div><div className={`on-hand ${components.length > 1 ? 'mixed' : ''}`}>{components.length ? components.map((component) => <label key={component.key}>Already used / on hand ({component.unit})<input type="number" min="0" step="0.01" defaultValue={item.manual_covered_components[component.key] || ''} onBlur={(event) => update({ table: 'shopping_items', id: item.id, patch: { manual_covered_components: { ...item.manual_covered_components, [component.key]: Number(event.target.value) || 0 } } })} /></label>) : <label>Already used / on hand<input type="number" min="0" step="0.01" defaultValue={item.manual_covered_quantity || ''} onBlur={(event) => update({ table: 'shopping_items', id: item.id, patch: { manual_covered_quantity: Number(event.target.value) || 0 } })} /></label>}</div><label className="row-note shopping-row-note"><span>Note</span><textarea rows={2} defaultValue={item.notes} placeholder="Add a reminder for this item" onBlur={(event) => update({ table: 'shopping_items', id: item.id, patch: { notes: event.target.value } })} /></label></div>;
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
    merged = reflowDayTimes(merged, active.day_offset, detail.dinner);
    await Promise.all(merged.filter((task) => task.day_offset === active.day_offset).map((task) => update({ table: 'tasks', id: task.id, patch: { sort_order: task.sort_order, start_time: task.start_time } })));
  }
  return <div className="view-stack"><div className="toolbar"><div><strong>{sorted.length} prep tasks</strong><span>Manual days and ordering are preserved when the source steps still match.</span></div><Button variant="soft" disabled={planning || !detail.recipes.length} onClick={async () => { setPlanning(true); try { await invokeOwnerFunction('plan-timeline', { dinnerId: detail.dinner.id }); refresh(); } finally { setPlanning(false); } }}>{planning ? 'Planning…' : sorted.length ? 'Refresh suggestions' : 'Build prep plan'}</Button></div>{!sorted.length && <EmptyState icon={<CalendarClock />} title="No prep plan yet">Generate a source-grounded timeline after adding recipes.</EmptyState>}<DndContext sensors={sensors} onDragEnd={dragEnd}><SortableContext items={sorted.map((task) => task.id)} strategy={verticalListSortingStrategy}>{days.map((day) => <section className="timeline-day" key={day}><h2>{taskDayLabel(detail.dinner, day)}</h2>{sorted.filter((task) => task.day_offset === day).map((task) => <SortableTask key={task.id} task={task} detail={detail} update={update} />)}</section>)}</SortableContext></DndContext></div>;
}

function SortableTask({ task, detail, update }: { task: TimelineTask; detail: DinnerDetail; update: (input: { table: string; id: string; patch: Record<string, unknown> }) => Promise<unknown> }) {
  const sortable = useSortable({ id: task.id });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  const possibleDays = Array.from({ length: Math.max(detail.dinner.timeline_days, 7) + 1 }, (_, index) => index - Math.max(detail.dinner.timeline_days, 7));
  const selected = new Set((Array.isArray(task.ingredient_progress) ? task.ingredient_progress : []).map((value) => String(value).split(':')[0]));
  const candidates = detail.ingredients.filter((ingredient) => ingredient.recipe_id === task.recipe_id && (new RegExp(ingredient.item.split(/\s+/).filter((word) => word.length > 2).join('|'), 'i').test(task.timing_note) || detail.ingredients.filter((row) => row.recipe_id === task.recipe_id).length <= 8));
  return <Card ref={sortable.setNodeRef} style={style} className={`timeline-task ${task.status === 'done' ? 'done' : ''}`}><button className="drag-handle" {...sortable.attributes} {...sortable.listeners} aria-label="Reorder task"><GripVertical /></button><label className="check"><input type="checkbox" checked={task.status === 'done'} onChange={(event) => update({ table: 'tasks', id: task.id, patch: { status: event.target.checked ? 'done' : 'todo' } })} /><span><Check /></span></label><div className="task-copy"><strong>{task.title}</strong><p>{task.timing_note}</p><div><span>{task.start_time.slice(0, 5)}</span><span>{task.active_minutes} min active</span>{task.passive_minutes > 0 && <span>{task.passive_minutes} min passive</span>}<span>{task.resource}</span>{task.freezer_suitable && <span className="freezer">Freezer-friendly</span>}</div>{candidates.length > 0 && <details className="task-ingredients"><summary>Ingredients used / already prepared ({selected.size})</summary><div>{candidates.map((ingredient) => <label key={ingredient.id}><input type="checkbox" checked={selected.has(ingredient.id)} onChange={async (event) => { const next = new Set(selected); if (event.target.checked) next.add(ingredient.id); else next.delete(ingredient.id); await update({ table: 'tasks', id: task.id, patch: { ingredient_progress: [...next] } }); }} />{ingredient.translated_text || ingredient.raw_text}</label>)}</div><small>Each selection subtracts that recipe’s scaled amount from shopping. Repeated selections accumulate, then clamp at the original requirement.</small></details>}<label className="row-note task-row-note"><span>Note</span><textarea rows={2} defaultValue={task.notes} placeholder="Add a reminder for this prep step" onBlur={(event) => update({ table: 'tasks', id: task.id, patch: { notes: event.target.value } })} /></label></div><label className="day-control">Day<select value={task.day_offset} onChange={async (event) => { const dayOffset = Number(event.target.value); const priorDay = task.day_offset; const moved = moveTaskToDay(detail.tasks, task.id, dayOffset, detail.dinner); const affected = moved.filter((row) => row.day_offset === priorDay || row.day_offset === dayOffset); await Promise.all(affected.map((row) => update({ table: 'tasks', id: row.id, patch: { day_offset: row.day_offset, sort_order: row.sort_order, start_time: row.start_time } }))); }}>{possibleDays.map((offset) => <option value={offset} key={offset}>{taskDayLabel(detail.dinner, offset)}</option>)}</select></label></Card>;
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

function ImportRecipe({ dinnerId, guestCount, plannedRecipe, close, completed }: { dinnerId: string; guestCount: number; plannedRecipe: Recipe | null; close: () => void; completed: () => void }) {
  const [mode, setMode] = useState<'plan' | 'url' | 'pdf' | 'manual'>(plannedRecipe ? 'url' : 'plan');
  const [menuText, setMenuText] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function loadMenuFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 100_000) { setError('Menu text files must be smaller than 100 KB.'); return; }
    setError(''); setMenuText(await file.text());
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const form = new FormData(event.currentTarget);
    try {
      if (mode === 'plan') {
        await createPlannedMenu(dinnerId, guestCount, menuText);
      } else if (mode === 'pdf') {
        const source = choosePdfImportSource(form.get('file'), form.get('url'));
        let result: { recipeId: string };
        if (source.kind === 'file') {
          const { data: { user } } = await (await import('../lib/supabase')).supabase.auth.getUser(); if (!user) throw new Error('Sign in again.');
          const path = `${user.id}/${crypto.randomUUID()}-${source.file.name}`;
          const { error: uploadError } = await (await import('../lib/supabase')).supabase.storage.from('recipe-pdfs').upload(path, source.file); if (uploadError) throw uploadError;
          result = await invokeOwnerFunction<{ recipeId: string }>('import-recipe', { dinnerId, storagePath: path });
        } else result = await invokeOwnerFunction<{ recipeId: string }>('import-recipe', { dinnerId, url: source.url });
        if (plannedRecipe) await completePlannedRecipe(plannedRecipe, result.recipeId);
      } else if (mode === 'manual') {
        const result = await invokeOwnerFunction<{ recipeId: string }>('process-manual-recipe', { dinnerId, title: form.get('title'), yieldText: form.get('yieldText'), ingredients: form.get('ingredients'), steps: form.get('steps') });
        if (plannedRecipe) await completePlannedRecipe(plannedRecipe, result.recipeId);
      } else {
        const result = await invokeOwnerFunction<{ recipeId: string }>('import-recipe', { dinnerId, url: form.get('url') });
        if (plannedRecipe) await completePlannedRecipe(plannedRecipe, result.recipeId);
      }
      completed();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Import failed.'); } finally { setBusy(false); }
  }
  const importingLabel = plannedRecipe ? `Add a recipe for ${plannedRecipe.title}` : mode === 'plan' ? 'Plan from a menu' : 'Import a source-grounded recipe';
  return <div className="modal-backdrop" onMouseDown={close}><form className="modal import-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}><button type="button" className="modal-close" onClick={close}><X /></button><p className="eyebrow">{plannedRecipe ? 'Complete a menu item' : 'Add to the menu'}</p><h2>{importingLabel}</h2><div className={`segmented ${plannedRecipe ? '' : 'four'}`}>{!plannedRecipe && <button type="button" className={mode === 'plan' ? 'active' : ''} onClick={() => setMode('plan')}>Plan menu</button>}<button type="button" className={mode === 'url' ? 'active' : ''} onClick={() => setMode('url')}>Web link</button><button type="button" className={mode === 'pdf' ? 'active' : ''} onClick={() => setMode('pdf')}>PDF</button><button type="button" className={mode === 'manual' ? 'active' : ''} onClick={() => setMode('manual')}>Manual</button></div>{mode === 'plan' && <><label>Menu dishes<textarea value={menuText} onChange={(event) => setMenuText(event.target.value)} rows={10} required placeholder={'One dish per line\n\nAppetizers:\nCroquetas\nPan con tomate\n\nDessert:\nBasque cheesecake'} /></label><label className="file-drop menu-file-drop"><FileText /><span>Load a text menu</span><input type="file" accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" onChange={(event) => loadMenuFile(event.target.files?.[0])} /></label><p className="source-promise"><ClipboardList />This creates menu placeholders only. No ingredients, shopping quantities, or prep steps are generated until you attach a recipe.</p></>}{mode === 'url' && <label>Recipe URL<input name="url" type="url" required placeholder="https://…" /></label>}{mode === 'pdf' && <><label>Public PDF or Google Drive link<input name="url" type="url" placeholder="https://…" /></label><div className="or"><span>or</span></div><label className="file-drop"><Upload /><span>Upload a private PDF</span><input name="file" type="file" accept="application/pdf" /></label></>}{mode === 'manual' && <><label>Recipe title<input name="title" defaultValue={plannedRecipe?.title || ''} required /></label><label>Recipe makes<input name="yieldText" placeholder="6 servings" /></label><label>Ingredients<textarea name="ingredients" rows={7} required placeholder="One source ingredient per line" /></label><label>Instructions<textarea name="steps" rows={7} required placeholder="One source step per line" /></label></>}{mode !== 'plan' && <p className="source-promise"><Archive />Ingredients and steps must be traceable to the supplied source. AI may translate or group verified lines; it cannot invent recipe content.</p>}{error && <p className="form-error">{error}</p>}<Button type="submit" disabled={busy}>{busy ? (mode === 'plan' ? 'Saving menu…' : 'Reading source…') : (mode === 'plan' ? 'Add planned dishes' : 'Import recipe')}</Button></form></div>;
}

function ShareDinner({ dinnerId, close }: { dinnerId: string; close: () => void }) {
  const [code, setCode] = useState(''); const [link, setLink] = useState(''); const [error, setError] = useState('');
  async function rotate() { setError(''); const nextCode = code || Array.from(crypto.getRandomValues(new Uint8Array(8))).map((n) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join(''); const { data, error: rpcError } = await (await import('../lib/supabase')).supabase.rpc('rotate_dinner_share', { p_dinner_id: dinnerId, p_code: nextCode }); if (rpcError) { setError(rpcError.message); return; } const shareId = data?.[0]?.share_id; setCode(nextCode); setLink(`${location.origin}${location.pathname}#/d/${shareId}`); }
  return <div className="modal-backdrop" onMouseDown={close}><div className="modal share-modal" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={close}><X /></button><p className="eyebrow">Guest access</p><h2>Share this dinner night</h2><p>Guests see only this dinner’s sanitized read-only page.</p><label>Eight-character guest code<input maxLength={8} value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="Leave blank to generate" /></label><Button onClick={rotate}>{link ? 'Regenerate link and revoke old access' : 'Create guest link'}</Button>{link && <div className="share-result"><label>Guest link<input readOnly value={link} onFocus={(event) => event.currentTarget.select()} /></label><label>Guest code<input readOnly value={code} onFocus={(event) => event.currentTarget.select()} /></label><Button variant="soft" onClick={() => navigator.clipboard.writeText(`${link}\nCode: ${code}`)}>Copy link and code</Button></div>}{error && <p className="form-error">{error}</p>}<p className="small muted">Regenerating the code immediately revokes previously unlocked guest sessions.</p></div></div>;
}
