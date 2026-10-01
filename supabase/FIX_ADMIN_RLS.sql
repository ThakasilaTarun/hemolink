-- Fix: admin role exists but app cannot read user_roles (RLS)
-- Run in SQL Editor: https://supabase.com/dashboard/project/rktxgqukqglwynezerpy/sql/new

-- 1) Ensure users can read their own role
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 2) Security definer helper (role column may be TEXT, not app_role enum)
DROP FUNCTION IF EXISTS public.get_my_roles();

CREATE OR REPLACE FUNCTION public.get_my_roles()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role::text FROM public.user_roles WHERE user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.get_my_roles() TO authenticated;

-- 3) Ensure admin@hemolink.com has admin role + profile
DO $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@hemolink.com' LIMIT 1;
  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'Create admin@hemolink.com in Authentication → Users first';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = admin_id AND role::text = 'admin'
  ) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = admin_id) THEN
    INSERT INTO public.profiles (id, full_name, phone)
    VALUES (admin_id, 'System Administrator', '+911234567890');
  END IF;
END $$;

-- Verify
SELECT au.email, ur.role, p.full_name
FROM auth.users au
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
LEFT JOIN public.profiles p ON p.id = au.id
WHERE au.email = 'admin@hemolink.com';
