/**
 * Deletes ALL auth users and related profile data from Supabase.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env or environment.
 * Run: node scripts/delete-all-users.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

function loadEnv() {
  const env = {};
  try {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // .env optional if vars are in process.env
  }
  return env;
}

const env = loadEnv();
const url = process.env.VITE_SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env or environment");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function clearTable(table, column = "id") {
  const sentinel = "00000000-0000-0000-0000-000000000000";
  const { error, count } = await admin.from(table).delete({ count: "exact" }).neq(column, sentinel);
  if (error) {
    console.warn(`  ${table}: ${error.message}`);
    return 0;
  }
  console.log(`  ${table}: cleared ${count ?? 0} rows`);
  return count ?? 0;
}

async function deleteAllUsers() {
  console.log("Clearing related tables...");
  await clearTable("donations");
  await clearTable("blood_requests");
  await clearTable("donors");
  await clearTable("user_roles", "user_id");
  await clearTable("profiles", "id");

  console.log("\nDeleting auth users...");
  let page = 1;
  let deleted = 0;
  let failed = 0;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    if (!data.users.length) break;

    for (const user of data.users) {
      const { error: delError } = await admin.auth.admin.deleteUser(user.id);
      if (delError) {
        console.error(`  FAIL ${user.email}: ${delError.message}`);
        failed++;
      } else {
        console.log(`  Deleted: ${user.email}`);
        deleted++;
      }
    }

    if (data.users.length < 200) break;
    page = 1;
  }

  const { data: remaining } = await admin.auth.admin.listUsers({ perPage: 1000 });
  console.log(`\nDone. Deleted: ${deleted}, Failed: ${failed}, Remaining: ${remaining.users.length}`);
  process.exit(failed > 0 ? 1 : 0);
}

deleteAllUsers().catch((e) => {
  console.error(e);
  process.exit(1);
});
