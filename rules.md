# System Design + Terraform Practice — Rules

This file defines how this project runs. It should rarely change. **For routine use, read
`checklist.md` instead — it's the condensed loop/gates only.** Come back to this full file
when a step needs the reasoning behind a judgment call (grading nuance, the blocking/
non-blocking test for criticals, tone calibration, the "why" behind a gate), or the first
time you're setting this project up. Pair it with `progress.md` (the living record of
problems done, comfort level, and recurring mistakes) for full context.

## Tone

Grade plainly and directly. Say what's wrong without softening it, and say what's right
without inflating it. Don't pad feedback with encouragement it hasn't earned, but don't be
needlessly harsh either — the goal is an accurate signal, not a morale hit. Never adjust a
verdict upward to be kind. If an attempt is a fail, say fail and say why.

## Tooling split

This project spans two different Claude surfaces, used for different steps. They don't
share a live session — coordination happens only through files in the vault.

- **Cowork** (via the connected vault folder): issuing problems — including writing
  `given-app-spec.md` and generating the given-app's actual code in that same pass, when a
  problem needs one (see Given application code below; there's no separate hand-off for this
  anymore) — curating `background.md` (see Background — priming resources below), and running
  clarification rounds. Cowork does not grade and does not write any of the feedback/attempt
  files below — every file-writing or grading job in the loop happens on the Claude Code side,
  whether run interactively or through the viewer app. Issuing a problem (step 1) is the one
  Cowork job the viewer app also offers headlessly — Home's "Start new problem" prompt has a
  "Run automatically with Claude Code" option, same mechanism as every other headless job
  below, standing in for a Cowork conversation rather than a Claude Code one. It's still
  conceptually Cowork's job (conversational, judgment-based); headless is just a convenient
  way to run that same prompt without opening a chat.
- **Claude Code**, doing every remaining file-writing/grading job in the loop: grading the
  user's own given-app comprehension write-up (see "Given application code" below — the user
  writes it, Claude Code only grades it, same split as design/Terraform), grading design docs
  and Terraform (steps 5 and 8), writing and grading the test script (step 9, "Check" — stops
  before any apply), and the deploy/run/destroy loop against an already-checked script
  (step 10, "Verify"). Each of these jobs can be run either way:
  - **Interactively** — paste the generated prompt into any Claude Code session, or into a
    plain web chat with no file access, which replies with each file as a fenced code block
    instead; the viewer app parses and saves those blocks back into the vault itself (see
    "Given application code" for the pattern, and the schemas above for what each prompt
    expects to produce).
  - **Headlessly** — the viewer app's "Run automatically with Claude Code" button spawns the
    local `claude` CLI directly (no copy/paste, no separate "tell me when it's done"
    round-trip). Available for every job above **except Verify** — a real `terraform
    apply`/`destroy` against live AWS always stays a manual, watched session, never a
    background button click, no matter how convenient the rest of the loop has gotten.
- Both surfaces grade using the same standard (see Tone and Grading integrity below) —
  interactive vs. headless only changes how a prompt gets run, never the grading philosophy.

## progress.md and progress.json

Two files track history, deliberately split so neither one needs to be fully loaded into
context every session as this project scales up:

- **`progress.md`** — small, curated, human-readable. Current tier, comfort/pacing
  estimate, recurring issues, and a one-line pointer per problem. Updated only when
  something actually changes the narrative, not after every attempt.
- **`progress.json`** — structured rollup, one entry per problem, tracking each of the three
  phases' latest attempt independently:
  ```json
  {
    "problems": {
      "<problem-slug>": {
        "tier": 1,
        "phases": {
          "design": {"attempt_count": 2, "latest_attempt": "attempt-2-2026-08-03", "latest_verdict": "solid-pass"},
          "terraform": {"attempt_count": 1, "latest_attempt": "attempt-1-2026-08-05", "latest_verdict": "passed-with-gaps"},
          "test": {"attempt_count": 0, "latest_attempt": null, "latest_verdict": null}
        }
      }
    }
  }
  ```
  This is the queryable ground truth for "how did rate-limiter's terraform attempt 1 go" or
  "how many blocking criticals are still open" — read it with a targeted lookup (a specific
  problem slug) rather than loading the whole file when it grows large. It mirrors each
  phase attempt's own `attempt.json`, so it should never contain detail that contradicts or
  duplicates-with-drift what's in the attempt folder itself.

## Tech stack

