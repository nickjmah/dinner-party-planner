import { errorResponse, handleOptions, json } from '../_shared/http.ts';
import { hashIp, signGuestToken } from '../_shared/guest-token.ts';
import { serviceClient } from '../_shared/supabase.ts';

Deno.serve(async (request) => {
  const options = handleOptions(request); if (options) return options;
  try {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    const { shareId, code } = await request.json();
    if (!/^[a-f0-9]{36}$/i.test(String(shareId || '')) || !/^[a-z0-9]{8}$/i.test(String(code || ''))) throw new Error('Enter the valid dinner link and eight-character access code.');
    const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || request.headers.get('cf-connecting-ip') || 'unknown';
    const service = serviceClient();
    const { data, error } = await service.rpc('verify_guest_code', { p_share_id: shareId, p_code: code, p_ip_hash: await hashIp(forwarded) });
    if (error || !data?.[0]) throw new Error(error?.message || 'Incorrect dinner code.');
    const result = data[0];
    return json({ token: await signGuestToken({ shareId, dinnerId: result.dinner_id, version: result.share_version }), expiresIn: 2_592_000 });
  } catch (error) { return errorResponse(error); }
});

