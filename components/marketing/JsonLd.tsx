// components/marketing/JsonLd.tsx — schema.org structured data for the public website.
// Every URL comes from lib/site/urls.ts (no domain in code). Only facts we can stand behind: no ratings, reviews,
// awards, customer counts or prices (packages are not final). FAQPage markup is deliberately not emitted: search
// engines restrict FAQ rich results to authoritative government and health sites, so the FAQs stay as visible content.
import { COMPANY_NAME, PRODUCT_DESCRIPTOR, PRODUCT_NAME } from '@/lib/brand'
import { absolute, siteUrl } from '@/lib/site/urls'

type Json = Record<string, unknown>

const url = (path: string) => absolute(path, siteUrl())
const ORG_ID = () => `${url('/')}#organization`
const SITE_ID = () => `${url('/')}#website`
const APP_ID = () => `${url('/')}#software`

/** Serialises safely inside <script>: a "<" in content can never close the tag. */
export function JsonLd({ data }: { data: Json | Json[] }) {
  const graph = { '@context': 'https://schema.org', '@graph': Array.isArray(data) ? data : [data] }
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(graph).replace(/</g, '\\u003c') }} />
}

export function organizationJsonLd(): Json {
  return {
    '@type': 'Organization', '@id': ORG_ID(), name: COMPANY_NAME, url: url('/'),
    brand: { '@type': 'Brand', name: PRODUCT_NAME },
  }
}

export function websiteJsonLd(): Json {
  return { '@type': 'WebSite', '@id': SITE_ID(), name: PRODUCT_NAME, url: url('/'), inLanguage: 'en-IN', publisher: { '@id': ORG_ID() } }
}

export function softwareApplicationJsonLd(): Json {
  return {
    '@type': 'SoftwareApplication', '@id': APP_ID(), name: PRODUCT_NAME, alternateName: PRODUCT_DESCRIPTOR,
    applicationCategory: 'BusinessApplication', applicationSubCategory: 'Real estate CRM and sales operations software',
    operatingSystem: 'Web browser; installable web app on Android and iOS',
    description: `${PRODUCT_NAME} is a ${PRODUCT_DESCRIPTOR.toLowerCase()} for real estate developers and channel partner agencies: lead management, sales teams, projects and property inventory, site visits, bookings and channel partner workflows in one platform.`,
    audience: { '@type': 'BusinessAudience', audienceType: 'Real estate developers, builders and channel partner agencies in India' },
    publisher: { '@id': ORG_ID() }, url: url('/'),
  }
}

export function webPageJsonLd(p: { path: string; name: string; description: string; about?: string }): Json {
  return {
    '@type': 'WebPage', '@id': `${url(p.path)}#webpage`, url: url(p.path), name: p.name, description: p.description,
    inLanguage: 'en-IN', isPartOf: { '@id': SITE_ID() }, about: { '@id': APP_ID() },
    ...(p.about ? { keywords: p.about } : {}),
  }
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]): Json {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: url(it.path) })),
  }
}

export function articleJsonLd(a: { path: string; headline: string; description: string; datePublished: string; dateModified?: string }): Json {
  return {
    '@type': 'Article', '@id': `${url(a.path)}#article`, headline: a.headline, description: a.description,
    datePublished: a.datePublished, dateModified: a.dateModified ?? a.datePublished, inLanguage: 'en-IN',
    mainEntityOfPage: { '@id': `${url(a.path)}#webpage` },
    author: { '@id': ORG_ID() }, publisher: { '@id': ORG_ID() }, about: { '@id': APP_ID() },
  }
}