- **Terraform targets AWS exclusively.** No multi-cloud abstraction, no GCP/Azure
  variants — every problem, skeleton, and scanner config assumes AWS.
- **Application code (test scripts, any given/generated app code) is TypeScript or
  Python.** Pick whichever fits the problem naturally; don't introduce a third language
  without discussing it first.

## Problem statement style

Problems are issued as a short stakeholder scenario, not a dry spec sheet — a named person
or team wants something, described the way a real stakeholder would (informally, with a
business reason, sometimes with a complaint). Functional requirements, scale/constraints,
and completion conditions (per step 1 of the loop) still all need to be present and precise
— the narrative framing doesn't replace precision, it's just how it's delivered.

Every problem statement includes at least one deliberate wrinkle: an unstated assumption,
a mild conflict between two requirements, or a detail that implies something the stakeholder
didn't say outright (e.g. "we get a huge spike every Friday at noon" implies an autoscaling
requirement even though the word "autoscaling" never appears; a stakeholder wanting both
"keep it cheap" and "no downtime, ever" is a real tension to surface, not resolve for them).
This is what the clarification round (step 3) is for — a good clarification round finds the
wrinkle; a good design doc addresses it once found. The wrinkle should be realistic, not a
gotcha for its own sake — nothing that requires guessing a password or spotting a typo.

## Background — priming resources

The goal of this project is to learn new things quickly, not just grind reps blind. This is
step 2 of the loop — right after a problem is issued and before the clarification round
(step 3) — and curates a short, varied set of external resources to prime the user's
understanding of the tech and architecture the problem is actually testing: a running start,
not a substitute for the design doc's own thinking.

- Written into `<problem-slug>/background.md`, once per problem. Not attempt-tracked and not
  regenerated automatically — the user can ask for a refresh at any time from the viewer
  app's Background tab, which just re-runs the same prompt.
- Aim for variety over volume: roughly 4–8 real, working links, mixing videos and articles,
  and mixing sources/creators/teaching styles — not five videos from the same channel, or
  five blog posts all making the same point the same way. Different explanations stick
  differently; that's the point of priming from more than one angle. Cover, where relevant:
  - The core technology or pattern the problem is built around.
  - The shape of the architecture involved — how the pieces fit together, not just one piece
    in isolation.
  - At least one resource that actually gets into a realistic corner case or failure mode
    relevant to this problem's wrinkle (see Problem statement style).
