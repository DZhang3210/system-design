# System Design + Terraform Practice — Progress

This file is the living, human-readable record — kept small and curated on purpose. Per-
problem, per-attempt detail (dates, verdicts, findings) lives in `progress.json`, not here,
so this file stays cheap to read every session even after months of practice. Read
alongside `rules.md` (process, does not change) and, when you need attempt-level detail,
query `progress.json` rather than loading it in full — see that file's note at the top.

Update this file's "Recurring issues" and "Comfort & pacing" sections when a pattern
becomes clear across multiple attempts — not after every single attempt, and not by
appending; overwrite the relevant line so this stays a current snapshot, not a log.

## Problems started

A one-line pointer per problem — name, tier, and current state — not attempt-level detail.
For attempt history on any of these, query `progress.json` for that problem slug.

<!-- Example:
- rate-limiter (tier 1) — 2 attempts, latest solid-pass, no open blocking issues.
-->

- orders-api-uptime (tier 1) — problem issued 2026-09-03 (REST API behind ALB + ASG, Friday
  noon spike wrinkle, given-app provided). Design doc not started yet.

## Recurring issues

Mistakes that have shown up more than once, across different problems or attempts. Only
add something here once it's actually recurred (check `progress.json` if unsure) — a single
occurrence belongs in that attempt's feedback file, not here.

(none yet)

## Comfort & pacing notes

Current-state estimate, not a history — overwrite in place as it changes.

- Current tier: 1
- Design doc pacing: no data yet — default to 45–60 min for first few problems
- Terraform pacing: no data yet
- Areas of relative strength: (none identified yet)
- Areas needing more reps: (none identified yet)

## Tier status

- Tier 1: in progress, 0 problems completed
- Tier 2: not started
- Tier 3: not started
- Tier 4 (revisit-with-new-constraint): not started
