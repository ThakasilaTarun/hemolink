const STORAGE_URL_KEY = "hemolink_supabase_url";
const STORAGE_ANON_KEY = "hemolink_supabase_anon_key";

export type SupabaseConfig = {
  url: string;
  anonKey: string;
  projectId: string | null;
  source: "env" | "localStorage";
  isValid: boolean;
};

function isPlaceholder(value: string | undefined): boolean {
  if (!value?.trim()) return true;
  const v = value.trim().toLowerCase();
  return (
    v.includes("your-project") ||
    v.includes("your-anon") ||
    v === "undefined" ||
    v === "null"
  );
}

function extractProjectId(url: string): string | null {
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co\/?$/i);
  return match?.[1] ?? null;
}

export function resolveSupabaseConfig(): SupabaseConfig {
  const envUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
  const envKey = (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_ANON_KEY
  )?.trim();

  if (!isPlaceholder(envUrl) && !isPlaceholder(envKey) && envUrl && envKey) {
    return {
      url: envUrl,
      anonKey: envKey,
      projectId: import.meta.env.VITE_SUPABASE_PROJECT_ID?.trim() || extractProjectId(envUrl),
      source: "env",
      isValid: true,
    };
  }

  const storedUrl = localStorage.getItem(STORAGE_URL_KEY)?.trim();
  const storedKey = localStorage.getItem(STORAGE_ANON_KEY)?.trim();

  if (storedUrl && storedKey && !isPlaceholder(storedUrl) && !isPlaceholder(storedKey)) {
    return {
      url: storedUrl,
      anonKey: storedKey,
      projectId: extractProjectId(storedUrl),
      source: "localStorage",
      isValid: true,
    };
  }

  return {
    url: envUrl || "",
    anonKey: envKey || "",
    projectId: null,
    source: "env",
    isValid: false,
  };
}

export function isSupabaseConfigured(): boolean {
  return resolveSupabaseConfig().isValid;
}

export function saveSupabaseConfig(url: string, anonKey: string): void {
  const trimmedUrl = url.trim().replace(/\/$/, "");
  if (!extractProjectId(trimmedUrl)) {
    throw new Error("URL must look like https://YOUR_REF.supabase.co");
  }
  if (!anonKey.trim() || anonKey.trim().length < 20) {
    throw new Error("Please paste a valid anon public API key.");
  }
  localStorage.setItem(STORAGE_URL_KEY, trimmedUrl);
  localStorage.setItem(STORAGE_ANON_KEY, anonKey.trim());
}

export function clearStoredSupabaseConfig(): void {
  localStorage.removeItem(STORAGE_URL_KEY);
  localStorage.removeItem(STORAGE_ANON_KEY);
}

export async function testSupabaseConnection(
  url: string,
  anonKey: string
): Promise<{ ok: boolean; message: string }> {
  const baseUrl = url.trim().replace(/\/$/, "");
  try {
    const response = await fetch(`${baseUrl}/auth/v1/health`, {
      headers: {
        apikey: anonKey.trim(),
        Authorization: `Bearer ${anonKey.trim()}`,
      },
    });
    if (response.ok) {
      return { ok: true, message: "Connected to Supabase successfully." };
    }
    return {
      ok: false,
      message: `Supabase returned HTTP ${response.status}. Check your URL and anon key.`,
    };
  } catch {
    return {
      ok: false,
      message:
        "Cannot reach Supabase. Check the project URL, your internet connection, and that the project is not paused.",
    };
  }
}

export function getSupabaseConfigErrorMessage(): string {
  return "Backend not connected. Add your Supabase URL and anon key below (from supabase.com → Project Settings → API), or update the .env file and restart the dev server.";
}

/** Strip spaces/dashes from phone; keep optional +91 prefix */
export function normalizeIndianPhone(phone: string): string {
  const digits = phone.replace(/[\s-]/g, "");
  if (digits.startsWith("+91")) return `+91${digits.slice(3).replace(/\D/g, "")}`;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  return digits.replace(/\D/g, "");
}

export function formatAuthError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Please try again.";

  if (
    message.toLowerCase().includes("failed to fetch") ||
    message.toLowerCase().includes("networkerror") ||
    message.toLowerCase().includes("load failed")
  ) {
    return getSupabaseConfigErrorMessage();
  }

  if (message.includes("user_roles_role_check")) {
    return "Registration blocked by database role constraint. In Supabase SQL Editor, run supabase/APPLY_ALL_FIXES.sql then try again.";
  }

  if (message.includes("User already registered")) {
    return "This email is already registered. Use Login, or submit Register again with the same password to finish setup.";
  }

  if (
    message.toLowerCase().includes("rate limit") ||
    message.toLowerCase().includes("email rate") ||
    message.toLowerCase().includes("too many requests") ||
    (error as { status?: number })?.status === 429
  ) {
    return "Email sending limit reached (Supabase free tier). Fix: In Supabase Dashboard → Authentication → Providers → Email, turn OFF “Confirm email”. Then register again or use Login if the account was already created. You can also wait ~1 hour and retry.";
  }

  if (message.includes("violates row-level security") || message.includes("RLS")) {
    return "Registration failed due to database policies. Run migrations in Supabase (see BACKEND_SETUP.md).";
  }

  if (
    message.includes("create_user_profile_and_role") ||
    message.includes("schema cache")
  ) {
    return "Database setup incomplete. In Supabase Dashboard → SQL Editor, run supabase/APPLY_ALL_FIXES.sql then try again.";
  }

  return message;
}
