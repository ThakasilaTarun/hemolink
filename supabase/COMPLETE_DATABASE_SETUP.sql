-- =============================================================================
-- HEMO LINK — Run ONCE in Supabase SQL Editor
-- https://supabase.com/dashboard/project/rktxgqukqglwynezerpy/sql/new
-- Safe to re-run: uses IF NOT EXISTS / DROP POLICY IF EXISTS
-- =============================================================================

-- 0) Helpers (profiles / user_roles must already exist from initial setup)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 0b) Ensure profiles has columns used by registration & donor features
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weight NUMERIC;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hospital_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hospital_address TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS weight_range_check;
ALTER TABLE public.profiles ADD CONSTRAINT weight_range_check
CHECK (weight IS NULL OR (weight >= 45 AND weight <= 200));

-- 0c) Role helpers (works with TEXT or app_role column)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('donor', 'hospital', 'admin');
  END IF;
END $$;

-- 0d) Fix user_roles.role check constraint (blocks donor registration)
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

-- 1) Registration helper — drop old overloads (app_role vs text)
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

-- 2) Core hospital tables (required before donations FK)
CREATE TABLE IF NOT EXISTS public.donors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    blood_group TEXT NOT NULL,
    phone TEXT NOT NULL,
    location TEXT NOT NULL,
    last_donation_date DATE,
    donation_count INTEGER DEFAULT 0,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.blood_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL,
    units_available INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT now(),
    UNIQUE (hospital_id, blood_group)
);

CREATE TABLE IF NOT EXISTS public.blood_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL,
    units_needed INTEGER NOT NULL,
    urgency_level TEXT NOT NULL CHECK (urgency_level IN ('critical', 'urgent', 'normal')),
    patient_name TEXT NOT NULL,
    patient_contact TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'alert_sent', 'fulfilled', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blood_requests ENABLE ROW LEVEL SECURITY;

