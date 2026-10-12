# DESIGN.md — Stemma

Plagiarism-detection tool for colleges. Students join classes, submit work, and read similarity reports. Accounts are institution-issued.

Format follows the Stitch DESIGN.md spec. This file is the visual contract; `CLAUDE.md` holds the craft/review rules.

---

## 1. Visual Theme & Atmosphere

Dark-locked, editorial-technical. The page is near-black ink with a large structural lattice motif drawn behind content — the logo's interlock logic scaled up to architecture. Serif headings give it an academic register; mono labels keep it credible as software. Not a marketing surface: no heroes, no gradients-as-decoration, no illustration.

Density: moderate. Generous on entry screens (login), tighter on report and roster views where scanning matters.

Glass is a **badge material**, not a container style — it appears only where something needs to read as a mark or a state.

---

## 2. Color Palette & Roles

| Semantic name | Hex | Role |
|---|---|---|
| Ink | `#101216` | Page base, all surfaces |
| Vermilion | `#FF5A2B` | Primary accent — lattice strokes, focus, primary CTA |
| Vermilion light | `#FF6B3D` | Accent on dark glass: step numbers, small marks |
| Grey | `#4A5058` | Secondary lattice strokes, hairlines, dividers |
| Bone | `#F7F4EE` | Primary text |
| Bone 66% | `rgba(247,244,238,0.66)` | Body copy |
| Bone 55% | `rgba(247,244,238,0.55)` | Mono eyebrows, meta |
| Bone 18% | `rgba(247,244,238,0.18)` | Glass borders |

**One accent, page-wide.** Vermilion is the only hue. No second accent for status, no colored badges outside the verdict phase-states.

Verdict phase-states derive from the logo's three states — they are the one sanctioned place for varied treatment, and they vary by *lattice phase and opacity*, not by new hues.

---

## 3. Typography Rules

| Family | Use | Notes |
|---|---|---|
| Mentarika | Wordmark only | Self-hosted from `mentarika.ttf` via `@font-face` in the helmet. Cap height is small for its em, so set it larger than the mark beside it. |
| Familjen Grotesk | All UI headings | 500 weight, `letter-spacing: -0.012em` to `-0.018em` |
| Instrument Sans | Body, UI, inputs, buttons | 400–600 |
| Newsreader | Document/essay text rendered *inside* the product | The login background field, report bodies. Never a UI heading. |
| JetBrains Mono | Labels, join codes, percentages, counts, timestamps | uppercase + `0.14–0.16em` tracking for eyebrows |

Caveat: **Mentarika** must be declared with `@font-face` in the helmet of every screen that uses it, or the wordmark falls back to Instrument Serif. Its free version is a personal-use demo, so purchase a commercial licence before launch. Young Serif was trialled as a replacement and rejected.

Hierarchy:

| Token | Size | Family |
|---|---|---|
| Wordmark | 78px login / 35px app bar | Mentarika |
| Page heading | 37px | Familjen Grotesk 500 |
| Section heading | 26px | Familjen Grotesk 500 |
| Body | 15.5–16px / 1.6 | Instrument Sans |
| Document field | 15px / 1.76 | Newsreader |
| Field label | 11px, uppercase, 0.14em | JetBrains Mono |
| Eyebrow | 11px, uppercase, 0.16em | JetBrains Mono |

Never set numbers or codes in a serif. Never set a UI heading in the mono or in Newsreader.

---

## 4. Component Stylings

**Glass surface (badges, pills, chips, login card)**
```
border: 1px solid rgba(247,244,238,0.18);
background: linear-gradient(150deg, rgba(247,244,238,0.16), rgba(247,244,238,0.05) 48%, rgba(247,244,238,0.11));
box-shadow: inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -1px 0 rgba(255,255,255,0.07), inset 0 0 24px rgba(0,0,0,0.20);
backdrop-filter: blur(18–26px) saturate(180%);
```
Blur 18px at badge scale, 22px at title-pill scale, 26px at card scale. Glass carries **no accent wash at all** — depth comes from the specular insets and the inner floor only. A trailing-edge vermilion wash was tried across the title pills and user pills and removed: against a warm background field it read as overkill. Never a radial blob behind the glass either; clipped by the pill it reads as a band. Needs a solid-fill fallback under `prefers-reduced-transparency`.

**Buttons** — primary is vermilion fill with ink label (passes AA); secondary is a bone hairline stroke on ink. `:active` gets `translateY(1px)`. Labels 1–3 words, one line at desktop, one label per intent across the whole product.

**Inputs** — 12px radius, ink-tinted fill, bone hairline border, vermilion focus ring. Label **above** (mono, 11px), error **below** (inline, never a toast). No placeholder-as-label.

**Radius system** — pills/chips full-radius · cards 20–24px · inputs 12px. No other values.

---

## 5. Layout Principles

CSS Grid, `gap` over margins. Full-height panels use `100dvh`, never `100vh`.

The login page's right panel carries a **document field**: faint columns of essay prose set in Newsreader at `rgba(247,244,238,0.17)`, with matched passages picked out in `rgba(255,122,80,0.40)` (colour only, no underline). It bleeds past the top and bottom edges. A soft radial scrim sits beneath the login card so its backdrop blur picks up ink rather than smearing the accent.

Cards only where elevation means real hierarchy — otherwise hairlines or space. A grid has exactly as many cells as there is content.

Mobile collapse is declared explicitly per multi-column section at `<768px`.

---

## 6. Depth & Elevation

Three levels only:

1. **Panels** — stepped ink surfaces (`#101216` left, `#13151a` right) divided by hairlines. Depth from surface value.
2. **Scrim** — flat or radial gradient, restores text contrast and protects the glass blur.
3. **Glass** — the only elevated material, and only for marks and states.

No drop shadows on ink. Depth comes from surface value, blur and inset specular highlights, not cast shadows.

---

## 7. Do's and Don'ts

**Do** — keep one accent, one theme, one radius system, one copy register per screen. Build loading (skeletons shaped like the result), empty (says how to fill it), error (inline), and success states every time. Motion only when it communicates hierarchy, sequence, feedback, or state change; `transform` and `opacity` only; honour `prefers-reduced-motion`.

**Don't** — no light-mode section, ever. No glass as a general container. No second accent. No 3D/WebGL ornament. No hand-drawn SVG illustration as filler. No invented precise numbers — real, labelled mock, or gone. Max 1 mono eyebrow per 3 sections. No emoji. No decorative em-dashes in UI copy. No font that isn't web-loaded and licensed for commercial use.

---

## 8. Responsive Behavior

Breakpoints 640 / 768 / 1024 / 1280. Touch targets never below 44px.

The login split (lattice + steps left, card right) collapses at `<1024px` to card-only with the lattice as background; the three-step timeline moves below the card. At `<768px` everything is single-column, 24px gutters.

---

## 9. Agent Prompt Guide

Quick reference: ink `#101216` · vermilion `#FF5A2B` / `#FF6B3D` · grey `#4A5058` · bone `#F7F4EE`.

Prompt template:

> Build `<screen>` for Stemma. Dark ink base, single vermilion accent, stepped ink panels divided by hairlines. Mentarika wordmark, Familjen Grotesk headings, Instrument Sans body, JetBrains Mono for labels and numbers. Glass only for badges, chips, and state marks. Grid layout, gap spacing, explicit mobile collapse. Include loading, empty, and error states.
