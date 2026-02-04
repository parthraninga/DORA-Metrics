import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type TokenType = 'github' | 'gitlab' | 'bitbucket';

export interface TokenRow {
  id: string;
  name: string;
  token: string;
  type: TokenType;
  created_at?: string;
}

function getSupabase(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export const supabaseServer = getSupabase();

export function maskToken(token: string): string {
  if (!token || token.length < 8) return '••••••••';
  return '••••••••' + token.slice(-4);
}
