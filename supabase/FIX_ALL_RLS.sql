-- Run after COMPLETE_DATABASE_SETUP.sql
-- Fixes: admin empty dashboard, donor cannot see requests, admin data access

-- Admin read-all policies (use has_role — no recursion)
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

DROP POLICY IF EXISTS "Admins can manage all blood requests" ON public.blood_requests;
CREATE POLICY "Admins can manage all blood requests"
ON public.blood_requests FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Donors can see open requests matching their blood group
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

-- Donors can read their own profile (if missing)
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = id);

SELECT 'RLS policies applied successfully.' AS status;
