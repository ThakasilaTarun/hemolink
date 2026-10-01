import { supabase } from "@/integrations/supabase/client";

export type UserRole = "donor" | "hospital" | "admin";

const VALID_ROLES: UserRole[] = ["donor", "hospital", "admin"];

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && VALID_ROLES.includes(value as UserRole);
}

function pickRole(roles: UserRole[]): UserRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("hospital")) return "hospital";
  if (roles.includes("donor")) return "donor";
  return roles[0] ?? null;
}

/**
 * Resolves the current user's role from user_roles (authoritative) then auth metadata.
 */
export const getUserRole = async (): Promise<UserRole | null> => {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return null;

    // Prefer SECURITY DEFINER RPC (works when RLS blocks direct SELECT)
    const { data: rpcRoles, error: rpcError } = await (supabase.rpc as any)("get_my_roles");
    if (!rpcError && Array.isArray(rpcRoles) && rpcRoles.length) {
      const roles = rpcRoles.filter(isUserRole);
      const picked = pickRole(roles);
      if (picked) return picked;
    }

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    if (!roleError && roleRows?.length) {
      const roles = roleRows.map((r) => r.role).filter(isUserRole);
      const picked = pickRole(roles);
      if (picked) return picked;
    }

    const metadataRole = (user.user_metadata as { role?: unknown })?.role;
    if (isUserRole(metadataRole)) {
      return metadataRole;
    }

    return null;
  } catch (error) {
    console.error("Error in getUserRole:", error);
    return null;
  }
};

export function getDashboardPathForRole(role: UserRole | null): string {
  if (role === "donor") return "/donor";
  if (role === "admin" || role === "hospital") return "/dashboard";
  return "/auth";
}
