# Problem: Orders API uptime

**Tier:** 1 — basic AWS/networking reps.

## Stakeholder message

> Hey — it's Priya, I run ops for a small D2C brand. Our "orders" API (the thing our
> storefront calls to place and look up orders) has been running on a single EC2 box since
> launch. It's fine most of the week, but every Friday at noon we send a marketing blast to
> our email list and traffic spikes hard for about 20-30 minutes — and twice now the box has
> just fallen over during that window, which means checkout is down while people are actively
> trying to buy things. That's the worst possible time for it to happen.
>
> I want this fixed properly, not just "give the box more RAM." But I also don't have a big
> budget — we're a small team, keep this cheap. It should basically never go down, especially
> not during the Friday spike, and if a server does have a problem I don't want anyone to have
> to SSH in and restart something at noon on a Friday.
>
> The API itself is simple, I'll give you the code — you're just fixing how it's deployed and
> making it resilient to the traffic pattern.

## Given application

A minimal "orders" REST API is provided under `given-app/` (see `given-app-spec.md` for the
spec). Read the actual generated code before designing around it.

## Functional requirements

- Deploy the given orders API so it's reachable over HTTP(S) from the public internet.
- The API must keep serving traffic through the Friday-noon spike window without manual
  intervention.
- An unhealthy instance must be detected and removed from serving traffic automatically, with
  no human needed to intervene (Priya explicitly does not want anyone SSHing in at noon on a
  Friday).
- Normal (non-spike) traffic is low — call it a small handful of requests per minute the rest
  of the week.

## Scale / traffic pattern

- Baseline: light, sporadic traffic, well within a single small instance's capacity.
- Friday spike: roughly 20–30 minutes of significantly elevated load once a week, at a
  predictable time (noon). Exact multiplier is intentionally unspecified — the design should
  reason about how it detects and reacts to the spike, not just hardcode a guessed number.

## Out of scope

- Multi-region failover.
- CI/CD pipeline for deploying new versions of the app.
- Authentication/authorization on the API itself.
- A managed database — the given app's persistence is intentionally trivial (see
  `given-app-spec.md`); do not design around swapping it for RDS/DynamoDB unless you think
  that's genuinely required to meet the completion conditions below.

## The wrinkle

Priya asked for two things that are in tension: **"keep it cheap"** and **"basically never go
down, especially not during the Friday spike."** Running enough capacity 24/7 to always
absorb the Friday spike without a scale-up event is not cheap for a small team's baseline
traffic; running exactly enough for baseline traffic isn't resilient to a 20-30 minute weekly
spike. The design needs to actually reconcile this (e.g. scale reactively/on a schedule rather
than just over-provisioning flat capacity, and be explicit about the cost/resilience tradeoff
chosen) rather than silently picking one side and ignoring the other.

## Explicit completion conditions

1. The API is reachable behind a load balancer, not a bare instance IP — no single instance
   is a single point of failure for serving traffic.
2. An instance that fails a health check is automatically removed from rotation and replaced,
   with no manual step.
3. The design can absorb the described Friday-noon spike (elevated load for 20-30 minutes)
   without falling over or requiring someone to manually intervene at that time.
4. The design states, explicitly, its approach to the cost/resilience tradeoff from the
   wrinkle above (e.g. why scheduled/reactive scaling was or wasn't used, and what it costs
   roughly relative to just leaving flat capacity running).
5. Baseline (non-spike) cost stays small — the design should not default to "just run peak
   capacity all the time" as its answer without justifying why.

## Suggested timebox

- Design doc: 45–60 minutes (first tier-1 problem — take the extra room).
- Terraform: no fixed baseline yet; take what you need and we'll calibrate pacing from this
  attempt.

## Judgment calls made issuing this problem

- No prior attempts exist yet, so there's no difficulty jump to flag — this is a clean tier-1
  start per `rules.md`'s ramp-up guidance (single-service, single-region, core AWS
  networking/Terraform mechanics), not a multi-component problem.
- Chose "REST API behind a load balancer with autoscaling" over a static site or bare VPC
  problem as the first rep, since it's the more common real-world tier-1 shape and pairs
  naturally with a given-app (more representative of "front/scale existing app logic," which
  this project's rules call out as a recurring problem type worth reps on).
- Kept the given-app deliberately trivial (in-memory orders store, no real DB) so the exercise
  stays about the infrastructure, not about reverse-engineering app logic.
