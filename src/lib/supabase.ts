import { createClient, SupabaseClient } from '@supabase/supabase-js';

export type TokenType = 'github' | 'gitlab' | 'bitbucket';

export interface TokenRow {
  id: string;
  name: string;
  token: string;
  type: TokenType;
  email?: string | null;
  created_at?: string;
}

let _client: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  _client = createClient(url, key);
  return _client;
}

/** Lazy-initialized Supabase client. Throws only on first use if env vars are missing (so API handlers can catch and return a safe response). */
export const supabaseServer = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getSupabaseClient() as Record<string | symbol, unknown>)[prop];
  }
});

export function maskToken(token: string): string {
  if (!token || token.length < 8) return '••••••••';
  return '••••••••' + token.slice(-4);
}
