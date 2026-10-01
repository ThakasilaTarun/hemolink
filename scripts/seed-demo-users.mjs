/**
 * Creates demo hospitals and donors in Supabase.
 * Run from hemo-connect-main: node scripts/seed-demo-users.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

function loadEnv() {
  const env = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const DEMO_PASSWORD = env.DEMO_PASSWORD || "Demo@Hemo2024!";

if (!url || !key) {
  console.error("Missing VITE_SUPABASE_URL or key in .env");
  process.exit(1);
}

const supabase = createClient(url, key);

const DEMO_USERS = [
  {
    email: "cmr.hospital@hemolink.demo",
    role: "hospital",
    full_name: "CMR Aster Multi-Speciality Hospital",
    phone: "+919876543210",
    hospital_name: "CMR Aster Multi-Speciality Hospital",
    hospital_address: "Kalyan Nagar, Bengaluru, Karnataka 560043",
  },
  {
    email: "city.hospital@hemolink.demo",
    role: "hospital",
    full_name: "City Care Blood Bank",
    phone: "+919887766554",
    hospital_name: "City Care Blood Bank",
    hospital_address: "MG Road, Bengaluru, Karnataka 560001",
  },
  {
    email: "donor.bplus@hemolink.demo",
    role: "donor",
    full_name: "Priya Sharma",
    phone: "+919123456789",
    blood_group: "B+",
    location: "Indiranagar, Bengaluru",
  },
  {
    email: "donor.oplus@hemolink.demo",
    role: "donor",
    full_name: "Rahul Kumar",
    phone: "+919234567890",
    blood_group: "O+",
    location: "Whitefield, Bengaluru",
  },
  {
    email: "donor.aplus@hemolink.demo",
    role: "donor",
    full_name: "Ananya Reddy",
    phone: "+919345678901",
    blood_group: "A+",
    location: "Jayanagar, Bengaluru",
  },
  {
    email: "donor.abplus@hemolink.demo",
    role: "donor",
    full_name: "Vikram Singh",
    phone: "+919456789012",
    blood_group: "AB+",
    location: "Koramangala, Bengaluru",
  },
];

async function ensureUser(account) {
  let userId;
  let session;

  const { data: signUp, error: signUpError } = await supabase.auth.signUp({
    email: account.email,
    password: DEMO_PASSWORD,
    options: { data: { role: account.role } },
  });

  if (signUpError?.message?.includes("already registered")) {
    const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
      email: account.email,
      password: DEMO_PASSWORD,
    });
    if (signInError) {
      throw new Error(`${account.email}: sign-in failed — ${signInError.message}`);
    }
    userId = signIn.user.id;
    session = signIn.session;
  } else if (signUpError) {
    throw new Error(`${account.email}: sign-up failed — ${signUpError.message}`);
  } else {
    userId = signUp.user?.id;
    session = signUp.session;
    if (!userId) throw new Error(`${account.email}: no user id from sign-up`);
    if (!session) {
      const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
        email: account.email,
        password: DEMO_PASSWORD,
      });
      if (signInError) throw new Error(`${account.email}: no session — ${signInError.message}`);
      session = signIn.session;
    }
  }

  const { error: rpcError } = await supabase.rpc("create_user_profile_and_role", {
    p_user_id: userId,
    p_full_name: account.full_name,
    p_phone: account.phone,
    p_role: account.role,
    p_blood_group: account.blood_group ?? null,
    p_location: account.location ?? null,
    p_hospital_name: account.hospital_name ?? null,
    p_hospital_address: account.hospital_address ?? null,
  });

  if (rpcError) {
    throw new Error(`${account.email}: profile RPC — ${rpcError.message}`);
  }

  if (account.role === "hospital") {
    await supabase.rpc("initialize_blood_inventory", { hospital_user_id: userId });
  }

  await supabase.auth.signOut();
  return { email: account.email, role: account.role, userId };
}

async function seedSampleRequest(hospitalEmail) {
  const { data: signIn, error } = await supabase.auth.signInWithPassword({
    email: hospitalEmail,
    password: DEMO_PASSWORD,
  });
  if (error) return;

  const hospitalId = signIn.user.id;
  const { data: existing } = await supabase
    .from("blood_requests")
    .select("id")
    .eq("hospital_id", hospitalId)
    .eq("patient_name", "Demo Patient")
    .limit(1);

  if (!existing?.length) {
    await supabase.from("blood_requests").insert({
      hospital_id: hospitalId,
      blood_group: "B+",
      units_needed: 2,
      urgency_level: "urgent",
      patient_name: "Demo Patient",
      patient_contact: "9876543210",
      status: "alert_sent",
    });
  }
  await supabase.auth.signOut();
}

console.log("=== HEMO LINK — Seed demo users ===\n");
console.log("Password for all demo accounts:", DEMO_PASSWORD, "\n");

const results = [];
for (const account of DEMO_USERS) {
  try {
    const r = await ensureUser(account);
    results.push({ ...r, status: "ok" });
    console.log(`✓ ${account.role.padEnd(8)} ${account.email}`);
  } catch (e) {
    results.push({ email: account.email, status: "fail", error: e.message });
    console.log(`✗ ${account.email}: ${e.message}`);
  }
}

try {
  await seedSampleRequest("cmr.hospital@hemolink.demo");
  console.log("✓ Sample B+ blood request for CMR hospital");
} catch {
  console.log("— Skipped sample request");
}

console.log("\n--- Login credentials ---");
console.log("App: http://localhost:5173/auth");
console.log("Admin: http://localhost:5173/admin (admin@hemolink.com)\n");
for (const u of DEMO_USERS) {
  console.log(`  ${u.role.padEnd(8)} ${u.email}`);
}
console.log(`\n  Password: ${DEMO_PASSWORD}`);

const failed = results.filter((r) => r.status === "fail");
process.exit(failed.length ? 1 : 0);
