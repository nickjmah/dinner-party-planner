export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Resource = 'counter' | 'burner' | 'oven' | 'fryer' | 'fridge' | 'freezer' | 'none';
export type TaskStatus = 'todo' | 'in_progress' | 'done';

export interface Dinner {
  id: string;
  owner_id: string;
  title: string;
  cuisine: string;
  guest_count: number;
  event_date: string;
  serve_time: string;
  dietary_notes: string;
  notes: string;
  burners: number;
  ovens: number;
  fryers: number;
  cooks: number;
  shopping_chef_notes: string;
  timeline_chef_notes: string;
  timeline_days: number;
  created_at: string;
  updated_at: string;
}

export interface Recipe {
  id: string;
  dinner_id: string;
  owner_id: string;
  title: string;
  short_title: string;
  source_url: string;
  source_host: string;
  source_type: string;
  yield_text: string;
  yield_servings: number | null;
  target_servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  provenance: Json;
  fetched_at: string | null;
  translated_title: string;
  translated_yield_text: string;
  translation_language: string;
  translation_model: string;
  created_at: string;
  updated_at: string;
}

export interface Ingredient {
  id: string;
  recipe_id: string;
  dinner_id: string;
  owner_id: string;
  position: number;
  raw_text: string;
  translated_text: string;
  quantity: number | null;
  unit: string;
  item: string;
  notes: string;
  provenance: Json;
}

export interface RecipeStep {
  id: string;
  recipe_id: string;
  dinner_id: string;
  owner_id: string;
  position: number;
  section: string;
  raw_text: string;
  translated_section: string;
  translated_text: string;
  provenance: Json;
}

export interface QuantityComponent {
  key: string;
  quantity: number;
  unit: string;
  dimension?: string;
}

export interface ShoppingItem {
  id: string;
  dinner_id: string;
  owner_id: string;
  key: string;
  item: string;
  quantity: number | null;
  unit: string;
  raw_sources: Json;
  category: string;
  purchased: boolean;
  assignee: string;
  covered_quantity: number;
  manual_covered_quantity: number;
  component_requirements: QuantityComponent[];
  covered_components: Record<string, number>;
  manual_covered_components: Record<string, number>;
  updated_at: string;
}

export interface TimelineTask {
  id: string;
  dinner_id: string;
  recipe_id: string | null;
  owner_id: string;
  title: string;
  source_step_ids: string[];
  day_offset: number;
  start_time: string;
  duration_minutes: number;
  active_minutes: number;
  passive_minutes: number;
  resource: Resource;
  assignee: string;
  status: TaskStatus;
  provenance: Json;
  notes: string;
  timing_basis: string;
  storage_method: string;
  timing_note: string;
  freezer_suitable: boolean;
  sort_order: number;
  ingredient_progress: Json;
  created_at: string;
  updated_at: string;
}

export interface DinnerDetail {
  dinner: Dinner;
  recipes: Recipe[];
  ingredients: Ingredient[];
  steps: RecipeStep[];
  shopping: ShoppingItem[];
  tasks: TimelineTask[];
  stale_at?: string;
}

export interface GuestDinner {
  dinner: Pick<Dinner, 'title' | 'cuisine' | 'guest_count' | 'event_date' | 'serve_time' | 'dietary_notes' | 'notes' | 'burners' | 'ovens' | 'fryers' | 'cooks' | 'timeline_days' | 'created_at' | 'updated_at'>;
  recipes: Array<Pick<Recipe, 'title' | 'short_title' | 'source_url' | 'source_host' | 'source_type' | 'yield_text' | 'yield_servings' | 'target_servings' | 'prep_minutes' | 'cook_minutes' | 'total_minutes' | 'translated_title' | 'translated_yield_text' | 'translation_language' | 'created_at' | 'updated_at'>>;
  ingredients: Array<Pick<Ingredient, 'position' | 'raw_text' | 'translated_text' | 'quantity' | 'unit' | 'item' | 'notes'>>;
  steps: Array<Pick<RecipeStep, 'position' | 'section' | 'raw_text' | 'translated_section' | 'translated_text'>>;
  shopping: Array<Pick<ShoppingItem, 'item' | 'quantity' | 'unit' | 'category' | 'purchased' | 'covered_quantity' | 'component_requirements' | 'covered_components'>>;
  tasks: Array<Pick<TimelineTask, 'title' | 'source_step_ids' | 'day_offset' | 'start_time' | 'duration_minutes' | 'active_minutes' | 'passive_minutes' | 'resource' | 'assignee' | 'status' | 'timing_basis' | 'storage_method' | 'timing_note' | 'freezer_suitable' | 'sort_order' | 'created_at' | 'updated_at'>>;
}
