import { useParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { LoadingState, ErrorState } from '../components/ui';
import { useDinner } from '../hooks/useDinner';
import { formatQuantity, recipeScale, remainingComponents, remainingQuantity } from '../lib/quantity';
import { sortTimeline, taskDayLabel } from '../lib/timeline';

function PrintActions() { return <div className="print-actions"><button onClick={() => window.print()}>Print / save PDF</button></div>; }

export function PrintRecipePage() {
  const { dinnerId = '', recipeId = '' } = useParams(); const detail = useDinner(dinnerId);
  if (detail.isLoading) return <LoadingState />; if (detail.error || !detail.data) return <ErrorState message={detail.error?.message || 'Recipe not found.'} />;
  const recipe = detail.data.recipes.find((row) => row.id === recipeId); if (!recipe) return <ErrorState message="Recipe not found." />;
  const scale = recipeScale(recipe, detail.data.dinner.guest_count);
  const ingredients = detail.data.ingredients.filter((row) => row.recipe_id === recipe.id);
  const steps = detail.data.steps.filter((row) => row.recipe_id === recipe.id);
  return <main className="print-page"><PrintActions /><header><p>Service · scaled recipe</p><h1>{recipe.short_title || recipe.translated_title || recipe.title}</h1><div><span>Source: {recipe.title}</span><span>Makes {recipe.target_servings || detail.data.dinner.guest_count} · {scale.toFixed(2)}× source recipe</span></div></header><section><h2>Ingredients</h2><ul className="print-ingredients">{ingredients.map((ingredient) => <li key={ingredient.id}><strong>{ingredient.quantity == null ? 'As needed' : `${formatQuantity(ingredient.quantity * scale)} ${ingredient.unit}`}</strong><span>{ingredient.translated_text || ingredient.item || ingredient.raw_text}</span></li>)}</ul></section><section><h2>Method</h2><ol className="print-steps">{steps.map((step) => <li key={step.id}>{step.translated_text || step.raw_text}</li>)}</ol></section>{recipe.source_url && <footer>Publisher source: {recipe.source_url}</footer>}</main>;
}

export function PrintDinnerPage() {
  const { dinnerId = '' } = useParams(); const detail = useDinner(dinnerId);
  if (detail.isLoading) return <LoadingState />; if (detail.error || !detail.data) return <ErrorState message={detail.error?.message || 'Dinner not found.'} />;
  const data = detail.data;
  const days = [...new Set(data.tasks.map((task) => task.day_offset))].sort((a, b) => a - b);
  return <main className="print-page dinner-packet"><PrintActions /><header><p>Service · dinner packet</p><h1>{data.dinner.title}</h1><div><span>{format(parseISO(`${data.dinner.event_date}T12:00:00`), 'EEEE, MMMM d, yyyy')} at {data.dinner.serve_time.slice(0, 5)}</span><span>{data.dinner.guest_count} guests · {data.dinner.cuisine}</span></div></header><section><h2>Menu</h2><ol>{data.recipes.map((recipe) => <li key={recipe.id}>{recipe.short_title || recipe.translated_title || recipe.title} — {recipe.target_servings || data.dinner.guest_count} servings</li>)}</ol></section><section className="print-break"><h2>Shopping list</h2>{data.dinner.shopping_chef_notes && <p className="print-note"><strong>Chef’s note:</strong> {data.dinner.shopping_chef_notes}</p>}<div className="print-shopping">{data.shopping.filter((item) => !item.purchased).map((item) => { const components = remainingComponents(item); return <div key={item.id}><span>□ {item.item}</span><strong>{components.length ? components.map((part) => `${formatQuantity(part.quantity)} ${part.unit}`).join(' + ') : `${formatQuantity(remainingQuantity(item))} ${item.unit}`}</strong></div>; })}</div></section><section className="print-break"><h2>Prep timeline</h2>{data.dinner.timeline_chef_notes && <p className="print-note"><strong>Chef’s note:</strong> {data.dinner.timeline_chef_notes}</p>}{days.map((day) => <div className="print-day" key={day}><h3>{taskDayLabel(data.dinner, day)}</h3>{sortTimeline(data.tasks.filter((task) => task.day_offset === day)).map((task) => <div key={task.id}><time>{task.start_time.slice(0, 5)}</time><span>□ {task.title}</span><small>{task.duration_minutes} min · {task.resource}</small></div>)}</div>)}</section>{data.recipes.map((recipe) => { const scale = recipeScale(recipe, data.dinner.guest_count); return <section className="print-break print-recipe" key={recipe.id}><h2>{recipe.short_title || recipe.translated_title || recipe.title}</h2><p>{recipe.target_servings || data.dinner.guest_count} servings · {scale.toFixed(2)}× source</p><h3>Ingredients</h3><ul className="print-ingredients">{data.ingredients.filter((row) => row.recipe_id === recipe.id).map((ingredient) => <li key={ingredient.id}><strong>{ingredient.quantity == null ? 'As needed' : `${formatQuantity(ingredient.quantity * scale)} ${ingredient.unit}`}</strong><span>{ingredient.translated_text || ingredient.item || ingredient.raw_text}</span></li>)}</ul><h3>Method</h3><ol className="print-steps">{data.steps.filter((row) => row.recipe_id === recipe.id).map((step) => <li key={step.id}>{step.translated_text || step.raw_text}</li>)}</ol></section>; })}</main>;
}

