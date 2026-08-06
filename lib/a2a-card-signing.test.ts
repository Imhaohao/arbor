import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  cardSignatureNote,
  jcsCanonicalize,
  publicJwksFromEnv,
  signAgentCard,
  signCardFromEnv,
  verifyAgentCardSignatures,
} from "./a2a-card-signing";

async function main(): Promise<void> {
  // ─── RFC 8785 canonicalization ────────────────────────────────────────────

  assert.equal(
    jcsCanonicalize({ b: 2, a: 1 }),
    '{"a":1,"b":2}',
    "keys sorted",
  );
  assert.equal(
    jcsCanonicalize({ nested: { z: [1, "two", null], a: true } }),
    '{"nested":{"a":true,"z":[1,"two",null]}}',
    "recursive sort, arrays in order",
  );
  assert.equal(jcsCanonicalize(1e30), "1e+30", "ES number serialization");
  assert.equal(jcsCanonicalize(10), "10", "integer form");
  assert.equal(
    jcsCanonicalize({ a: undefined, b: 1 }),
    '{"b":1}',
    "undefined-valued members dropped (JSON semantics)",
  );
  assert.equal(
    jcsCanonicalize({ "€": "euro", A: 1 }),
    '{"A":1,"€":"euro"}',
    "UTF-16 code-unit key ordering",
  );
  assert.throws(() => jcsCanonicalize(Number.POSITIVE_INFINITY), /non-finite/);
  console.log("ok — JCS canonicalization");

  // ─── ES256 round-trip ─────────────────────────────────────────────────────

  const ec = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const ecPrivJwk = ec.privateKey.export({ format: "jwk" }) as Record<
    string,
    unknown
  >;
  const ecPubJwk = ec.publicKey.export({ format: "jwk" }) as Record<
    string,
    unknown
  >;

  const card = {
    protocolVersion: "0.3.0",
    name: "Test Agent",
    url: "https://agent.example/api/a2a",
    skills: [{ id: "demo", name: "demo" }],
  };

  const signed = signAgentCard(card, {
    privateKeyJwk: ecPrivJwk,
    kid: "test-1",
    jku: "https://agent.example/.well-known/jwks.json",
  });
  assert.equal(signed.signatures.length, 1);
  assert.equal(signed.name, "Test Agent", "card content untouched");

  const jwks = { keys: [{ ...ecPubJwk, kid: "test-1" }] };
  const ok = await verifyAgentCardSignatures(signed, { jwks });
  assert.equal(ok.status, "valid");
  assert.equal(ok.kid, "test-1");
  assert.equal(ok.alg, "ES256");
  assert.equal(cardSignatureNote(ok), "card_sig:valid kid=test-1");
  console.log("ok — ES256 sign/verify round-trip");

  // ─── Tamper detection ─────────────────────────────────────────────────────

  const tampered = { ...signed, name: "Evil Agent" };
  const bad = await verifyAgentCardSignatures(tampered, { jwks });
  assert.equal(bad.status, "invalid", "tampered card must not verify");

  // Reordering keys must NOT break verification (canonicalization). Same
  // content as `card`, every level written in a different key order.
  const reordered = {
    url: "https://agent.example/api/a2a",
    skills: [{ name: "demo", id: "demo" }],
    protocolVersion: "0.3.0",
    name: "Test Agent",
    signatures: signed.signatures,
  };
  const stillOk = await verifyAgentCardSignatures(reordered, { jwks });
  assert.equal(stillOk.status, "valid", "key order must not affect verification");
  console.log("ok — tamper detected, reorder tolerated");

  // ─── Unsigned and wrong-key ───────────────────────────────────────────────

  assert.equal((await verifyAgentCardSignatures(card, { jwks })).status, "unsigned");
  const otherEc = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const wrongJwks = {
    keys: [
      {
        ...(otherEc.publicKey.export({ format: "jwk" }) as Record<string, unknown>),
        kid: "test-1",
      },
    ],
  };
  assert.equal(
    (await verifyAgentCardSignatures(signed, { jwks: wrongJwks })).status,
    "invalid",
  );
  console.log("ok — unsigned and wrong-key statuses");

  // ─── RS256 round-trip ─────────────────────────────────────────────────────

  const rsa = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const rsaSigned = signAgentCard(card, {
    privateKeyJwk: rsa.privateKey.export({ format: "jwk" }) as Record<
      string,
      unknown
    >,
    kid: "rsa-1",
    jku: "https://agent.example/.well-known/jwks.json",
  });
  const rsaOk = await verifyAgentCardSignatures(rsaSigned, {
    jwks: {
      keys: [
        {
          ...(rsa.publicKey.export({ format: "jwk" }) as Record<string, unknown>),
          kid: "rsa-1",
        },
      ],
    },
  });
  assert.equal(rsaOk.status, "valid");
  assert.equal(rsaOk.alg, "RS256");
  console.log("ok — RS256 sign/verify round-trip");

  // ─── jku fetch path (injected fetcher; no network) ────────────────────────

  let fetchedUrl = "";
  const viaJku = await verifyAgentCardSignatures(signed, {
    fetchJson: async (url) => {
      fetchedUrl = url;
      return jwks;
    },
  });
  assert.equal(viaJku.status, "valid");
  assert.equal(fetchedUrl, "https://agent.example/.well-known/jwks.json");
  assert.equal(viaJku.jwksOrigin, "https://agent.example");
  console.log("ok — jku-driven key discovery");

  // ─── Env-driven signing (signCardFromEnv + publicJwksFromEnv) ─────────────

  const prevJwk = process.env.ARBOR_A2A_CARD_SIGNING_JWK;
  const prevKid = process.env.ARBOR_A2A_CARD_SIGNING_KID;

  delete process.env.ARBOR_A2A_CARD_SIGNING_JWK;
  assert.equal(
    (signCardFromEnv(card) as { signatures?: unknown[] }).signatures,
    undefined,
    "no env key -> unsigned card",
  );
  assert.equal(publicJwksFromEnv(), undefined, "no env key -> no JWKS");

  process.env.ARBOR_A2A_CARD_SIGNING_JWK = JSON.stringify(ecPrivJwk);
  process.env.ARBOR_A2A_CARD_SIGNING_KID = "env-key-1";
  const envSigned = signCardFromEnv(card) as typeof signed;
  assert.equal(envSigned.signatures?.length, 1, "env key -> signed card");
  const envJwks = publicJwksFromEnv();
  assert.ok(envJwks && envJwks.keys.length === 1, "env key -> public JWKS");
  assert.equal(envJwks.keys[0].kid, "env-key-1");
  assert.equal(envJwks.keys[0].alg, "ES256");
  assert.ok(
    !("d" in envJwks.keys[0]),
    "public JWKS must not leak the private scalar",
  );
  const envVerify = await verifyAgentCardSignatures(envSigned, { jwks: envJwks });
  assert.equal(envVerify.status, "valid", "env-signed card verifies against served JWKS");
  // jku must point at the card's own origin
  const header = JSON.parse(
    Buffer.from(envSigned.signatures[0].protected, "base64url").toString("utf8"),
  );
  assert.equal(header.jku, "https://agent.example/.well-known/jwks.json");
  assert.equal(header.typ, "JOSE");

  if (prevJwk === undefined) delete process.env.ARBOR_A2A_CARD_SIGNING_JWK;
  else process.env.ARBOR_A2A_CARD_SIGNING_JWK = prevJwk;
  if (prevKid === undefined) delete process.env.ARBOR_A2A_CARD_SIGNING_KID;
  else process.env.ARBOR_A2A_CARD_SIGNING_KID = prevKid;
  console.log("ok — env-driven signing and JWKS");

  console.log("a2a-card-signing: all tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
