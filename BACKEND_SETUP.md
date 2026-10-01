# Backend setup (Supabase)

HEMO LINK uses **Supabase** for auth, database, storage, and edge functions. The bundled `.env` points to a project that no longer exists — you need your own Supabase project.

## 1. Create a Supabase project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard) and sign in (free tier is fine).
2. **New project** → pick a name, password, and region → wait until it is ready.

## 2. Configure the frontend `.env`

1. In the dashboard: **Project Settings** → **API**.
2. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon public** key → `VITE_SUPABASE_PUBLISHABLE_KEY`
3. **Project Settings** → **General** → **Reference ID** → `VITE_SUPABASE_PROJECT_ID`
4. In `hemo-connect-main`, copy the example env file and edit it:

```powershell
cd hemo-connect-main
copy .env.example .env
# Edit .env with your three values
```

## 3. Apply database migrations

### Option A — Supabase CLI (recommended)

```powershell
cd hemo-connect-main
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

### Option B — SQL Editor

Run each file under `supabase/migrations/` **in filename order** (oldest first) in **SQL Editor** → **New query** → **Run**.

Skip `20251204000000_create_admin_user.sql` until you have created an admin user in Auth (see [ADMIN_SETUP.md](./ADMIN_SETUP.md)).

## 4. Deploy edge functions (AI features)

```powershell
npx supabase functions deploy chat generate-certificate suggest-donors send-donor-alerts delete-user
```

In **Project Settings** → **Edge Functions** → **Secrets**, add:

| Secret | Purpose |
|--------|---------|
| `HEMO_AI_API_KEY` | OpenAI / Gemini / Claude API key |
| `AI_PROVIDER` | Optional: `openai`, `google`, or `anthropic` |

See [API_KEY_SETUP.md](./API_KEY_SETUP.md).

## 5. Create an admin user (optional)

Follow [ADMIN_SETUP.md](./ADMIN_SETUP.md).

## 6. Run the app

```powershell
npm install
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

## Local Supabase (optional, requires Docker)

If you install [Docker Desktop](https://www.docker.com/products/docker-desktop/):

```powershell
npx supabase start
npx supabase status
```

Use the **API URL** and **anon key** from `supabase status` in your `.env`, then:

```powershell
npx supabase db reset
npx supabase functions serve
```

## Verify backend

```powershell
.\scripts\verify-backend.ps1
```
