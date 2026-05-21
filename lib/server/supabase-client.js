import { createClient } from '@supabase/supabase-js';

let client = null;

export function hasSupabaseConfig() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function getSupabaseAdminClient() {
  if (!hasSupabaseConfig()) {
    return null;
  }

  if (!client) {
    client = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }

  return client;
}
