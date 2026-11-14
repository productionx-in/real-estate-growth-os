// lib/integrations/whatsapp/templates.ts
// Approved WhatsApp message template management and parameter formatting.

import type { WhatsAppTemplateAsset } from '@/lib/integrations/types'

export interface RenderedTemplateMessage {
  templateName: string
  language: string
  components: Array<{
    type: string
    parameters: Array<{
      type: 'text' | 'image' | 'document' | 'video'
      text?: string
      image?: { link: string }
      document?: { link: string; filename?: string }
    }>
  }>
}

/**
 * Validates whether a template is approved and ready for outbound messaging.
 */
export function validateTemplateForSending(template: WhatsAppTemplateAsset): {
  valid: boolean
  error?: string
} {
  if (template.status !== 'APPROVED') {
    return {
      valid: false,
      error: `Template '${template.name}' is ${template.status}. Only APPROVED templates can be sent.`,
    }
  }

  if (!template.components || template.components.length === 0) {
    return {
      valid: false,
      error: `Template '${template.name}' does not have any components defined.`,
    }
  }

  return { valid: true }
}

/**
 * Renders template parameters replacing {{1}}, {{2}} with concrete lead and project values.
 */
export function renderTemplateMessage(
  template: WhatsAppTemplateAsset,
  variables: {
    customerName?: string
    projectName?: string
    developerName?: string
    siteVisitDate?: string
    brochureUrl?: string
    customParams?: string[]
  }
): RenderedTemplateMessage {
  const bodyParams: Array<{ type: 'text'; text: string }> = []

  // Default ordering: {{1}} customerName, {{2}} projectName, {{3}} developerName
  if (variables.customParams && variables.customParams.length > 0) {
    for (const val of variables.customParams) {
      bodyParams.push({ type: 'text', text: val })
    }
  } else {
    if (variables.customerName) bodyParams.push({ type: 'text', text: variables.customerName })
    if (variables.projectName) bodyParams.push({ type: 'text', text: variables.projectName })
    if (variables.siteVisitDate) bodyParams.push({ type: 'text', text: variables.siteVisitDate })
  }

  const components: RenderedTemplateMessage['components'] = [
    {
      type: 'body',
      parameters: bodyParams,
    },
  ]

  if (variables.brochureUrl) {
    components.push({
      type: 'header',
      parameters: [
        {
          type: 'document',
          document: {
            link: variables.brochureUrl,
            filename: `${variables.projectName || 'Project'}_Brochure.pdf`,
          },
        },
      ],
    })
  }

  return {
    templateName: template.name,
    language: template.language || 'en',
    components,
  }
}

/**
 * Standard illustrative real estate message templates.
 */
export const STANDARD_REAL_ESTATE_TEMPLATES: WhatsAppTemplateAsset[] = [
  {
    id: 'tpl_site_visit_confirm_v1',
    name: 'site_visit_confirmation',
    language: 'en',
    status: 'APPROVED',
    category: 'UTILITY',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Site Visit Confirmed - {{1}}',
      },
      {
        type: 'BODY',
        text: 'Hello {{1}}, your site visit for {{2}} has been confirmed for {{3}}. Our sales executive will guide your tour.',
      },
      {
        type: 'FOOTER',
        text: 'Production X Real Estate OS',
      },
      {
        type: 'BUTTONS',
      },
    ],
  },
  {
    id: 'tpl_brochure_delivery_v1',
    name: 'project_brochure_delivery',
    language: 'en',
    status: 'APPROVED',
    category: 'MARKETING',
    components: [
      {
        type: 'HEADER',
        format: 'DOCUMENT',
      },
      {
        type: 'BODY',
        text: 'Dear {{1}}, thank you for your interest in {{2}}. Please find the official project e-brochure and floor plans attached.',
      },
      {
        type: 'FOOTER',
        text: 'Reply STOP to unsubscribe.',
      },
    ],
  },
]
