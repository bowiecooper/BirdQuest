# BirdQuest — Full App Roadmap (ML/AI portfolio focus)

> "Letterboxd for birding." Users photograph birds, an **ML model I trained**
> identifies the species, users build a life list, form groups, and compete on a
> rarity-weighted leaderboard.

**This is a portfolio project targeting ML/AI roles, ~few-weeks timeline.**
The trained bird-classification model is the centerpiece; the React + Supabase app
is the wrapper that proves end-to-end ML delivery (training → serving → product).

Decisions locked in:

- **The ML model is the headline.** Train a fine-grained bird-species classifier
  (transfer learning), report metrics, serve it, and make it explainable in the UI.
- **Backend / DB / auth:** Supabase (Postgres + Auth + Storage + RLS)
- **Inference service:** Python **FastAPI** serving the PyTorch model (this is the
  resume-relevant backend, not a generic Node CRUD server)
- **Leaderboard scoring:** rarity-weighted
- **Process:** plan first, review, then build in phases

---

## 0. Why this is a strong ML resume project

- **Fine-grained visual classification (FGVC)** — distinguishing visually similar
  species (a Cooper's vs a Sharp-shinned Hawk) is a *named, respected* CV problem.
  CUB-200-2011 is the standard benchmark. This is not a toy.
- **End-to-end ML**, not just a notebook: data → training → evaluation → model
  serving (FastAPI) → integrated into a real product → deployed. This breadth is
  exactly what ML-engineer hiring looks for.
- **Human-in-the-loop data flywheel**: the "user confirms the species among the
  model's top-5 guesses" UX *is* a labeled-data collection loop. We can frame a
  retraining / active-learning story around user-confirmed sightings.
- **Explainability**: Grad-CAM heatmaps showing *where the model looked* — a
  killer demo visual and a real talking point on model interpretability.

---

## 1. The ML model (the centerpiece)

- **Task:** fine-grained image classification, top-k species prediction.
- **Dataset:** **CUB-200-2011** (200 species, ~11,788 images) as the primary;
  optionally **NABirds** (~400 NA species) if we want broader/North-America
  coverage. Standard train/test split.
- **Approach:** transfer learning from an ImageNet-pretrained backbone. Fine-tune;
  data augmentation (random crop, flip, color jitter); handle class imbalance.
- **Backbone choice driven by 4GB VRAM** (see compute below): start with
  **EfficientNet-B0** or **ResNet-50** at 224px, **mixed precision (AMP)**, batch
  ~16–32, gradient accumulation if needed. ViT-large is too heavy for 4GB — skip.
  Two-stage: train the head first (backbone frozen), then unfreeze + fine-tune.
- **Outputs:** **top-5 candidate species + calibrated confidences** (drives the
  user-confirm UX directly), plus a **Grad-CAM** heatmap.
- **Evaluation:** report **top-1 / top-5 accuracy**, a confusion matrix, and the
  hardest confused pairs. Write a short **model card**.
- **Compute:** local **RTX 3050 Laptop, 4GB VRAM**, Python 3.12. Feasible for
  transfer learning but memory-tight → AMP + small batch + smaller backbone are
  not optional. Normal Python script + venv (not a Colab notebook).
- **ML experience:** "some exposure" → scaffold the pipeline with explanation of
  the key steps (dataloaders, transforms, train loop, eval, Grad-CAM).
- **Artifacts:** training notebook/script + saved weights + `metrics.md` +
  example Grad-CAMs, all in the repo (great for reviewers).

> **Fallback / v0:** if the model isn't ready when the app needs it, stub the
> inference behind the same `predict()` interface (mock or a hosted API) so app
> work isn't blocked — then swap the real model in. The interface never changes.

---

## 2. Inference service (the ML backend)

- **Python FastAPI** service exposing `POST /predict` → top-5 `{species, prob}` +
  optional Grad-CAM image. Loads the PyTorch model once at startup.
- Export to **TorchScript/ONNX** for faster, dependency-light serving.
- **Deploy:** Hugging Face Spaces / Render / Modal / Fly. A live inference
  endpoint is a strong portfolio artifact on its own.
- Hides nothing secret; the value is "I trained and served my own model."

> The generic social/CRUD logic (groups, scoring) lives in Supabase
> (Postgres + RLS), so we don't run a second general-purpose backend. The only
> custom backend is the ML service — keeps the ML the star and the scope small.

---

## 3. Data model (Supabase / Postgres)

Same Letterboxd split: **Species** (catalog) vs **Sighting** (your observation).

| Table | Key columns | Notes |
|---|---|---|
| `profiles` | `id` (=auth user), `username`, `display_name`, `avatar_url` | |
| `species` | `id`, `class_index`, `common_name`, `scientific_name`, `rarity_tier`, `points` | `class_index` maps to the model's output classes |
| `sightings` | `id`, `user_id`, `species_id`, `photo_url`, `observed_at`, `lat`, `lng`, `notes`, `model_confidence`, `model_top5` (jsonb), `status` | `model_top5` preserves the prediction → data flywheel |
| `groups` | `id`, `name`, `slug`, `owner_id`, `is_private` | |
| `group_members` | `group_id`, `user_id`, `role`, `joined_at` | composite PK |
| `group_invites` | `id`, `group_id`, `token`, `status`, `expires_at` | link-based |

**Leaderboard** = derived SQL view: `SUM` of `species.points` over the **distinct
confirmed species** each member has logged in that group.

**Rarity → points:** tiered (Common=1, Uncommon=3, Rare=8, Vagrant=20), mapped onto
the species in our dataset from eBird frequency data.

---

## 4. Frontend (React, + TypeScript)

- **Convert to TypeScript** — high-leverage resume signal, cheap to do early.
- Add react-router + Supabase auth context + protected routes.
- Replace `alert()` results with: upload → **show top-5 candidates with confidence
  bars + Grad-CAM overlay** → user confirms species → save sighting.
- Pages: `/login`, `/signup`, `/` dashboard, `/identify`, `/me` (life list),
  `/groups`, `/groups/:slug` (members + leaderboard), `/invite/:token`.

---

## 5. Build phases (~3 weeks)

- **Week 1 — ML core:** dataset, transfer-learning training pipeline, hit a solid
  top-1/top-5, save weights + metrics + Grad-CAM. *This is the priority; protect
  the time.*
- **Week 2 — Serving + app spine:** FastAPI `/predict` (deployed); Supabase schema
  + RLS; TS conversion + router + auth; identify flow wired to the real model;
  life-list page.
- **Week 3 — Social + ship:** groups, invite links, rarity leaderboard; deploy
  frontend (Vercel); polish; **README with live demo link + screenshots +
  architecture diagram + model card**; basic tests + CI badge.

**Stretch (only after a deployed, working v1):** email invites, public/discoverable
groups, NABirds (more species), the retraining-from-user-data flywheel.

---

## 6. Resume framing (bullets this project should earn you)

- "Trained a fine-grained bird-species classifier (transfer learning,
  EfficientNet-B0) on CUB-200-2011, achieving **78.3% top-1 / 95.1% top-5** on a
  4GB GPU; served via a FastAPI/ONNX endpoint with from-scratch Grad-CAM
  explainability." *(Week 1 done — numbers are real.)*
- "Built and deployed a full-stack ML product (React + TypeScript, Supabase) around
  the model, including a human-in-the-loop confirmation flow that collects labeled
  data for future retraining."

---

## 7. Known issues in current code (clean up along the way)

- `LandingPage.js:44` — hardcoded LAN IP; must be env-based.
- Results shown via `alert()` — replace with the candidate-picker UI.
- Existing Node/Express backend returns a **random mock** bird — will be replaced
  by the FastAPI inference service.
- `CLAUDE.md` is both gitignored and tracked — decide intentionally.
- Plain JS, no real tests — convert to TS, add coverage for scoring + auth.
