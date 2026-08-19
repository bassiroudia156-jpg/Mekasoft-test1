# Phase 8 — Team & Account Settings — Banani → izikit/MekaSoft

## Source
- Banani screens (7, cached dump, domain J "Team & Account Settings"):
  - `ChangePasswordModal` + `PasswordChangedConfirmation`
  - `EditProfileModal` + `EditProfileModal_next1` ("Profile Updated Confirmation")
  - `SettingsPage` + `SettingsPage_next1` (identical content — one canonical page)
  - `EditShopSettingsPage`
- `TeamManagementModal`/`AddTeamMemberModal` already shipped in Phase 3 — not re-touched here except where `ManagerProfilePanel` composes them.
- Fetched/read: 2026-08-17.

## The real gap this phase closes

`ManagerProfilePanel.tsx` (mounted on all 6 authenticated list pages) has hardcoded
placeholder identity (`firstName = 'Moussa'`, `lastName = 'Diallo'`, …) and two
callback props (`onChangePassword`, `onEditField`) that **no caller in the app
supplies** — every "Changer le mot de passe" / pencil-icon button has been a
no-op since the panel was first built. `Sidebar`'s bottom account block has the
identical problem (`userName = 'Mon compte'`, `userRole = 'Gérant'` defaults,
never overridden by any of its 16 call sites). Same species of bug as the
`href="#"` Sidebar nav fixed in Phase 6 — a component built with an intentional
integration seam nothing ever filled in. Closing it is the actual point of this
phase; the 4 new screens are secondary.

## Structure map

- **`GET /api/auth/me`** (extend) — add `name`, `phone`, `avatarUrl`,
  `organizationId`, `orgRole`, `jobTitle` to the response by selecting the
  caller's first `OrganizationMember` row in the same query (no second
  round-trip). This becomes the single source of truth `AuthContext` already
  fetches once per session — `Sidebar` and `ManagerProfilePanel` read it via
  `useAuth()` instead of each doing their own fetch.
- **`PATCH /api/auth/me`** (new) — `{ name?, phone? }`, CSRF + `requireAuth`.
  Powers `EditProfileModal`. Avatar is set separately (see below).
- **`GET /api/organizations`** (extend) — add the shop-detail fields to each
  org summary (existing consumers only destructure `id`/`slug`/`name`/`role`,
  so this is additive).
- **`PATCH /api/organizations`** (new, same file) — acts on the caller's own
  org via `requireCallerOrg('ADMIN')` (no `[id]` — matches the app's implicit
  org-scoping convention). Powers `EditShopSettingsPage`.
- **`POST /api/upload`** (existing, untouched) — reused for avatar photo
  upload; the returned `url` is PATCHed into `User.avatarUrl` via a 3rd,
  narrower PATCH body variant on the same `/api/auth/me` route (`{ avatarUrl }`,
  string or `null` to remove).
- **`ManagerProfilePanel`** (rewrite) — drops `firstName`/`lastName`/`email`/
  `phone`/`role`/`lastLoginLabel`/`onChangePassword`/`onEditField` props
  entirely; self-derives everything from `useAuth()`; internally manages
  `ChangePasswordModal`/`EditProfileModal` open state exactly the way it
  already manages `LogoutConfirmModal`/`TeamManagementModal`.
- **`Sidebar`** (rewrite) — becomes a client component, drops `userName`/
  `userRole` props, self-derives display name/avatar/role from `useAuth()`.
  Gains `'settings'` to `SidebarActiveKey` + a nav entry (Banani's flow reaches
  Settings from the profile panel, not the main nav, but every other resource
  has a permanent nav slot and Settings deserves the same discoverability).
- **`ChangePasswordModal`** (new component) — form/confirmation two-view
  modal, `Modal` primitive. Branches on `user.hasPassword`.
- **`EditProfileModal`** (new component) — form/confirmation two-view modal.
  Prénom/Nom split display of `User.name`.
- **`/settings`** (rewrite — a generic pre-Banani stub already lives here,
  see Decision 8) — Compte / Sécurité / Atelier sections.
- **`/settings/shop`** (new page) — `EditShopSettingsPage`.

## Domain model additions

```prisma
model User {
  // ...
  phone String? // E.164 — editable via PATCH /api/auth/me (EditProfileModal)
}

model Organization {
  // ... existing phone/city reused for "Téléphone de l'atelier"/"Ville"
  street       String? // matches Client.street naming
  postalCode   String?
  country      String? @default("Sénégal") // matches Client.country default
  taxId        String? // "Numéro SIRET" — matches Client's Company taxId naming
  siren        String? // "Numéro SIREN"
  contactEmail String? // shop's own email, distinct from the owner's login email
  hoursWeekday  String? @default("07h00 - 18h00")
  hoursSaturday String? @default("08h00 - 14h00")
  hoursSunday   String? @default("Fermé")
}
```

## Decisions

1. **`ManagerProfilePanel`/`Sidebar` self-fetch via `useAuth()`, not props.**
   Mirrors the existing `TeamManagementModal`/`LogoutConfirmModal` internal-
   state pattern already in `ManagerProfilePanel`. Zero call-site churn for
   `Sidebar`'s 16 usages (none currently pass `userName`/`userRole`).
2. **Org role/jobTitle piggybacks on `/api/auth/me`** instead of a second
   fetch — one extra `select` on the existing query, avoids adding a
   render-blocking network call to every page load just to label a sidebar
   role.