- **Official cloud-provider documentation is fine in more than one entry, but never as a bare
  link to the whole page.** A plain link to, say, the full IAM docs asks for more reading than
  a priming pass should cost — nobody's reading all of IAM to prime for one problem. Every
  docs.aws.amazon.com (or equivalent) entry must name the specific section/heading — or even
  the specific paragraphs — actually worth reading, right in the relevance note (e.g. "just
  the 'Identity-based policies' and 'Resource-based policies' sections, not the rest of the
  page"). It's still an easy trap to fill this list mostly with vendor docs simply because
  they're the safest thing to be sure is real — that isn't priming from more than one angle,
  it's one angle repeated — so most of the list should still be genuine third-party content:
  other companies' engineering blogs, conference talks, YouTube channels, newsletters — named
  creators/publishers, not the vendor's own docs restated. Use live web search if available to
  find and verify real current resources, rather than relying only on training-data memory.
- Each entry gets a one-line note on why it's relevant, so the user can tell where to start
  without opening all of them first. A short AI-written summary is fine to add alongside a
  link when it genuinely orients (e.g. "the part that matters here starts around the 8-minute
  mark"), but it's a supplement, never a replacement for actually watching or reading the
  thing — don't let the summary become the primer instead of the resource it's summarizing.
- Real links only. Never fabricate a URL, a video, or an author that doesn't exist. If a
  genuinely good third-party resource can't be verified for some angle (no web search
  available, nothing confidently real), say so explicitly in that entry — a shorter, honest
  list beats padding it with another docs page or a fabricated one just to hit a count.

Format `background.md` as a one-line intro (what this list is priming for) followed by a flat
list of resources, each stating its type (video/article), title, link, and its one-line
relevance note (plus an optional short summary line).

## Given application code

Some problems involve fronting, scaling, or securing an existing piece of application logic
(a load balancer in front of an API, a cache in front of a service, a queue in front of a
worker) rather than designing a service from nothing. For these, the actual code is generated
in the same pass as issuing the problem (step 1) — not as a separate, deferred hand-off — by
whichever surface is doing the issuing (Cowork, interactive Claude Code, or a headless run;
see Tooling split, since all three already have direct vault file access):

- When issuing a problem that needs one, write `given-app-spec.md` into
  `<problem-slug>/given-app/` describing exactly what the app needs to do (endpoints,
  behavior, any deliberately-realistic quirks worth including), then immediately generate the
  actual code from that spec — same session, same pass, before moving on. There's no
  intermediate "paste this into Claude Code" step to wait on.
- The app is written in TypeScript or Python (per Tech stack), kept minimal and clearly
  commented, into `given-app/`. Once done, a short note gets left
  (`given-app/generated.md` — done, what it built, anything the user should know).
- By the time the problem is actually handed to the user, the given-app already exists and
  its code is already visible on the Code Analysis tab's Current view — there's no "check
  back later" gap where the spec exists but the code doesn't yet.
- This is generated once per problem, not regenerated per attempt.

Keep the generated app genuinely simple: the exercise is designing infrastructure around it,
not reverse-engineering obscure code.

**Comprehension is its own graded exercise, same pattern as the design doc.** Once the
given-app exists, the user writes `given-app/current/description.md` themselves — what the
code actually does (endpoints/behavior, notable implementation choices, deliberate quirks),
in their own words, from actually reading it. Claude Code does not write this for the user;
its only job here is grading it, exactly like design/Terraform:
- The user writes `given-app/current/description.md` solo, no timebox pressure needed (it's
  short), before moving on to the design doc.
- Grading checks the summary against the actual generated code (not just the spec) — findings
  ordered minor → major → critical, tagging anywhere it misreads, omits, or gets wrong the
  code's real behavior, same severity/verdict conventions as every other grading in this
  project (see attempt.json schemas below). Snapshots `current/` into a new
  `given-app/attempts/attempt-<n>-<date>/`, writes `description-feedback.md` +
  `attempt.json` there — this is the one action that creates the attempt.
- Revisions are just grading again, same as design/Terraform: keep editing
  `current/description.md` and grade again for a new, independent attempt.
- Review the feedback same as any other grading — discuss findings before deciding whether to
  revise or move on to the design doc.

The design doc still gets graded on getting the given-app's behavior right too — a design doc
that misreads it is its own finding there, independent of how the comprehension summary itself
was graded. Two different artifacts, two independent verdicts, same as design/Terraform/test
never collapsing into one number (see Verdicts are independent below).

## Scaffolding on problem start

When a new problem is issued (step 1), generate the routine boilerplate automatically rather
than asking the user to redo it each time:
- The folder structure itself (per Folder structure below), including empty
  `phases/design/current/` and `phases/terraform/current/` folders.
- A basic Terraform skeleton copied into `phases/terraform/current/` — AWS provider block,
  `required_providers`, a `variables.tf` stub, backend config placeholder. This is starter
  scaffolding, not a partial solution — it shouldn't pre-solve any part of the actual design
  decision the problem is testing.
- If the problem needs given-app code, its spec and the actual generated code both get
  written in this same pass too (see Given application code above) — not deferred to a
  separate hand-off.
Keep this scaffolding minimal and boring on purpose — its only job is removing repetitive
setup, not giving the user a head start on the actual exercise.

## Ramp-up and repetition

Progress should be slow and cumulative, not a rush through breadth. Concretely:
- **Start at the basics and stay there for a while.** Early tier-1 problems should be
  things like a basic REST API behind a load balancer, a static site on S3/CloudFront, or a
  simple VPC with public/private subnets — the goal early on is reps with core AWS
  networking and Terraform mechanics themselves, not novel system-design reasoning. Don't
  rush past this into multi-component problems before these are comfortable.
- **Repetition is built in, not incidental.** Not every problem needs to be a new shape.
  It's expected and fine to reissue a similar problem with a small variation (different
  traffic pattern, a different AWS service standing in for the same role) purely to get
  more reps at a given complexity level before moving on. Suggest this explicitly when it
  seems more useful than a new problem, based on `progress.md`/`progress.json`.
- **Tier progression stays slow by default** — see Tier progression below for the actual
  criteria, but the default assumption is more reps at the current level rather than fewer.

## Folder structure

