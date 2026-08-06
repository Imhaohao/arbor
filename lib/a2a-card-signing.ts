import crypto from "node:crypto";

/**
 * A2A Agent Card signing and verification (JWS per RFC 7515, payload
 * canonicalized with JCS per RFC 8785).
 *
 * Version context: the `signatures` field exists on AgentCard from A2A v0.3.0
 * (the version Arbor's card targets), but the normative procedure — JCS
 * canonicalization, `signatures` excluded from the signed payload, jku/kid in
 * the protected header — is specified in A2A v1.0. We follow the v1.0
 * procedure for interop while staying on the v0.3.0 card shape.
 *
 * What a valid signature attests: integrity and origin of the card — the
 * holder of the key published exactly these bytes. It attests NOTHING about
 * whether the advertised skills work; capability evidence stays with the
 * eval gate and smoke probes.
 *
 * Env:
 *   ARBOR_A2A_CARD_SIGNING_JWK — private key as a JWK JSON string
 *                                (EC P-256 -> ES256, or RSA -> RS256).
 *   ARBOR_A2A_CARD_SIGNING_KID — optional key id (default: jwk.kid or "arbor-1").
 */

// ─── RFC 8785 JSON Canonicalization Scheme ──────────────────────────────────
//
// JSON.stringify already matches RFC 8785 for primitive serialization: string
// escaping (shortest form, \u00XX for controls) and number formatting (the
// ECMAScript Number-to-String algorithm the RFC adopts). What it does not
// guarantee is member ordering, so objects are rebuilt with keys sorted by
// UTF-16 code units (plain Array.sort on strings), recursively.

export function jcsCanonicalize(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) {
        throw new Error("JCS: non-finite numbers are not valid JSON");
      }
      return JSON.stringify(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new Error(`JCS: cannot canonicalize a ${typeof value}`);
  }
  if (Array.isArray(value)) {
    // JSON.stringify maps undefined array elements to null; mirror that.
    return `[${value
      .map((item) => (item === undefined ? "null" : jcsCanonicalize(item)))
      .join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort();
  const members = keys.map(
    (key) => `${JSON.stringify(key)}:${jcsCanonicalize(record[key])}`,
  );
  return `{${members.join(",")}}`;
}

// ─── JWS helpers ────────────────────────────────────────────────────────────

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function b64urlJson(value: unknown): string {
  return b64url(Buffer.from(JSON.stringify(value), "utf8"));
}

type JwsAlg = "ES256" | "RS256";

interface Jwk {
  kty?: string;
  crv?: string;
  kid?: string;
  alg?: string;
  [key: string]: unknown;
}

function algForJwk(jwk: Jwk): JwsAlg {
  if (jwk.kty === "EC" && jwk.crv === "P-256") return "ES256";
  if (jwk.kty === "RSA") return "RS256";
  throw new Error(
    `unsupported card-signing key (kty=${jwk.kty} crv=${jwk.crv}); use EC P-256 or RSA`,
  );
}

/** ES256 signatures are raw R||S per RFC 7518, not DER. */
function signParams(alg: JwsAlg, key: crypto.KeyObject) {
  return alg === "ES256"
    ? { key, dsaEncoding: "ieee-p1363" as const }
    : key;
}

export interface AgentCardSignature {
  protected: string;
  signature: string;
  header?: Record<string, unknown>;
}

export interface SignableCard {
  signatures?: AgentCardSignature[];
  [key: string]: unknown;
}

/** The signed payload is the card WITHOUT its signatures field (spec MUST). */
function signingPayload(card: SignableCard): string {
  const { signatures: _omit, ...rest } = card;
  return b64url(Buffer.from(jcsCanonicalize(rest), "utf8"));
}

export function signAgentCard<C extends SignableCard>(
  card: C,
  opts: { privateKeyJwk: Jwk; kid: string; jku: string },
): C & { signatures: AgentCardSignature[] } {
  const key = crypto.createPrivateKey({
    key: opts.privateKeyJwk as crypto.JsonWebKey,
    format: "jwk",
  });
  const alg = algForJwk(opts.privateKeyJwk);
  const protectedHeader = b64urlJson({
    alg,
    typ: "JOSE",
    kid: opts.kid,
    jku: opts.jku,
  });
  const input = `${protectedHeader}.${signingPayload(card)}`;
  const signature = b64url(
    crypto.sign("sha256", Buffer.from(input, "ascii"), signParams(alg, key)),
  );
  return {
    ...card,
    signatures: [{ protected: protectedHeader, signature }],
  };
}

// ─── Env-driven signing for Arbor's own card ────────────────────────────────

function loadPrivateJwkFromEnv(): { jwk: Jwk; kid: string } | undefined {
  const raw = process.env.ARBOR_A2A_CARD_SIGNING_JWK?.trim();
  if (!raw) return undefined;
  const jwk = JSON.parse(raw) as Jwk;
  const kid =
    process.env.ARBOR_A2A_CARD_SIGNING_KID?.trim() || jwk.kid || "arbor-1";
  return { jwk, kid };
}

let warnedBadKey = false;

/**
 * Sign the market card when a signing key is configured; otherwise return it
 * unchanged. A malformed key logs once and serves the card unsigned rather
 * than turning the discovery route into a 500 — discovery availability beats
 * signature availability.
 */
export function signCardFromEnv<C extends SignableCard & { url?: string }>(
  card: C,
): C {
  let loaded: { jwk: Jwk; kid: string } | undefined;
  try {
    loaded = loadPrivateJwkFromEnv();
    if (!loaded) return card;
    const origin = new URL(card.url ?? "").origin;
    return signAgentCard(card, {
      privateKeyJwk: loaded.jwk,
      kid: loaded.kid,
      jku: `${origin}/.well-known/jwks.json`,
    });
  } catch (err) {
    if (!warnedBadKey) {
      warnedBadKey = true;
      console.warn(
        `[a2a-card-signing] serving card unsigned: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return card;
  }
}