3. **`ChangePasswordModal` copy corrected vs. Banani's literal text.** The
   real `PUT /api/auth/change-password` re-issues cookies for the *current*
   session (only other sessions die on their next request) — Banani's mock
   says "Vous serez déconnecté" / primary action "Se reconnecter", which is
   false for this backend. Confirmation copy says "vos autres sessions ont
   été déconnectées"; primary action is "Retour au tableau de bord".
4. **Password requirements checklist trimmed to what the backend actually
   enforces.** Real policy is `AUTH_PASSWORD_MIN_LENGTH` (default 10) + a
   banned-list check + optional HIBP — no uppercase/digit/special-char rule
   exists server-side. Showing Banani's literal 4-item complexity checklist
   would advertise rules that aren't real; the static hint shows "10
   caractères minimum" + "évitez les mots de passe trop courants", and any
   live rejection still surfaces the server's real error message.
5. **`hasPassword` branch reuses `POST /api/auth/set-password`** for OAuth-
   only accounts (no current-password field, no lockout-relevant compare) —
   this collapses the *already-shipped* generic `/settings` page's
   change/set-password branching into the modal, so no functionality is lost
   in the rewrite.
6. **2FA row is informational only, no "Activer" button.** No 2FA
   infrastructure exists in this starter. Matches the established "no dead
   UI" precedent (Phase 6 Sidebar fix, Phase 7 payment row-menu) — drop
   actionable affordances with no real destination, keep the informational
   state ("Non activée").
7. **Upgrade-to-Pro banner dropped entirely**, not just de-buttoned. Unlike
   the 2FA row, it carries no real state about the user's account — it's a
   pure marketing CTA to a page (domain K `UpgradePlansPage`) explicitly
   deferred and not scheduled. An informational row with real data left in
   place is one thing; a promo banner whose only content is a dead button is
   just dead UI with extra steps.
8. **`/settings` is rewritten, not net-new.** A generic pre-Banani stub
   already lives at this route (plain gray Tailwind, no Sidebar/layout,
   password change + Google-link only). Its two real, working flows
   (change/set-password branching, Google OAuth linking) are preserved and
   *relocated* into the new Banani-styled page — password change moves into
   `ChangePasswordModal`, Google-link becomes a third row in the "Sécurité"
   section (no Banani screen shows it, but it's real shipped functionality
   with nowhere else to live, and the row-based Sécurité layout fits it
   without inventing a new section).
9. **Shop settings require `ADMIN`+ org role.** `requireCallerOrg('ADMIN')` on
   the `PATCH`, and the "Modifier l'atelier" entry points (both on `/settings`
   and the `/settings/shop` page itself) are hidden/redirect for `MEMBER`
   callers — editing the workshop's legal/contact identity is not a plain-
   member action, and showing a form that 403s on submit would itself be
   dead UI.
10. **Avatar: `UserAvatar` gains an optional `src`.** It currently always
    renders initials (deliberate substitution for Banani's stock-photo mock,
    documented in the component). Real upload only matters if the result is
    visible — extending it with an optional real `<img>` (falling back to
    initials when absent) is required for the upload flow to mean anything,
    and is additive/safe for all existing callers (no one passes `src` yet,
    including Google-OAuth users whose real `avatarUrl` has silently gone
    unused since Phase 1).
11. **Email is read-only everywhere in this phase.** No re-verification flow
    exists for changing a verified login email; Banani's own `EditProfileModal`
    already renders Email as non-interactive. Out of scope, not a gap.
12. **Prénom/Nom split is a display convenience over the single `User.name`
    column** — join on submit (`${firstName} ${lastName}`.trim()), split on
    load by the first space. No schema change for this (mirrors how `Client`
    already stores one `name` while some forms collect first/last — precedent,
    not new).

## Implementation checklist

- [ ] Prisma: `User.phone`, `Organization` shop fields — migrate (stop dev
      server first, Windows EPERM precedent)
- [ ] `GET/PATCH /api/auth/me` — extend + new PATCH
- [ ] `GET/PATCH /api/organizations` — extend + new PATCH (`requireCallerOrg('ADMIN')`)
- [ ] `AuthContext`'s `User` type — add `name`/`phone`/`avatarUrl`/`organizationId`/`orgRole`/`jobTitle`
- [ ] `src/lib/roleLabel.ts` — shared `orgRoleLabel(orgRole, jobTitle)` helper
- [ ] `UserAvatar` — optional `src` prop
- [ ] `ChangePasswordModal` — new component
- [ ] `EditProfileModal` — new component (incl. avatar upload wiring)
- [ ] `ManagerProfilePanel` — rewire to `useAuth()`, drop dead props, mount the two new modals
- [ ] `Sidebar` — rewire to `useAuth()`, drop `userName`/`userRole` props, add `settings` nav entry
- [ ] `/settings` — rewrite (Compte/Sécurité incl. Google-link row/Atelier)
- [ ] `/settings/shop` — new page
- [ ] Verification gate: typecheck/lint/format/test/build
- [ ] `e2e-phase8.mjs` against real dev server + Neon, then delete
- [ ] `STATUS.md` + `IMPLEMENTATION-PLAN.md` updates

## Open questions for user

None blocking — all resolved from code evidence + established project
precedent (see Decisions above). Proceeding.
