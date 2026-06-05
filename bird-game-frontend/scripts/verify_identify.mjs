// Headless end-to-end check of the Phase 2 identify flow against live services.
//
//   node scripts/verify_identify.mjs
//
// Requires: migration 0004 (storage) applied, the FastAPI service running, and a
// CUB sample image under ../bird-model/data. Signs in a throwaway user, calls
// /predict, uploads the photo to Storage, inserts a sighting, reads it back, then
// cleans up the row + file. Exercises predict + Storage RLS + sighting RLS.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));

function env() {
  const raw = readFileSync(join(here, '..', '.env.local'), 'utf8');
  const out = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

function findSampleImage() {
  const root = join(here, '..', '..', 'bird-model', 'data', 'CUB_200_2011', 'images');
  const entries = readdirSync(root, { recursive: true });
  const rel = entries.find((e) => typeof e === 'string' && e.endsWith('.jpg'));
  if (!rel) throw new Error(`No sample .jpg found under ${root}`);
  return join(root, rel);
}

function die(msg, err) {
  console.error(`✗ ${msg}${err ? ': ' + (err.message ?? err) : ''}`);
  process.exit(1);
}

const e = env();
const API = e.VITE_INFERENCE_API_URL || 'http://localhost:8000';
const supabase = createClient(e.VITE_SUPABASE_URL, e.VITE_SUPABASE_ANON_KEY);

// 1. Auth — fresh user (email confirmation must be off so we get a session).
const stamp = Date.now();
const { data: auth, error: authErr } = await supabase.auth.signUp({
  email: `bq-identify-${stamp}@gmail.com`,
  password: 'verify-password-123',
  options: { data: { username: `identify_${stamp}` } },
});
if (authErr) die('signUp failed', authErr);
if (!auth.session) die('no session after signUp — disable "Confirm email" in Supabase');
const userId = auth.user.id;
console.log(`✓ signed in as ${userId}`);

// 2. Predict via FastAPI.
const imgPath = findSampleImage();
const blob = new Blob([readFileSync(imgPath)], { type: 'image/jpeg' });
const form = new FormData();
form.append('file', blob, 'bird.jpg');
let predictRes;
try {
  const r = await fetch(`${API}/predict`, { method: 'POST', body: form });
  if (!r.ok) die(`/predict returned ${r.status}`);
  predictRes = await r.json();
} catch (err) {
  die(`could not reach inference service at ${API} (is uvicorn running?)`, err);
}
const top = predictRes.predictions[0];
console.log(
  `✓ /predict ok — top guess: ${top.common_name} (${Math.round(top.probability * 100)}%), ` +
    `gradcam ${predictRes.gradcam ? 'present' : 'absent'}`,
);

// 3. Resolve species_id from class_index.
const { data: species, error: spErr } = await supabase
  .from('species')
  .select('id')
  .eq('class_index', top.class_index)
  .single();
if (spErr) die('species lookup failed', spErr);

// 4. Upload to Storage (RLS: must be under <userId>/).
const path = `${userId}/${crypto.randomUUID()}.jpg`;
const { error: upErr } = await supabase.storage
  .from('sightings')
  .upload(path, blob, { contentType: 'image/jpeg' });
if (upErr) die('storage upload failed (is migration 0004 applied?)', upErr);
const {
  data: { publicUrl },
} = supabase.storage.from('sightings').getPublicUrl(path);
console.log('✓ photo uploaded to Storage');

// 5. Insert sighting.
const { data: inserted, error: insErr } = await supabase
  .from('sightings')
  .insert({
    user_id: userId,
    species_id: species.id,
    photo_url: publicUrl,
    model_confidence: top.probability,
    model_top5: predictRes.predictions,
    status: 'confirmed',
  })
  .select('id')
  .single();
if (insErr) die('sighting insert failed', insErr);
console.log(`✓ sighting inserted (${inserted.id})`);

// 6. Read it back (public select policy).
const { data: readBack, error: readErr } = await supabase
  .from('sightings')
  .select('id, species_id, photo_url, model_confidence, status')
  .eq('id', inserted.id)
  .single();
if (readErr) die('read-back failed', readErr);
if (readBack.species_id !== species.id || readBack.status !== 'confirmed') {
  die('read-back mismatch');
}
console.log('✓ sighting read back correctly');

// 7. Cleanup.
await supabase.from('sightings').delete().eq('id', inserted.id);
await supabase.storage.from('sightings').remove([path]);
console.log('✓ cleaned up test row + file');

console.log('\n✅ Phase 2 verified: predict → Storage upload → sighting insert → read back all work.');
process.exit(0);
