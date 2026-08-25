const allowedOrigin = Deno.env.get('FRONTEND_ORIGIN') || '*';

export const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Vary': 'Origin',
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

export function handleOptions(request: Request): Response | null {
  return request.method === 'OPTIONS' ? new Response('ok', { headers: corsHeaders }) : null;
}

export function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  const status = /sign in|authorization|token|access code/i.test(message) ? 401 : /not found/i.test(message) ? 404 : /too many/i.test(message) ? 429 : 400;
  return json({ error: message }, status);
}

