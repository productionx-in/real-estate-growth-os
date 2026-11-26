# RE by PX console: what each staff role needs

The console (`/platform`) is where RE by PX's own team watches customers and does its work. Each role opens
the console to a home page built around its own job. Which navigation links appear depends on the role, and
the server enforces every permission again. Staff never see customers' leads, buyers or documents. Opening a
customer's records needs a support grant that the customer approves, that expires, and that is audited.

## Roles, jobs and the questions they arrive with

| Role | Job | Questions on arrival | Home shows |
|---|---|---|---|
| Platform Owner | Runs the business | Are we growing? Is revenue safe? Which customers are slipping? Is the team keeping up? | Revenue and customer KPIs, growth trend, customers at risk, team workload, staff activity |
| Platform admin | Keeps customers set up and healthy | Who is stuck in setup? Who stopped using RE by PX? Who is read-only and why? | Customer health list (worst first), onboarding still pending, lifecycle mix, support summary |
| Finance | Money in and out | What failed? What needs my approval? What renews soon? Do the books reconcile? | Payment alerts, refunds awaiting approval, unapplied money, disputes, reconciliation exceptions, renewals in the next 30 days |
| Sales manager | Pipeline and team | Where is the pipeline leaking? Who is behind on follow-ups? Which website requests are unassigned? | Funnel by stage, win rate, team follow-up table, unassigned website requests |
| Sales executive | Own prospects | Whom do I call today? What is overdue? | Today's and overdue follow-ups, own funnel |
| Support | Customer cases | What is urgent? What is unassigned? What is waiting longest? Which access grants are about to expire? | Queue by priority, unassigned, oldest waiting, own cases, grants expiring within 24 hours |
| Auditor | Oversight (read-only) | What changed, by whom, and how much? | Sensitive actions by type over 7 days, recent activity |

## The calculations

**Customer health (0–100).** Each workspace starts at 100 and loses points for these signals, all of which are
workspace metadata, never business data:

| Signal | Points |
|---|---|
| Suspended or on billing hold | −40 |
| Subscription expired or past due | −25 |
| Trial ends within 7 days | −15 |
| No member has signed in for 14+ days (−35 for 30+ days, or if nobody has ever signed in) | −20 |
| Each open urgent support case | −10 |
| Invitations unaccepted for 7+ days (setup is stuck) | −10 |

Bands: **Healthy** at 75 or more, **Watch** from 50 to 74, **At risk** below 50. Each workspace lists its reasons, so
whoever looks can act on them. The score is clamped to 0–100.

**Sales.** Win rate = won ÷ (won + lost), and is shown only once there are closed deals. A follow-up is overdue
once `next_follow_up_at` has passed on an open prospect. Every open prospect counts towards the funnel totals.

**Support.** A case's age is measured from `created_at` for active cases (open, in progress, waiting on the
customer). The home page shows the oldest case and the median age. "Unassigned" means an active case with no
assignee.

**Finance.** Monthly recurring revenue comes from contracted prices, counting annual contracts as twelfths and
excluding GST. Renewals are active subscriptions whose period ends within 30 days.

## Interface rules

- Every screen opens with a page header: a title, one line on what the page is for, and the main action.
- Filters are tabs that show their counts, and the URL holds the current filter.
- Tables state dates in Indian Standard Time and use tabular figures. Wherever a person is named, the table
  shows their name or "You" rather than an ID.
- A colour always comes with a word or a number, never on its own.
- Sign out and Account security sit in the user menu in the header. Sign out also appears in the phone menu and
  on the authenticator step, so nobody is ever stuck.
