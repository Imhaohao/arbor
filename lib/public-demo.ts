/**
 * Explicit isolation switch for a public Arbor preview. This must only be set
 * on an isolated non-production deployment: it removes live specialist access
 * and allows the deterministic demo lane to prove the Hive lifecycle safely.
 */
export function publicDemoMode(): boolean {
  return process.env.ARBOR_PUBLIC_DEMO_MODE === "true";
}

export const PUBLIC_DEMO_AGENT_ID = "arbor-public-demo";
