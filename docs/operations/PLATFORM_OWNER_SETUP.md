# Setting up the first Platform Owner

The Platform Owner (`super_admin`) is the only role that can add staff, change payment gateways, set GST
particulars and provision customers. Exactly one person should hold it at first. **Only you can do this setup.**
No automation, script or other person creates this account for you, and nobody bypasses the authenticator step.

Production has no Platform Owner today (`platform_users` is empty), so the setup door is open. Once it has run, the
database refuses a second bootstrap.

## What you need

- A long, unique password, kept in a password manager.
- An authenticator app on your phone: Google Authenticator, Microsoft Authenticator, 1Password or similar.
- A trusted computer with Node.js 20 or later and a checkout of this repository.
- Production values for `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`.
  Copy them from Supabase → Project settings → API. Keep them in your shell only, never in a file you commit.

## Steps

1. **Create your sign-in account.** In Supabase → Authentication → Users → Add user → Create new user, enter your
   e-mail and password and tick *Auto confirm user*. REGrow has no public sign-up.
2. **Sign in and turn on two-step verification.** Sign in at `<app URL>/login?for=staff` (staff sign-in is not listed on the public page), then open
   `<app URL>/account/security`.
   Scan the QR code with your authenticator app and enter the 6-digit code. The page then says *Two-step verification
   is on*. This page only protects your own account; it grants no access.
3. **Run the bootstrap on your own computer.** Use a fresh terminal, and run it within 30 seconds of reading the code
   from your authenticator:

   ```bash
   export NEXT_PUBLIC_SUPABASE_URL='<production URL>'
   export NEXT_PUBLIC_SUPABASE_ANON_KEY='<production anon key>'
   export SUPABASE_SERVICE_ROLE_KEY='<production service role key>'
   export INITIAL_SUPER_ADMIN_EMAIL='<your e-mail>'
   export PLATFORM_BOOTSTRAP_SECRET="$(openssl rand -hex 32)"
   read -rs INITIAL_SUPER_ADMIN_PASSWORD && export INITIAL_SUPER_ADMIN_PASSWORD
   read -r INITIAL_SUPER_ADMIN_TOTP_CODE && export INITIAL_SUPER_ADMIN_TOTP_CODE
   ```

   ```bash
   node scripts/bootstrap-super-admin.mjs
   ```

   The script:
   - signs in as you with your password;
   - checks that the account has a verified authenticator and that your code reaches AAL2;
   - assigns `super_admin` and writes a platform audit entry in one database transaction, under a lock.

   It stops without changing anything if a Platform Owner already exists, if the e-mail doesn't match exactly, or if
   any check fails. `PLATFORM_BOOTSTRAP_SECRET` is a deliberate 32+ character confirmation, not a stored credential:
   generate it fresh and discard it.
4. **Close the terminal** so the password and keys leave memory. Never put these variables in Vercel, a `.env` file,
   a PR or a chat.
5. **Check the result.** Sign in again, open `/platform` and enter a code. You should see the full console, including
   Staff and Provision customer. Then, read-only in the Supabase SQL editor:

   ```sql
   select role, is_active, mfa_enforced from public.platform_users;
   ```

   ```sql
   select action, created_at from public.platform_audit_logs order by created_at desc limit 3;
   ```

   You should see exactly one active `super_admin`, plus the bootstrap audit entry.

## Afterwards

- Add other staff from Platform Admin → Staff. See `STAFF_ONBOARDING.md`.
- Keep a second recovery path. If you lose your phone, another Platform Owner can help; with only one, recovery
  needs database-owner access, as below. Consider adding a second trusted Platform Owner later.
- **Lost authenticator, single owner.** In the Supabase dashboard (Authentication → Users → your user), remove the MFA
  factor, sign in again and repeat step 2. Your `super_admin` row is kept. Record what happened in your incident log;
  see `INCIDENT_RESPONSE.md`.
