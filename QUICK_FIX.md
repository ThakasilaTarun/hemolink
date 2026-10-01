# Quick fix — Chatbot, My Donations, Admin

## 1. Database (fixes My Donations + registration)

1. Open: https://supabase.com/dashboard/project/rktxgqukqglwynezerpy/sql/new  
2. Copy all of `supabase/COMPLETE_DATABASE_SETUP.sql`  
3. Click **Run**

## 2. Admin account

1. **Authentication → Users → Add user**
   - Email: `admin@hemolink.com`
   - Password: `Admin@Hemo2024!` (change later)
   - **Auto Confirm User:** ON

2. Run all of `supabase/SETUP_ADMIN.sql` in SQL Editor

3. Login at: http://localhost:5174/admin

## 3. Chatbot

**Works now** in **offline help mode** (built-in answers).

For full OpenAI chat:

1. Supabase → **Edge Functions** → Secrets → add `HEMO_AI_API_KEY` (OpenAI key)
2. In terminal:
   ```powershell
   cd hemo-connect-main
   npx supabase login
   npx supabase link --project-ref rktxgqukqglwynezerpy
   npx supabase functions deploy chat
   ```

## 4. My Donations shows empty?

That is normal until a **hospital records a donation** for your donor account (Donor Management → Record Donation).

## Optional: service role (automated admin)

Add to `.env` (do not commit):

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Then: `node scripts/create-admin.mjs`
