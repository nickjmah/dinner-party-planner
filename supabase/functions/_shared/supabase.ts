import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.57.4';

export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
}

export async function authenticatedOwner(request: Request): Promise<{ user: User; client: SupabaseClient; service: SupabaseClient }> {
  const authorization = request.headers.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) throw new Error('Sign in to continue.');
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error('Sign in to continue.');
  return { user: data.user, client, service: serviceClient() };
}

export async function assertOwnsDinner(client: SupabaseClient, dinnerId: string): Promise<void> {
  const { data, error } = await client.from('dinners').select('id').eq('id', dinnerId).single();
  if (error || !data) throw new Error('Dinner not found.');
}

