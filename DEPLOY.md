# Deploying BirdQuest

Three pieces, two of which you deploy here (the third is already live):

| Piece | Host | What it serves |
|-------|------|----------------|
| **Inference API** (`bird-model/`) | Hugging Face Spaces (Docker, free CPU) | PyTorch model → `POST /predict` (top-5 + Grad-CAM) |
| **Frontend** (`bird-game-frontend/`) | Vercel (free) | the React/Vite SPA |
| **Database / Auth / Storage** | Supabase (already provisioned) | Postgres + RLS + Auth + the `sightings` bucket |

> Deploy order matters for CORS: do the **frontend first** to learn its URL, then
> set that URL as the API's `ALLOWED_ORIGINS`. (Or temporarily allow `*` while
> wiring up — see Part C.)

**Prerequisites**
- The repo pushed to GitHub.
- A [Vercel](https://vercel.com) account (sign in with GitHub).
- A [Hugging Face](https://huggingface.co) account + the `git` CLI with
  [git-lfs](https://git-lfs.com) installed (`git lfs install`).
- Your Supabase **Project URL** and **anon key** (Supabase dashboard → Project
  Settings → API).

---

## Part A — Inference API → Hugging Face Spaces

The Space is its own git repo whose **root** must hold the Dockerfile and the
runtime code. We push the *contents of `bird-model/`* (not the monorepo) into it.

1. **Create the Space:** huggingface.co → New → Space. Name `birdquest-api`,
   **SDK = Docker** (blank template), Hardware = **CPU basic (free)**, visibility
   Public. Note its git URL: `https://huggingface.co/spaces/<user>/birdquest-api`.

2. **Populate it** (the checkpoint is 17 MB, so it must go through Git LFS):
   ```bash
   git clone https://huggingface.co/spaces/<user>/birdquest-api /tmp/birdquest-space
   cd /tmp/birdquest-space
   git lfs install
   git lfs track "*.pth"

   # copy only what the Dockerfile needs (paths are relative to bird-model/)
   SRC=/home/bowie/BirdQuest/bird-model
   cp "$SRC/Dockerfile" "$SRC/requirements.txt" .
   cp -r "$SRC/src" "$SRC/serve" .
   mkdir -p checkpoints && cp "$SRC/checkpoints/best.pth" checkpoints/
   ```

3. **Add the Space `README.md`** (HF reads this YAML to configure the Space —
   `app_port: 8000` must match the port the container listens on):
   ```markdown
   ---
   title: BirdQuest Inference API
   emoji: 🐦
   colorFrom: green
   colorTo: blue
   sdk: docker
   app_port: 8000
   pinned: false
   ---

   # BirdQuest Inference API

   Fine-grained bird-species classifier (EfficientNet-B0, CUB-200-2011, 78.3%
   top-1) served with FastAPI. `POST /predict` returns top-5 species + a Grad-CAM
   overlay. Interactive docs at `/docs`.
   ```

4. **Push** (LFS uploads `best.pth`):
   ```bash
   git add -A && git commit -m "Deploy BirdQuest inference API" && git push
   ```
   The Space builds the Docker image (a few minutes — it installs CPU PyTorch).
   Watch the **Logs** tab; the build is done when you see uvicorn's
   `Application startup complete`.

5. **Smoke-test the API** (replace with your Space's domain):
   ```bash
   curl https://<user>-birdquest-api.hf.space/health     # {"status":"ok","device":"cpu"}
   curl https://<user>-birdquest-api.hf.space/           # model card JSON
   ```
   Open `…/docs` for the Swagger UI. **First request after idle takes ~20 s** —
   the free Space sleeps and reloads the model on wake.

> **Leaner image (optional):** `requirements.txt` also pulls training-only deps
> (matplotlib, scikit-learn, pytest, tqdm). For a smaller Space image you can
> trim those — the service only needs `fastapi`, `uvicorn[standard]`,
> `python-multipart`, `pillow`, `numpy` (torch/torchvision come from the Dockerfile).

---

## Part B — Frontend → Vercel

`bird-game-frontend/vercel.json` already sets the Vite framework, build command,
output dir, and the SPA rewrite (so `/groups/:slug`, `/invite/:token`, etc. don't
404 on refresh).

1. Vercel → **Add New → Project** → import the GitHub repo.
2. **Root Directory = `bird-game-frontend`** (critical — the app isn't at repo root).
   Framework preset auto-detects as **Vite**; leave build/output as-is.
3. **Environment Variables** (all three; they're inlined at build time):
   | Key | Value |
   |-----|-------|
   | `VITE_SUPABASE_URL` | your Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon key (safe to expose — RLS enforces access) |
   | `VITE_INFERENCE_API_URL` | your Space URL, e.g. `https://<user>-birdquest-api.hf.space` |
4. **Deploy.** Note the resulting URL, e.g. `https://birdquest.vercel.app`.

> Changing an env var requires a **redeploy** (Vite bakes them into the build).

---

## Part C — Wire CORS + Supabase

1. **API CORS:** in the Space → Settings → **Variables and secrets**, add
   `ALLOWED_ORIGINS = https://birdquest.vercel.app` (comma-separate to also keep
   `http://localhost:3000` for local dev). The Space restarts and picks it up.
   *(Until this is set, browser `/predict` calls from Vercel are blocked by CORS;
   the `curl` tests in Part A still work because curl ignores CORS.)*

2. **Supabase Auth URLs:** dashboard → Authentication → **URL Configuration** →
   set **Site URL** to your Vercel URL and add it under **Redirect URLs**. Not
   strictly required for the current password-only signup/login (email
   confirmation is off), but needed if you later enable email confirmation, magic
   links, or password reset.

3. **Storage:** the `sightings` bucket is already public-read; no change needed.

---

## Part D — Verify production end-to-end

On the live Vercel URL: sign up → **Identify** (upload a bird photo; the first
prediction wakes the Space, ~20 s) → **Save to life list** → **Groups** → create a
group, copy the invite link, open it in a second browser as another user → confirm
the join + leaderboard. This is the same flow `bird-game-frontend/scripts/verify_*.mjs`
exercise headlessly.

---

## Updating after deploy

- **Frontend:** push to `main` → Vercel auto-deploys.
- **API:** re-copy changed files into the Space clone and `git push` (the Space is
  a separate remote). If you retrain the model, regenerate the species seed
  (`bird-model/.venv/bin/python supabase/scripts/gen_species_seed.py`) so
  `species.class_index` stays in sync with the model's outputs.
