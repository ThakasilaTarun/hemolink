import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { resolveSupabaseConfig } from "@/lib/supabase-config";

let cachedClient: SupabaseClient<Database> | null = null;
let cachedKey = "";

function getSupabaseClient(): SupabaseClient<Database> {
  const config = resolveSupabaseConfig();
  const cacheKey = `${config.url}|${config.anonKey}`;

  if (!config.isValid) {
    throw new Error(
      "Supabase is not configured. Connect your project on the login page or set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env."
    );
  }

  if (!cachedClient || cachedKey !== cacheKey) {
    cachedClient = createClient<Database>(config.url, config.anonKey, {
      auth: {
        storage: localStorage,
        persistSession: true,
        autoRefreshToken: true,
      },
    });
    cachedKey = cacheKey;
  }

  return cachedClient;
}

/** Resets client after saving new Supabase credentials in the UI */
export function resetSupabaseClient(): void {
  cachedClient = null;
  cachedKey = "";
}

export const supabase = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = getSupabaseClient();
    const value = Reflect.get(client, prop, client);
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(client);
    }
    return value;
  },
});
