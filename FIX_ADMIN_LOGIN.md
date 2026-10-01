# Fix admin "Invalid login credentials"

The user **admin@hemolink.com exists** in Supabase, but the password in the dashboard is **not** `Admin@Hemo2024!`.

## Option A — Reset in Supabase Dashboard (easiest)

1. Open [Authentication → Users](https://supabase.com/dashboard/project/rktxgqukqglwynezerpy/auth/users)
2. Find **admin@hemolink.com**
3. Either:
   - **Delete** the user → **Add user** again:
     - Email: `admin@hemolink.com`
     - Password: `Admin@Hemo2024!`
     - **Auto Confirm User:** ON
   - Or use **Send password recovery** and set a new password from the email
4. Run **`SETUP_ADMIN.sql`** again in SQL Editor
5. Login at http://localhost:5173/admin

## Option B — Reset with service role key (automated)

1. Supabase → **Settings → API** → copy **service_role** key (secret)
2. Add to `.env` (do not commit):

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
ADMIN_EMAIL=admin@hemolink.com
ADMIN_PASSWORD=Admin@Hemo2024!
```

3. Run:

```powershell
cd hemo-connect-main
node scripts/reset-admin-password.mjs
node scripts/create-admin.mjs
```

4. Login at http://localhost:5173/admin with `Admin@Hemo2024!`

## After login shows "Access Denied"

The password worked but the **admin role** is missing. Run **`SETUP_ADMIN.sql`** in SQL Editor.

## Verify admin role (SQL Editor)

```sql
SELECT au.email, ur.role
FROM auth.users au
LEFT JOIN public.user_roles ur ON ur.user_id = au.id
WHERE au.email = 'admin@hemolink.com';
```

You should see `role = admin`.
