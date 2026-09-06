# Loop checklist (quick reference)

Read this every session. Consult the full `rules.md` only when a step below needs the
reasoning behind a judgment call (grading nuance, the blocking/non-blocking test, tone) —
not as a matter of routine.

Each of design / terraform / test / given-app comprehension keeps its own independent attempt
history — **grading is what creates an attempt**, snapshotting a `current/` folder into a new
`attempts/attempt-<n>-<date>/`. No shared attempt number across any of them.

1. Issue problem → stakeholder-style, with a real wrinkle, explicit completion conditions,
   suggested timebox. If given-app needed: write spec AND generate the actual code, same
   pass — no separate hand-off, code's already there under Code Analysis by the time this
   step is done.
2. Background → curate `background.md` (viewer app's Background tab): 4–8 real, varied
   resources (videos + articles, different sources/teaching styles) priming the tech,
   architecture, and a realistic corner case this problem involves. One-line relevance note
   per link; short AI summaries are a supplement, never a replacement for the real thing.
3. Clarification round — scope questions only, not design decisions.
3.5. If given-app: write your own comprehension summary (viewer app's Code Analysis tab,
   `given-app/current/description.md`) → grade it (Claude Code, headless or interactive) →
   snapshots into a new given-app attempt, same write/grade/regrade pattern as design below.
   You write it, Claude Code only grades it — not the other way around.
4. Design doc, solo, timeboxed, in `phases/design/current/design-doc.md`. Debugging-class
   help only.
5. Grade design doc → snapshots into a new design attempt. Findings minor→major→critical,
   each citing a file/line where it applies (not just prose), verdict, blocking call on
   criticals.
6. Revisions are just grading again — no separate "new attempt vs. revision" call to make.
7. Terraform, solo, timeboxed, in `phases/terraform/current/`, from a specific *graded*
   design attempt.
8. Grade Terraform → snapshots into a new terraform attempt, recording which design attempt
   it implements. Static tools first, then review. Verdict.
9. Check → write & grade the test script (viewer app's Check tab, headless or interactive;
   must hit stated completion conditions). Creates the new test attempt folder, writes
   `test-script-feedback.md` + a partial `attempt.json` (`functional_test_result: "not-run"`),
   then stops — no apply yet. Review the script/grading before moving on.
10. Verify → deploy, run for real, destroy (viewer app's Verify tab; never headless — always a
   manual, watched run). Applies the terraform this test targets → debug with user if needed →
   runs the already-checked script → judges if the result is real → captures evidence →
   destroys (no permission needed) → confirms destroy completed. Updates that same attempt's
   `attempt.json` with the real `functional_test_result`.
11. Update `progress.json`'s per-phase entry for this problem. Update `progress.md` only if
   the narrative actually changed.
12. Blocking criticals don't block starting a new problem — just stay flagged.

**Hard gates — never skip:**
- Test script must be graded and clear before any real `apply`.
- Billing alert must exist before first deploy.
- Destroy always runs, even on test failure — no live infra left idle.
- Verdicts (terraform / test-script / functional-test) stay separate, never merged.

**Stack:** AWS only for Terraform. TypeScript or Python for all code.
