-- Add age column to profiles table for donor age verification
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age INTEGER;

-- Add check constraint to ensure age is between 18-65 for donors
ALTER TABLE public.profiles ADD CONSTRAINT age_range_check 
CHECK (age IS NULL OR (age >= 18 AND age <= 65));

-- Create index on age for potential future queries
CREATE INDEX IF NOT EXISTS idx_profiles_age ON public.profiles(age);
