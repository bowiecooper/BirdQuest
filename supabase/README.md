# BirdQuest — Supabase (database, auth, RLS)

Postgres schema for the BirdQuest product layer: user profiles, the species
catalog, sightings (the life list), birding groups, link-based invites, and a
rarity-weighted leaderboard. Auth, storage, and the API are handled by Supabase;
this directory is the version-controlled schema.

## Layout
```
migrations/
  20260604000001_initial_schema.sql   tables, enums, indexes, new-user -> profile trigger
  20260604000002_rls_policies.sql      RLS + membership helper functions (Letterboxd-style)
  20260604000003_leaderboard_view.sql  rarity-weighted leaderboard view + redeem_invite()
  20260604000004_storage.sql           public `sightings` bucket + storage RLS
  20260604000005_reusable_invites.sql  redeem_invite() made reusable (no longer single-use)
seed.sql                               200-species catalog (GENERATED from the model)
scripts/gen_species_seed.py            regenerates seed.sql from bird-model/checkpoints/best.pth
```

## Data model
| Table | Purpose |
|-------|---------|
| `profiles` | app-facing user data, 1:1 with `auth.users` (auto-created on signup) |
| `species` | catalog; `class_index` is the join key to model predictions |
| `sightings` | a user's observation; `model_top5` (jsonb) preserves the prediction for a future retraining flywheel |
| `groups` / `group_members` / `group_invites` | birding groups + link-based invites |
| `group_leaderboard` (view) | per-member SUM of `species.points` over **distinct confirmed** species |

## Security model (RLS)
Public, Letterboxd-style: anyone (including logged-out) can **read** profiles,
species, and sightings; users may only **write** their own rows. Groups gate
their own membership/invites; private groups are invisible to non-members.
`is_group_member()` / `is_group_admin()` are `SECURITY DEFINER` helpers so
membership checks don't recurse through `group_members`' own policies.
`redeem_invite(token)` lets an invitee join atomically without read access to the
invites table.

## Apply it

### Option A — Supabase CLI (recommended)
```bash
supabase init                       # if not already initialized
supabase link --project-ref <ref>   # link to your cloud project
supabase db push                    # applies migrations/ in order
psql "$DATABASE_URL" -f supabase/seed.sql   # load the species catalog
```
Local stack: `supabase start` (applies migrations + `seed.sql` automatically).

### Option B — Dashboard SQL editor (no CLI)
Paste and run, **in order**: each file in `migrations/` (oldest first), then
`seed.sql`. The species catalog is idempotent (`on conflict (class_index)`),
so it's safe to re-run.

## Regenerating the species seed
The model's class indices are the contract between inference and the DB. If the
model is retrained with different classes, regenerate the seed so they stay in
sync:
```bash
bird-model/.venv/bin/python supabase/scripts/gen_species_seed.py
```

## Notes / later work
- All species are seeded at the **Common** tier (1 pt); `rarity_tier` is nullable.
  Real eBird-frequency-based tiers and `scientific_name` are a later enrichment.
- Invites are **reusable share links** (migration 0005): a token stays `active`
  and can be redeemed by many people. Admins kill a link by setting `status =
  'revoked'` (the UI's "Regenerate" revokes the old one and mints a new token).
- Validated against Postgres 16 with a stubbed `auth` schema: migrations apply
  clean, the signup trigger, RLS policies, leaderboard, and `redeem_invite` all
  behave as intended.
