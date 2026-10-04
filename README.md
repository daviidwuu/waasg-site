# waasg.com

The website of **waa** (Wu's Automation Agency), Singapore. It is plain HTML and CSS with two small scripts, deployed by Vercel straight from this repo. There is no build step on Vercel: every push to `main` goes live.

## What's where

| Path | What it is |
|---|---|
| `index.html`, `services.html`, `pricing.html`, … | The pages. Each file is a complete page. `pricing.html` is served at `/pricing` (clean URLs, set in `vercel.json`). |
| `assets/site.css` | The one stylesheet for every page. |
| `assets/snapshot.js` | Runs only on `/snapshot`. It turns the free-snapshot form into an email to david@waasg.com and shows how many characters are left in the notes box. |
| `assets/menu.js` | Lets the Escape key close the phone menu. Loaded on every page through the header. |
| `pricing.json` | **All prices and plan details, plus the on/off switch for the founding-client offer.** |
| `tools/build.mjs` | Fills in the generated blocks: header, footer, prices, social tags, structured data, `sitemap.xml` and `llms.txt`. |
| `tools/partials/` | The header and footer shared by every page. |
| `tools/og-image.html` | Template for the share images in `assets/` (instructions inside). |
| `tools/llms.template.txt` | The source of `llms.txt`. Edit this file, not `llms.txt`, then run the build. |
| `robots.txt`, `sitemap.xml`, `llms.txt` | For search engines and AI answer engines. The build writes `sitemap.xml` and `llms.txt`. |
| `vercel.json` | Clean URLs, redirects and security headers. |
| `.vercelignore` | Keeps `README.md`, `pricing.json` and `tools/` off the public site. |

## Editing a page

1. Edit the text in the page's `.html` file directly.
2. Leave the blocks between `<!-- gen:NAME -->` and `<!-- /gen:NAME -->` alone: they are generated.
3. Run `node tools/build.mjs`. It needs Node 18 or newer and nothing to install.

The build refreshes the generated blocks. It also checks for:
- broken internal links;
- a missing title, description or canonical URL;
- JSON-LD that doesn't parse;
- "waa" written with capitals.

`node tools/build.mjs --check` runs the same checks without changing anything.

To change the header or footer, edit `tools/partials/header.html` or `tools/partials/footer.html`, then run the build.

## Changing prices or plans

1. Edit `pricing.json`. Prices are monthly amounts in US dollars.
2. Run `node tools/build.mjs`.
3. Commit everything that changed.

Prices appear on the home page, the pricing page, the service and audience pages, the FAQ answers, the structured data and `llms.txt`. The build updates all of them from `pricing.json`.

## Founding-client offer (on/off)

In `pricing.json`, set `"enabled": false` inside `"foundingOffer"`, then run the build. That removes the offer everywhere it appears:
- the banner;
- the founding prices on the plan cards;
- the FAQ entry;
- the note on `/snapshot`;
- the `llms.txt` line.

Set it back to `true` to bring it back.

## Adding a page

1. Copy a similar page.
2. Change its `<title>`, `<meta name="description">`, `<link rel="canonical">`, breadcrumb and content.
3. Run the build. It adds the page to `sitemap.xml`.

For a new service page, also add an entry to `SERVICES` in `tools/build.mjs` and use `<!-- gen:jsonld {"service":"your-key"} -->` in the page's `<head>`.

## Previewing locally

Run `npx serve .` and open http://localhost:3000. `serve` resolves clean URLs such as `/pricing` the same way Vercel does.

## Analytics and third-party scripts

None are installed. The Content-Security-Policy in `vercel.json` only allows files from this site, and no inline scripts or styles.

- **Vercel Web Analytics** is served from this site's own domain, so it works with the policy as it is. Turn it on in the Vercel dashboard, then add `<script defer src="/_vercel/insights/script.js"></script>` to the `<head>` of every page. Leave out the small inline `window.va` snippet from Vercel's guide: the policy blocks inline scripts, and page views are counted without it.
- **Anything from another domain** (other analytics, embeds, fonts) needs that domain added to the matching directive in the policy. Otherwise the browser blocks it.
- **Before adding any analytics**, update two pages that would otherwise say something untrue:
  - the "You're looking at an example" panel in `websites-software.html`, which says the site has "no tracking scripts";
  - `privacy.html`, which says the site sets no cookies and runs no tracking scripts, and that it will say so before that changes.

## Images

- **Adding photos to a page** (for example from a shoot):
  - Save web-sized copies in `assets/`, at most about 1600 px wide, as WebP or JPEG.
  - Always give each image `width`, `height` and `alt`, so the page doesn't jump while it loads and screen readers can describe it.
  - Add `loading="lazy"` to every image except one at the very top of a page.
  - Example: `<img src="/assets/dining-room.webp" width="1600" height="1067" alt="Dining room with window seating" loading="lazy" decoding="async">`
- `assets/og.png` and `assets/og-snapshot.png` are the share images. They are rendered from `tools/og-image.html`.
- The icons (`favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`) were made from the waa wordmark logo, which is kept outside this repo. They show the white wordmark centred on black.

## History

The first version (June 2026) was a single concept page.
