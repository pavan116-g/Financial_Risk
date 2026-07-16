# UI/UX Design System // RiskWatch

Companion to [`design.md`](design.md) (architecture/API/DB) — this document covers the **visual design system**: layout, typography, color tokens, components, theming, and motion. It reflects the CSS as it currently stands in [`public/css/style.css`](public/css/style.css) (User Terminal Portal) and [`public/css/admin.css`](public/css/admin.css) (Presenter SOC Console).

---

## 1. Two Surfaces, Two Layout Systems

| Surface | Route | Shell | Breakpoint behavior |
|---|---|---|---|
| **User Terminal Portal** | `/` | A centered "phone" frame (`.device`, max-width 430px) | Below 431px: full-bleed mobile view. Above 431px: the phone frame renders centered with rounded corners (36px), a drop shadow, and a fixed 850px height, like a device mockup on a desktop background. |
| **Presenter SOC Console** | `/admin` | A CSS grid dashboard (`.dash { grid-template-columns: 240px 1fr }`) — fixed sidebar + scrollable main pane | Desktop-only by design: `#desktopGate` fullscreen-blocks any viewport under the narrow threshold with a "rotate your device" style message rather than attempting a responsive dashboard layout. |

This split is deliberate: the portal is what an audience member hands-holds during a live session; the console is what a presenter runs on a laptop/projector.

---

## 2. Typography

Three type families, loaded once via Google Fonts (`Space+Grotesk`, `Inter`, `IBM+Plex+Mono`), each with a fixed role:

| Family | Role | Where |
|---|---|---|
| **Inter** | Base body copy | `html, body` default in both stylesheets |
| **Space Grotesk** | UI chrome — headings, labels, buttons, nav, table headers, pills | Default theme and Matrix theme |
| **IBM Plex Mono** | Terminal/hacker voice | Was loaded but unused until the "Impossible" theme — now the *entire* UI switches to it when that theme is active (see §4) |

Sizing is small and dense throughout (0.65rem–1.8rem), consistent with a "console readout" feel rather than a marketing page — the largest text on either surface is the KPI value (1.8rem) and the auth hero heading (1.65rem).

---

## 3. Color System (Design Tokens)

Both stylesheets define the same token set as CSS custom properties, scoped to `:root` (default) and overridden per-theme via a `body.theme-*` class. Components never hardcode theme colors — they consume `var(--token)`, which is what makes theme-switching a single class toggle.

```
--bg              page/app background
--surface          card / panel background
--surface-2        hover / active / elevated surface
--border           default hairline border
--border-focus     focus ring + active border (= --accent in every theme)
--text             primary text
--text-dim         secondary/muted text
--accent           brand color — buttons, links, active nav, glows
--accent-light     lighter accent — used for text on dark surfaces
--accent-gradient  135° gradient, accent → darker accent — primary buttons
--danger / --danger-light   High-severity semantic color
--medium           Medium-severity semantic color
--safe             positive/success semantic color
--radius           global corner radius — also a personality knob (see below)
```

### Theme values

| Token | Default (`:root`) | Matrix (`.theme-matrix`) | Impossible (`.theme-impossible`) |
|---|---|---|---|
| `--bg` | `#09090b` | `#030704` | `#030303` |
| `--surface` | `#18181b` | `rgba(10,20,13,.7)` | `#120f10` |
| `--accent` | `#8b5cf6` (violet) | `#00ff66` (green) | `#ff1428` (red) |
| `--accent-light` | `#a78bfa` | `#86efac` | `#ff5c6c` |
| `--radius` | `14px` | `8px` | `3px` |

The `--radius` progression (14 → 8 → 3) is intentional: each theme gets visually "sharper" as the tone gets more tactical — soft SaaS product → hacker terminal → military HUD.

**Severity colors are theme-stable by design.** `.severity-tag.High` and `.pill.High` use a hardcoded `rgba(239, 68, 68, …)` background/border in every theme (only the *text* color pulls from `var(--danger-light)`, which does shift per theme). This keeps "this is a High-severity item" instantly recognizable regardless of which theme is active, rather than a red badge blending into an already-red Impossible theme.

---

## 4. Theming Architecture

Three themes, one mechanism, applied identically on both surfaces:

1. A `body.theme-<name>` class swaps every CSS variable at once.
2. `initTheme()` (portal) / `initAdminTheme()` (console) in the respective JS file reads a `localStorage` key (`rw_theme` / `rw_theme_admin`), applies the matching class on load, and defaults to **Impossible** if nothing is stored.
3. Clicking the theme-toggle button cycles `vercel → matrix → impossible → vercel`, persists the choice, and relabels the button (`Theme` / `Matrix` / `IMF`).
4. Chart.js grid-line colors on the admin dashboard are re-derived on every theme change via `getThemeGridColor()` so the radar chart doesn't visually clash with the new palette.