Everything lives inside the connected vault/project folder. Each of the three graded phases
(design, terraform, test) keeps its **own, independent attempt history** — there is no single
shared "attempt number" spanning all three; the given-app's comprehension summary, when a
problem has one, is a fourth, equally independent attempt history, living under `given-app/`
rather than `phases/` since it isn't one of the three every problem has. **Grading is what
creates an attempt**: every time something's graded, whatever's currently being worked on is
snapshotted into a new, immutable `attempts/attempt-<n>-<date>/` folder, `n` incrementing
per-artifact. Design, terraform, and the given-app comprehension summary each have a
`current/` folder for the live work-in-progress between gradings; test doesn't, because
writing and grading the test script (step 9, Check) creates its attempt folder directly
rather than iterating in place first — deploying, running it for real, and capturing evidence
(step 10, Verify) then continues that same folder.

```
<problem-slug>/
  problem.md                          — the prompt as issued, written once, never edited after issuance
  background.md                       — optional: curated priming resources (step 2), written once, refreshable
  clarifications.json                 — optional: log of clarification-round Q&A (step 3), append-only
  given-app/                          — optional: app code the infra is built around
    given-app-spec.md                 — spec written by Cowork, for Claude Code to build from
    generated.md                      — short done-note from Claude Code once the app is built
    <actual app code>                 — generated by Claude Code, TypeScript or Python
    current/
      description.md                  — user's live comprehension draft, freely overwritten until graded
    attempts/
      attempt-<n>-<YYYY-MM-DD>/       — frozen snapshot from the moment it was graded
        description.md                — the summary exactly as graded
        description-feedback.md       — findings + verdict
        attempt.json                  — machine-readable record (see schema below)
  phases/
    design/
      current/
        design-doc.md                 — live draft, freely overwritten until it's graded
      attempts/
        attempt-<n>-<YYYY-MM-DD>/     — frozen snapshot from the moment it was graded
          design-doc.md                — the doc exactly as graded
          design-feedback.md          — findings + verdict
          attempt.json                — machine-readable record (see schema below)
    terraform/
      current/
        <live .tf files>              — the user's actual .tf files, edited directly (AWS provider, scaffolded)
      attempts/
        attempt-<n>-<YYYY-MM-DD>/
          terraform/                   — snapshot of current/ at grading time
          terraform-feedback.md
          attempt.json                — records which design attempt this implements
    test/
      attempts/
        attempt-<n>-<YYYY-MM-DD>/     — created directly by Claude Code's step-8 run
          test-script.*                — the actual functional test run against the deployed system
          test-script-feedback.md     — findings + verdict for the test script, graded BEFORE deploy
          test-evidence.md            — captured output/logs/timing from the real run, plus pass/fail
          test-evidence.json          — optional: same run, broken into machine-readable phases
          attempt.json                — records which terraform attempt this tests
```

Rules:
- Never edit a past attempt's files after it's created — grade again to get a new one.
  `current/` is the only place safe to overwrite freely; nothing there is graded until it's
  explicitly snapshotted.
- A phase's attempt count has no relationship to another phase's — terraform attempt 1 might
  implement design attempt 3, if the design doc went through two earlier revisions first.
- `problem.md` is written once when a problem is first issued and is not edited afterward,
  even across revisits — if the problem needs to change, that's a new problem.
- Terraform files are kept as real, runnable `.tf` files, not embedded in markdown or JSON,
  so they stay diffable and lintable across attempts.

## clarifications.json schema

An append-only log of the clarification round (step 3), one entry per question asked —
whichever surface answers it. Optional; a problem with no clarification round simply has no
file.

```json
[
  {
    "question": "Is the 100 req/min limit per API key or per source IP?",
    "answer": "Per API key — see problem.md's client-identification section.",
    "date": "2026-09-02T05:12:00.000Z",
    "cost_usd": 0.055
  }
]
```

`cost_usd` is only present when the answer came from a headless call that reports it; omit
otherwise. Never edit or remove a past entry — a wrong answer gets corrected by a new
question, not a rewrite of history.

## attempt.json schemas

Each phase attempt gets its own `attempt.json`, scoped to just that phase — there's no single
record spanning all three (or four, counting given-app comprehension). All of them share the
same finding shape and the same severity/verdict/location conventions (see the shared rules
below the schemas).

**Given-app comprehension** (`given-app/attempts/attempt-<n>-<date>/attempt.json`, only for
problems with a given-app):
```json
{
  "phase": "given-app",
  "attempt_number": 1,
  "date": "YYYY-MM-DD",
  "findings": [
    {
      "severity": "minor|major|critical",
      "blocking": true,
      "description": "...",
      "location": {"file": "description.md", "line_start": 4, "line_end": 6}
    }
  ],
  "verdict": "fail|passed-with-gaps|solid-pass|strong-pass"
}
```

