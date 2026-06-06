// Headless end-to-end check of the Week 3 groups + leaderboard layer against the
// live Supabase project.
//
//   node scripts/verify_groups.mjs
//
// Requires: migrations 0001-0003 + 0005 (reusable_invites) applied. No FastAPI
// needed — sightings are inserted directly with real species ids. Creates throwaway
// @gmail.com users (Supabase rejects @example.com) and exercises:
//   * group create + owner membership
//   * reusable invite link: TWO different users redeem the SAME token
//   * group_leaderboard view reflects distinct confirmed species per member
//   * private-group RLS: an outsider can't see the group or its members
//   * admin management: remove a member, promote a member to admin
// Then cleans up (deletes the group → cascades members/invites, and the sightings).
import { readFileSync } from 'node:fs';
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

function die(msg, err) {
  console.error(`✗ ${msg}${err ? ': ' + (err.message ?? JSON.stringify(err)) : ''}`);
  process.exit(1);
}

const e = env();
const URL = e.VITE_SUPABASE_URL;
const KEY = e.VITE_SUPABASE_ANON_KEY;

// Each "user" gets its own client so auth sessions don't clobber each other.
function freshClient() {
  return createClient(URL, KEY, { auth: { persistSession: false } });
}

const stamp = Date.now();
async function signUp(tag) {
  const client = freshClient();
  const email = `bq-grp-${tag}-${stamp}@gmail.com`;
  const { data, error } = await client.auth.signUp({
    email,
    password: 'verify-password-123',
    options: { data: { username: `grp_${tag}_${stamp}` } },
  });
  if (error) die(`signUp(${tag}) failed`, error);
  if (!data.session) die('no session after signUp — disable "Confirm email" in Supabase');
  return { client, id: data.user.id, email };
}

// --- Users: A owner, B & C joiners, D outsider ---
const A = await signUp('A');
const B = await signUp('B');
const C = await signUp('C');
const D = await signUp('D');
console.log('✓ four throwaway users signed up');

// --- A creates a private group + owner membership ---
const slug = `verify-grp-${stamp}`;
const { data: group, error: gErr } = await A.client
  .from('groups')
  .insert({ name: `Verify Group ${stamp}`, slug, owner_id: A.id, is_private: true })
  .select('id, slug')
  .single();
if (gErr) die('group insert failed', gErr);
const groupId = group.id;
const { error: omErr } = await A.client
  .from('group_members')
  .insert({ group_id: groupId, user_id: A.id, role: 'owner' });
if (omErr) die('owner membership insert failed', omErr);
console.log(`✓ group created (${slug}) with owner membership`);

// --- A mints a reusable invite ---
const token = `tok${stamp}`;
const { error: invErr } = await A.client
  .from('group_invites')
  .insert({ group_id: groupId, token, status: 'active' });
if (invErr) die('invite insert failed', invErr);

// --- B and C redeem the SAME token (proves reusable link) ---
for (const u of [B, C]) {
  const { data: gid, error } = await u.client.rpc('redeem_invite', { invite_token: token });
  if (error) die(`redeem by ${u.email} failed (is migration 0005 applied?)`, error);
  if (gid !== groupId) die('redeem returned wrong group id');
}
console.log('✓ two users redeemed the same invite token (reusable link works)');

// --- Insert confirmed sightings: A logs 1 species, B logs 1 (different) species ---
const { data: species, error: spErr } = await A.client
  .from('species')
  .select('id')
  .order('id', { ascending: true })
  .limit(2);
if (spErr || !species || species.length < 2) die('species lookup failed', spErr);
const [sp1, sp2] = species;

async function logSighting(u, speciesId) {
  const { error } = await u.client.from('sightings').insert({
    user_id: u.id,
    species_id: speciesId,
    status: 'confirmed',
    model_confidence: 0.9,
  });
  if (error) die(`sighting insert for ${u.email} failed`, error);
}
await logSighting(A, sp1.id);
await logSighting(B, sp2.id);
console.log('✓ A and B each logged a confirmed sighting');

// --- Leaderboard reflects it (queried as a member, A) ---
const { data: lb, error: lbErr } = await A.client
  .from('group_leaderboard')
  .select('user_id, species_count, total_points')
  .eq('group_id', groupId);
if (lbErr) die('leaderboard query failed', lbErr);
if (lb.length !== 3) die(`expected 3 leaderboard rows, got ${lb.length}`);
const byUser = Object.fromEntries(lb.map((r) => [r.user_id, r]));
if (byUser[A.id].species_count !== 1) die('A species_count != 1');
if (byUser[B.id].species_count !== 1) die('B species_count != 1');
if (byUser[C.id].species_count !== 0) die('C species_count != 0');
if (byUser[A.id].total_points < 1) die('A total_points < 1');
console.log('✓ leaderboard: 3 members, A/B = 1 species, C = 0');

// --- Private RLS: outsider D sees neither the group nor its members ---
const { data: dGroup } = await D.client.from('groups').select('id').eq('id', groupId).maybeSingle();
if (dGroup) die('RLS leak: outsider can see a private group');
const { data: dMembers } = await D.client.from('group_members').select('user_id').eq('group_id', groupId);
if (dMembers && dMembers.length > 0) die('RLS leak: outsider can see private group members');
console.log('✓ private RLS: outsider sees no group and no members');

// --- Admin management: A promotes C to admin, removes B ---
const { error: promoteErr } = await A.client
  .from('group_members')
  .update({ role: 'admin' })
  .eq('group_id', groupId)
  .eq('user_id', C.id);
if (promoteErr) die('promote C to admin failed', promoteErr);

const { error: removeErr } = await A.client
  .from('group_members')
  .delete()
  .eq('group_id', groupId)
  .eq('user_id', B.id);
if (removeErr) die('remove B failed', removeErr);

const { data: membersAfter } = await A.client
  .from('group_members')
  .select('user_id, role')
  .eq('group_id', groupId);
const roleByUser = Object.fromEntries((membersAfter ?? []).map((m) => [m.user_id, m.role]));
if (roleByUser[C.id] !== 'admin') die('C was not promoted to admin');
if (roleByUser[B.id]) die('B was not removed');
console.log('✓ admin management: C promoted to admin, B removed');

// --- Cleanup ---
await A.client.from('sightings').delete().eq('user_id', A.id);
await B.client.from('sightings').delete().eq('user_id', B.id);
const { error: delErr } = await A.client.from('groups').delete().eq('id', groupId);
if (delErr) die('group delete (cleanup) failed', delErr);
const { data: gone } = await A.client.from('group_members').select('user_id').eq('group_id', groupId);
if (gone && gone.length > 0) die('group delete did not cascade members');
console.log('✓ cleaned up group (cascaded members + invites) and sightings');

console.log('\n✅ Week 3 verified: group create → reusable invite → leaderboard → private RLS → admin management.');
process.exit(0);
