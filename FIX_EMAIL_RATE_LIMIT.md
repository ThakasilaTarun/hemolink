# Fix: "Email rate limit exceeded" on registration

Supabase sends a **confirmation email** on every signup when **Confirm email** is enabled. The free tier limits how many auth emails can be sent per hour.

## Fix (recommended — takes 1 minute)

1. Open your project:  
   https://supabase.com/dashboard/project/rktxgqukqglwynezerpy/auth/providers

2. Click **Email** provider.

3. Turn **OFF** → **Confirm email** (disable email confirmation).

4. Click **Save**.

5. In **Authentication** → **URL Configuration**:
   - Site URL: `http://localhost:5174` (or your dev port)
   - Redirect URLs: `http://localhost:5174/**`

6. Try again:
   - **Register** with a new email, or  
   - **Login** if you already registered (account may exist even if email failed).

## If you still see rate limit errors

- Wait **30–60 minutes** for the limit to reset.
- Use a **different email** address.
- In **Authentication** → **Users**, delete test users you created during failed attempts.

## Optional: run registration SQL (if profile errors)

Run `supabase/RUN_THIS_IN_SQL_EDITOR.sql` in SQL Editor if you see database/function errors after signup.
