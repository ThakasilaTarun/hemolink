-- Run after APPLY_ALL_FIXES.sql if COMPLETE_DATABASE_SETUP.sql was never run.
-- Creates donations table and related objects.

CREATE TABLE IF NOT EXISTS public.donations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hospital_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    donor_id UUID,
    donor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    blood_group TEXT NOT NULL,
    units_donated INTEGER NOT NULL DEFAULT 1,
    donation_date DATE NOT NULL DEFAULT CURRENT_DATE,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.donations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hospitals can view their own donations" ON public.donations;
CREATE POLICY "Hospitals can view their own donations"
ON public.donations FOR SELECT TO authenticated
USING (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Hospitals can insert their own donations" ON public.donations;
CREATE POLICY "Hospitals can insert their own donations"
ON public.donations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = hospital_id);

DROP POLICY IF EXISTS "Donors can view their own donations" ON public.donations;
CREATE POLICY "Donors can view their own donations"
ON public.donations FOR SELECT TO authenticated
USING (auth.uid() = donor_user_id);

DROP POLICY IF EXISTS "Admins can view all donations" ON public.donations;
CREATE POLICY "Admins can view all donations"
ON public.donations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

SELECT 'Donations table ready.' AS status;
