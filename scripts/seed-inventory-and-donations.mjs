/**
 * Fills blood inventory (8+ units per group) and sample donations for demo hospitals.
 * Run: node scripts/seed-inventory-and-donations.mjs
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = {};
for (const line of readFileSync(resolve(__dirname, "../.env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}

const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DEMO_PASSWORD = env.DEMO_PASSWORD || "Demo@Hemo2024!";
const UNITS_PER_GROUP = 10;
const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const HOSPITALS = [
  { email: "cmr.hospital@hemolink.demo", name: "CMR Aster" },
  { email: "city.hospital@hemolink.demo", name: "City Care" },
];

const DONORS = [
  {
    email: "donor.bplus@hemolink.demo",
    blood_group: "B+",
    full_name: "Priya Sharma",
    phone: "+919123456789",
    location: "Indiranagar, Bengaluru",
  },
  {
    email: "donor.oplus@hemolink.demo",
    blood_group: "O+",
    full_name: "Rahul Kumar",
    phone: "+919234567890",
    location: "Whitefield, Bengaluru",
  },
  {
    email: "donor.aplus@hemolink.demo",
    blood_group: "A+",
    full_name: "Ananya Reddy",
    phone: "+919345678901",
    location: "Jayanagar, Bengaluru",
  },
  {
    email: "donor.abplus@hemolink.demo",
    blood_group: "AB+",
    full_name: "Vikram Singh",
    phone: "+919456789012",
    location: "Koramangala, Bengaluru",
  },
];

const supabase = createClient(url, key);

async function signIn(email) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });
  if (error) throw new Error(`${email}: ${error.message}`);
  return data.user.id;
}

async function fillInventory(hospitalEmail) {
  const hospitalId = await signIn(hospitalEmail);
  await supabase.rpc("initialize_blood_inventory", { hospital_user_id: hospitalId });

  const { data: rows, error } = await supabase
    .from("blood_inventory")
    .select("id, blood_group, units_available")
    .eq("hospital_id", hospitalId);

  if (error) throw error;

  for (const row of rows || []) {
    if ((row.units_available ?? 0) < UNITS_PER_GROUP) {
      const { error: upErr } = await supabase
        .from("blood_inventory")
        .update({
          units_available: UNITS_PER_GROUP,
          last_updated: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (upErr) throw upErr;
    }
  }

  await supabase.auth.signOut();
  console.log(`✓ Inventory ${UNITS_PER_GROUP}+ units/group — ${hospitalEmail}`);
}

async function resolveDonorUserId(email) {
  const client = createClient(url, key);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password: DEMO_PASSWORD,
  });
  await client.auth.signOut();
  if (error || !data.user) throw new Error(`${email}: ${error?.message || "not found"}`);
  return data.user.id;
}

async function linkDonorsAndRecordDonations(hospitalEmail) {
  const hospitalId = await signIn(hospitalEmail);
  const donationDate = "2024-01-15";

  for (const donor of DONORS) {
    const donorUserId = await resolveDonorUserId(donor.email);
    await signIn(hospitalEmail);

    const { data: existing } = await supabase
      .from("donors")
      .select("id")
      .eq("hospital_id", hospitalId)
      .eq("user_id", donorUserId)
      .maybeSingle();

    let donorRowId = existing?.id;

    if (!donorRowId) {
      const { data: inserted, error: insErr } = await supabase
        .from("donors")
        .insert({
          hospital_id: hospitalId,
          user_id: donorUserId,
          full_name: donor.full_name,
          blood_group: donor.blood_group,
          phone: donor.phone,
          location: donor.location,
          email: donor.email,
          donation_count: 1,
          last_donation_date: donationDate,
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      donorRowId = inserted.id;
    }

    const { data: existingDonation } = await supabase
      .from("donations")
      .select("id")
      .eq("hospital_id", hospitalId)
      .eq("donor_user_id", donorUserId)
      .limit(1);

    if (!existingDonation?.length) {
      const { error: donErr } = await supabase.from("donations").insert({
        hospital_id: hospitalId,
        donor_id: donorRowId,
        donor_user_id: donorUserId,
        blood_group: donor.blood_group,
        donation_date: donationDate,
        units_donated: 1,
        notes: "Demo donation — seed data",
      });
      if (donErr) console.warn(`  donation skip ${donor.email}:`, donErr.message);
    }
  }

  await supabase.auth.signOut();
  console.log(`✓ Donors linked + donations — ${hospitalEmail}`);
}

console.log("=== Seed inventory & donations ===\n");

for (const h of HOSPITALS) {
  try {
    await fillInventory(h.email);
  } catch (e) {
    console.log(`✗ Inventory ${h.email}:`, e.message);
  }
}

try {
  await linkDonorsAndRecordDonations("cmr.hospital@hemolink.demo");
} catch (e) {
  console.log("✗ Donors/donations:", e.message);
}

console.log("\nDone. Log in as cmr.hospital@hemolink.demo → Blood Inventory should show 10 units each group.");
