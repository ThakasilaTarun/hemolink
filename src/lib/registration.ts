import { supabase } from "@/integrations/supabase/client";
import type { UserRole } from "@/utils/userRole";

export type RegistrationProfile = {
  userId: string;
  fullName: string;
  phone: string;
  role: Extract<UserRole, "donor" | "hospital">;
  bloodGroup?: string;
  location?: string;
  age?: number;
  weight?: number;
  hospitalName?: string;
  hospitalAddress?: string;
  email?: string;
  password?: string;
};

/** Ensures an auth session exists (needed for RLS fallback inserts). */
export async function ensureAuthSession(email: string, password: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
  return data.session;
}

/** Creates profile + role; safe to call if user already exists in auth. */
export async function ensureUserProfileAndRole(profile: RegistrationProfile): Promise<void> {
  const { userId, fullName, phone, role } = profile;

  const rpcPayload = {
    p_user_id: userId,
    p_full_name: fullName,
    p_phone: phone,
    p_role: role,
    p_blood_group: role === "donor" ? profile.bloodGroup ?? null : null,
    p_location: role === "donor" ? profile.location ?? null : null,
    p_age: role === "donor" ? profile.age ?? null : null,
    p_weight: role === "donor" ? profile.weight ?? null : null,
    p_hospital_name: role === "hospital" ? profile.hospitalName ?? fullName : null,
    p_hospital_address: role === "hospital" ? profile.hospitalAddress ?? null : null,
  };

  const { error: rpcErrorWithAge } = await (supabase.rpc as any)(
    "create_user_profile_and_role",
    rpcPayload
  );

  let rpcError = rpcErrorWithAge;

  if (
    rpcErrorWithAge &&
    /p_age|p_weight|schema cache|function .*create_user_profile_and_role/i.test(
      rpcErrorWithAge.message ?? ""
    )
  ) {
    const { p_age: _p_age, p_weight: _p_weight, ...legacyPayload } = rpcPayload;
    const { error: legacyRpcError } = await (supabase.rpc as any)(
      "create_user_profile_and_role",
      legacyPayload
    );
    rpcError = legacyRpcError;
  }

  if (!rpcError) {
    if (role === "hospital") {
      await supabase.rpc("initialize_blood_inventory", { hospital_user_id: userId });
    }
    return;
  }

  if (profile.email && profile.password) {
    await ensureAuthSession(profile.email, profile.password);
  }

  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  const { data: existingRoles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  const hasRole = existingRoles?.some((r) => String(r.role) === role);

  if (existingProfile && hasRole) {
    if (role === "hospital") {
      await supabase.rpc("initialize_blood_inventory", { hospital_user_id: userId });
    }
    return;
  }

  if (!existingProfile) {
    const profileInsert = {
      id: userId,
      full_name: fullName,
      phone,
      blood_group: role === "donor" ? profile.bloodGroup ?? null : null,
      location: role === "donor" ? profile.location ?? null : null,
      age: role === "donor" ? profile.age ?? null : null,
      weight: role === "donor" ? profile.weight ?? null : null,
      hospital_name: role === "hospital" ? profile.hospitalName ?? fullName : null,
      hospital_address: role === "hospital" ? profile.hospitalAddress ?? null : null,
    };

    const { error: profileError } = await supabase.from("profiles").insert(profileInsert);
    if (profileError) {
      if (/age|weight|schema cache|column/i.test(profileError.message ?? "")) {
        const { age: _age, weight: _weight, ...legacyProfileInsert } = profileInsert;
        const { error: legacyProfileError } = await supabase
          .from("profiles")
          .insert(legacyProfileInsert);
        if (legacyProfileError) throw legacyProfileError;
      } else {
        throw profileError;
      }
    }
  }

  if (!hasRole) {
    const { error: roleError } = await supabase.from("user_roles").insert({
      user_id: userId,
      role,
    });
    if (roleError) throw roleError;
  }

  if (role === "hospital") {
    await supabase.rpc("initialize_blood_inventory", { hospital_user_id: userId });
  }
}

export function notifyStatsChanged() {
  window.dispatchEvent(new Event("hemolink:stats-changed"));
}