/** Public JWKS for /.well-known/jwks.json; undefined when signing is off. */
export function publicJwksFromEnv():
  | { keys: Array<Record<string, unknown>> }
  | undefined {
  const loaded = loadPrivateJwkFromEnv();
  if (!loaded) return undefined;
  const priv = crypto.createPrivateKey({
    key: loaded.jwk as crypto.JsonWebKey,
    format: "jwk",
  });
  const pub = crypto.createPublicKey(priv).export({ format: "jwk" }) as Record<
    string,
    unknown
  >;
  return {
    keys: [
      { ...pub, kid: loaded.kid, use: "sig", alg: algForJwk(loaded.jwk) },
    ],
  };
}

// ─── Verification (registry-side trust signal) ──────────────────────────────

export type CardSignatureStatus = "unsigned" | "valid" | "invalid";

export interface CardSignatureResult {
  status: CardSignatureStatus;
  /** kid of the first signature that verified (valid only). */
  kid?: string;
  alg?: string;
  /** Origin the verification keys came from — trust is scoped to it. */
  jwksOrigin?: string;
  reason?: string;
}

type JsonFetcher = (url: string) => Promise<unknown>;

const JWKS_FETCH_TIMEOUT_MS = 3_000;
const JWKS_MAX_BYTES = 64 * 1024;

/** https-only, timeout-bounded, size-capped JWKS fetch. The jku URL comes
 * from the (untrusted) card, so this must never reach into private space —
 * refuse plain http and non-default-port localhost-ish hosts outright. */