**Design** (`phases/design/attempts/attempt-<n>-<date>/attempt.json`):
```json
{
  "phase": "design",
  "attempt_number": 1,
  "date": "YYYY-MM-DD",
  "findings": [
    {
      "severity": "minor|major|critical",
      "blocking": true,
      "description": "...",
      "location": {"file": "design-doc.md", "line_start": 19, "line_end": 21}
    }
  ],
  "verdict": "fail|passed-with-gaps|solid-pass|strong-pass"
}
```

**Terraform** (`phases/terraform/attempts/attempt-<n>-<date>/attempt.json`):
```json
{
  "phase": "terraform",
  "attempt_number": 1,
  "date": "YYYY-MM-DD",
  "implements": "attempt-2-2026-08-03",
  "findings": [ ... same shape as design ... ],
  "verdict": "fail|passed-with-gaps|solid-pass|strong-pass"
}
```
`implements` is the design attempt's folder name (within this same problem) that this
Terraform was built against — required, since Terraform is always implementing a *specific*
graded design doc, per step 7.

**Test** (`phases/test/attempts/attempt-<n>-<date>/attempt.json`):
```json
{
  "phase": "test",
  "attempt_number": 1,
  "date": "YYYY-MM-DD",
  "tests": "attempt-1-2026-08-05",
  "script_findings": [ ... same shape as design ... ],
  "script_verdict": "fail|passed-with-gaps|solid-pass|strong-pass",
  "functional_test_result": "pass|fail|not-run"
}
```
`tests` is the terraform attempt's folder name this run deployed and exercised.

### Shared rules for findings

`blocking` is only ever `true` for a `critical` finding, and only when the flaw is systemic
(the rest of the work is built on a broken foundation) rather than an easy, isolated fix.
That judgment call is made explicitly per-finding, not assumed from severity alone.

`location` is optional but expected whenever a finding is actually about something at a
specific spot (a wrong line, a missing block that belongs near an existing one, a
misconfigured resource) rather than a genuinely holistic observation (e.g. "the doc never
addresses the stated completion conditions" with nothing to point at). `file` is a path
relative to the attempt folder (e.g. `design-doc.md`, `terraform/networking.tf`,
`test-script.py`). `line_start`/`line_end` are 1-indexed and inclusive; for a single-line
finding, set them equal. Findings should point at the actual line the flaw lives on or the
actual line something should have been added near — not a vague "somewhere in this file"
gesture. This applies at every grading step (design doc, Terraform, test script) on both
surfaces (Cowork and Claude Code).

## test-evidence.json schema

`test-evidence.md` (prose — output, logs, narrative) stays the primary record of a real
run. `test-evidence.json` is an optional machine-readable companion covering the same run,
broken into phases, so numbers can be tabulated and charted instead of only read as prose.
Write it whenever the test script's own output is structured enough to break into phases
(most functional tests naturally are); skip it only when a run genuinely doesn't decompose
that way.

```json
{
  "run_date": "YYYY-MM-DD",
  "region": "us-east-1",
  "functional_test_result": "pass|fail",
  "phases": [
    {
      "name": "Phase 1 — default client, under limit",
      "expected": "60/60 requests succeed, p99 latency well under the ~20ms guideline",
      "actual": "60/60 succeeded, p99 14ms",
      "pass": true,
      "metrics": {"success_count": 60, "total": 60, "p50_ms": 8, "p99_ms": 14}
    }
  ]
}
```

- `phases` should mirror the phases/sections already narrated in `test-evidence.md` — same
  names, same order, not a different breakdown.
- `expected` is what the problem's completion conditions (or the test script's assertions)
  say should happen; `actual` is what really happened. Both are short one-line prose, not a
  re-narration of the whole phase.
- `metrics` is free-form numeric key/value pairs for that phase (e.g. counts, latencies).
  Keys ending in `_ms` are treated as latency numbers a viewer can chart; anything else is
  just tabulated. Omit `metrics` entirely for a phase with nothing numeric to report.
- `pass` is this phase's own pass/fail against its `expected`, independent of the overall
  `functional_test_result` (a single failing phase can still coexist with other passing
  phases in the same run).

## The loop

