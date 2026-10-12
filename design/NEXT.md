# Where this left off — Stemma, 28 Aug 2026

Pick up in a new chat in this same project. Everything below is already on disk.

## Screens built
**Student**
- `Login.dc.html` — pre-auth, wordmark not linked (deliberate)
- `Home.dc.html` — class list, due next, also open, returned work
- `Join Class.dc.html` — live code field: `B3PL9A` joins, `K7M2QX` already-enrolled, else rejected
- `Classroom.dc.html` — reads `?class=physics-11b` / `?class=world-history`
- `Submit.dc.html` — typed / photo / OCR error / transcription / submitting / submitted
- `Submission.dc.html` — read side: text, grade, teacher comment, verdict motif

**Teacher** (same app shell, role marker reads Teacher)
- `Teacher Home.dc.html` — flagged-pairs card, classes, closing soon
- `Teacher Course.dc.html` — Work set / Roster tabs, join code, new assignment
- `Teacher Assignment.dc.html` — submissions table, filters, integrity rail (not-run / scanning / flagged)
- `Integrity Queue.dc.html` — cross-class pairs sorted by overlap
- `Pair Review.dc.html` — verdict pinned left, scrolling comparison right, confirm / dismiss
- `Grade Submission.dc.html` — marking with live out-of-20 validation
- `New Assignment.dc.html` — title, class, IST deadline, out-of, threshold, live student preview
## The background field — DONE
The approved `mesh` field now ships on `Home`, `Classroom`, `Submit` and `Submission`
(identical layer, one unique `grain-*` filter id per screen). `Home Backgrounds.dc.html`
has been folded back into `Home.dc.html` and deleted. `Login` keeps its own
document-text field — deliberate, not a gap.

Mesh recipe, for reference: five blurred masses, all one hue `#FF6B3D` (the mark's accent strand),
alphas 0.40–0.58, over `#101216`, plus SVG grain at 0.30 overlay, a vertical scrim, and a
190px app-bar scrim. Cards and rail are translucent (`rgba(22,24,29,0.70)` /
`rgba(19,21,26,0.48)`) with backdrop blur — this is required, not decorative: with opaque
panels most of the field paints behind them and cannot be seen.

Mass layout: large behind the title (top-left, `top:-160px`), small cropped at top-centre,
mid-right wash, bottom-right corner, bottom-centre.

### Next up
Nothing queued on the field. Remaining work is the backend gaps below and the Mentarika
licence.

### Rejected along the way — don't re-pitch
Moiré lattice, giant cropped mark, low-poly hairline mesh (all 5 variants), diffraction
fringes, two-ink seam, ruled page, giant Newsreader type, halftone, marked-up bars,
edge-anchored "flow" gradients, mirror-symmetric mass layout. Also: a second accent (blue
`rgba(90,120,255)`) was tried for the right side and removed — one accent, page-wide.
The trailing-edge vermilion wash on glass pills was tried and removed as overkill.

## Backend gaps the UI is ahead of
The full paste-in patch is `backend-gaps.md` — all six gaps, grounded in the repo at
`stemma/backend/`, landing as migration `0004`. Both open decisions are now settled:
- **Timezone:** `TIME_ZONE = 'Asia/Kolkata'`, institution-wide. No per-course zone.
  Storage stays UTC; the front end must send an explicit `+05:30` offset when setting a
  deadline.
- **AI verdict visibility:** a student sees it only once `TeacherFeedback.confirmed` is
  true. `explanation` is teacher-only — it names a classmate — so the student payload is
  verdict + confidence only.

The rest — `due_at`, `Assignment.max_score`, drafts, photo storage, late flag — is
mechanical. Gap 7 adds the endpoints the teacher screens need and do not have: the roster,
a cross-class `/api/pairs/` with the verdict nested, the shared-phrase overlap the pair
comparison highlights from, and a summary for teacher home's counts. Only drafts need
front-end work (debounced `POST /assignments/{id}/draft/`).
I can read the repo but not write to it, so the patch is paste-in.
(`backend-due-time.md` is superseded and deleted.)

## Still open on brand
Mentarika is a personal-use-only demo (~191 glyphs). A commercial licence must be bought
before launch. Young Serif was tried as a replacement and rejected.

## Haikei
Claude cannot operate haikei.app (it is a GUI). To use it: generate there with
`#101216` / `#FF5A2B` / `#4A5058`, export SVG, drop the file into chat. It would replace
the five blurred masses inside the field layer on each screen.
