/**
 * Creates admin@hemolink.com using service role key (optional automation).
 * Add SUPABASE_SERVICE_ROLE_KEY to .env — never commit that key.
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const raw = readFileSync(envPath, "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)$/);
  if (m) env[m[1]] = m[2].trim();
}

const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const adminEmail = env.ADMIN_EMAIL || "admin@hemolink.com";
const adminPassword = env.ADMIN_PASSWORD || "Admin@Hemo2024!";

if (!url || !serviceKey) {
  console.error("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env");
  console.error("Service role key: Supabase → Settings → API → service_role");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email: adminEmail,
  password: adminPassword,
  email_confirm: true,
  user_metadata: { role: "admin" },
});

if (error && !error.message.includes("already")) {
  console.error("Create user failed:", error.message);
  process.exit(1);
}

const userId = data?.user?.id;
let uid = userId;

if (!uid) {
  const { data: list } = await admin.auth.admin.listUsers();
  uid = list?.users?.find((u) => u.email === adminEmail)?.id;
}

if (!uid) {
  console.error("Could not resolve admin user id");
  process.exit(1);
}

await admin.from("user_roles").upsert({ user_id: uid, role: "admin" }, { onConflict: "user_id,role" });
await admin.from("profiles").upsert({
  id: uid,
  full_name: "System Administrator",
  phone: "+911234567890",
});

console.log("Admin ready:", adminEmail);
console.log("Login at /admin with the password from .env (ADMIN_PASSWORD)");