1. **Issue the problem.** State functional requirements, scale/constraints, what's
   explicitly out of scope, and **explicit completion conditions** — concrete, measurable
   thresholds the solution is judged against (e.g. "requests above 100/min from a single
   client get rejected with 429," "cache hit rate stays ≥ 90% under the stated traffic
   pattern," "failover completes within 30 seconds of the primary going down"). These go in
   `problem.md` alongside the requirements, not left implicit. If the problem involves a
   given-app (see Given application code), write `given-app-spec.md` and hand off to Claude
   Code to build it now — this can run in parallel with the next steps. Suggest a timebox
   (see Timeboxing below). Write `problem.md`.
2. **Background — priming resources.** Right after issuing the problem and before the
   clarification round, curate a short, varied set of external resources (see Background —
   priming resources below) into `<problem-slug>/background.md`, so the clarification round
   and design doc aren't a cold start.
3. **Clarification round.** The user may ask questions about what the prompt means, what's
   assumed, or what edge cases are in scope. Answer these directly.
   Do NOT answer questions that are actually design decisions in disguise (e.g. "should I
   use a token bucket or sliding window" is a design choice, not a scope question — decline
   and note that it's part of what they're being asked to design).
4. **Design doc, solo.** The user writes it within the timebox, in
   `phases/design/current/design-doc.md`. Only debugging-class questions are answered during
   this step (e.g. "is my throughput math internally consistent" is fine; "what should I use
   for the cache layer" is not — redirect back).
5. **Grade the design doc.** List findings ordered minor → major → critical (save the worst
   for last rather than leading with it). A design doc that doesn't address how it would
   meet the problem's stated completion conditions is itself a finding — not an afterthought
   checked only at test time. Tag each finding with severity; tag criticals with a
   blocking/non-blocking call. Roll up to a verdict. Grading snapshots `current/` into a new
   `phases/design/attempts/attempt-<n>-<date>/` and writes `design-feedback.md` +
   `attempt.json` there — this is the one action that creates the attempt; there's no
   separate "start an attempt" step.
6. **Revisions are just grading again.** If the user wants another pass, they keep editing
   `current/design-doc.md` and grade again — each grade produces a new, independent attempt,
   so there's no ambiguity between "a revision" and "a fresh attempt" to resolve.
7. **Terraform implementation.** The user implements the *graded* design doc (a specific
   attempt from step 5/6, not their original uncorrected one) in
   `phases/terraform/current/`, within a timebox. Debugging-only help again.
8. **Grade the Terraform.** Check it against the design doc it implements (does it actually
   implement what was specified) plus code quality, security, and networking basics. Static
   validation (`terraform validate`, `terraform fmt -check`, a scanner like `tfsec` or
   `checkov`) runs first — its findings are objective and get folded into the graded
   findings, not treated as a separate softer category. Grading snapshots `current/` into a
   new `phases/terraform/attempts/attempt-<n>-<date>/`, records which design attempt it
   `implements`, and writes `terraform-feedback.md` + `attempt.json` there.
9. **Check — write & grade the test script.** Once a Terraform attempt is graded (step 8),
   run this against that attempt via the viewer app's Check tab (headlessly, or copy the
   generated prompt into any Claude Code session) or an equivalent handoff prompt (see
   Handoff prompt templates below). This step:
   - Creates the new attempt folder itself (`phases/test/attempts/attempt-<n>-<date>/`, `n`
     one more than the highest existing test attempt for this problem, or 1 if none exist).
   - Writes and grades the functional test script against the same criteria as the rest of
     this project (does it test the claimed behavior, bounded runtime, fails safe, scoped
     to the cheapest setup that still proves the point). Critically, it must assert against
     the problem's stated completion conditions specifically (the actual thresholds/timing
     from `problem.md`), not a looser proxy for them — a test that only checks "the service
     responds" when the completion condition is "rejects above 100 req/min with 429" is
     itself a finding.
   - Writes `test-script-feedback.md` and a *partial* `attempt.json` there (phase "test",
     `tests` set to the terraform attempt folder name, `script_verdict` set,
     `functional_test_result: "not-run"`) — then stops. No apply, no deploy, nothing spent
     yet. Review the script and its grading (same as reviewing any other feedback) before
     moving on to step 10; a blocking finding here should be fixed first.
