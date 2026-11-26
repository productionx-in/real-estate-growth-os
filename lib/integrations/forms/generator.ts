// lib/integrations/forms/generator.ts
// Generates clean, responsive embed codes and integration snippets for customer project websites.

import { appUrl } from '@/lib/site/urls'
import type { FormEmbedOptions } from './types'

export interface EmbedSnippets {
  scriptTag: string
  iframe: string
  apiFetch: string
}

export function generateFormEmbedSnippets(options: FormEmbedOptions): EmbedSnippets {
  // The customer pastes this into their website, so it must point at this deployment (lib/site/urls.ts).
  const baseUrl = (options.appUrl || appUrl() || '').replace(/\/$/, '')
  const title = options.formTitle || 'Enquire Now'
  const button = options.buttonText || 'Schedule Site Visit'
  const projectParam = options.projectId ? ` data-project-id="${options.projectId}"` : ''
  const projectQuery = options.projectId ? `&projectId=${options.projectId}` : ''

  // 1. Script Tag Embed (Responsive inline widget)
  const scriptTag = `<!-- RE Enquiry Form Embed -->
<div id="productionx-enquiry-form" data-connection-id="${options.connectionId}"${projectParam} data-title="${title}" data-button="${button}"></div>
<script src="${baseUrl}/forms/embed.js" async defer></script>`

  // 2. iframe Embed (Sandbox isolation)
  const iframe = `<!-- RE Enquiry Form iframe -->
<iframe
  src="${baseUrl}/forms/view?connectionId=${options.connectionId}${projectQuery}"
  width="100%"
  height="540"
  frameborder="0"
  style="border: none; border-radius: 8px; width: 100%; max-width: 480px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);"
  title="${title}"
></iframe>`

  // 3. Custom REST API JavaScript Fetch Snippet
  const apiFetch = `// Direct REST API Submission
const response = await fetch('${baseUrl}/api/forms/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    connectionId: '${options.connectionId}',${options.projectId ? `\n    projectId: '${options.projectId}',` : ''}
    name: 'Customer Name',
    phone: '+919876543210',
    email: 'customer@example.com',
    unitPreference: '3 BHK Apartment',
    scheduleSiteVisit: true,
    utmSource: new URLSearchParams(window.location.search).get('utm_source'),
    utmCampaign: new URLSearchParams(window.location.search).get('utm_campaign'),
    pageUrl: window.location.href,
    referrer: document.referrer,
    formLoadTime: Date.now(),
  }),
});
const result = await response.json();`

  return { scriptTag, iframe, apiFetch }
}
