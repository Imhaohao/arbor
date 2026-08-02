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
// ARBOR_GOLDEN_AUDIT_ENABLED=true. The 6h tick just gives the interval cap
// regular chances to fire.
crons.interval(
  "golden task audit post",
  { hours: 6 },
  internal.goldenTasks.maybePostGolden,
  {},
);

export default crons;
