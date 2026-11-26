# Adding and removing RE by PX staff

Staff work in the RE by PX console (`/platform`). They never see customer leads, buyers or documents. The only way
into a customer's data is a support access grant: the customer approves it, it is time-limited, and every use is
audited. Every staff member needs their own account; shared logins are not allowed.

## Roles

| Role | Can | Cannot |
|---|---|---|
| Platform Owner (`super_admin`) | Everything in the console: staff, gateways, GST particulars, provisioning | — |
| Platform admin (`platform_admin`) | Organisations, support cases | Sales pipeline, payments, staff |
| Finance (`finance_admin`) | Payments: refunds (never approving their own), reconciliation | Staff, gateway switching, GST particulars |
| Sales manager (`sales_manager`) | All internal prospects, assigning them | Customer CRM data, support, payments |
| Sales executive (`sales_rep`) | Their own prospects | Others' prospects, support, payments |
| Support (`support_agent`) | Support cases; customer data only under a customer-approved grant | Sales, payments, staff |
| Auditor (`auditor`) | Read-only: organisations, sales, support, payments, audit log | Any change |

Give each person the narrowest role their job needs.

## Add someone (Platform Owner)

1. Platform Admin → Staff → enter their work e-mail and choose a role. The change is audited.
2. If they have no RE by PX account yet, RE by PX creates one (with no password) and shows you a **one-time setup link**.
   Copy it and send it to them privately. It works once and expires (Supabase → Authentication → email OTP
   expiry, 1 hour by default). If it expires before they use it, add them again: you get a fresh link, and no
   duplicate is created. Nobody chooses a password for them, and no e-mail service is needed.
3. They open the link, choose a password, and land in the console, where they must set up an authenticator app
   before any screen opens. Afterwards they sign in at `<app URL>/login?for=staff`. The public sign-in page does not
   show a staff option; share this address only with staff.

If they already have a RE by PX account and have signed in before, step 2 is skipped: they use their existing password.

## Change a role or remove access

Platform Admin → Staff → change the role, or deactivate the person. Deactivation takes effect on their next request.
You cannot remove or demote the last active Platform Owner. When someone leaves, deactivate them the same day, and
also disable their sign-in in Supabase → Authentication.

## Review every quarter

```sql
select p.role, p.is_active, u.email, u.last_sign_in_at
from public.platform_users p join auth.users u on u.id = p.user_id
order by p.role;
```

Remove anyone who no longer needs access. Platform Admin → Audit log shows every staff action.
