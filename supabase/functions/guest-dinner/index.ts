import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { verifyGuestToken } from '../_shared/guest-token.ts';
import { serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request); if (options) return options;
  try {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    const shareId = new URL(request.url).searchParams.get('shareId') || '';
    const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const claims = await verifyGuestToken(token);
    if (claims.shareId !== shareId) throw new Error('This guest token belongs to another dinner.');
    const service = serviceClient();
    const { data: share } = await service.from('dinner_shares').select('dinner_id,share_version,enabled').eq('share_id', shareId).single();
    if (!share || !share.enabled || share.dinner_id !== claims.dinnerId || share.share_version !== claims.version) throw new Error('This guest link has been revoked.');
    const dinnerId = claims.dinnerId;
    const [dinner, recipes, ingredients, steps, shopping, tasks] = await Promise.all([
      service.from('dinners').select('title,cuisine,guest_count,event_date,serve_time,dietary_notes,notes,burners,ovens,fryers,cooks,timeline_days,created_at,updated_at').eq('id', dinnerId).single(),
      service.from('recipes').select('title,short_title,source_url,source_host,source_type,yield_text,yield_servings,target_servings,prep_minutes,cook_minutes,total_minutes,translated_title,translated_yield_text,translation_language,created_at,updated_at').eq('dinner_id', dinnerId).order('created_at'),
      service.from('ingredients').select('position,raw_text,translated_text,quantity,unit,item,notes').eq('dinner_id', dinnerId).order('position'),
      service.from('steps').select('position,section,raw_text,translated_section,translated_text').eq('dinner_id', dinnerId).order('position'),
      service.from('shopping_items').select('item,quantity,unit,category,purchased,covered_quantity,manual_covered_quantity,component_requirements,covered_components,manual_covered_components').eq('dinner_id', dinnerId).order('category').order('item'),
      service.from('tasks').select('title,source_step_ids,day_offset,start_time,duration_minutes,active_minutes,passive_minutes,resource,assignee,status,timing_basis,storage_method,timing_note,freezer_suitable,sort_order,created_at,updated_at').eq('dinner_id', dinnerId).order('day_offset').order('sort_order'),
    ]);
    const failure = [dinner, recipes, ingredients, steps, shopping, tasks].find((result) => result.error)?.error;
    if (failure) throw failure;
    const publicShopping = (shopping.data || []).map((item) => {
      const requirements = Array.isArray(item.component_requirements) ? item.component_requirements : [];
      const remainingComponents = requirements.map((part: { key: string; quantity: number; unit: string }) => ({ ...part, quantity: Math.max(0, Number(part.quantity || 0) - Number(item.covered_components?.[part.key] || 0) - Number(item.manual_covered_components?.[part.key] || 0)) }));
      return { item: item.item, quantity: requirements.length ? null : Math.max(0, Number(item.quantity || 0) - Number(item.covered_quantity || 0) - Number(item.manual_covered_quantity || 0)), unit: item.unit, category: item.category, purchased: item.purchased, covered_quantity: 0, component_requirements: remainingComponents, covered_components: {} };
    });
    return json({ dinner: dinner.data, recipes: recipes.data, ingredients: ingredients.data, steps: steps.data, shopping: publicShopping, tasks: tasks.data });
  } catch (error) { return errorResponse(error); }
});
