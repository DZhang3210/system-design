# Claude Code project instructions

This is the System Design + Terraform Practice project. Read `checklist.md` at the start of
every session — it's the condensed loop and hard gates. Only read the full `rules.md` when
a step needs the reasoning behind a judgment call that the checklist doesn't cover. Read
`progress.md` for the current state of things.

## Shorthand: "1" means resume

If the user's message is just `1` (nothing else), treat it as: figure out where we left off
and continue from there, without asking the user to re-explain context. To do this:

1. Read `progress.md` for the current tier and recent narrative notes.
2. Query `progress.json` for the problem(s) in progress — each has a `phases` object with
   design/terraform/test tracked independently (don't load the whole file if it's grown
   large). Cross-check against the actual `phases/` folder contents per `rules.md`'s
   structure:
   - If a problem has `given-app/given-app-spec.md` but no `generated.md` yet → the
     given-app handoff (step 1) is pending. Build it per `rules.md`'s "Given application
     code" section.
   - If the latest `phases/terraform/attempts/` folder is graded but there's no
     corresponding `phases/test/attempts/` folder referencing it (`tests` field) yet → the
     handoff to Claude Code (step 7.5/8 in `rules.md`) is pending. Pick up there: write and
     grade the test script, then proceed through apply/test/destroy per `rules.md`.
   - If the latest `phases/test/attempts/` folder already has `test-script-feedback.md`,
     `test-evidence.md`, and `attempt.json` → that run's Claude Code work is done; say so
     plainly and ask if the user wants a new problem or to revisit something, rather than
     re-running anything.
   - If nothing is in progress at all → say so and ask what the user wants to do next
     (new problem, revisit, etc.) rather than guessing.
3. State plainly what you found and what you're about to do before doing it — "1" means
   skip re-explaining the project, not skip telling the user what's happening.

This shorthand only applies to a bare `1`. Any other message is treated normally as a fresh
instruction, even if it's short.

## General

- Follow `rules.md` for grading tone, severity tagging, the deploy/test/destroy sequence,
  and the safety net (billing alert, confirmed destroy) before any real cloud spend.
- Never skip the test-script grading gate (step 7.5) before an `apply`, even when resuming
  via the "1" shorthand.
