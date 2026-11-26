// lib/email/customer.ts — the e-mails RE by PX sends to a workspace's owners and admins about their account.
// Plain, specific and short: what happened, what it means, the one thing to do next. Built on the shared layout
// (lib/email/layout.ts), so every message looks the same and has a text version. No business data from the
// workspace (leads, buyers) ever goes into these e-mails.
import { renderEmail } from '@/lib/email/layout'

export type CustomerEmailKind = 'welcome' | 'trial_ending' | 'trial_ended' | 'invoice_issued' | 'payment_received' | 'payment_failed' | 'workspace_state'
  | 'plan_active' | 'member_joined' | 'daily_member' | 'daily_manager' | 'weekly_manager'
  | 'plot_map_activated' | 'plot_map_action_needed' | 'plot_map_published' | 'plot_map_delayed'

export interface Rendered { subject: string; html: string; text: string }

const inr = (cents: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(cents / 100)
const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
const out = (subject: string, c: Parameters<typeof renderEmail>[0]): Rendered =>
  ({ subject, ...renderEmail({ reason: 'You received this because you own or manage a RE by PX workspace.', ...c }) })

export const customerEmails = {
  welcome: (o: { orgName: string; url: string; trialEndsAt?: string | null; plan?: string | null }) =>
    out(`Your RE by PX workspace "${o.orgName}" is ready`, {
      preheader: o.trialEndsAt ? `Your free trial runs until ${day(o.trialEndsAt)}.` : 'Three steps to your first leads in RE by PX.',
      heading: `Welcome to RE by PX, ${o.orgName}`,
      paragraphs: [
        o.trialEndsAt
          ? `Your workspace is ready and your **free trial has started**${o.plan ? ` on the **${o.plan}** plan` : ''}. It runs until **${day(o.trialEndsAt)}** — everything is switched on.`
          : `Your workspace is ready${o.plan ? ` on the **${o.plan}** plan` : ''}.`,
        'Three steps get you to your first leads:',
        '**1. Connect a lead source** — Meta, Google, your website form or a portal, under Integrations.',
        '**2. Invite your team** — add your salespeople under Team, so new leads reach them straight away.',
        '**3. Add a project** — so every lead is tied to the right project and inventory.',
        'Questions? Tap the parrot in the corner of any page, or reply to this e-mail.',
      ],
      cta: { label: 'Open your workspace', url: o.url },
    }),

  trial_ending: (o: { orgName: string; endsAt: string; daysLeft: number; url: string }) =>
    out(o.daysLeft <= 1 ? `Your RE by PX trial ends tomorrow` : `Your RE by PX trial ends in ${o.daysLeft} days`, {
      preheader: `The trial for ${o.orgName} ends on ${day(o.endsAt)}.`,
      heading: o.daysLeft <= 1 ? 'Your trial ends tomorrow' : `Your trial ends in ${o.daysLeft} days`,
      paragraphs: [
        `The free trial of **${o.orgName}** ends on **${day(o.endsAt)}**.`,
        'Choose a plan to keep your team working without interruption. Your leads, projects and settings stay exactly as they are.',
        'Need more time or want to talk about the right plan? Reply to this e-mail.',
      ],
      cta: { label: 'Choose a plan', url: o.url },
    }),

  trial_ended: (o: { orgName: string; url: string }) =>
    out(`Your RE by PX trial has ended`, {
      preheader: `Choose a plan to keep using ${o.orgName}.`,
      heading: 'Your trial has ended',
      paragraphs: [
        `The free trial of **${o.orgName}** has ended. Your data is safe and kept.`,
        'Choose a plan to switch everything back on for your team.',
      ],
      cta: { label: 'Choose a plan', url: o.url },
      footnote: 'Nothing is deleted when a trial ends. Reply to this e-mail if you need help deciding.',
    }),

  invoice_issued: (o: { orgName: string; invoiceNumber: string; amountCents: number; dueDate: string | null; url: string }) =>
    out(`Invoice ${o.invoiceNumber} from RE by PX — ${inr(o.amountCents)}`, {
      preheader: `Invoice for ${o.orgName}${o.dueDate ? `, due ${day(o.dueDate)}` : ''}.`,
      heading: 'Your invoice is ready',
      paragraphs: [
        `Invoice **${o.invoiceNumber}** for **${o.orgName}**: **${inr(o.amountCents)}** including GST${o.dueDate ? `, due **${day(o.dueDate)}**` : ''}.`,
        'You can view, download and pay it from Billing.',
      ],
      cta: { label: 'View and pay', url: o.url },
    }),

  payment_received: (o: { orgName: string; amountCents: number; reference: string; invoiceNumber: string | null; url: string }) =>
    out(`Payment received — ${inr(o.amountCents)}`, {
      preheader: `Thank you. Payment for ${o.orgName} received.`,
      heading: 'Payment received — thank you',
      paragraphs: [
        `We received **${inr(o.amountCents)}** for **${o.orgName}**${o.invoiceNumber ? ` against invoice **${o.invoiceNumber}**` : ''}.`,
        `Payment reference: **${o.reference}**. Your receipt and invoice are in Billing.`,
      ],
      cta: { label: 'View billing', url: o.url },
    }),

  payment_failed: (o: { orgName: string; amountCents: number; invoiceNumber: string | null; url: string }) =>
    out(`Your payment didn’t go through`, {
      preheader: `A payment of ${inr(o.amountCents)} for ${o.orgName} failed.`,
      heading: 'Your payment didn’t go through',
      paragraphs: [
        `A payment of **${inr(o.amountCents)}** for **${o.orgName}**${o.invoiceNumber ? ` (invoice **${o.invoiceNumber}**)` : ''} didn’t complete. No money was taken.`,
        'Please try again from Billing, or use a different payment method.',
      ],
      cta: { label: 'Try again', url: o.url },
      footnote: 'If money was taken from your account, it is returned automatically by your bank. Reply to this e-mail if it isn’t.',
    }),

  plan_active: (o: { orgName: string; plan: string | null; seats: number | null; renewsAt: string | null; url: string }) =>
    out(`Your RE by PX plan is active`, {
      preheader: `${o.orgName}${o.plan ? ` is on the ${o.plan} plan` : ' is active'}.`,
      heading: 'Your plan is active',
      paragraphs: [
        `**${o.orgName}** is now on${o.plan ? ` the **${o.plan}** plan` : ' a paid plan'}${o.seats ? ` with **${o.seats} seats**` : ''}. Thank you for choosing RE by PX.`,
        ...(o.renewsAt ? [`Your current period runs until **${day(o.renewsAt)}**. We’ll remind you before it renews.`] : []),
        'Invoices, receipts and seats are under Billing.',
      ],
      cta: { label: 'Open your workspace', url: o.url },
    }),

  member_joined: (o: { orgName: string; firstName: string; role: string; url: string }) => {
    const roleLine: Record<string, string> = {
      owner: 'As an owner you can do everything, including billing and the team.',
      admin: 'As an admin you manage the team, lead sources and settings.',
      manager: 'As a manager you see every lead and can assign and reassign them.',
      team_lead: 'As a team lead you see your team’s leads and can assign work within the team.',
      sales_exec: 'New leads assigned to you appear in your list — call them first, then log what happened.',
      post_sales: 'You look after bookings and buyers after the sale.',
      readonly: 'You can view the workspace; you can’t change anything.',
    }
    return out(`Welcome to ${o.orgName} on RE by PX`, {
      preheader: 'Your account is set up. Here’s how to start.',
      heading: `Welcome, ${o.firstName}`,
      paragraphs: [
        `You’ve joined **${o.orgName}** on RE by PX as **${o.role.replace('_', ' ')}**. ${roleLine[o.role] ?? ''}`,
        '**To start:**',
        '• open **Today** — it shows who to call now and what’s due',
        '• allow notifications when asked, so a new lead reaches you within seconds',
        '• add RE by PX to your phone’s home screen to use it like an app',
        'You’ll also get a short summary of your day by e-mail each morning. You can turn it off in your account settings.',
      ],
      cta: { label: 'Open RE by PX', url: o.url },
    })
  },

  workspace_state: (o: { orgName: string; to: string; reason: string | null; url: string }) => {
    const v = {
      suspended: { s: `${o.orgName} is now read-only`, h: 'Your workspace is read-only', p: 'Your team can still see everything, but can’t add or change anything until this is resolved.' },
      deactivated: { s: `${o.orgName} has been deactivated`, h: 'Your workspace has been deactivated', p: 'Nobody can open it right now. Your data is kept and nothing has been deleted.' },
      grace: { s: `Action needed for ${o.orgName}`, h: 'Your renewal is due', p: 'Everything still works for now. Renew to avoid interruption.' },
      active: { s: `${o.orgName} is active again`, h: 'Your workspace is active again', p: 'Everyone can sign in and work as before.' },
    }[o.to] ?? { s: `Update on ${o.orgName}`, h: 'Your workspace was updated', p: `Its state is now: ${o.to}.` }
    return out(v.s, {
      preheader: v.p,
      heading: v.h,
      paragraphs: [v.p, ...(o.reason ? [`Reason: ${o.reason}`] : []), 'Questions? Reply to this e-mail and our team will help.'],
      cta: { label: o.to === 'deactivated' ? 'Contact RE by PX' : 'Open your workspace', url: o.url },
    })
  },

  // Interactive Plot Map setup (lib/jobs/customer-emails.ts collects these from what was recorded).
  plot_map_activated: (o: { orgName: string; projectName: string; url: string }) =>
    out(`Interactive Plot Map is active for ${o.projectName}`, {
      preheader: 'Upload your approved layout to start.',
      heading: `Your plot map for ${o.projectName} is ready to set up`,
      paragraphs: [
        `Interactive Plot Map is now **active** for **${o.projectName}** in ${o.orgName}.`,
        '**Next step:** upload the approved layout (PDF, PNG or JPG). You can follow every step of the set-up, with an expected ready date, on the project’s Plot map page.',
      ],
      cta: { label: 'Upload the layout', url: o.url },
    }),

  plot_map_action_needed: (o: { orgName: string; projectName: string; what: string; url: string }) =>
    out(`Action needed: plot map for ${o.projectName}`, {
      preheader: o.what.slice(0, 120),
      heading: 'Your plot map needs something from you',
      paragraphs: [`The plot map set-up for **${o.projectName}** is waiting on your team:`, `“${o.what}”`, 'The service clock is paused until this is done.'],
      cta: { label: 'Open the plot map', url: o.url },
    }),

  plot_map_published: (o: { orgName: string; projectName: string; url: string }) =>
    out(`Your plot map for ${o.projectName} is live`, {
      preheader: 'Your team can use it now; share the buyer link when you are ready.',
      heading: 'Your plot map is published',
      paragraphs: [
        `The approved plot map for **${o.projectName}** is now live for your team, with every plot showing its current status from your inventory.`,
        'Turn on the buyer link from the Plot map page whenever you are ready to share it.',
      ],
      cta: { label: 'Open the plot map', url: o.url },
    }),

  plot_map_delayed: (o: { orgName: string; projectName: string; stage: string; newDate: string; url: string }) =>
    out(`Update on your plot map for ${o.projectName}`, {
      preheader: `New expected date: ${day(o.newDate)}.`,
      heading: 'Your plot map is taking longer than planned',
      paragraphs: [
        `The **${o.stage}** step for **${o.projectName}** is taking longer than our usual service time. Sorry about that.`,
        `It is now expected by **${day(o.newDate)}**. You can follow progress on the Plot map page.`,
      ],
      cta: { label: 'See progress', url: o.url },
    }),
} as const
