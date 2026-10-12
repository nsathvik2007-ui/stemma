# Wiring a screen to the API

Every screen is built twice: first as **presentation only** with mock data, then
**wired** to a real endpoint. This document is the second half.

`src/routes/Login.tsx` is already wired and is the worked reference.
`src/routes/student/StudentHome.tsx` is presentation-only and is the exercise.

---

## 1. The three pieces that already exist

You do not write `fetch` by hand. Three layers sit underneath every screen.

**`src/api/client.ts` — transport.**
Adds `Authorization: Bearer <access>` to every request, prefixes `/api`, parses
JSON, and throws `ApiError` on a non-2xx. It also does the token refresh: on a
401 it silently gets a new access token with the refresh token and retries the
request **once**. If that also fails, the error surfaces. You get `api.get`,
`api.post`, `api.patch`, `api.del`.

**`src/api/student.ts` and `src/api/teacher.ts` — endpoints.**
One function per endpoint, already typed. `studentApi.myCourses()` is
`GET /api/my-courses/`. Add a function here rather than calling `api.get` from a
component — it keeps URLs in one place and keeps the two roles apart.

**`src/api/types.ts` — response shapes.**
What the backend actually returns. The mock data in a presentation-only screen
is typed with these, which is what makes wiring a swap rather than a rewrite.

> **Rule:** a file under `routes/student/` may import `student.ts`, never
> `teacher.ts`. `AIReview.explanation` names another student by name, and the
> student types deliberately have no field to put it in. Keeping the imports
> apart is what keeps that true.

---

## 2. The shape of a wired screen

```tsx
const [data, setData] = useState<Thing[] | null>(null);   // null = still loading
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;                       // guards against unmount
  studentApi.myCourses()
    .then((rows) => { if (!cancelled) setData(rows); })
    .catch(() => { if (!cancelled) setError('Could not load your classes.'); });
  return () => { cancelled = true; };
}, []);                                        // [] = run once on mount
```

Three states come out of those two variables, and `design/CLAUDE.md` requires
all of them every time:

| State | Condition | What to render |
|---|---|---|
| Loading | `!data && !error` | A skeleton **shaped like the result** — not a spinner |
| Error | `error` | Inline message, never a toast |
| Empty | `data.length === 0` | A composed empty state that says how to fill it |
| Populated | `data.length > 0` | The real thing |

`null` versus `[]` is the whole trick: `null` means *not back yet*, `[]` means
*came back with nothing*. Do not initialise state to `[]` or you can never tell
loading from empty.

---

## 3. Exercise: wire StudentHome

Open `src/routes/student/StudentHome.tsx`. It has three consts standing in for
three calls, and a pure `derive()` below them. **`derive()` and everything under
it does not change.** You are only replacing where the data comes from.

### Step 1 — fetch the three lists

```tsx
const [courses, setCourses] = useState<Course[] | null>(null);
const [assignments, setAssignments] = useState<Assignment[] | null>(null);
const [submissions, setSubmissions] = useState<Submission[] | null>(null);
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  let cancelled = false;
  Promise.all([
    studentApi.myCourses(),
    studentApi.assignments(),      // you will add this one — see step 3
    studentApi.submissions(),      // and this one
  ])
    .then(([c, a, s]) => {
      if (cancelled) return;
      setCourses(c); setAssignments(a); setSubmissions(s);
    })
    .catch(() => { if (!cancelled) setError('Could not load your classes.'); });
  return () => { cancelled = true; };
}, []);
```

`Promise.all` fires all three at once rather than in sequence. Three round trips
one after another is three times the latency for no reason.

### Step 2 — guard, then derive

```tsx
if (error) return <Shell><p className="error">{error}</p></Shell>;
if (!courses || !assignments || !submissions) return <HomeSkeleton />;

const { dueNext, alsoOpen, returned } = derive(courses, assignments, submissions);
```

Note `derive` is called **after** the guard, so it only ever sees real arrays.
That is why it was written as a plain function taking arguments rather than
reading the consts directly.

### Step 3 — add the two missing endpoint functions

`studentApi` does not have `assignments` or `submissions` yet. Add them to
`src/api/student.ts`:

```ts
assignments: () => api.get<Assignment[]>('/assignments/'),
submissions: () => api.get<Submission[]>('/submissions/'),
```

Both are already scoped server-side: a student token sees only their own
enrolled courses, their assignments and their own submissions. Verified.

### Step 4 — delete the mocks

Remove `COURSES`, `ASSIGNMENTS`, `SUBMISSIONS` and `STUDENT_NAME`. For the name,
see "Known gap" below.

---

## 4. Reading failures

| Symptom | Cause |
|---|---|
| 401 on `/api/token/` | Wrong username or password. |
| 401 anywhere else, twice | Refresh token expired too (7 days). Sign in again. |
| **404 on someone else's record** | Deliberate. Ownership-scoped endpoints answer 404, not 403, so the response does not reveal that the row exists. **Never translate this to "forbidden".** |
| `TypeError: Failed to fetch` | Django is not running, or the origin is not in `CORS_ALLOWED_ORIGINS` in `backend/stemma/settings.py`. |
| Request fires twice in dev | React StrictMode double-invokes effects on purpose. Harmless for reads. It is a real warning for writes — never `POST` from a bare `useEffect`. |

---

## 5. Known gap: the student's own name

There is no `GET /api/me/`. The token carries `role` (added in
`backend/integrity/auth.py`) but not a display name, so `STUDENT_NAME` cannot be
fetched yet. Two options when you get there: add `name` to the token claim
beside `role`, or add a small `/api/me/` endpoint. The second is more useful once
more than one screen needs it.

---

## 6. Order to work in

Wire the read-only screens first — they are forgiving, because a wrong guess
just shows wrong data rather than writing it.

1. **Student Home** — three GETs, joined client-side *(this exercise)*
2. **Classroom** — one course's assignments
3. **Submission** — one submission plus its grade
4. **Submit** — first screen with a POST; needs the draft debounce
5. **Join Class** — POST with three distinct outcomes: joined, already enrolled, rejected

Then the teacher screens, which are heavier: Integrity Queue and Pair Review
carry the AI verdict and are the ones where the student/teacher separation
actually matters.
