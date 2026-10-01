/**
 * Wipes ALL application data from Supabase (fresh start).
 * Clears: donations, requests, donors, inventory, profiles, roles, auth users, storage files.
 * Requires SUPABASE_SERVICE_ROLE_KEY in .env or environment.
 * Run: node scripts/clear-all-data.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

const DATA_TABLES = [
  { table: "donations", column: "id" },
  { table: "blood_requests", column: "id" },
  { table: "donors", column: "id" },
  { table: "blood_inventory", column: "id" },
  { table: "user_roles", column: "user_id" },
  { table: "profiles", column: "id" },
];

const STORAGE_BUCKETS = ["certificates"];

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

async function listStoragePaths(bucket, prefix = "") {
  const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error || !data?.length) return [];

  const paths = [];
  for (const item of data) {
    const fullPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id) {
      paths.push(fullPath);
    } else {
      paths.push(...(await listStoragePaths(bucket, fullPath)));
    }
  }
  return paths;
}

async function clearStorageBucket(bucket) {
  const paths = await listStoragePaths(bucket);
  if (!paths.length) {
    console.log(`  ${bucket}: already empty`);
    return 0;
  }

  const { error } = await admin.storage.from(bucket).remove(paths);
  if (error) {
    console.warn(`  ${bucket}: ${error.message}`);
    return 0;
  }

  console.log(`  ${bucket}: removed ${paths.length} file(s)`);
  return paths.length;
}

async function deleteAllUsers() {
  let deleted = 0;
  let failed = 0;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
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
  }

  return { deleted, failed };
}

async function verifyEmpty() {
  console.log("\nVerification:");
  for (const { table } of DATA_TABLES) {
    const { count, error } = await admin.from(table).select("*", { count: "exact", head: true });
    console.log(`  ${table}: ${error ? error.message : count}`);
  }

  const { data: users } = await admin.auth.admin.listUsers({ perPage: 10 });
  console.log(`  auth.users: ${users.users.length}`);

  for (const bucket of STORAGE_BUCKETS) {
    const paths = await listStoragePaths(bucket);
    console.log(`  storage/${bucket}: ${paths.length} file(s)`);
  }
}

async function clearAllData() {
  console.log("=== HEMO LINK — Clear all data ===\n");

  console.log("Clearing database tables...");
  for (const { table, column } of DATA_TABLES) {
    await clearTable(table, column);
  }

  console.log("\nClearing storage...");
  for (const bucket of STORAGE_BUCKETS) {
    await clearStorageBucket(bucket);
  }

  console.log("\nDeleting auth users...");
  const { deleted, failed } = await deleteAllUsers();

  await verifyEmpty();

  console.log(`\nDone. Auth users deleted: ${deleted}, failed: ${failed}`);
  process.exit(failed > 0 ? 1 : 0);
}

clearAllData().catch((e) => {
  console.error(e);
  process.exit(1);
});
