import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import postgres from 'postgres';
import XLSX from 'xlsx';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const replace = args.has('--replace');
const root = process.env.MIGRATION_SOURCE_DIR || path.resolve('private-migration');
const workbookPath = process.env.MIGRATION_WORKBOOK || path.join(root, 'live-sheet.xlsx');
const ownerId = process.env.MIGRATION_OWNER_ID || '';
const privateMetadataPath = path.join(root, 'source-metadata.json');
const privateMetadata = fs.existsSync(privateMetadataPath) ? JSON.parse(fs.readFileSync(privateMetadataPath, 'utf8')) : {};
const spreadsheetId = process.env.MIGRATION_SPREADSHEET_ID || privateMetadata.sourceSpreadsheetId || '';

if (!fs.existsSync(workbookPath)) throw new Error(`Migration workbook not found: ${workbookPath}`);
const workbook = XLSX.readFile(workbookPath, { cellDates: true });
const rows = (sheet) => XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: '', raw: false });
const text = (value) => String(value ?? '').trim();
const number = (value, fallback = null) => value === '' || value == null || !Number.isFinite(Number(value)) ? fallback : Number(value);
const bool = (value) => value === true || ['true', '1', 'yes'].includes(text(value).toLowerCase());
const json = (value, fallback, allowScalar = false) => {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try { return JSON.parse(String(value)); } catch { if (allowScalar) return String(value); throw new Error(`Invalid JSON value: ${String(value).slice(0, 100)}`); }
};
const jsonArray = (value) => {
  if (value == null || value === '') return [];
  if (Array.isArray(value)) return value;
  try { const parsed = JSON.parse(String(value)); return Array.isArray(parsed) ? parsed : [parsed]; }
  catch { return String(value).split(/\r?\n/).map((line) => line.trim()).filter(Boolean); }
};
const iso = (value, fallback = new Date().toISOString()) => {
  if (!value) return fallback; const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid timestamp: ${value}`); return date.toISOString();
};
const dateOnly = (value) => {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = text(value); if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const date = new Date(raw); if (Number.isNaN(date.valueOf())) throw new Error(`Invalid event date: ${value}`); return date.toISOString().slice(0, 10);
};
const timeOnly = (value, fallback = '19:00') => {
  const match = text(value).match(/(\d{1,2}):(\d{2})/); return match ? `${match[1].padStart(2, '0')}:${match[2]}:00` : `${fallback}:00`;
};

const dinners = rows('Dinners').map((r) => ({
  id: text(r.id), owner_id: ownerId, title: text(r.title), cuisine: text(r.cuisine), guest_count: number(r.guestCount, 12), event_date: dateOnly(r.eventDate), serve_time: timeOnly(r.serveTime), dietary_notes: text(r.dietaryNotes), notes: text(r.notes), burners: number(r.burners, 4), ovens: number(r.ovens, 1), fryers: number(r.fryers, 1), cooks: number(r.cooks, 1), shopping_chef_notes: text(r.shoppingChefNotes), timeline_chef_notes: text(r.timelineChefNotes), timeline_days: number(r.timelineDays, 4), created_at: iso(r.createdAt), updated_at: iso(r.updatedAt),
}));
const recipes = rows('Recipes').map((r) => ({
  id: text(r.id), dinner_id: text(r.dinnerId), owner_id: ownerId, title: text(r.title), short_title: text(r.shortTitle), source_url: text(r.sourceUrl), source_host: text(r.sourceHost), source_type: text(r.sourceType) || 'manual', yield_text: text(r.yieldText), yield_servings: number(r.yieldServings), target_servings: number(r.targetServings), prep_minutes: number(r.prepMinutes), cook_minutes: number(r.cookMinutes), total_minutes: number(r.totalMinutes), provenance: json(r.provenance, {}, true), fetched_at: r.fetchedAt ? iso(r.fetchedAt) : null, translated_title: text(r.translatedTitle), translated_yield_text: text(r.translatedYieldText), translation_language: text(r.translationLanguage), translation_model: text(r.translationModel), created_at: iso(r.createdAt), updated_at: iso(r.fetchedAt || r.createdAt),
}));
const ingredients = rows('Ingredients').map((r) => ({
  id: text(r.id), recipe_id: text(r.recipeId), dinner_id: text(r.dinnerId), owner_id: ownerId, position: number(r.position, 1), raw_text: text(r.rawText), translated_text: text(r.translatedText), quantity: number(r.quantity), unit: text(r.unit), item: text(r.item), notes: text(r.notes), provenance: json(r.provenance, {}, true),
}));
const steps = rows('Steps').map((r) => ({
  id: text(r.id), recipe_id: text(r.recipeId), dinner_id: text(r.dinnerId), owner_id: ownerId, position: number(r.position, 1), section: text(r.section), raw_text: text(r.rawText), translated_section: text(r.translatedSection), translated_text: text(r.translatedText), provenance: json(r.provenance, {}, true),
}));
const shopping = rows('Shopping').map((r) => ({
  id: text(r.id), dinner_id: text(r.dinnerId), owner_id: ownerId, key: text(r.key), item: text(r.item), quantity: number(r.quantity), unit: text(r.unit), raw_sources: jsonArray(r.rawSources), category: text(r.category) || 'Other', purchased: bool(r.purchased), assignee: text(r.assignee), updated_at: iso(r.updatedAt), covered_quantity: number(r.coveredQuantity, 0), manual_covered_quantity: number(r.manualCoveredQuantity, 0), component_requirements: json(r.componentRequirements, []), covered_components: json(r.coveredComponents, {}), manual_covered_components: json(r.manualCoveredComponents, {}),
}));
const tasks = rows('Tasks').filter((r) => text(r.id)).map((r) => ({
  id: text(r.id), dinner_id: text(r.dinnerId), recipe_id: text(r.recipeId) || null, owner_id: ownerId, title: text(r.title), source_step_ids: text(r.sourceStepId).split(',').map((value) => value.trim()).filter(Boolean), day_offset: number(r.dayOffset, 0), start_time: timeOnly(r.startTime, '10:00'), duration_minutes: number(r.durationMinutes, 15), active_minutes: number(r.activeMinutes, number(r.durationMinutes, 15)), passive_minutes: number(r.passiveMinutes, 0), resource: text(r.resource) || 'counter', assignee: text(r.assignee), status: text(r.status) || 'todo', provenance: json(r.provenance, {}, true), notes: text(r.notes), timing_basis: text(r.timingBasis), storage_method: text(r.storageMethod), timing_note: text(r.timingNote), freezer_suitable: bool(r.freezerSuitable), sort_order: number(r.sortOrder, 1), ingredient_progress: json(r.ingredientProgress, []), created_at: iso(r.createdAt || r.updatedAt), updated_at: iso(r.updatedAt || r.createdAt),
}));

const manifestPath = path.join(root, 'snapshots-manifest.json');
const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : { files: [] };
const liveRecipeIds = new Set(recipes.map((recipe) => recipe.id));
const snapshots = manifest.files.map((file) => {
  const sourceContent = fs.readFileSync(path.join(root, 'snapshots', file.exportFile), 'utf8'); const parsed = JSON.parse(sourceContent);
  return { recipe_id: liveRecipeIds.has(parsed.recipeId) ? parsed.recipeId : null, legacy_recipe_id: parsed.recipeId, dinner_id: liveRecipeIds.has(parsed.recipeId) ? parsed.dinnerId : null, owner_id: ownerId, original_drive_file_id: file.driveFileId, original_drive_name: file.originalName, source_url: parsed.sourceUrl || '', source_type: parsed.sourceType || 'legacy-drive-snapshot', fetched_at: iso(parsed.fetchedAt || file.createdTime), content_sha256: crypto.createHash('sha256').update(sourceContent).digest('hex'), source_content: sourceContent, storage_path: null, metadata: { originalDriveCreatedTime: file.createdTime, originalDriveModifiedTime: file.modifiedTime, sourceTitle: parsed.title || '', orphanedAtMigration: !liveRecipeIds.has(parsed.recipeId) } };
});

const bundle = { dinners, recipes, ingredients, steps, shopping, tasks, snapshots };
const ids = (values) => new Set(values.map((value) => value.id));
function validate() {
  const errors = []; const dinnerIds = ids(dinners); const recipeIds = ids(recipes); const stepIds = ids(steps);
  for (const [name, values] of Object.entries(bundle)) {
    const keyValues = values.map((value) => value.id || value.original_drive_file_id);
    if (new Set(keyValues).size !== keyValues.length) errors.push(`${name} contains duplicate primary/source IDs.`);
  }
  recipes.forEach((row) => { if (!dinnerIds.has(row.dinner_id)) errors.push(`Recipe ${row.id} has a missing dinner.`); });
  ingredients.forEach((row) => { if (!recipeIds.has(row.recipe_id) || !dinnerIds.has(row.dinner_id)) errors.push(`Ingredient ${row.id} has a missing parent.`); });
  steps.forEach((row) => { if (!recipeIds.has(row.recipe_id) || !dinnerIds.has(row.dinner_id)) errors.push(`Step ${row.id} has a missing parent.`); });
  shopping.forEach((row) => { if (!dinnerIds.has(row.dinner_id)) errors.push(`Shopping row ${row.id} has a missing dinner.`); });
  tasks.forEach((row) => { if (!dinnerIds.has(row.dinner_id) || (row.recipe_id && !recipeIds.has(row.recipe_id))) errors.push(`Task ${row.id} has a missing parent.`); row.source_step_ids.forEach((id) => { if (!stepIds.has(id)) errors.push(`Task ${row.id} references missing step ${id}.`); }); });
  snapshots.forEach((row) => { if (row.recipe_id && !recipeIds.has(row.recipe_id)) errors.push(`Snapshot ${row.original_drive_file_id} has an invalid recipe relationship.`); });
  const counts = Object.fromEntries(Object.entries(bundle).map(([name, values]) => [name, values.length]));
  const byDinner = Object.fromEntries(dinners.map((dinner) => [dinner.id, { recipes: recipes.filter((row) => row.dinner_id === dinner.id).length, ingredients: ingredients.filter((row) => row.dinner_id === dinner.id).length, steps: steps.filter((row) => row.dinner_id === dinner.id).length, shopping: shopping.filter((row) => row.dinner_id === dinner.id).length, tasks: tasks.filter((row) => row.dinner_id === dinner.id).length }]));
  return { valid: errors.length === 0, errors, counts, byDinner, sourceSpreadsheetId: spreadsheetId, snapshotDriveIdsUnique: new Set(snapshots.map((row) => row.original_drive_file_id)).size === snapshots.length, orphanedSnapshotsPreserved: snapshots.filter((row) => !row.recipe_id).map((row) => ({ driveFileId: row.original_drive_file_id, legacyRecipeId: row.legacy_recipe_id })), checkedAt: new Date().toISOString() };
}

const report = validate();
fs.writeFileSync(path.join(root, 'validation-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.valid) throw new Error('Migration source validation failed.');
if (!apply) { console.log('\nValidation complete. Re-run with --apply after Supabase is configured.'); process.exit(0); }
if (!ownerId) throw new Error('MIGRATION_OWNER_ID is required with --apply.');
if (!process.env.SUPABASE_DB_URL) throw new Error('SUPABASE_DB_URL is required with --apply.');
if (!spreadsheetId) throw new Error('MIGRATION_SPREADSHEET_ID is required with --apply.');

const sql = postgres(process.env.SUPABASE_DB_URL, { ssl: 'require', max: 1 });
try {
  await sql.begin(async (tx) => {
    const [profile] = await tx`select id from public.profiles where id = ${ownerId}`; if (!profile) throw new Error('Create and verify the owner account before migration.');
    const existing = await tx`select count(*)::int as count from public.dinners where owner_id = ${ownerId}`;
    if (existing[0].count && !replace) throw new Error('Owner already has dinner data. Use --replace only for an intentional rehearsal reset.');
    if (replace) await tx`delete from public.dinners where owner_id = ${ownerId}`;
    const [run] = await tx`insert into public.migration_runs (owner_id,source_spreadsheet_id,status,source_counts) values (${ownerId},${spreadsheetId},'started',${tx.json(report.counts)}) returning id`;
    if (dinners.length) await tx`insert into public.dinners ${tx(dinners)}`;
    if (recipes.length) await tx`insert into public.recipes ${tx(recipes)}`;
    if (ingredients.length) await tx`insert into public.ingredients ${tx(ingredients)}`;
    if (steps.length) await tx`insert into public.steps ${tx(steps)}`;
    if (shopping.length) await tx`insert into public.shopping_items ${tx(shopping)}`;
    if (tasks.length) await tx`insert into public.tasks ${tx(tasks)}`;
    if (snapshots.length) await tx`insert into public.recipe_source_snapshots ${tx(snapshots)}`;
    const importedCounts = {};
    for (const table of ['dinners','recipes','ingredients','steps','shopping_items','tasks','recipe_source_snapshots']) {
      const result = await tx.unsafe(`select count(*)::int as count from public.${table} where owner_id = $1`, [ownerId]); importedCounts[table] = result[0].count;
    }
    const expected = { dinners: dinners.length, recipes: recipes.length, ingredients: ingredients.length, steps: steps.length, shopping_items: shopping.length, tasks: tasks.length, recipe_source_snapshots: snapshots.length };
    if (Object.keys(expected).some((key) => expected[key] !== importedCounts[key])) throw new Error(`Imported counts do not match: ${JSON.stringify(importedCounts)}`);
    await tx`update public.migration_runs set status='committed', imported_counts=${tx.json(importedCounts)}, validation_report=${tx.json(report)}, completed_at=timezone('utc',now()) where id=${run.id}`;
  });
  console.log('\nMigration committed transactionally.');
} finally { await sql.end(); }
