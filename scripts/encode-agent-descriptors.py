#!/usr/bin/env python3
"""Offline encoder job for encoder-target decoupling (arXiv:2603.20895).

Reads every agent's descriptor out of Convex, runs it through the local
all-MiniLM-L6-v2 encoder, projects with the FROZEN basis in
lib/hive/encoder-projection.json, and writes the 8-dim vectors that
lib/hive/encoder-head-core.ts consumes.

    pip install transformers torch numpy
    python3 scripts/encode-agent-descriptors.py --out /tmp/vectors.json
    npm run reputation:prior -- --vectors /tmp/vectors.json --write

WHY THE PROJECTION IS FROZEN AND CHECKED IN. The shipped model file carries
coef/intercept/platt but originally carried no PCA basis and no scaler, so the
vectors those coefficients were fit against could not be regenerated — encoding
a new agent would have required refitting the whole pipeline, which silently
invalidates the coefficients. encoder-projection.json is that missing half,
recovered by replaying the training pipeline and verified against the seven
fixtures baked into encoder-head-model.json (worst component error 4.7e-5).
Refit it only alongside new coefficients, never on its own.

WHY MiniLM. It is the cheapest encoder that still exposes PER-LAYER hidden
states, which Fisher layer selection needs; Ollama only ever returns
final-layer pooled vectors. $0/call, ~0.8ms per text batched, weights already
cached under ~/.cache/huggingface. Fisher J picked layer 2 (0.4341); layer 6
was worst (0.1270).
"""
import argparse
import json
import os
import subprocess
import sys

import numpy as np

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECTION = os.path.join(REPO, "lib", "hive", "encoder-projection.json")
MODEL_JSON = os.path.join(REPO, "lib", "hive", "encoder-head-model.json")
ENCODER = "sentence-transformers/all-MiniLM-L6-v2"
MAX_LENGTH = 256


def fetch_descriptors():
    """Pull already-built descriptors for the whole roster via the Convex CLI.

    The descriptor serialization is a MODEL CONTRACT — field order, the ' . '
    separator, and the 1000-character clamp are all baked into the trained
    coefficients. It is built by buildAgentDescriptor() in TypeScript and
    fetched here rather than reimplemented, because a second copy would drift
    and the head would keep producing plausible numbers that mean nothing.
    """
    out = subprocess.run(
        ["npx", "convex", "run", "reputationPrior:_descriptorFields", "{}"],
        cwd=REPO, capture_output=True, text=True, check=True,
    ).stdout
    start = out.index("[")
    return json.loads(out[start:])


def encode(texts, batch_size=64):
    """(n_texts, hidden) mask-weighted mean-pooled activations at the frozen layer."""
    import torch
    from transformers import AutoTokenizer, AutoModel

    proj = json.load(open(PROJECTION))
    layer = proj["layer"]
    tok = AutoTokenizer.from_pretrained(ENCODER)
    model = AutoModel.from_pretrained(ENCODER, output_hidden_states=True)
    model.eval()

    out = []
    with torch.no_grad():
        for i in range(0, len(texts), batch_size):
            enc = tok(texts[i : i + batch_size], padding=True, truncation=True,
                      max_length=MAX_LENGTH, return_tensors="pt")
            hidden = model(**enc).hidden_states[layer]
            mask = enc["attention_mask"].unsqueeze(-1).float()
            pooled = (hidden * mask).sum(dim=1) / mask.sum(dim=1).clamp(min=1e-9)
            out.append(pooled.cpu().numpy())
            print(f"\r  {min(i + batch_size, len(texts))}/{len(texts)}", end="", file=sys.stderr)
    print(file=sys.stderr)
    return np.concatenate(out, axis=0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True, help="where to write the vectors JSON")
    args = ap.parse_args()

    proj = json.load(open(PROJECTION))
    head = json.load(open(MODEL_JSON))
    components = np.array(proj["pca_components"])       # (8, 384)
    pca_mean = np.array(proj["pca_mean"])               # (384,)
    scaler_mean = np.array(proj["scaler_mean"])         # (8,)
    scaler_std = np.array(proj["scaler_std"])           # (8,)
    coef = np.array(head["coef"])
    intercept = head["intercept"]

    rows = fetch_descriptors()
    print(f"encoding {len(rows)} agent descriptors with {ENCODER}", file=sys.stderr)
    texts = [r["descriptor"] for r in rows]
    H = encode(texts)
    V = ((H - pca_mean) @ components.T - scaler_mean) / scaler_std
    logits = intercept + V @ coef

    # Self-check against the shipped fixtures. A drifted encoder build or a
    # refit projection would otherwise go unnoticed until routing degraded.
    by_id = {r["agent_id"]: i for i, r in enumerate(rows)}
    worst = 0.0
    for f in head.get("fixtures", []):
        if f["agent_id"] in by_id:
            worst = max(worst, float(np.abs(V[by_id[f["agent_id"]]] - np.array(f["vector"])).max()))
    print(f"worst fixture component error: {worst:.2e}", file=sys.stderr)
    if worst > 1e-3:
        sys.exit("fixtures do not reproduce — refusing to emit vectors")

    json.dump(
        [
            {
                "agent_id": r["agent_id"],
                "vector": [round(float(x), 6) for x in V[i]],
                "logit": round(float(logits[i]), 6),
                "descriptor": texts[i],
            }
            for i, r in enumerate(rows)
        ],
        open(args.out, "w"),
    )
    print(f"wrote {len(rows)} vectors to {args.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
