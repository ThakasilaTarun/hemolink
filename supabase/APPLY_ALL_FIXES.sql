-- =============================================================================
-- HEMO LINK — Run this ONE file in Supabase SQL Editor to fix all known DB bugs
-- https://supabase.com/dashboard/project/rktxgqukqglwynezerpy/sql/new
-- Safe to re-run.
-- =============================================================================

-- 1) Ensure app_role enum exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('donor', 'hospital', 'admin');
  END IF;
END $$;

-- 2) Fix user_roles.role check constraint (blocks donor registration)
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role';

  IF col_type = 'text' OR col_type = 'character varying' THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_role_check
      CHECK (role IN ('donor', 'hospital', 'admin'));
  END IF;
END $$;

-- 3) has_role helper (text role — works with enum or text column)
-- Do NOT drop has_role(uuid,text) — RLS policies depend on it. Use CREATE OR REPLACE.
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role::text = _role
  );
$$;

-- 4) Registration RPC — drop all overloads, recreate one version
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weight NUMERIC;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS weight_range_check;
ALTER TABLE public.profiles ADD CONSTRAINT weight_range_check
CHECK (weight IS NULL OR (weight >= 45 AND weight <= 200));

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'create_user_profile_and_role'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.create_user_profile_and_role(
  p_user_id UUID,
  p_full_name TEXT,
  p_phone TEXT,
  p_role TEXT,
  p_blood_group TEXT DEFAULT NULL,
  p_location TEXT DEFAULT NULL,
  p_age INTEGER DEFAULT NULL,
  p_weight NUMERIC DEFAULT NULL,
  p_hospital_name TEXT DEFAULT NULL,
  p_hospital_address TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  role_col_udt TEXT;
BEGIN
  IF p_role NOT IN ('donor', 'hospital', 'admin') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  INSERT INTO public.profiles (
    id, full_name, phone, blood_group, location, age, weight, hospital_name, hospital_address
  ) VALUES (
    p_user_id, p_full_name, p_phone, p_blood_group, p_location, p_age, p_weight, p_hospital_name, p_hospital_address
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    blood_group = COALESCE(EXCLUDED.blood_group, profiles.blood_group),
    location = COALESCE(EXCLUDED.location, profiles.location),
    age = COALESCE(EXCLUDED.age, profiles.age),
    weight = COALESCE(EXCLUDED.weight, profiles.weight),
    hospital_name = COALESCE(EXCLUDED.hospital_name, profiles.hospital_name),
    hospital_address = COALESCE(EXCLUDED.hospital_address, profiles.hospital_address);

  SELECT udt_name INTO role_col_udt
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'user_roles' AND column_name = 'role';

  IF role_col_udt = 'app_role' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, p_role::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (p_user_id, p_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_user_profile_and_role(uuid, text, text, text, text, text, integer, numeric, text, text) TO authenticated, anon;

-- 5) Read own roles (admin login fix)
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

-- 6) Profile columns used by registration
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weight NUMERIC;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hospital_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hospital_address TEXT;

-- 7) Signup RLS policies
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own role during signup" ON public.user_roles;
CREATE POLICY "Users can insert their own role during signup"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 8) Admin read-all policies (fixes empty admin dashboard)
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all blood requests" ON public.blood_requests;
CREATE POLICY "Admins can view all blood requests"
ON public.blood_requests FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all donors" ON public.donors;
CREATE POLICY "Admins can view all donors"
ON public.donors FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all blood inventory" ON public.blood_inventory;
CREATE POLICY "Admins can view all blood inventory"
ON public.blood_inventory FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all donations" ON public.donations;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'donations'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Admins can view all donations"
      ON public.donations FOR SELECT TO authenticated
      USING (public.has_role(auth.uid(), 'admin'))
    $policy$;
  END IF;
END $$;

DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage all blood requests" ON public.blood_requests;
CREATE POLICY "Admins can manage all blood requests"
ON public.blood_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 9) Donors can see matching blood requests (fixes empty donor portal requests tab)
DROP POLICY IF EXISTS "Donors can view matching blood requests" ON public.blood_requests;
CREATE POLICY "Donors can view matching blood requests"
ON public.blood_requests FOR SELECT TO authenticated
USING (
  status IN ('pending', 'alert_sent')
  AND EXISTS (
    SELECT 1
    FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid()
      AND ur.role::text = 'donor'
      AND p.blood_group IS NOT NULL
      AND p.blood_group = blood_requests.blood_group
  )
);

-- 10) Ensure admin account has role (create user in Auth first if missing)
DO $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT id INTO admin_id FROM auth.users WHERE email = 'admin@hemolink.com' LIMIT 1;
  IF admin_id IS NULL THEN
    RAISE NOTICE 'Skip admin setup — create admin@hemolink.com in Authentication → Users first';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = admin_id AND role::text = 'admin'
  ) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (admin_id, 'admin');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = admin_id) THEN
    INSERT INTO public.profiles (id, full_name, phone)
    VALUES (admin_id, 'System Administrator', '+911234567890');
  END IF;
END $$;

SELECT 'All fixes applied successfully.' AS status;