-- Donors policies
DROP POLICY IF EXISTS "Hospitals can view their own donors" ON public.donors;
CREATE POLICY "Hospitals can view their own donors"
ON public.donors FOR SELECT TO authenticated
USING (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Hospitals can insert their own donors" ON public.donors;
CREATE POLICY "Hospitals can insert their own donors"
ON public.donors FOR INSERT TO authenticated
WITH CHECK (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Hospitals can update their own donors" ON public.donors;
CREATE POLICY "Hospitals can update their own donors"
ON public.donors FOR UPDATE TO authenticated
USING (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Hospitals can delete their own donors" ON public.donors;
CREATE POLICY "Hospitals can delete their own donors"
ON public.donors FOR DELETE TO authenticated
USING (auth.uid() = hospital_id);

-- Inventory policies
DROP POLICY IF EXISTS "Hospitals can view their own inventory" ON public.blood_inventory;
CREATE POLICY "Hospitals can view their own inventory"
ON public.blood_inventory FOR SELECT TO authenticated
USING (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Hospitals can insert their own inventory" ON public.blood_inventory;
CREATE POLICY "Hospitals can insert their own inventory"
ON public.blood_inventory FOR INSERT TO authenticated
WITH CHECK (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Hospitals can update their own inventory" ON public.blood_inventory;
CREATE POLICY "Hospitals can update their own inventory"
ON public.blood_inventory FOR UPDATE TO authenticated
USING (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Anyone can view all inventory for emergency purposes" ON public.blood_inventory;
CREATE POLICY "Anyone can view all inventory for emergency purposes"
ON public.blood_inventory FOR SELECT TO authenticated
USING (true);

-- Blood requests policies
DROP POLICY IF EXISTS "Hospitals can view their own requests" ON public.blood_requests;
CREATE POLICY "Hospitals can view their own requests"
ON public.blood_requests FOR SELECT TO authenticated
USING (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Hospitals can create requests" ON public.blood_requests;
CREATE POLICY "Hospitals can create requests"
ON public.blood_requests FOR INSERT TO authenticated
WITH CHECK (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Hospitals can update their own requests" ON public.blood_requests;
CREATE POLICY "Hospitals can update their own requests"
ON public.blood_requests FOR UPDATE TO authenticated
USING (auth.uid() = hospital_id);

DROP TRIGGER IF EXISTS set_donors_updated_at ON public.donors;
CREATE TRIGGER set_donors_updated_at
BEFORE UPDATE ON public.donors
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_blood_requests_updated_at ON public.blood_requests;
CREATE TRIGGER set_blood_requests_updated_at
BEFORE UPDATE ON public.blood_requests
FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.initialize_blood_inventory(hospital_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.blood_inventory (hospital_id, blood_group, units_available)
  VALUES
    (hospital_user_id, 'A+', 0), (hospital_user_id, 'A-', 0),
    (hospital_user_id, 'B+', 0), (hospital_user_id, 'B-', 0),
    (hospital_user_id, 'AB+', 0), (hospital_user_id, 'AB-', 0),
    (hospital_user_id, 'O+', 0), (hospital_user_id, 'O-', 0)
  ON CONFLICT (hospital_id, blood_group) DO NOTHING;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_donors_user_id ON public.donors(user_id);

-- 3) Donations table (My Donations tab)
CREATE TABLE IF NOT EXISTS public.donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    donor_id UUID,
    donor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    hospital_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    blood_group TEXT NOT NULL,
    donation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    units_donated INTEGER DEFAULT 1,
    certificate_generated BOOLEAN DEFAULT false,
    certificate_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.donations
    ADD CONSTRAINT fk_donor_id FOREIGN KEY (donor_id)
    REFERENCES public.donors(id) ON DELETE SET NULL;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_donations_donor_user_id ON public.donations(donor_user_id);
CREATE INDEX IF NOT EXISTS idx_donations_hospital_id ON public.donations(hospital_id);
CREATE INDEX IF NOT EXISTS idx_donations_donation_date ON public.donations(donation_date);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Donors can view their own donations" ON public.donations;
CREATE POLICY "Donors can view their own donations"
ON public.donations FOR SELECT TO authenticated
USING (donor_user_id = auth.uid());

DROP POLICY IF EXISTS "Hospitals can view their donations" ON public.donations;
CREATE POLICY "Hospitals can view their donations"
ON public.donations FOR SELECT TO authenticated
USING (
  hospital_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Hospitals can insert donations" ON public.donations;
CREATE POLICY "Hospitals can insert donations"
ON public.donations FOR INSERT TO authenticated
WITH CHECK (
  hospital_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "Hospitals can update their donations" ON public.donations;
CREATE POLICY "Hospitals can update their donations"
ON public.donations FOR UPDATE TO authenticated
USING (
  hospital_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- 4) Donor stats trigger
CREATE OR REPLACE FUNCTION public.update_donor_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.donor_id IS NOT NULL THEN
    UPDATE public.donors
    SET
      donation_count = (SELECT COUNT(*)::int FROM public.donations WHERE donor_id = NEW.donor_id),
      last_donation_date = NEW.donation_date
    WHERE id = NEW.donor_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_donor_stats_trigger ON public.donations;
CREATE TRIGGER update_donor_stats_trigger
AFTER INSERT ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.update_donor_stats();

-- 5) Inventory trigger
CREATE OR REPLACE FUNCTION public.update_blood_inventory_on_donation()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.blood_inventory (hospital_id, blood_group, units_available)
  VALUES (NEW.hospital_id, NEW.blood_group, NEW.units_donated)
  ON CONFLICT (hospital_id, blood_group)
  DO UPDATE SET
    units_available = blood_inventory.units_available + EXCLUDED.units_available,
    last_updated = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_inventory_on_donation ON public.donations;
CREATE TRIGGER update_inventory_on_donation
AFTER INSERT ON public.donations
FOR EACH ROW EXECUTE FUNCTION public.update_blood_inventory_on_donation();

-- 6) Registered donors RPC
CREATE OR REPLACE FUNCTION public.get_registered_donors()
RETURNS TABLE (
  id UUID, full_name TEXT, phone TEXT, blood_group TEXT, location TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.phone, p.blood_group, p.location
  FROM public.profiles p
  INNER JOIN public.user_roles ur ON ur.user_id = p.id
  WHERE ur.role = 'donor';
$$;

GRANT EXECUTE ON FUNCTION public.get_registered_donors TO authenticated, service_role;

-- 6b) Read own roles (fixes admin login when RLS blocks SELECT)
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

DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- 7) Donors can see hospital names in donation history
DROP POLICY IF EXISTS "Users can view hospital profile names" ON public.profiles;
CREATE POLICY "Users can view hospital profile names"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id OR hospital_name IS NOT NULL);

-- 8) Profile / role signup policies
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert their own role during signup" ON public.user_roles;
CREATE POLICY "Users can insert their own role during signup"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all user roles" ON public.user_roles;
CREATE POLICY "Admins can view all user roles"
ON public.user_roles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 9) Admin + donor visibility policies
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
CREATE POLICY "Admins can view all donations"
ON public.donations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Donors can view matching blood requests" ON public.blood_requests;
CREATE POLICY "Donors can view matching blood requests"
ON public.blood_requests FOR SELECT TO authenticated
USING (
  status IN ('pending', 'alert_sent')
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    INNER JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.id = auth.uid()
      AND ur.role::text = 'donor'
      AND p.blood_group IS NOT NULL
      AND p.blood_group = blood_requests.blood_group
  )
);

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id);

-- Done
SELECT 'HEMO LINK database setup completed successfully.' AS status;
