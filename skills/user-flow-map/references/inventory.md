# Inventory: find every page, action, user type, and system actor

The map is only as true as this inventory. Read code, not docs: existing flow
docs, READMEs, and marketing copy go stale. Note every place where they
disagree with the code, because the user will want those findings.

## Repository mode (preferred)

### Where pages and guards live

| Stack | Pages / routes | Access rules |
| --- | --- | --- |
| Next.js App Router | `app/**/page.tsx`, `app/**/route.ts` | `middleware.ts`, `layout.tsx` redirects, server-action checks |
| Next.js Pages Router | `pages/**` | `getServerSideProps` redirects, middleware |
| Remix / React Router 7 | `app/routes/**` | `loader` redirects |
| SvelteKit | `src/routes/**/+page.svelte` | `hooks.server`, `+layout.server` |
| Nuxt | `pages/**` | `middleware/`, `definePageMeta` |
| Rails | `config/routes.rb` | `before_action`, Pundit/CanCan policies |
| Django | `urls.py` | `login_required`, permission decorators |
| Laravel | `routes/web.php` | route middleware, policies |
| Express / Fastify | router files | auth middleware per route |
| SPA (React Router, Vue Router) | router config | route guards, `RequireAuth` wrappers |

### What to capture

- **User types:** anonymous, signed in, plan or tier flags, roles (admin,
  owner, editor), invite or share tokens, gift or referral recipients. Find
  them in auth middleware, role checks (`isAdmin`, role enums, policies),
  and billing flags.
- **Per page:** who can reach it, every action on it (buttons, forms, server
  actions, dialogs), and where each action leads: a route, a dialog, an
  external page such as Stripe Checkout, or a toast.
- **Decision points:** the auth gate, out of credits, paywalls, success and
  failure branches, server redirects for signed-in users.
- **System actors:** webhooks (Stripe, payment, shipping, auth), scheduled
  jobs, queues and workers, AI or other external APIs, and email senders.
  - **Check that each job is scheduled:** wrangler `triggers.crons`,
    `vercel.json` crons, Kubernetes `CronJob`, a GitHub Actions `schedule`,
    an external scheduler. A cron route with no trigger is not a flow.
  - **Check that each email template is sent:** find its call site.
- **Model facts:** sign-in methods, free allowances, prices, what a paid user
  gets that a free user does not.
- **Unreachable code:** actions with no UI, retired products, dead links.

### Explorer briefs (run in parallel with subagents)

Replace the bracketed parts. Ask for terse output so the briefs return
conclusions, not file dumps.

**Brief A: customer flows**

```text
Repo: [path]. Read-only. Search breadth: very thorough.
Goal: an accurate, current inventory of every customer-facing user flow, for a
user flow diagram. [Existing doc X] may be stale; trust the code.
Pages live in [paths]; access rules in [middleware / guards].
Cover these user types, and tell me if the code has others: [anonymous visitor
(including each entry point: referral, share, invite, SEO pages), signed-in
free user, paying user, invitee or recipient].
For each route: who can reach it, every user action on it, and where each
action leads (route, dialog, external page, toast). Note decision points.
Also: sign-in methods, the free/paid model and prices, purchase flows end to end,
share and invite flows, settings and account actions, support.
Output (under ~1200 words, terse bullets, no code):
- USER TYPES
- ROUTES: one line each: `route — access — actions → destinations`
- FLOWS: 6–10 named flows as `step → step` with [decision branches]
- MODEL FACTS
- WHERE THE DOCS ARE WRONG
Cite file paths for anything non-obvious.
```

**Brief B: admin and system actors**

```text
Repo: [path]. Read-only. Search breadth: very thorough.
Goal: inventory the admin flows and the non-human actors, for a user flow diagram.
Part A, admin: how admin access is decided; for each admin page, what the admin
sees and every action they can take, and what each action triggers.
Part B, system actors: each webhook, scheduled job (and whether it really has a
scheduler), queue or worker, AI or external API, and email. For each:
trigger → effect → what the user sees.
Part C: how a customer reaches support, and how that reaches an admin.
Output (under ~900 words, terse bullets, no code):
- ADMIN ACCESS RULE
- ADMIN PAGES: `route — sees — actions → effect`
- SYSTEM ACTORS: `actor — trigger → effect → user-visible result`
- EMAILS: event → email (and templates that are never sent)
- BUILT BUT UNREACHABLE
Cite file paths for anything non-obvious.
```

## Website mode (no code)

Use a browser tool, such as agent-browser or Playwright.

1. Read `sitemap.xml` and `robots.txt`, then collect the links in the header,
   footer, and navigation.
2. Visit each page. Record its route, its heading, and every button, link, and
   form, with where each one leads.
3. Sign in only with test accounts that the user gives you, one per role they
   want mapped. Never submit real payments. Stop at the payment page and record
   it as the step to the payment provider.
4. Watch network requests to name third-party services: payment, auth,
   analytics, chat. These become cards in a System or External lane.
5. Mark what you cannot see as unknown: webhooks, crons, admin pages, emails.
   Do not invent backstage steps. Say in the delivery what a code-based map
   would add.

## Hand-off to the model step

Before writing the data file, list:

- **Lanes:** access zones, top to bottom.
- **Actors:** user types plus system, each with a colour.
- **Cards:** route, name, and up to 5 actions, grouped by lane.
- **Flows:** title, who, a two-line description, and steps in the form
  `from → to (actor): label`.
- **Leave-outs:** unreachable code and doc drift, to report to the user.
