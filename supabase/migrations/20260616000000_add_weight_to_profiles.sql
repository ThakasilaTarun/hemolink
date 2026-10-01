-- Add donor weight for eligibility checks during registration.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS weight NUMERIC;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS weight_range_check;
ALTER TABLE public.profiles ADD CONSTRAINT weight_range_check
CHECK (weight IS NULL OR (weight >= 45 AND weight <= 200));

CREATE INDEX IF NOT EXISTS idx_profiles_weight ON public.profiles(weight);
