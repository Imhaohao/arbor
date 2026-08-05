// Delivery validity (Layer 5 pure helpers).
//
// A specialist runner returns a STRING even when the agent never did the work.
// Measured 2026-07-30 on live A2A endpoints:
//
//   infergonka-a2a  "[FALLBACK — auth not satisfied] agent card unreachable:
//                    HTTP 410 from https://a2a.gogonka.com/..."   -> recorded COMPLETE
//   fodda           "Fodda A2A endpoint is operational. Provide an API key
//                    via Authorization: Bearer <key>..."          -> recorded COMPLETE
//   agentcrush      '{"help": "Send a plain-text message: find <capability>..."}'
//                                                                 -> recorded COMPLETE
//
// Every one of those is a transport or auth failure wearing a 200. Because the
// battery only checked "did a string come back", delivery rate measured 100% for
// every arm — including a roster of endpoints independently probed as HTTP 410.
//
// That made the redundancy hypothesis untestable: P(at least one delivers) has
// nothing to act on when the instrument reports that everything always delivers.
//
// This module separates "the agent produced work" from "the transport produced
// prose". It is deliberately CONSERVATIVE: it only rejects on explicit failure
// markers, because misclassifying real work as a failure would understate agents
// that legitimately answer briefly.

export type DeliveryVerdict =
  | "work"
  /** Transport/auth/plumbing failure dressed as a 200 response. */
  | "transport_failure"
  /** Provider is up but demands credentials before doing anything. */
  | "credentials_required"
  /** Generic usage/help text — the endpoint answered, the task did not. */
  | "help_text"
  /** Nothing usable at all. */
  | "empty";

export interface DeliveryAssessment {
  verdict: DeliveryVerdict;
  /** True only when the agent plausibly attempted the task. */
  isWork: boolean;
  /** The marker that decided it, for auditability. */
  matched?: string;
  reason: string;
}

/** Explicit failure markers, matched case-insensitively against the delivery. */
const TRANSPORT_MARKERS: ReadonlyArray<[RegExp, string]> = [
  [/\[fallback\b/i, "fallback banner"],
  [/agent card unreachable/i, "agent card unreachable"],
  [/\bhttp\s*(4\d{2}|5\d{2})\b/i, "HTTP error status in body"],
  [/endpoint (is )?(down|unreachable|unavailable)/i, "endpoint unavailable"],
  [/\b(econnrefused|enotfound|etimedout|socket hang up)\b/i, "socket error"],
  [/failed to fetch|fetch failed|request failed/i, "fetch failure"],
  [/no runner:|no specialist runner/i, "no runner registered"],
];

const CREDENTIAL_MARKERS: ReadonlyArray<[RegExp, string]> = [
  [/provide an api key/i, "asks for an API key"],
  [/authorization:\s*bearer\s*<?key>?/i, "documents a bearer header"],
  [/get a key at\b/i, "points at a signup page"],
  [/auth (not satisfied|required|failed)/i, "auth not satisfied"],
  [/\b(unauthorized|forbidden|payment required)\b/i, "auth/payment status word"],
  [/requires? (an? )?(api key|token|credential)/i, "requires a credential"],
];

const HELP_MARKERS: ReadonlyArray<[RegExp, string]> = [
  [/send a plain[- ]text message/i, "usage instructions"],
  [/^\s*\{?\s*"?help"?\s*[:"]/i, "help payload"],
  [/available commands?\b/i, "command listing"],
  [/usage:\s/i, "usage banner"],
  [/^\s*(hello|hi)[!,. ]*(i am|i'm|this is)\b/i, "greeting boilerplate"],
];

/** Below this a reply cannot contain an answer to a non-trivial task. */
export const MIN_WORK_CHARS = 40;

function firstMatch(
  text: string,
  markers: ReadonlyArray<[RegExp, string]>,
): string | undefined {
  for (const [re, label] of markers) if (re.test(text)) return label;
  return undefined;
}

/**
 * Decide whether a delivery represents actual agent work.
 *
 * Conservative by design: only explicit markers reject. An unrecognized reply is
 * treated as work, because wrongly failing a terse-but-real answer would bias
 * the corpus against concise agents — the opposite of the bug being fixed.
 */
export function assessDelivery(deliveryText: string | undefined): DeliveryAssessment {
  const text = (deliveryText ?? "").trim();
  if (text.length === 0) {
    return { verdict: "empty", isWork: false, reason: "empty delivery" };
  }

  // Transport failures are checked FIRST: a message can both announce an outage
  // and mention a key, and the outage is the more fundamental fact.
  const transport = firstMatch(text, TRANSPORT_MARKERS);
  if (transport) {
    return {
      verdict: "transport_failure",
      isWork: false,
      matched: transport,
      reason: `transport failure reported in the body (${transport})`,
    };
  }

  const credential = firstMatch(text, CREDENTIAL_MARKERS);
  if (credential) {
    return {
      verdict: "credentials_required",
      isWork: false,
      matched: credential,
      reason: `provider demands credentials before working (${credential})`,
    };
  }

  const help = firstMatch(text, HELP_MARKERS);
  if (help) {
    return {
      verdict: "help_text",
      isWork: false,
      matched: help,
      reason: `generic help/usage text rather than task output (${help})`,
    };
  }

  if (text.length < MIN_WORK_CHARS) {
    return {
      verdict: "empty",
      isWork: false,
      reason: `delivery is ${text.length} chars, too short to answer the task`,
    };
  }

  return { verdict: "work", isWork: true, reason: "no failure marker detected" };
}

/**
 * Delivery rate over a set of runs — the metric the redundancy hypothesis needs.
 *
 * Counts only genuine work. Returns undefined for an empty set rather than 0,
 * so "we measured nothing" never renders as "everything failed".
 */
export function deliveryRate(
  deliveries: Array<string | undefined>,
): number | undefined {
  if (deliveries.length === 0) return undefined;
  const work = deliveries.filter((d) => assessDelivery(d).isWork).length;
  return work / deliveries.length;
}

/** Breakdown by verdict, for reporting WHY a roster failed. */
export function verdictBreakdown(
  deliveries: Array<string | undefined>,
): Record<DeliveryVerdict, number> {
  const out: Record<DeliveryVerdict, number> = {
    work: 0,
    transport_failure: 0,
    credentials_required: 0,
    help_text: 0,
    empty: 0,
  };
  for (const d of deliveries) out[assessDelivery(d).verdict] += 1;
  return out;
}
