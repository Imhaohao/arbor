import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval(
  "hive payout accrual",
  { hours: 24 },
  internal.settlement.accrueCurrentAndPrevious,
  {},
);

// Golden-task audit lane: posts at most one reference-answer audit task per
// ARBOR_GOLDEN_MIN_INTERVAL_HOURS (default 24h); a no-op unless
// ARBOR_GOLDEN_AUDIT_ENABLED=true. The tick only gives the interval cap
// chances to fire — the cap, not this interval, sets the real rate.
//
// 1h rather than 6h because the tick was the binding constraint: a 6h tick
// caps the lane at 4 posts/day no matter how low the interval cap is set, and
// the settlement-audit protocol needs 12-24/day to reach N=500 in 3-6 weeks.
crons.interval(
  "golden task audit post",
  { hours: 1 },
  internal.goldenTasks.maybePostGolden,
  {},
);

export default crons;