| Theme | Personality | Font | Signature details |
|---|---|---|---|
| **Vercel** (default violet) | Clean SaaS product | Space Grotesk / Inter | Soft 14px radius, subtle violet glow on hover/focus |
| **Matrix** | Green hacker-cinema | Space Grotesk / Inter | 8px radius, green glow on card hover/open |
| **Impossible** (IMF) | Movie-hacker / spy-thriller terminal | IBM Plex Mono, everywhere | See below |

### Impossible theme — signature effects
This theme goes beyond a palette swap into full art direction:
- **CRT scanlines** — a repeating 3px horizontal-line overlay across the whole device frame (`.device::before`)
- **Scanning beam** — a soft red gradient band that sweeps top-to-bottom on a 6s loop (`.device::after`, `@keyframes impossibleScan`)
- **HUD targeting-reticle corners** — red corner brackets on every card (`.risk-card::before/::after`), brightening on hover/open like a scanner locking on
- **Glitch flicker** — the brand wordmark randomly RGB-splits/jitters every ~5s (`@keyframes impossibleGlitch`)
- **Blinking terminal cursor** — a `_` after the operator session name (`@keyframes impossibleBlink`)
- **Terminal prompts** — `>` prefix injected before action links (`EXPAND THREAT DOSSIER`, etc.)
- **Neon pulse** — the primary CTA button's glow breathes on a 2.2s loop
- **Faint red grid** — a 16px background grid behind each card, circuit-board style

None of this is present in the other two themes — they're intentionally calmer, so the effort is concentrated where it earns the "cool hacking movie UI" reaction.

---

## 5. Component Inventory

### User Terminal Portal (`style.css`)
- **Auth screen** — centered form, `.field` label+input pairs, gradient `.btn-primary`, sign-in/sign-up switch link
- **Risk card feed** (`.risk-card`) — icon + title + severity pill, collapsed by default, expands in place to reveal `.risk-detail` and a `.risk-stats` progress bar ("Defense Coverage")
- **Locked state** (`.risk-card.locked`) — 45% opacity, disabled cursor, used during Presenter Focus Lock (see `design.md` §4A)
- **Severity pills** (`.severity-tag.High` / `.Medium`) — semantic, theme-stable color (§3)
- **Theme toggle button** — top-right of the header, alongside "End Session"

### Presenter SOC Console (`admin.css`)
- **Sidebar nav** (`.nav-item`) — flat list, `.active` state gets the accent gradient fill
- **KPI tiles** (`.kpi`) — label + large value, one per stat
- **Panels** (`.panel`) — bordered containers for charts/tables
- **Data table** (`.tbl-scroll` + sticky first column) — used for the Threat Vector Matrix and the Access Logs/Operators directory
- **Modal** (`.modal` / `.modal-content`) — centered dialog with blurred backdrop, slide-in entrance (`modalSlide`), used for the Operator Dossier popup
- **Operator badges** (`.operator-badge`) — small pill showing who has interacted with the focused threat vector

Both surfaces share the same `.btn-primary`, `.field`, `.theme-toggle-btn`, and `.pill`/`.severity-tag` patterns — intentional visual continuity between the audience-facing and presenter-facing screens.

---

## 6. Motion & Interaction

- **Global transition** — every element transitions `background-color`, `border-color`, `transform`, and `box-shadow` over 0.2s ease (`* { transition: ... }`), so theme switches and hover states never feel abrupt.
- **Card hover** — lift + scale (`translateY(-3px) scale(1.01)`) plus a theme-colored glow shadow.
- **Card press** — scale down slightly (`scale(0.99)`) for tactile feedback.
- **Button press** — `.btn-primary:active { transform: scale(0.98) }`.
- **Modal entrance** — `cubic-bezier(0.16, 1, 0.3, 1)` slide/scale-in, a springy "ease-out-back" feel.
- **Impossible-theme-only animations** — glitch, scan sweep, blink, neon pulse (§4) are gated entirely behind that theme class; the other two themes have no idle/looping animation, keeping them calmer for extended presentation use.

---

## 7. Iconography

No icon font/SVG sprite system for content icons — risk cards use plain emoji (🚔 📈 💳 🎣 💰 📱 🪪 💼 🔒 🔁) sized via `font-size` inside a bordered circular container (`.risk-icon`). This keeps the bundle dependency-free and gives each threat category an instantly scannable glyph. The one custom SVG asset is the `#riskDial` logo mark, reused at different sizes across the auth hero, header brand, and admin sidebar.

---

## 8. Known Gaps / Follow-ups

- **No `prefers-reduced-motion` handling.** The Impossible theme's glitch/scan/pulse loops run unconditionally — worth gating behind a media query if this is ever used with photosensitive audiences.
- **Contrast on `--text-dim`** hasn't been audited against WCAG AA on the Matrix theme's translucent surface colors (`rgba(10,20,13,.7)` over near-black can get close to the 4.5:1 line depending on backdrop blur).
- **`design.md`'s existing "Design & Aesthetic Systems" section (§2) is stale** — it documents an older cyan/emerald palette that predates the current violet/matrix/impossible token set. Worth reconciling so the two docs don't disagree.
