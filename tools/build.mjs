#!/usr/bin/env node
/**
 * waasg.com page builder. Zero dependencies, Node 18+.
 *
 * The .html files in the repo root ARE the website. Vercel serves them as they are (no build step).
 * This script only rewrites the blocks between  <!-- gen:NAME -->  and  <!-- /gen:NAME -->  markers,
 * plus small inline price tags, so that shared things live in exactly one place:
 *
 *   pricing.json             prices, plan inclusions, terms, founding-client offer (on/off switch)
 *   tools/partials/*.html    the header and footer used on every page
 *   SITE and SERVICES below  business facts used in the structured data (JSON-LD)
 *   each page itself         its <title>, meta description, canonical URL, breadcrumb and FAQ
 *                            (social tags and JSON-LD are derived from these so they never drift)
 *   sitemap.xml              rebuilt from the pages
 *   tools/llms.template.txt  the source of /llms.txt; the public file is written without the gen: markers
 *
 * Usage:   node tools/build.mjs           update files in place
 *          node tools/build.mjs --check   change nothing; exit 1 if a file is out of date or a check fails
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

// ---------------------------------------------------------------------------------------------
// Business facts (structured data). Keep to what is true and public.
// ---------------------------------------------------------------------------------------------
const SITE = {
  origin: 'https://waasg.com',
  name: 'waa',
  alternateName: "Wu's Automation Agency",
  email: 'david@waasg.com',
  founder: 'David Wu',
  description:
    "waa (Wu's Automation Agency) is a founder-led AI marketing, SEO, GEO and automation agency based in Singapore. " +
    'It helps businesses get found on Google and cited in AI answers such as ChatGPT, Perplexity and Google AI Overviews, ' +
    'then automates the follow-up. Clients can be anywhere; work outside Singapore is remote. Photography is offered in Singapore only.',
  knowsAbout: [
    'Search engine optimization', 'Generative engine optimization', 'AI search visibility', 'AI marketing',
    'Local SEO', 'Google Business Profile', 'Structured data', 'Marketing automation', 'Business process automation',
    'Website development', 'Custom software', 'Commercial photography',
  ],
  logo: '/icon-512.png',
  image: '/assets/og.png',
};
const ORG_ID = `${SITE.origin}/#org`;
const SINGAPORE = { '@type': 'Country', name: 'Singapore' };
const WORLDWIDE = { '@type': 'Place', name: 'Worldwide (remote)' };

// One entry per service or audience page; `plans` attaches the matching retainer offers from pricing.json.
const SERVICES = {
  'ai-seo-geo': {
    name: 'AI SEO and GEO (generative engine optimization)',
    serviceType: 'Search engine optimization and generative engine optimization',
    description: 'Technical SEO, content, structured data, Google Business Profile care and AI-answer tracking, so a business is found on Google and cited by ChatGPT, Perplexity and Google AI Overviews.',
    plans: ['visibility', 'growth', 'automation-partner'],
  },
  growth: {
    name: 'AI marketing and growth',
    serviceType: 'Digital marketing',
    description: 'Content, landing pages, conversion improvements, review requests, email follow-up and readable tracking that turn search and AI visibility into enquiries.',
    plans: ['growth', 'automation-partner'],
  },
  automation: {
    name: 'Business and marketing automation',
    serviceType: 'Business process automation',
    description: 'Lead capture, follow-ups, client replies, reporting and data cleanup automated with the tools a business already uses. One-off builds or an ongoing retainer.',
    plans: ['automation-partner'],
  },
  'websites-software': {
    name: 'Websites and custom software',
    serviceType: 'Website design and development',
    description: 'Fast, accessible websites and small internal tools that search engines and AI answer engines can read. Quoted per project.',
    plans: [],
  },
  photography: {
    name: 'Business photography in Singapore',
    serviceType: 'Commercial photography',
    description: 'Food and menu, interiors and property, team and brand photography for websites, Google Business Profiles and listings. Singapore only. Quoted per shoot.',
    plans: [],
    singaporeOnly: true,
  },
  restaurants: {
    name: 'AI marketing, SEO and automation for multi-location restaurants',
    serviceType: 'Restaurant marketing',
    description: 'Location pages, Google Business Profiles, readable menus, review replies, AI-answer tracking and automations for restaurant groups with more than one location.',
    audience: 'Multi-location restaurant groups',
    plans: ['visibility', 'growth', 'automation-partner'],
  },
  'property-managers': {
    name: 'Marketing and automation for property management companies',
    serviceType: 'Property management marketing',
    description: 'Owner-lead SEO and GEO, plus automations around Buildium or AppFolio exports and integrations: owner updates, maintenance intake and leasing follow-ups.',
    audience: 'Property management companies using Buildium or AppFolio',
    plans: ['growth', 'automation-partner'],
  },
  singapore: {
    name: 'AI marketing, SEO, websites and photography for Singapore businesses',
    serviceType: 'Local SEO and digital marketing',
    description: 'Local SEO, Google Business Profile, AI-answer visibility, websites, automation and photography for Singapore businesses, from a Singapore-based founder.',
    audience: 'Singapore small and medium businesses',
    plans: ['visibility', 'growth', 'automation-partner'],
    singaporeOnly: true,
  },
  snapshot: {
    name: 'Free site snapshot',
    serviceType: 'Website, SEO and AI-visibility review',
    description: 'A free, plain-English review of how a business shows up on Google and in AI answers, how its site performs, and the three fixes to make first.',
    plans: [],
    free: true,
  },
};

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------
const pricing = JSON.parse(fs.readFileSync(path.join(ROOT, 'pricing.json'), 'utf8'));
const plansById = Object.fromEntries(pricing.plans.map((p) => [p.id, p]));
const founding = pricing.foundingOffer || { enabled: false };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => `${pricing.currencySymbol}${Number(n).toLocaleString('en-US')}`;
const foundingPrice = (plan) => Math.round(plan.price * (1 - founding.discountPercent / 100));
const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const textOf = (html) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
const jsonForScript = (data) => JSON.stringify(data, null, 2).replace(/</g, '\\u003c');
const problems = [];

function headValue(html, re) {
  const m = re.exec(html);
  return m ? decode(m[1]) : null;
}
function pageMeta(html) {
  return {
    title: headValue(html, /<title>([^<]*)<\/title>/),
    description: headValue(html, /<meta name="description" content="([^"]*)">/),
    canonical: headValue(html, /<link rel="canonical" href="([^"]*)">/),
    noindex: /<meta name="robots" content="[^"]*noindex/.test(html),
  };
}

// ---------------------------------------------------------------------------------------------
// Renderers for <!-- gen:NAME {args} --> blocks
// ---------------------------------------------------------------------------------------------
function planCards() {
  return [
    '<div class="plans">',
    ...pricing.plans.map((p) => [
      `  <article class="plan" id="${p.id}" aria-labelledby="plan-${p.id}">`,
      `    <h3 class="plan-name" id="plan-${p.id}">${esc(p.name)}</h3>`,
      `    <p class="plan-tagline">${esc(p.tagline)}</p>`,
      `    <p class="plan-price"><span class="amount">${money(p.price)}</span><span class="per">/month</span></p>`,
      founding.enabled
        ? `    <p class="plan-founding">Founding clients: ${money(foundingPrice(p))}/month for the first ${founding.months} months.</p>`
        : null,
      `    <p class="plan-best"><strong>Best for:</strong> ${esc(p.bestFor)}</p>`,
      '    <ul class="checks">',
      ...p.includes.map((item) => `      <li>${esc(item)}</li>`),
      '    </ul>',
      `    <a class="cta" href="/snapshot?plan=${p.id}">Start with ${esc(p.name)}</a>`,
      '  </article>',
    ].filter((l) => l !== null).join('\n')),
    '</div>',
  ].join('\n');
}

function planSummary() {
  return [
    '<ul class="plan-list">',
    ...pricing.plans.map((p) => [
      '  <li class="plan-mini">',
      `    <h3><a href="/pricing#${p.id}">${esc(p.name)}</a></h3>`,
      `    <p class="plan-price"><span class="amount">${money(p.price)}</span><span class="per">/month</span></p>`,
      `    <p>${esc(p.tagline)}</p>`,
      '  </li>',
    ].join('\n')),
    '</ul>',
  ].join('\n');
}

function foundingSentence() {
  return `The first ${founding.spots} retainer clients get ${founding.discountPercent}% off their first ${founding.months} months, in exchange for ${founding.ask}.`;
}

function foundingBanner() {
  if (!founding.enabled) return '';
  return [
    '<div class="founding">',
    '  <p class="founding-title">Founding-client offer</p>',
    `  <p>${esc(foundingSentence())} ${esc(founding.disclosure)}</p>`,
    '</div>',
  ].join('\n');
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);

function foundingLine() {
  if (!founding.enabled) return '';
  return `<p class="note"><strong>Founding-client offer:</strong> ${esc(lowerFirst(foundingSentence()))} ${esc(founding.disclosure)} <a href="/pricing">See pricing</a>.</p>`;
}

function foundingFaq() {
  if (!founding.enabled) return '';
  return [
    '<details class="qa">',
    '  <summary>Is there a discount for early clients?</summary>',
    '  <div class="qa-a">',
    `    <p>Yes, while it lasts. ${esc(foundingSentence())} ${esc(founding.disclosure)}</p>`,
    '  </div>',
    '</details>',
  ].join('\n');
}

function priceRange() {
  const prices = pricing.plans.map((p) => p.price);
  return `${money(Math.min(...prices))} to ${money(Math.max(...prices))} a month`;
}

function joinAnd(items) {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function pricingFaqAnswer() {
  const list = joinAnd(pricing.plans.map((p) => `${p.name} is ${money(p.price)} a month`));
  return `<p>${esc(list)}. ${esc(pricing.terms)} ${esc(pricing.projects)} The <a href="/snapshot">site snapshot</a> is free.</p>`;
}

function llmsPlans() {
  const lines = pricing.plans.map((p) => `- ${p.name}: ${money(p.price)} per month. ${p.summary} Best for: ${p.bestFor}`);
  lines.push(`- Terms: ${pricing.terms} ${pricing.billing}`);
  lines.push(`- Projects: ${pricing.projects}`);
  lines.push(`- Free site snapshot: ${SITE.origin}/snapshot (delivered within ${pricing.snapshotTurnaround}).`);
  if (founding.enabled) lines.push(`- Founding-client offer: ${lowerFirst(foundingSentence())} ${founding.disclosure}`);
  return lines.join('\n');
}

function offerNode(plan) {
  const url = `${SITE.origin}/pricing#${plan.id}`;
  return {
    '@type': 'Offer',
    '@id': url,
    name: `${plan.name} retainer`,
    description: plan.summary,
    url,
    price: plan.price,
    priceCurrency: pricing.currency,
    priceSpecification: {
      '@type': 'UnitPriceSpecification',
      price: plan.price,
      priceCurrency: pricing.currency,
      unitCode: 'MON',
      unitText: 'month',
      referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'MON' },
    },
    seller: { '@id': ORG_ID },
    itemOffered: {
      '@type': 'Service',
      name: `${plan.name}: ${plan.tagline.replace(/\.$/, '')}`,
      description: plan.includes.join('. ') + '.',
      provider: { '@id': ORG_ID },
    },
  };
}

function snapshotOffer() {
  return {
    '@type': 'Offer',
    '@id': `${SITE.origin}/snapshot#offer`,
    name: 'Free site snapshot',
    url: `${SITE.origin}/snapshot`,
    price: 0,
    priceCurrency: pricing.currency,
    seller: { '@id': ORG_ID },
  };
}

function faqItems(html) {
  const items = [];
  const re = /<details class="qa"[^>]*>\s*<summary>([\s\S]*?)<\/summary>\s*<div class="qa-a">([\s\S]*?)<\/div>\s*<\/details>/g;
  let m;
  while ((m = re.exec(html))) items.push({ q: textOf(m[1]), a: textOf(m[2]) });
  return items;
}

function breadcrumbs(html, canonical) {
  const m = /<nav class="crumbs" aria-label="Breadcrumb">([\s\S]*?)<\/nav>/.exec(html);
  if (!m) return null;
  const crumbs = [];
  const re = /<li>\s*<a href="([^"]+)">([\s\S]*?)<\/a>\s*<\/li>|<li aria-current="page">([\s\S]*?)<\/li>/g;
  let c;
  while ((c = re.exec(m[1]))) {
    if (c[1]) crumbs.push({ name: textOf(c[2]), url: new URL(c[1], SITE.origin).href });
    else crumbs.push({ name: textOf(c[3]), url: canonical });
  }
  return crumbs;
}

function jsonLd(html, args) {
  const meta = pageMeta(html);
  const url = meta.canonical;
  const graph = [];
  const org = {
    '@type': ['Organization', 'ProfessionalService'],
    '@id': ORG_ID,
    name: SITE.name,
    alternateName: SITE.alternateName,
    url: `${SITE.origin}/`,
    email: SITE.email,
    description: SITE.description,
    logo: SITE.origin + SITE.logo,
    image: SITE.origin + SITE.image,
    founder: { '@id': `${SITE.origin}/#founder` },
    address: { '@type': 'PostalAddress', addressLocality: 'Singapore', addressCountry: 'SG' },
    areaServed: [SINGAPORE, WORLDWIDE],
    knowsAbout: SITE.knowsAbout,
    priceRange: priceRange(),
    contactPoint: { '@type': 'ContactPoint', contactType: 'sales', email: SITE.email, availableLanguage: ['English'], areaServed: [SINGAPORE, WORLDWIDE] },
  };
  if (args.catalog) {
    org.hasOfferCatalog = {
      '@type': 'OfferCatalog',
      name: 'waa monthly retainers',
      itemListElement: pricing.plans.map(offerNode),
    };
  }
  graph.push(org);
  graph.push({ '@type': 'Person', '@id': `${SITE.origin}/#founder`, name: SITE.founder, jobTitle: 'Founder', worksFor: { '@id': ORG_ID } });
  graph.push({ '@type': 'WebSite', '@id': `${SITE.origin}/#website`, url: `${SITE.origin}/`, name: SITE.name, alternateName: SITE.alternateName, inLanguage: 'en', publisher: { '@id': ORG_ID } });

  const faqs = faqItems(html);
  const crumbs = breadcrumbs(html, url);
  const pageType = args.type || 'WebPage';
  const page = {
    '@type': faqs.length ? [pageType, 'FAQPage'] : pageType,
    '@id': `${url}#webpage`,
    url,
    name: meta.title,
    description: meta.description,
    inLanguage: 'en',
    isPartOf: { '@id': `${SITE.origin}/#website` },
    about: { '@id': ORG_ID },
    primaryImageOfPage: { '@type': 'ImageObject', url: SITE.origin + (args.image || SITE.image) },
  };
  if (crumbs) page.breadcrumb = { '@id': `${url}#breadcrumb` };
  if (faqs.length) {
    page.mainEntity = faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } }));
  }
  graph.push(page);
  if (crumbs) {
    graph.push({
      '@type': 'BreadcrumbList',
      '@id': `${url}#breadcrumb`,
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
    });
  }
  if (args.service) {
    const s = SERVICES[args.service];
    if (!s) throw new Error(`Unknown service "${args.service}" in gen:jsonld`);
    const service = {
      '@type': 'Service',
      '@id': `${url}#service`,
      name: s.name,
      serviceType: s.serviceType,
      description: s.description,
      url,
      provider: { '@id': ORG_ID },
      areaServed: s.singaporeOnly ? SINGAPORE : [SINGAPORE, WORLDWIDE],
    };
    if (s.audience) service.audience = { '@type': 'BusinessAudience', audienceType: s.audience };
    const offers = s.free ? [snapshotOffer()] : s.plans.map((id) => offerNode(plansById[id]));
    if (offers.length) service.offers = offers;
    graph.push(service);
  }
  return ['<script type="application/ld+json">', jsonForScript({ '@context': 'https://schema.org', '@graph': graph }), '</script>'].join('\n');
}

function social(html, args) {
  const meta = pageMeta(html);
  const image = SITE.origin + (args.image || SITE.image);
  const alt = args.imageAlt || "waa (Wu's Automation Agency): AI marketing, SEO, GEO and automation. Founder-led and based in Singapore.";
  return [
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="waa">',
    '<meta property="og:locale" content="en_SG">',
    `<meta property="og:url" content="${esc(meta.canonical)}">`,
    `<meta property="og:title" content="${esc(meta.title)}">`,
    `<meta property="og:description" content="${esc(meta.description)}">`,
    `<meta property="og:image" content="${esc(image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    `<meta property="og:image:alt" content="${esc(alt)}">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${esc(meta.title)}">`,
    `<meta name="twitter:description" content="${esc(meta.description)}">`,
    `<meta name="twitter:image" content="${esc(image)}">`,
    `<meta name="twitter:image:alt" content="${esc(alt)}">`,
  ].join('\n');
}

function partial(name, html) {
  let out = fs.readFileSync(path.join(ROOT, 'tools', 'partials', `${name}.html`), 'utf8').trimEnd();
  out = out.replace(/\{\{year\}\}/g, String(new Date().getFullYear()));
  const canonical = pageMeta(html).canonical;
  if (canonical) {
    const here = new URL(canonical).pathname;
    out = out.replace(new RegExp(`<a href="${here.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"(?=[ >])`, 'g'), `<a href="${here}" aria-current="page"`);
  }
  return out;
}

const RENDERERS = {
  header: (html) => partial('header', html),
  footer: (html) => partial('footer', html),
  'plan-cards': planCards,
  'plan-summary': planSummary,
  'founding-banner': foundingBanner,
  'founding-line': foundingLine,
  'founding-faq': foundingFaq,
  'pricing-faq-answer': pricingFaqAnswer,
  'llms-plans': llmsPlans,
  social,
  jsonld: jsonLd,
};
// social and jsonld read the finished page, so they run after everything else.
const LATE = new Set(['social', 'jsonld']);

function renderBlocks(html, { late }) {
  const re = /([ \t]*)<!-- gen:([a-z-]+)((?: \{.*?\})?) -->[\s\S]*?<!-- \/gen:\2 -->/g;
  return html.replace(re, (whole, indent, name, rawArgs) => {
    if (LATE.has(name) !== late) return whole;
    const render = RENDERERS[name];
    if (!render) throw new Error(`Unknown block gen:${name}`);
    const args = rawArgs.trim() ? JSON.parse(rawArgs.trim()) : {};
    const body = render(html, args);
    const inner = body ? body.split('\n').map((l) => (l ? indent + l : l)).join('\n') + '\n' : '';
    return `${indent}<!-- gen:${name}${rawArgs} -->\n${inner}${indent}<!-- /gen:${name} -->`;
  });
}

// Inline tags such as <span data-plan="growth" data-field="price">US$1,800</span>
function renderInline(html) {
  html = html.replace(/(<(span|strong) data-plan="([a-z-]+)" data-field="([a-z-]+)">)([^<]*)(<\/\2>)/g, (w, open, tag, id, field, _old, close) => {
    const p = plansById[id];
    if (!p) throw new Error(`Unknown plan "${id}"`);
    const value = { name: p.name, price: money(p.price), 'per-month': `${money(p.price)}/month`, tagline: p.tagline, 'founding-price': money(foundingPrice(p)) }[field];
    if (value === undefined) throw new Error(`Unknown plan field "${field}"`);
    return open + esc(value) + close;
  });
  return html.replace(/(<(span|strong) data-pricing="([a-z-]+)">)([^<]*)(<\/\2>)/g, (w, open, tag, field, _old, close) => {
    const value = {
      terms: pricing.terms,
      billing: pricing.billing,
      projects: pricing.projects,
      turnaround: pricing.snapshotTurnaround,
      from: money(Math.min(...pricing.plans.map((p) => p.price))),
      range: priceRange(),
    }[field];
    if (value === undefined) throw new Error(`Unknown pricing field "${field}"`);
    return open + esc(value) + close;
  });
}

function build(html) {
  let out = renderInline(html);
  out = renderBlocks(out, { late: false });
  out = renderBlocks(out, { late: true });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Checks: catch broken pages before they ship
// ---------------------------------------------------------------------------------------------
function checkPage(file, html, pages) {
  const meta = pageMeta(html);
  const where = path.basename(file);
  if (!meta.title) problems.push(`${where}: missing <title>`);
  if (!meta.noindex) {
    if (!meta.description) problems.push(`${where}: missing meta description`);
    if (!meta.canonical || !meta.canonical.startsWith(SITE.origin)) problems.push(`${where}: canonical must start with ${SITE.origin}`);
  }
  const h1s = html.match(/<h1[\s>]/g) || [];
  if (h1s.length !== 1) problems.push(`${where}: expected exactly one <h1>, found ${h1s.length}`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { problems.push(`${where}: JSON-LD does not parse (${e.message})`); }
  }
  const targets = new Set([...html.matchAll(/\s(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]));
  for (const target of targets) {
    if (target.startsWith('//')) continue;
    const [pathPart, hash] = target.split('#');
    const clean = pathPart.split('?')[0];
    const candidates = clean === '/' ? ['index.html'] : [clean.slice(1), `${clean.slice(1)}.html`];
    const found = candidates.find((c) => c && fs.existsSync(path.join(ROOT, c)) && fs.statSync(path.join(ROOT, c)).isFile());
    if (!found) { problems.push(`${where}: broken internal link ${target}`); continue; }
    if (hash && found.endsWith('.html')) {
      const targetHtml = pages.get(found) ?? fs.readFileSync(path.join(ROOT, found), 'utf8');
      if (!new RegExp(`\\sid="${hash}"`).test(targetHtml)) problems.push(`${where}: link ${target} points to a missing #${hash}`);
    }
  }
  const visible = textOf(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''));
  if (/\b(WAA|Waa)\b/.test(visible)) problems.push(`${where}: the brand must be written "waa" (lowercase)`);
  // .eyebrow text is shown in capitals by the stylesheet, which would turn "waa" into "WAA".
  if (/<p class="eyebrow">[^<]*\bwaa\b/i.test(html)) problems.push(`${where}: don't put "waa" in an eyebrow label (it is shown in capitals)`);
}

// ---------------------------------------------------------------------------------------------
// Sitemap (canonical URLs of indexable pages; lastmod from git, or today for uncommitted edits)
// ---------------------------------------------------------------------------------------------
function lastModified(file) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const rel = path.relative(ROOT, file);
    const dirty = execFileSync('git', ['status', '--porcelain', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (dirty) return today;
    const date = execFileSync('git', ['log', '-1', '--format=%cs', '--', rel], { cwd: ROOT, encoding: 'utf8' }).trim();
    return date || today;
  } catch {
    return today;
  }
}

function sitemap(pages) {
  const entries = [...pages.entries()]
    .map(([name, html]) => ({ name, meta: pageMeta(html) }))
    .filter((p) => !p.meta.noindex && p.meta.canonical)
    .sort((a, b) => (a.meta.canonical === `${SITE.origin}/` ? -1 : b.meta.canonical === `${SITE.origin}/` ? 1 : a.meta.canonical.localeCompare(b.meta.canonical)));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map((p) => `  <url><loc>${p.meta.canonical}</loc><lastmod>${lastModified(path.join(ROOT, p.name))}</lastmod></url>`),
    '</urlset>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------------------------
const htmlFiles = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).sort();
const pages = new Map();
const changed = [];
for (const f of htmlFiles) {
  const file = path.join(ROOT, f);
  const before = fs.readFileSync(file, 'utf8');
  const after = build(before);
  pages.set(f, after);
  if (after !== before) changed.push({ file, after });
}
// /llms.txt is written from tools/llms.template.txt. The template keeps the gen: markers (with nothing between
// them); the public file gets the generated text without the markers.
const llmsTemplate = path.join(ROOT, 'tools', 'llms.template.txt');
if (fs.existsSync(llmsTemplate)) {
  const file = path.join(ROOT, 'llms.txt');
  const before = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const after = renderBlocks(fs.readFileSync(llmsTemplate, 'utf8'), { late: false })
    .replace(/^[ \t]*<!-- \/?gen:[a-z-]+(?: \{.*?\})? -->\n/gm, '');
  if (after !== before) changed.push({ file, after });
}
for (const [f, html] of pages) checkPage(f, html, pages);

const sitemapFile = path.join(ROOT, 'sitemap.xml');
const sitemapNew = sitemap(pages);
const sitemapOld = fs.existsSync(sitemapFile) ? fs.readFileSync(sitemapFile, 'utf8') : '';
// Ignore lastmod-only differences in --check mode (dates depend on when you commit).
const stripDates = (s) => s.replace(/<lastmod>[^<]*<\/lastmod>/g, '');
if (CHECK ? stripDates(sitemapNew) !== stripDates(sitemapOld) : sitemapNew !== sitemapOld) changed.push({ file: sitemapFile, after: sitemapNew });

if (CHECK) {
  for (const c of changed) problems.push(`${path.relative(ROOT, c.file)} is out of date: run node tools/build.mjs`);
} else {
  for (const c of changed) fs.writeFileSync(c.file, c.after);
  console.log(changed.length ? `Updated: ${changed.map((c) => path.relative(ROOT, c.file)).join(', ')}` : 'Everything was already up to date.');
}
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log(`Checked ${pages.size} pages: OK. Founding-client offer is ${founding.enabled ? 'ON' : 'OFF'}.`);
