# Background — priming for: orders-api-uptime

Priming for this problem's core pieces: ALB + target group health checks, EC2 Auto Scaling
Group mechanics, and the reactive-vs-scheduled scaling tradeoff this problem's wrinkle turns
on.

**Note on how this list was built:** web search wasn't available in this session, so this
list leans more heavily on official AWS docs (with specific sections named, per this
project's own rule against bare doc-page links) than it should — the usual target is mostly
third-party content from varied sources, and this list falls short of that on this pass. Real,
stable canonical doc URLs are included below; third-party resources are named by title/channel
only where the exact current URL couldn't be verified live, rather than risking a guessed or
dead link. Worth asking for a refresh of this file once web search is available, to fill in
the third-party half properly.

## Core technology

- **Article (AWS docs)** — [Application Load Balancer: Health checks for target
  groups](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/target-group-health-checks.html).
  Read the "Health check settings" and "Health check status reason codes" sections
  specifically — not the whole ALB guide. This is the exact mechanism completion condition
  #2 (unhealthy instance auto-removed) depends on.
- **Article (AWS docs)** — [EC2 Auto Scaling: Dynamic scaling for Amazon EC2 Auto
  Scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-target-tracking.html).
  Just the "Target tracking scaling policies" section — this is the reactive half of the
  cost/resilience tradeoff the wrinkle asks you to reason about.
- **Article (AWS docs)** — [EC2 Auto Scaling: Scheduled
  scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-scheduled-scaling.html).
  The whole page is short and relevant — this is the "we know Friday noon in advance" half of
  the tradeoff; worth comparing directly against target tracking's reactive lag.

## Architecture shape (how the pieces fit together)

- **Video** — search YouTube for "AWS re:Invent Application Load Balancer Auto Scaling deep
  dive" (AWS's own re:Invent channel runs one of these most years) — couldn't verify a specific
  current talk/URL without web search this session, but re:Invent's ALB/ASG deep-dive talks are
  a reliably real, recurring series and worth finding the most recent one for the
  ALB→target-group→ASG→instance request path end to end, not just one piece in isolation.
- **Article** — search for "Gruntwork.io" or Yevgeniy Brikman's Terraform/AWS writing (e.g. the
  "Comprehensive Guide to Terraform" series) for how an ALB + ASG + launch template fit
  together as a Terraform-managed unit — again, a specific current URL couldn't be verified
  live this session, but this is a real, well-known source worth locating directly.

## Corner case / failure mode relevant to this problem's wrinkle

- **Article (AWS docs)** — [EC2 Auto Scaling: Scaling cooldowns for Amazon EC2 Auto
  Scaling](https://docs.aws.amazon.com/autoscaling/ec2/userguide/ec2-auto-scaling-cooldowns.html).
  Read this one in full (it's short) — it's the realistic failure mode for a reactive-only
  approach to a sharp, short spike: target tracking has to *detect* elevated load before it
  reacts, and a 20-30 minute spike may be over before a purely reactive scale-up fully
  provisions and passes health checks. This is exactly the tension completion condition #3
  and the wrinkle are testing.

## What to do if this list feels thin

Ask for a refresh from the viewer app's Background tab once web search is available in that
session — the third-party half of this list (videos/blog posts from named creators, not AWS's
own docs) is the part that came up short here and is worth actually filling in properly rather
than working from this reduced set.
