# HEMO LINK — Final setup (production-ready)

## 1. Add your Supabase credentials

**Option A — paste in the app**

1. Run `npm run dev` → open http://localhost:5173/auth  
2. Use **Connect Supabase backend** and paste URL + anon key  

**Option B — `.env` file**

```powershell
.\scripts\configure-supabase.ps1 -Url "https://YOUR_REF.supabase.co" -AnonKey "YOUR_ANON_KEY"
```

Restart: `npm run dev`

## 2. Supabase dashboard settings

| Setting | Location | Recommendation |
|--------|----------|----------------|
| **Confirm email** | Authentication → Providers → Email | **Off** for easier local testing |
| **Site URL** | Authentication → URL Configuration | `http://localhost:5173` |
| **Redirect URLs** | Same | `http://localhost:5173/**` |

## 3. Database migrations (required once)

**Quick fix (2 minutes):** Supabase Dashboard → **SQL Editor** → paste and run:

`supabase/RUN_THIS_IN_SQL_EDITOR.sql`

**Or use CLI:**

```powershell
npx supabase login
npx supabase link --project-ref rktxgqukqglwynezerpy
npx supabase db push
```

## 3b. Auth settings (recommended)

Supabase → **Authentication** → **Providers** → Email → disable **Confirm email** for instant login after signup.

Add **Site URL**: `http://localhost:5173` and redirect `http://localhost:5173/**`

## 4. Verify backend

```powershell
npm run verify:backend
node scripts/test-supabase.mjs
```

## 5. Admin user

See `ADMIN_SETUP.md` — create user in Auth, then assign `admin` role in SQL Editor.

## Bugs fixed in this release

- Registration/login **Failed to fetch** when Supabase not configured  
- In-app Supabase connection UI  
- Role detection uses **user_roles** table (fixes admin login)  
- Phone number normalization (spaces / +91)  
- Email confirmation flow (no redirect without session)  
- Protected routes handle missing backend safely  
- Wrong dashboard redirects for donor/hospital roles  

## Run the app

```powershell
cd hemo-connect-main
npm install
npm run dev
```

Open http://localhost:5173
