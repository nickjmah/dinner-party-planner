import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { authenticatedOwner } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request); if (options) return options;
  try {
    await authenticatedOwner(request);
    const results: Record<string, unknown> = {};
    const translationResponse = await fetch('https://api.mymemory.translated.net/get?q=hola&langpair=es%7Cen');
    results.translation = { provider: 'MyMemory free API', configured: true, working: translationResponse.ok, status: translationResponse.status };
    const jinaKey = Deno.env.get('JINA_API_KEY');
    if (jinaKey) {
      const response = await fetch('https://r.jina.ai/https://example.com', { headers: { Authorization: `Bearer ${jinaKey}` } });
      results.jina = { configured: true, working: response.ok, status: response.status };
    } else results.jina = { configured: false, working: true, note: 'Anonymous reader fallback may be rate limited.' };
    return json(results);
  } catch (error) { return errorResponse(error); }
});
