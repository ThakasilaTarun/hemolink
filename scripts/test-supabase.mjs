/**
 * Tests Supabase auth + DB after configuring .env
 * Run: node scripts/test-supabase.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

function loadEnv() {
  const raw = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*VITE_SUPABASE_(\w+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const url = env.URL;
const key = env.PUBLISHABLE_KEY || env.ANON_KEY;

if (!url || url.includes("your-project") || !key || key.includes("your-anon")) {
  console.error("Configure .env first (or run scripts/configure-supabase.ps1)");
  process.exit(1);
}

const supabase = createClient(url, key);
const testEmail = `hemolink.test.${Date.now()}@mailinator.com`;
const testPassword = "TestPass1!";

console.log("1. Health check...");
const health = await fetch(`${url}/auth/v1/health`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
console.log(health.ok ? "   OK" : `   FAIL HTTP ${health.status}`);

console.log("2. Sign up test user...");
const { data: signUp, error: signUpError } = await supabase.auth.signUp({
  email: testEmail,
  password: testPassword,
  options: { data: { role: "donor" } },
});
if (signUpError) {
  console.error("   Sign up failed:", signUpError.message);
  process.exit(1);
}
console.log("   User id:", signUp.user?.id);

if (signUp.user) {
  console.log("3. create_user_profile_and_role RPC...");
  const { error: rpcError } = await supabase.rpc("create_user_profile_and_role", {
    p_user_id: signUp.user.id,
    p_full_name: "Test Donor",
    p_phone: "9876543210",
    p_role: "donor",
    p_blood_group: "O+",
    p_location: "Test City",
    p_hospital_name: null,
    p_hospital_address: null,
  });
  if (rpcError) {
    console.error("   RPC failed (run migrations):", rpcError.message);
  } else {
    console.log("   OK");
  }
}

if (signUp.session) {
  console.log("4. Sign in...");
  await supabase.auth.signOut();
  const { error: loginError } = await supabase.auth.signInWithPassword({
    email: testEmail,
    password: testPassword,
  });
  console.log(loginError ? `   FAIL: ${loginError.message}` : "   OK");
} else {
  console.log("4. Skipped login — enable auto-confirm email in Supabase Auth settings for instant login");
}

console.log("\nDone. Test email:", testEmail);
