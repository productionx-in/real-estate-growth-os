# E-mail setup (Resend)

RE by PX sends two kinds of e-mail:

- **Its own messages:** invitations, site-visit confirmations, payment alerts. These use Resend (`lib/email/adapter.ts`).
- **Supabase Auth messages:** password reset and e-mail confirmation.

Until both are set up, nothing reaches customers. On production, the app now reports *"E-mail is not configured"*
instead of pretending the e-mail was sent.

## 1. Resend account and domain (owner, about 15 minutes)
1. Create an account at resend.com. The free tier covers 3,000 e-mails a month.
2. Go to Domains → Add domain → `productionx.in`. Resend shows 3–4 DNS records (SPF/DKIM, plus optional DMARC); add them
   at your domain registrar, then click Verify.
3. Go to API Keys → Create API key, with sending access. Copy it **straight into Vercel** (next step). Never paste it
   into chat or e-mail.

## 2. Vercel (Production)
| Variable | Value |
|---|---|
| `RESEND_API_KEY` | the key from step 1 (mark it Sensitive) |
| `RESEND_FROM_EMAIL` | `RE by PX <noreply@productionx.in>` |

Then redeploy. Invitations from Platform → Provision customer and from a workspace's Team page will now be delivered.

## 3. Supabase Auth e-mails (password reset)
Supabase's built-in sender is for testing only: it sends very few e-mails and only to your own team's addresses. In
Supabase → Authentication → Emails (SMTP settings), enable custom SMTP:

| Field | Value |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | a Resend API key (create a separate one for Supabase) |
| Sender e-mail | `noreply@productionx.in` |
| Sender name | `RE by PX` |

## 4. Check
- Provision a test customer to an inbox you control. The success screen must say the invitation *has been sent*,
  and the e-mail must arrive.
- On the login page, use *Forgot password?* for a test account. The reset e-mail must arrive.

## Without e-mail
- **Team invitations:** the Team page shows a one-time link that the owner or admin can share, for example on
  WhatsApp.
- **Customer provisioning:** the link is sent only by e-mail, on purpose. Set up e-mail before onboarding customers.
- **Website demo requests:** these do not need e-mail. They appear in the staff console → Sales.
