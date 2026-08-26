# Landing Page + Terms of Use + Privacy Policy — Banani → Next.js

## Source
- `83o75a2tYyMD/screens/LandingPage.jsx` (desktop, screenSize: desktop)
- `83o75a2tYyMD/screens/LandingPageMobile.jsx` (mobile, screenSize: mobile)
- `83o75a2tYyMD/screens/TermsOfUse.jsx` (desktop only — no mobile variant fetched)
- `83o75a2tYyMD/screens/PrivacyPolicy.jsx` (desktop only — no mobile variant fetched)
- Fetched: 2026-08-17

## Decisions confirmed with user (batched question, all answered)
1. `/` is replaced by the real landing page (was an unconditional `redirect('/login')`). `/login` stays reachable via nav CTA.
2. An already-authenticated visitor landing on `/` is redirected to `/dashboard` (isolated client-side effect, doesn't force the whole page into a client component — see architecture below).
3. Both pricing-card CTAs ("Starter"/"Pro") route to `/signup`, no plan-tier distinction — the app has no billing/subscription system, this is decorative marketing copy for v1.
4. The two Banani `<Image prompt="...">` slots (Banani-only AI-image mock, not usable in real code) are replaced by one reusable abstract "dashboard mockup" built from Tailwind shapes in the brand palette — no external image dependency.

## Structure map
Both LandingPage.jsx and LandingPageMobile.jsx are **full separate mockups** of the same page (not one desktop file with a mobile companion diff) — same 10 sections, same copy, different layout/density. Merged into ONE responsive component per section, mobile classes unprefixed, `lg:` layers the desktop treatment (Banani's desktop breakpoint reference ~1024px+, matches project's existing `lg:` convention seen in dashboard.tsx's `flex-col lg:flex-row`).

Sections (nav → hero → problem → solution → product showcase → how it works → why mekasoft → pricing → faq → final cta → footer):
1. **Nav** — mobile: logo + single "Commencer" button. Desktop: logo + 4 anchor links (Fonctionnalités/Comment ça marche/Tarifs/FAQ) + "Se connecter" + "Commencer gratuitement". Genuinely different DOM, not just resized — built as one component with `hidden lg:flex` / `lg:hidden` halves.
2. **Hero** — badge + h1 + p + CTA, product mockup. Mobile: stacked column. Desktop: 2-col grid.
3. **Problem** — 3 cards, `grid-cols-1 lg:grid-cols-3`.
4. **Solution** — 4 feature cards, `grid-cols-1 lg:grid-cols-2`.
5. **Product showcase** — bullet list + mockup, mirrors hero's 2-col pattern, on `bg-secondary`.
6. **How it works** — 3 numbered steps. Mobile: vertical row layout + vertical connector. Desktop: centered column layout + horizontal dashed connector. Real structural difference, not just spacing — connectors are two separate elements toggled by breakpoint visibility.
7. **Why MekaSoft** — 4 benefit cards, `grid-cols-1 lg:grid-cols-4` (mobile is 1-col per Banani's own mobile source, not 2-col).
8. **Pricing** — 2 cards (Starter outline / Pro dark-filled "Populaire" badge), `grid-cols-1 lg:grid-cols-2`.
9. **FAQ** — 5 Q&A rows with a "+" icon. Banani's static mock renders all answers already visible (no real toggle exists in a design tool export) — built as a **real accordion** instead (collapsed by default, click toggles, icon rotates 45° open/closed) since a permanently-inert "+" reads as broken, same "no dead affordance" call made repeatedly elsewhere in this project.
10. **Final CTA** — centered, on `bg-primary`.
11. **Footer** — mobile: 2 columns (Produit, Légal) + brand blurb. Desktop: 4 columns (brand, Produit, Entreprise, Légal). The "Entreprise" column (À propos/Contact) has no destination anywhere in the app or Banani flow — "À propos" renders as plain non-clickable text, "Contact" links to `mailto:support@mekasoft.com` (reusing the address already in the Terms copy) rather than shipping dead links.

Terms/Privacy: nav (desktop-only variant reused, no mobile nav fetched for these — mobile-first responsive treatment designed by me, same nav merge pattern as the landing page) + a single content column (`max-w-3xl`), numbered sections, no footer (Banani's own screens stop at a one-line copyright, no full footer block — respected exactly, not padded out with the marketing footer).

## Component breakdown
- **NEW** `components/marketing/PublicNav.tsx` — shared nav, used by `/`, `/terms`, `/privacy` (3 occurrences). Server component (no state) — anchor links are plain `<Link href="/#slug">`, "Se connecter" → `/login`, "Commencer (gratuitement)" → `/signup`.
- **NEW** `components/marketing/ProductPreview.tsx` — abstract dashboard mockup (mini sidebar strip + top bar + stat-card row + bar-chart shapes, all brand tokens, no image asset). Used twice on the landing page (hero, product showcase).
- **NEW** `components/marketing/FaqAccordion.tsx` — `'use client'`, the only stateful piece of the landing page, isolated so `app/page.tsx` itself stays a server component.
- **NEW** `components/marketing/AuthRedirect.tsx` — `'use client'`, renders nothing, calls `useAuth()` and redirects to `/dashboard` once resolved+authenticated. Isolated client leaf so the rest of `/` stays static-prerenderable.
- **NEW** `components/marketing/LegalContent` pattern — Terms/Privacy don't share a component (each is genuinely distinct numbered-list copy), but both reuse `PublicNav` and the same `max-w-3xl` content shell inline.
- Reused: `Icon` (dynamic lucide lookup, already handles every icon name this flow needs).
- Not reused: the in-app `Button` primitive (`components/ui/Button.tsx`) — its hardcoded `rounded-sm` + `sm|md` padding scale is tuned for the dense authenticated app chrome and doesn't match Banani's marketing-page button spec (`rounded-md`, larger paddings, e.g. `px-8 py-3`). Forcing an override via `className` risks silently corrupting a shared, reused-everywhere primitive for one page's sake. Marketing CTAs are plain `<Link>`/`<button>` styled directly per Banani's exact classes instead.

## Token mapping (Banani → project)
Banani's own `/style.css` tokens for this flow are already 1:1 identical to `frontend/src/app/globals.css` (same flow, same design system already ported in Phase 0) — no new token mapping needed, direct class reuse (`bg-background`, `text-primary`, `border-border`, etc. already exist).

## Responsive plan
- **Base (375px, unprefixed)**: LandingPageMobile.jsx's exact markup/copy/spacing (`px-4`, `py-12`, `flex-col`, `text-xs`/`text-sm`/`text-2xl`).
- **lg (1024px+)**: LandingPage.jsx's exact desktop spec layered on top (`px-12`, `py-20`, `grid-cols-2/3/4`, `text-3xl`/`text-4xl`/`text-5xl`). No `sm`/`md`/`xl` breakpoints needed — Banani only shipped 2 discrete layouts (mobile/desktop), not a fluid multi-step scale, so mirroring exactly 2 breakpoints (base + `lg:`) is the faithful translation rather than inventing intermediate steps Banani never designed.
- Terms/Privacy: same base/lg pattern for the nav (shared component) and copyright line; the content column itself (`max-w-3xl`, numbered `h2`/`p`/`ul` blocks) needs no real breakpoint changes beyond padding (`px-4 py-10 lg:px-12 lg:py-16`) since Banani's own desktop version is already a comfortably-narrow single reading column.

## Interactions / state
- FAQ rows: click toggles expand/collapse, icon rotates (`plus` → rotated 45° reads as an "×"), `aria-expanded` on the button, answer in a `<div role="region">`.
- Nav links: standard hover/focus states inherited from browser defaults + Tailwind `hover:` where Banani implied it (buttons darken slightly, matching every other CTA in the app via existing token opacity conventions like `hover:bg-primary/90`).
- Touch targets: mobile CTA buttons are full-width `py-2.5`+ (≥48px tap height), nav mobile button ≥44px.

## Copy / i18n
All French, copied verbatim from the Banani source (no `constants.ts` file exists in this project — French strings live inline in JSX throughout the codebase already, e.g. every existing page; matching that established convention rather than introducing a new i18n layer for one feature).

## Implementation checklist
- [x] Plan written, decisions confirmed with user
- [x] `PublicNav`, `ProductPreview`, `FaqAccordion`, `AuthRedirect` components
- [x] `app/page.tsx` rewritten (was `redirect('/login')`)
- [x] `app/terms/page.tsx` (new)
- [x] `app/privacy/page.tsx` (new)
- [x] Structural verification via curl (no browser/screenshot tool available in this environment — see STATUS.md dated section for what was checked and why it's a reasonable substitute here)
- [x] `pnpm typecheck` / `lint` / `format` / `test` / `build` — all green (one bug found+fixed: `unlock` → `lock-open`, see STATUS.md)
- [x] `STATUS.md` domain A updated

## Open questions for user
None outstanding — the 4 ambiguous points were batched and answered before implementation started (see "Decisions confirmed" above).
