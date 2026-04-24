import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type SupabaseServerEnv = {
  url: string;
  serviceRoleKey: string;
};

function readSupabaseServerEnv(): SupabaseServerEnv | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey,
  };
}

export function hasSupabaseServerEnv(): boolean {
  return Boolean(readSupabaseServerEnv());
}

export function createSupabaseAdminClient(): SupabaseClient {
  const env = readSupabaseServerEnv();

  if (!env) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for the Next.js frontend",
    );
  }

  return createClient(env.url, env.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
