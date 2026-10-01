-- =============================================================================
-- ADMIN SETUP — run after creating the auth user in Supabase Dashboard
-- =============================================================================
-- Step 1: Authentication → Users → Add user (or reset password if login fails)
--   Email:    admin@hemolink.com
--   Password: Admin@Hemo2024!   (must match exactly — see FIX_ADMIN_LOGIN.md)
--   Auto Confirm User: ON
--
-- If "Invalid login credentials": delete user & recreate, OR run scripts/reset-admin-password.mjs
-- Step 2: Run this entire script in SQL Editor
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('donor', 'hospital', 'admin');
  END IF;
END $$;

-- Ensure unique constraint on user_roles (some projects were created without it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_roles_user_id_role_key'
      AND conrelid = 'public.user_roles'::regclass
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN
    RAISE EXCEPTION 'Table public.user_roles does not exist. Run COMPLETE_DATABASE_SETUP.sql first.';
END $$;

DO $$
DECLARE
  admin_id UUID;
BEGIN
  SELECT id INTO admin_id
  FROM auth.users
  WHERE email = 'admin@hemolink.com'
  LIMIT 1;

  IF admin_id IS NULL THEN
    RAISE EXCEPTION 'No auth user with email admin@hemolink.com. Create the user in Authentication → Users first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = admin_id AND role = 'admin'
  ) THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (admin_id, 'admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = admin_id
  ) THEN
    INSERT INTO public.profiles (id, full_name, phone)
    VALUES (admin_id, 'System Administrator', '+911234567890');
  ELSE
    UPDATE public.profiles
    SET full_name = 'System Administrator',
        phone = '+911234567890'
    WHERE id = admin_id;
  END IF;
END $$;

-- Verify
SELECT ur.user_id, ur.role, p.full_name, p.phone, au.email
FROM public.user_roles ur
JOIN auth.users au ON au.id = ur.user_id
LEFT JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'admin';