async function defaultFetchJson(url: string): Promise<unknown> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error(`jwks url must be https, got ${parsed.protocol}//`);
  }
  const host = parsed.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error(`refusing jwks fetch to private host ${host}`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), JWKS_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`jwks fetch HTTP ${res.status}`);
    const text = await res.text();
    if (text.length > JWKS_MAX_BYTES) throw new Error("jwks response too large");
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function parseProtected(sig: AgentCardSignature): Record<string, unknown> {
  return JSON.parse(
    Buffer.from(sig.protected, "base64url").toString("utf8"),
  ) as Record<string, unknown>;
}

function keysFromJwks(jwks: unknown): Jwk[] {
  const keys = (jwks as { keys?: unknown })?.keys;
  return Array.isArray(keys) ? (keys as Jwk[]) : [];
}

/**
 * Verify a fetched external agent card's signatures.
 *
 * Key discovery: an injected `jwks` wins (tests, pinned keys); otherwise the
 * signature's own `jku`; otherwise `{cardOrigin}/.well-known/jwks.json` when
 * `cardOrigin` is supplied. A card whose keys come from its own origin proves
 * exactly self-consistency — the publisher controls both card and keys — so
 * `jwksOrigin` is reported and stored rather than treated as third-party
 * attestation.
 */
export async function verifyAgentCardSignatures(
  card: SignableCard,
  opts?: {
    jwks?: unknown;
    cardOrigin?: string;
    fetchJson?: JsonFetcher;
  },
): Promise<CardSignatureResult> {
  const sigs = card.signatures ?? [];
  if (sigs.length === 0) return { status: "unsigned" };

  const fetchJson = opts?.fetchJson ?? defaultFetchJson;
  const payload = signingPayload(card);
  let lastReason = "no signature verified";

  for (const sig of sigs) {
    try {
      const header = parseProtected(sig);
      const alg = header.alg;
      if (alg !== "ES256" && alg !== "RS256") {
        lastReason = `unsupported alg ${String(alg)}`;
        continue;
      }
      let jwks = opts?.jwks;
      let jwksOrigin: string | undefined;
      if (!jwks) {
        const jku = typeof header.jku === "string" ? header.jku : undefined;
        const url =
          jku ??
          (opts?.cardOrigin
            ? `${opts.cardOrigin}/.well-known/jwks.json`
            : undefined);
        if (!url) {
          lastReason = "no jku and no cardOrigin to locate keys";
          continue;
        }
        jwks = await fetchJson(url);
        jwksOrigin = new URL(url).origin;
      }
      const kid = typeof header.kid === "string" ? header.kid : undefined;
      const all = keysFromJwks(jwks);
      const candidates = kid
        ? all.filter((k) => k.kid === kid).concat(all.filter((k) => k.kid !== kid))
        : all;
      if (candidates.length === 0) {
        lastReason = "jwks contained no keys";
        continue;
      }
      const input = Buffer.from(`${sig.protected}.${payload}`, "ascii");
      const rawSig = Buffer.from(sig.signature, "base64url");
      for (const jwk of candidates) {
        try {
          const key = crypto.createPublicKey({
            key: jwk as crypto.JsonWebKey,
            format: "jwk",
          });
          const ok = crypto.verify(
            "sha256",
            input,
            alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key,
            rawSig,
          );
          if (ok) {
            return { status: "valid", kid: jwk.kid ?? kid, alg, jwksOrigin };
          }
        } catch {
          // key unusable for this alg — try the next one
        }
      }
      lastReason = "signature did not verify against any key";
    } catch (err) {
      lastReason = err instanceof Error ? err.message : String(err);
    }
  }
  return { status: "invalid", reason: lastReason.slice(0, 200) };
}

/** One-line summary for probe excerpts / logs: "card_sig:valid kid=arbor-1". */
export function cardSignatureNote(result: CardSignatureResult): string {
  if (result.status === "valid") {
    return `card_sig:valid kid=${result.kid ?? "?"}`;
  }
  if (result.status === "invalid") {
    return `card_sig:invalid (${result.reason ?? "unknown"})`;
  }
  return "card_sig:unsigned";
}
