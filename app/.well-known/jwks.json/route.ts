/**
 * Public JWKS for Agent Card signature verification.
 *
 * The card's JWS protected header carries `jku` pointing here (A2A v1.0
 * signing procedure; see lib/a2a-card-signing.ts). Serves only the public
 * key derived from ARBOR_A2A_CARD_SIGNING_JWK; 404 when signing is off so
 * clients can distinguish "unsigned by policy" from an empty key set.
 */

import { publicJwksFromEnv } from "@/lib/a2a-card-signing";
import { jsonOk, jsonError, corsPreflight } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const jwks = publicJwksFromEnv();
  if (!jwks) return jsonError("card signing is not enabled", 404);
  return jsonOk(jwks);
}

export function OPTIONS() {
  return corsPreflight();
}
