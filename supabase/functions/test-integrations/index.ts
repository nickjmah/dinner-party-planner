import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { authenticatedOwner } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request); if (options) return options;
  try {
    await authenticatedOwner(request);
    const results: Record<string, unknown> = {};
    const openAiKey = Deno.env.get('OPENAI_API_KEY');
    if (openAiKey) {
      const response = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${openAiKey}` } });
      results.openai = { configured: true, working: response.ok, status: response.status, model: Deno.env.get('OPENAI_MODEL') || 'gpt-4o-mini' };
    } else results.openai = { configured: false, working: false };
    const jinaKey = Deno.env.get('JINA_API_KEY');
    if (jinaKey) {
      const response = await fetch('https://r.jina.ai/https://example.com', { headers: { Authorization: `Bearer ${jinaKey}` } });
      results.jina = { configured: true, working: response.ok, status: response.status };
    } else results.jina = { configured: false, working: true, note: 'Anonymous reader fallback may be rate limited.' };
    return json(results);
  } catch (error) { return errorResponse(error); }
});