10. **Verify — deploy, run for real, destroy.** Once the Check attempt looks sound, run this
   via the viewer app's Verify tab or an equivalent handoff prompt (see Handoff prompt
   templates below), pointing at that checked test attempt. Unlike every other step, this one
   is never a one-click headless run — a real `terraform apply`/`destroy` against live AWS
   always stays a manual, watched session (see Tooling split). It:
   - `terraform apply`s the terraform attempt this test targets. If `apply` fails, work
     through it with the user interactively (this is a live back-and-forth, not silent
     auto-fixing) until it succeeds.
   - Runs the existing, already-graded test script against the live system — it doesn't get
     rewritten here unless it turns out to actually be broken, in which case say so first
     before continuing. If the test doesn't actually exercise the behavior the design doc
     claims — or doesn't check it against the problem's stated completion conditions — don't
     treat it as a real result: say so, give feedback, and revise (the test, or the infra, if
     the infra is what's actually wrong) before re-running.
   - Once a real result is in — pass or fail against the stated completion conditions —
     captures it: real output, logs, timings, into `test-evidence.md` (plus
     `test-evidence.json` per that schema, when the run's numbers decompose into phases), and
     updates that same attempt's `attempt.json` with the real `functional_test_result` — using
     the same severity-tagged, plain-tone methodology as everywhere else (see Tone and the
     grading rules above — this is one project with one grading standard, regardless of which
     surface or mode ran it).
   - Once everything looks good — or once the user is done iterating and ready to close out
     — runs `terraform destroy`. No permission prompt needed for destroy itself; the cost
     risk this project cares about is infra staying live unnecessarily, not the act of
     tearing it down. Confirms destroy actually completed before considering the loop closed.
11. **Update `progress.json`** with this problem's `phases` entry reflecting the phase(s) just
   graded (attempt count, latest attempt folder, latest verdict — mirroring the relevant
   `attempt.json`, not duplicating its full findings detail). **Update `progress.md`** only
   where this actually changes the curated narrative — a new one-line pointer if this is a
   new problem, or an edit to "Recurring issues"/"Comfort & pacing" if a real pattern has
   emerged across multiple attempts. Most single attempts should not require editing
   `progress.md` at all; the detail lives in `progress.json` and the attempt folders
   themselves.
12. **Blocking criticals do not stop the user from starting a new problem.** They stay
    flagged in that problem's record until the user chooses to revisit — never nag about it
    beyond noting it's unresolved when that problem comes up again.

## Handoff prompt templates

Claude Code has access to this entire vault folder already, so none of these prompts need to
grant or explain access — each just needs to orient Claude Code to the right subfolder and
point it at `rules.md` for the standard.

There's no standalone given-app-generation template anymore — writing `given-app-spec.md` and
generating the actual code both happen inline as part of issuing the problem itself (step 1,
see Given application code above), in the same prompt/session, not a separate hand-off to
paste somewhere else.

The handoffs below — design grading, Terraform grading, Check, and given-app comprehension
grading — are generated automatically by the viewer app (with the specific attempt folders
already filled in) rather than hand-typed by Cowork; the templates here just document what
they say, since Cowork should still know their shape when discussing a step with the user.
Every one of them can be run interactively (paste into a Claude Code session, or into a plain
web chat with no file access — see "Given application code" for how the paste-back fallback
works) or headlessly via the app's "Run automatically with Claude Code" button.

**Check — write & grade the test script (step 9)** — the viewer app's Check tab generates
this once a Terraform attempt is graded, always against the most recent one:

> You're inside this vault folder already. Write and grade the functional test script for
> testing the Terraform at
> `<problem-slug>/phases/terraform/attempts/<terraform-attempt-folder>/terraform/`, which
> implements the design doc at
> `<problem-slug>/phases/design/attempts/<design-attempt-folder>/design-doc.md`. Follow the
> process and grading standard in `rules.md` (project root) for step 9. Create a new attempt
> folder at `<problem-slug>/phases/test/attempts/attempt-<n>-<today>/` (n = one more than the
> highest existing test attempt for this problem, or 1 if none exist) and write the test
> script plus `test-script-feedback.md` into it. Also write a partial `attempt.json` there
> (phase "test", `"tests": "<terraform-attempt-folder>"`, `script_verdict` set to your
> grading, `functional_test_result: "not-run"`) so it's clear this attempt is checked but not
> yet run. Stop there — do not apply, deploy, run, or destroy anything yet.

**Verify — deploy, run for real, destroy (step 10)** — the viewer app's Verify tab generates
this once a Check attempt exists, pointing at it directly rather than re-describing the whole
problem:

> You're inside this vault folder already. Continue test attempt
> `<problem-slug>/phases/test/attempts/<test-attempt-folder>/` — its test script has already
> been written and graded (see `test-script-feedback.md` there); don't rewrite it unless you
> find it's actually broken, in which case say so first. Apply the Terraform at
> `<problem-slug>/phases/terraform/attempts/<terraform-attempt-folder>/terraform/`, working
> through any apply failures interactively until it succeeds. Once it's up, run the existing
> test script against the live system and capture the real result — output, logs, timings —
> into that attempt folder's `test-evidence.md` (plus `test-evidence.json` per its schema,
> when the run's numbers decompose into phases), and update its `attempt.json` with the real
> `functional_test_result`. Follow the process and grading standard in `rules.md` (project
> root) for step 10. Once everything looks good — or the user says they're done iterating —
> run `terraform destroy` and confirm it actually completed before calling this closed.

Check always creates the attempt folder; Verify always continues one that Check already
created. There is no longer a combined "do everything in one pass" handoff — reviewing the
test script's own grading before spending anything on real infra is the default now, not an
optional add-on.

## Verdicts are independent

A given-app comprehension attempt's verdict (did the write-up get the code's real behavior
right), a design attempt's verdict, a terraform attempt's verdict (code quality/security/does-
it-implement-the-design-doc), a test attempt's `script_verdict` (is the test itself sound and
safe to run against real infra), and its `functional_test_result` (did the deployed system
actually behave correctly) are recorded separately and never collapsed into one number.
A spot-on comprehension summary paired with a design doc that still gets the given-app's
behavior wrong, clean code that doesn't solve the problem, messy code that does, and a good
system paired with a bad test, are all distinct signals worth tracking distinctly over time —
this is also why each of these keeps its own independent attempt history rather than sharing
one attempt number.

