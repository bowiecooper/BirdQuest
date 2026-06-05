"""Regenerate supabase/seed.sql from the trained checkpoint's class list.

The model's class indices ARE the contract between inference and the database:
`POST /predict` returns a `class_index`, and the frontend resolves it to a species
row via `species.class_index`. Generating the seed straight from `best.pth`
guarantees the two never drift.

    # from the repo root, using the model's venv (has torch):
    bird-model/.venv/bin/python supabase/scripts/gen_species_seed.py

Seeds every species at the Common tier (1 point); `rarity_tier` is nullable and
real eBird-frequency-based tiers are a later enrichment task. `scientific_name`
is left NULL for the same reason.
"""

from __future__ import annotations

from pathlib import Path

import torch

REPO = Path(__file__).resolve().parents[2]
CKPT = REPO / "bird-model" / "checkpoints" / "best.pth"
OUT = REPO / "supabase" / "seed.sql"


def sql_escape(s: str) -> str:
    return s.replace("'", "''")


def main() -> int:
    ckpt = torch.load(CKPT, map_location="cpu", weights_only=False)
    classes: list[str] = ckpt["classes"]

    rows = ",\n".join(
        f"  ({i}, '{sql_escape(name)}', NULL, 'Common', 1)"
        for i, name in enumerate(classes)
    )

    sql = f"""-- Species catalog for BirdQuest — GENERATED, do not edit by hand.
-- Source: bird-model/checkpoints/best.pth  ({len(classes)} CUB-200 classes)
-- Regenerate: bird-model/.venv/bin/python supabase/scripts/gen_species_seed.py
--
-- class_index is the join key to model predictions (POST /predict).
-- All species seeded at the Common tier (1 pt); rarity_tier is nullable and
-- refined from eBird frequency data later.

insert into public.species (class_index, common_name, scientific_name, rarity_tier, points)
values
{rows}
on conflict (class_index) do update
  set common_name = excluded.common_name;
"""

    OUT.write_text(sql)
    print(f"Wrote {OUT.relative_to(REPO)} with {len(classes)} species.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
