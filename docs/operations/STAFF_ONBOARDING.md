# Adding and removing REGrow staff

Staff work in the REGrow console (`/platform`). They never see customer leads, buyers or documents. The only way
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

1. Create their sign-in account: Supabase → Authentication → Users → Add user, using their work e-mail. Tick *Auto
   confirm*, or send an invite so they set their own password. Never choose a password for them and share it.
2. Platform Admin → Staff → enter their e-mail and choose a role. The change is audited.
3. They sign in and open `/platform`. On their first visit they must set up an authenticator app; no console screen
   opens without it.

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
