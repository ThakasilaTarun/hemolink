/**
 * Resets password for admin user via service role key.
 * Add SUPABASE_SERVICE_ROLE_KEY to .env
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");
const env = {};
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)$/);
  if (m) env[m[1]] = m[2].trim();
}

const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const email = env.ADMIN_EMAIL || "admin@hemolink.com";
const password = env.ADMIN_PASSWORD || "Admin@Hemo2024!";

if (!url || !serviceKey) {
  console.error("Add SUPABASE_SERVICE_ROLE_KEY to .env (Settings → API → service_role)");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: list, error: listError } = await admin.auth.admin.listUsers();
if (listError) {
  console.error("List users failed:", listError.message);
  process.exit(1);
}

const user = list.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
if (!user) {
  console.error(`No user found for ${email}. Create them in Authentication → Users first.`);
  process.exit(1);
}

const { error } = await admin.auth.admin.updateUserById(user.id, {
  password,
  email_confirm: true,
});

if (error) {
  console.error("Password reset failed:", error.message);
  process.exit(1);
}

console.log("Password updated for:", email);
console.log("New password:", password);
console.log("Login at /admin");
