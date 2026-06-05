// Headless check of the auth chain against the live Supabase project.
//
//   node scripts/verify_auth.mjs
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.local, signs up a
// throwaway user with the public anon key, then reads public.profiles to confirm
// the handle_new_user() trigger created the matching row (visible via the public
// RLS select policy). Exercises signup -> trigger -> RLS without a browser.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  let raw;
  try {
    raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  } catch {
    console.error('✗ .env.local not found. Copy .env.example to .env.local and fill it in.');
    process.exit(1);
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = loadEnvLocal();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key || url.includes('your-project-ref')) {
  console.error('✗ Set real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.');
  process.exit(1);
}

const supabase = createClient(url, key);

const stamp = Date.now();
const username = `verify_${stamp}`;
// Supabase rejects reserved domains like example.com; use one with valid MX.
// This address won't receive mail (random local-part), which is fine for the check.
const email = `bq-verify-${stamp}@gmail.com`;
const displayName = 'Verify Bot';

console.log(`→ Signing up ${email} (username: ${username})`);
const { error: signUpError } = await supabase.auth.signUp({
  email,
  password: 'verify-password-123',
  options: { data: { username, display_name: displayName } },
});
if (signUpError) {
  console.error('✗ signUp failed:', signUpError.message);
  process.exit(1);
}
console.log('✓ signUp succeeded');

// The trigger runs synchronously with the auth insert, but give it a beat.
await new Promise((r) => setTimeout(r, 800));

const { data: profile, error: selectError } = await supabase
  .from('profiles')
  .select('username, display_name')
  .eq('username', username)
  .single();

if (selectError) {
  console.error('✗ Could not read the profile row:', selectError.message);
  console.error('  (If this is an RLS error, the public select policy is missing.)');
  process.exit(1);
}

if (profile.username === username && profile.display_name === displayName) {
  console.log(`✓ Trigger created profile: ${profile.username} / "${profile.display_name}"`);
  console.log('\n✅ Auth chain verified: signup → handle_new_user trigger → RLS read all work.');
  process.exit(0);
}

console.error('✗ Profile row mismatch:', profile);
process.exit(1);
