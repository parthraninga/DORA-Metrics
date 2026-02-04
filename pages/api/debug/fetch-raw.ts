import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseServer } from '@/lib/supabase';

/**
 * GET: Returns the latest fetch_data row's raw_response so we can inspect Lambda response shape.
 * Remove or restrict this route in production.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const { data, error } = await supabaseServer
      .from('fetch_data')
      .select('id, repo_id, state, fetched_at, raw_response')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return res.status(500).json({ error: error.message });
    }
    if (!data) {
      return res.status(200).json({
        message: 'No fetch_data row found',
        raw_response: null,
        structure: null,
      });
    }

    const raw = (data as { raw_response?: unknown }).raw_response;

    function describeStructure(obj: unknown, depth = 0): unknown {
      if (depth > 4) return '[max depth]';
      if (obj == null) return obj;
      if (Array.isArray(obj)) {
        if (obj.length === 0) return [];
        return [
          describeStructure(obj[0], depth + 1),
          obj.length > 1 ? `... +${obj.length - 1} more` : null,
        ].filter(Boolean);
      }
      if (typeof obj === 'object') {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) {
          if (depth >= 2 && typeof v === 'object' && v !== null && !Array.isArray(v)) {
            out[k] = Object.keys(v as object).slice(0, 5);
          } else {
            out[k] = describeStructure(v, depth + 1);
          }
        }
        return out;
      }
      return typeof obj;
    }

    return res.status(200).json({
      id: (data as { id: string }).id,
      repo_id: (data as { repo_id: string }).repo_id,
      state: (data as { state: string }).state,
      fetched_at: (data as { fetched_at: string }).fetched_at,
      raw_response: raw,
      structure: describeStructure(raw),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
}
