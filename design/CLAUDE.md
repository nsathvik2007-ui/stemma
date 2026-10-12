# Stemma — project instructions

## Locked identity decisions (do not drift)
- **Mark:** lattice-interlock, 13px strokes, three phase states for AI verdicts.
- **Palette:** ink `#101216` base, vermilion `#FF5A2B` / `#FF6B3D` accent, grey `#4A5058`, bone `#F7F4EE` text. One accent, page-wide. Dark theme only, locked.
- **Type:** Mentarika for the wordmark only (see caveat below). **Familjen Grotesk** for headings. Instrument Sans for body/UI. JetBrains Mono for labels, codes, numbers. Newsreader is reserved for *document/essay text* rendered inside the product (the login background field, report bodies) — never for UI headings.
- **Mentarika caveat.** Self-hosted from `mentarika.ttf` via `@font-face` in the helmet of every screen that shows the wordmark — forget this and the wordmark silently falls back to Instrument Serif, which is what went wrong on Home. It renders correctly now. Still outstanding: the free version is a personal-use-only demo with ~191 basic-Latin glyphs, so a commercial licence must be purchased before launch. Young Serif was tried as a replacement and rejected.
- **Wordmark optical sizing.** Mentarika's cap height is small for its em, so it needs to be set larger than the mark beside it to look level: 78px wordmark against a 94px mark on Login. In the app bar the mark leads instead: 48px mark against a 35px wordmark (Home, Classroom, Submit).
- **Glass** is the material for *marks and states* — badges, pills, chips, the login card. Never a general-purpose container. Recipe: `backdrop-filter: blur(18–26px) saturate(180%)`, 1px `rgba(247,244,238,0.18)` border, inset specular highlights, gradient fill.
- **Accounts are institution-issued.** No sign-up, no self-serve register. Username *is* the college email; `User.email` must be populated to match. Password reset goes via teacher/IT, not email flows.

## Adopted craft rules (filtered from taste-skill v2, MIT)
Kept only what doesn't fight the above. These are review checks, not a style engine.

**Consistency locks**
- One accent color across the whole page — no stray hue in a late section or a footer badge.
- One corner-radius system, documented and followed (Stemma: pills/chips full-radius, cards 20–24px, inputs 12px).
- One theme, page-wide. Sections never invert.
- One copy register per screen. Don't mix mono-technical, editorial, and marketing voice.

**Contrast + form discipline (a11y, mandatory)**
- Every button: label readable against its own background, WCAG AA (4.5:1 body, 3:1 for 18px+). Ghost buttons over the lattice need a scrim or stroke.
- Inputs, placeholders, focus rings, helper text and error text all pass AA against their section background.
- Label **above** input, error **below**. Never placeholder-as-label.
- Button labels fit one line at desktop. Primary CTAs 1–3 words.
- One CTA label per intent, reused everywhere. No "Submit" + "Hand in" + "Turn in" on one page.

**Layout**
- CSS Grid over flexbox percentage math. Gap over margins.
- Declare the <768px collapse explicitly per multi-column section.
- Use `min-h-100dvh`, never `100vh`, for full-height panels.
- Cards only where elevation means real hierarchy; otherwise divide with hairlines or space.
- A grid has exactly as many cells as there is content. No blank filler tile.
- Don't repeat a layout family more than once per screen; break up consecutive image+text splits.
- **Eyebrow restraint:** max 1 small-caps/mono label per 3 sections. Usually the heading alone is enough.

**Interaction states**
- Build the full cycle every time: loading (skeletons shaped like the result, not spinners), empty (composed, says how to fill it), error (inline for forms), success.
- `:active` gets a physical push (`translateY(1px)` or `scale(.98)`).

**Motion**
- Every animation must communicate one of: hierarchy, sequence/story, feedback, state change. If the reason doesn't fit in a sentence, cut it.
- Animate `transform` and `opacity` only.
- Honor `prefers-reduced-motion`; infinite loops and parallax collapse to static.
- Never `window.addEventListener('scroll')` or scroll position in component state.
- Max one marquee per page. Not every card needs a loop.

**Content**
- Re-read every visible string before shipping. Cut anything grammatically broken, with unclear referents, or mock-poetic. Plain functional copy beats clever copy.
- No invented precise numbers. Real, or labelled mock, or gone.
- Lists over ~5 items need a different component, not a longer list.
- Quotes: max 3 lines, attribution is name + role.
- No hand-drawn SVG illustration as filler. Use real imagery or a labelled placeholder slot and say what's needed.
- No em-dashes as decorative flourish in UI copy.
- No emoji.

## Explicitly rejected from that skill
- **Its serif ban.** It bans serif-by-default and names Instrument Serif specifically. Stemma's serif choice is brand-led and already locked — the Mentarika wordmark and Newsreader for in-product document text stay.
- **Its dial system** (variance/motion/density presets) — tuned for marketing pages; Stemma's remaining screens need clarity and density, not layout variance.
- **Anti-center bias, hero rules, logo walls, bento/spec-sheet guidance** — no marketing surface in this product.
- **Its stack** (Next.js, Tailwind v4, Motion, `next/font`, Phosphor icons, shadcn) — not the environment here. Styling stays inline.
- **Dual light/dark mandate** — Stemma is dark-locked by brand.
- **Its glassmorphism-is-for-premium-consumer framing** — glass here is a structural badge material, not a luxury cue.
