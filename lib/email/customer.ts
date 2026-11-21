// lib/email/customer.ts — the e-mails REGrow sends to a workspace's owners and admins about their account.
// Plain, specific and short: what happened, what it means, the one thing to do next. Built on the shared layout
// (lib/email/layout.ts), so every message looks the same and has a text version. No business data from the
// workspace (leads, buyers) ever goes into these e-mails.
import { renderEmail } from '@/lib/email/layout'

export type CustomerEmailKind = 'welcome' | 'trial_ending' | 'trial_ended' | 'invoice_issued' | 'payment_received' | 'payment_failed' | 'workspace_state'

export interface Rendered { subject: string; html: string; text: string }

const inr = (cents: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(cents / 100)
const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
const out = (subject: string, c: Parameters<typeof renderEmail>[0]): Rendered =>
  ({ subject, ...renderEmail({ reason: 'You received this because you own or manage a REGrow workspace.', ...c }) })

export const customerEmails = {
  welcome: (o: { orgName: string; url: string }) =>
    out(`Your REGrow workspace "${o.orgName}" is ready`, {
      preheader: 'Three steps to your first leads in REGrow.',
      heading: `Welcome to REGrow, ${o.orgName}`,
      paragraphs: [
        'Your workspace is ready. Three steps get you to your first leads:',
        '**1. Connect a lead source** — Meta, Google, your website form or a portal, under Integrations.',
        '**2. Invite your team** — add your salespeople under Team, so new leads reach them straight away.',
        '**3. Add a project** — so every lead is tied to the right project and inventory.',
        'Questions? Tap the parrot in the corner of any page, or reply to this e-mail.',
      ],
      cta: { label: 'Open your workspace', url: o.url },
    }),

  trial_ending: (o: { orgName: string; endsAt: string; daysLeft: number; url: string }) =>
    out(o.daysLeft <= 1 ? `Your REGrow trial ends tomorrow` : `Your REGrow trial ends in ${o.daysLeft} days`, {
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
    out(`Your REGrow trial has ended`, {
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
    out(`Invoice ${o.invoiceNumber} from REGrow — ${inr(o.amountCents)}`, {
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
      cta: { label: o.to === 'deactivated' ? 'Contact REGrow' : 'Open your workspace', url: o.url },
    })
  },
} as const