## Timeboxing

Suggest a timebox when issuing a problem; the user can override it. As a starting point:
- Design doc: 30–60 minutes, scaled up for genuinely complex tiers or the first few
  problems of a new shape (allow more room while still experimenting), scaled down toward
  the low end as `progress.md` shows repeated comfort with similar problems.
- Terraform: scale similarly, tier- and experience-dependent — there's no fixed baseline,
  set it per problem using `progress.md`.

## Tier progression

Tiers, roughly (see Ramp-up and repetition above for the pacing philosophy):
1. Basic AWS/networking reps — single service, single region (basic REST API behind a load
   balancer, static site, simple VPC). Expect to spend real time here, including repeats.
2. Multi-component with a real failure mode to design around.
3. Multi-region / high-scale / regulatory constraints.
4. Revisit an earlier problem with a new constraint bolted on.

Suggest moving to the next tier when the current tier shows consistent solid-pass-or-better
verdicts **across multiple problems, including at least one repeat**, with no repeated
blocking criticals — but this is a suggestion, not a gate. The user decides when to move,
and can jump around tiers freely.

## Revisiting problems

Entirely user-driven. No forced schedule. It's fine to mention it's been a while since a
given problem was touched if it comes up naturally, but never push a revisit — the user
has full control over what gets revisited and when.

## Cloud safety net

Real cloud deploys mean real spend. Before the first deploy-and-test attempt:
- A billing alert/budget cap should exist on the AWS account. If one isn't confirmed to
  exist yet, say so before proceeding with an apply.
- After every destroy, a quick check that it actually completed (console or a `plan` that
  shows no drift) is part of closing the attempt — not optional, not deferred.

## Grading integrity

Do not soften a verdict to be encouraging, and do not invent minor findings just to
pad a review with "positives." Grade what's actually there.

## Reference answers (on demand)

Every other prompt in this project is deliberately feedback-on-your-attempt, not the answer
handed over — that's the point. This is the one intentional exception: on any graded attempt
(design, Terraform, given-app comprehension, or the test script), the viewer app's attempt page
offers a second prompt — "Copy prompt for the reference answer" — for when you're done
iterating on that attempt and want to check nothing was missed.

- Written independently of the user's actual attempt (the prompt explicitly tells Claude not
  to read it) — a real, complete answer as if solving the problem fresh, not a corrected
  version of what was submitted. Thorough, not a sketch: every requirement and completion
  condition addressed explicitly, the way something earning a strong-pass would.
- Saved into that same attempt folder, alongside the feedback: `design-reference.md`,
  `terraform-reference.md`, `description-reference.md`, or `test-script-reference.<ext>`
  (matching the real script's language). Not attempt-tracked itself — it's a static artifact
  attached to the attempt it was requested from, not something with its own grading history.
- Entirely optional and user-initiated, same headless/paste-back mechanics as every other
  CODE-tagged prompt. Never generated automatically as part of grading.
