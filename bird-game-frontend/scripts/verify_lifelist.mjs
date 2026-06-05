// Verifies the life-list query (sightings -> species FK embed) against live DB.
//   node scripts/verify_lifelist.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, '..', '.env.local'), 'utf8');
const e = {};
for (const line of raw.split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const supabase = createClient(e.VITE_SUPABASE_URL, e.VITE_SUPABASE_ANON_KEY);

const die = (m, err) => {
  console.error(`✗ ${m}${err ? ': ' + (err.message ?? err) : ''}`);
  process.exit(1);
};

const stamp = Date.now();
const { data: auth, error: authErr } = await supabase.auth.signUp({
  email: `bq-lifelist-${stamp}@gmail.com`,
  password: 'verify-password-123',
  options: { data: { username: `lifelist_${stamp}` } },
});
if (authErr) die('signUp failed', authErr);
if (!auth.session) die('no session (disable Confirm email)');
const userId = auth.user.id;

const { data: species } = await supabase
  .from('species')
  .select('id, common_name')
  .eq('class_index', 0)
  .single();

const { data: inserted, error: insErr } = await supabase
  .from('sightings')
  .insert({
    user_id: userId,
    species_id: species.id,
    photo_url: 'https://example.com/test.jpg',
    model_confidence: 0.77,
    model_top5: [],
    notes: 'lifelist verify',
    status: 'confirmed',
  })
  .select('id')
  .single();
if (insErr) die('insert failed', insErr);

// The exact query MePage runs.
const SELECT =
  'id, species_id, photo_url, observed_at, model_confidence, notes, ' +
  'species:species_id(common_name, scientific_name, rarity_tier)';
const { data: rows, error: selErr } = await supabase
  .from('sightings')
  .select(SELECT)
  .eq('user_id', userId)
  .eq('status', 'confirmed')
  .order('observed_at', { ascending: false });
if (selErr) die('life-list select failed', selErr);

const row = rows.find((r) => r.id === inserted.id);
if (!row) die('inserted sighting not returned');
if (!row.species || row.species.common_name !== species.common_name) {
  die(`FK embed did not return nested species (got ${JSON.stringify(row.species)})`);
}
console.log(
  `✓ embed works — sighting → species: "${row.species.common_name}" ` +
    `(${Math.round(row.model_confidence * 100)}%)`,
);

await supabase.from('sightings').delete().eq('id', inserted.id);
console.log('✓ cleaned up');
console.log('\n✅ Phase 3 verified: life-list query returns sightings with nested species.');
process.exit(0);
