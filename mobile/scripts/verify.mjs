#!/usr/bin/env node
/**
 * NEXA integration verification (auth + profiles + storage).
 *
 * Exercises the real Supabase backend configured in .env:
 *   register -> profile row created -> update profile -> duplicate username ->
 *   sign out -> sign in -> session persistence across client instances ->
 *   public profile fetch -> RLS (cross-user write must fail) -> storage RLS.
 *
 * Note: "Disable email confirmation" must be ON in Supabase Auth settings for
 * the session-dependent checks to pass.
 *
 * Run: npm run verify
 */

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

let passCount = 0;
let failCount = 0;
const failures = [];

function pass(label) {
  passCount += 1;
  console.log(`  PASS  ${label}`);
}

function fail(label, detail = '') {
  failCount += 1;
  failures.push(label);
  console.log(`  FAIL  ${label}${detail ? ` â€” ${detail}` : ''}`);
}

function step(name) {
  console.log(`\nâ— ${name}`);
}

// ---------------------------------------------------------------------------
// Env loading (EXPO_PUBLIC_* are not auto-loaded in plain node)
// ---------------------------------------------------------------------------
function loadEnv() {
  const file = new URL('../.env', import.meta.url);
  if (!existsSync(file)) {
    console.error('Missing .env â€” copy .env.example to .env and fill in values.');
    process.exit(1);
  }

  const values = {};
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = loadEnv();
const URL_KEY = 'EXPO_PUBLIC_SUPABASE_URL';
const ANON_KEY = 'EXPO_PUBLIC_SUPABASE_ANON_KEY';

if (!env[URL_KEY] || !env[ANON_KEY]) {
  console.error(`Missing ${URL_KEY} / ${ANON_KEY} in .env`);
  process.exit(1);
}

// Each client gets its own isolated in-memory token store so sign-ups/sign-ins
// never leak across the simulated "devices".
function clientFor(sharedStorage) {
  return createClient(env[URL_KEY], env[ANON_KEY], {
    auth: {
      autoRefreshToken: false,
      persistSession: sharedStorage !== undefined,
      storage: sharedStorage,
      detectSessionInUrl: false,
    },
  });
}

function memoryStore(seed = {}) {
  const items = { 'supabase.auth.token': null, ...seed };
  return {
    getItem: (key) => items[key] ?? null,
    setItem: (key, value) => {
      items[key] = value ?? null;
    },
    removeItem: (key) => {
      items[key] = null;
    },
    items,
  };
}

const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const tinyPng = Uint8Array.from(Buffer.from(TINY_PNG_BASE64, 'base64'));

const rand = () => Math.random().toString(36).slice(2, 8);

// A unique-per-run class so leftover class communities from earlier runs never
// collide (join_community requires the caller's profile class to match the
// community), and so A always ends up owning the class community.
const classDept = `CS-${Math.floor(Math.random() * 9000 + 1000)}`;
const classSchool = 'Test University';
const classLevel = '300 Level';

// Some projects reject "@example.com" (a reserved domain) at signup. Override
// with your own domain when needed: VERIFY_EMAIL_DOMAIN=example.org npm run verify
const emailDomain = () => {
  const d = process.env.VERIFY_EMAIL_DOMAIN?.trim().replace(/^@/, '');
  return d ? `@${d}` : '@example.com';
};

const userA = {
  email: `nexa_a_${rand()}${emailDomain()}`,
  password: 'correct-horse-battery',
  display_name: 'Ada Test',
  username: `nexa_a_${rand()}`,
};
const userB = {
  email: `nexa_b_${rand()}${emailDomain()}`,
  password: 'another-stable-pass',
  display_name: 'Bola Test',
  username: `nexa_b_${rand()}`,
};

const aDevice = { store: memoryStore(), client: null };
const bStore = memoryStore();
let bClient = null;

console.log(`Using Supabase project: ${env[URL_KEY]}`);
console.log(`Test users created (kept in auth.users): ${userA.username}, ${userB.username}`);

// -- Registration ------------------------------------------------------------
step('1. Registration (user A)');
aDevice.client = clientFor(aDevice.store);
const signUpA = await aDevice.client.auth.signUp({
  email: userA.email,
  password: userA.password,
  options: { data: { display_name: userA.display_name, username: userA.username } },
});

if (signUpA.error) {
  fail('register user A', signUpA.error.message);
} else if (signUpA.data.session === null) {
  console.log(
    '\n  SKIP  full flow â€” email confirmation is enabled.\n' +
      '  Disable it in Supabase Auth settings and rerun. Expected test users were NOT created.',
  );
  process.exit(failCount > 0 ? 1 : 0);
} else {
  pass('register user A');
  const aId = signUpA.data.user.id;

  // -- Profile created -------------------------------------------------------
  step('2. Profile row created for user A');
  const { data: profile, error: profErr } = await aDevice.client
    .from('profiles')
    .select('*')
    .eq('id', aId)
    .single();
  if (profErr || !profile) {
    fail('profile row exists', profErr?.message ?? 'no row');
  } else if (profile.username !== userA.username || profile.display_name !== userA.display_name) {
    fail('profile fields match sign-up data', JSON.stringify(profile));
  } else {
    pass('profile row exists with matching username/display_name');
  }

  // -- Update profile --------------------------------------------------------
  step('3. Update own profile (bio/school/department/level)');
  const { data: updated, error: updErr } = await aDevice.client
    .from('profiles')
    .update({
      bio: 'Studying CS.',
      school: classSchool,
      department: classDept,
      level: classLevel,
    })
    .eq('id', aId)
    .select('*')
    .single();
  if (updErr || updated?.bio !== 'Studying CS.' || updated?.school !== classSchool) {
    fail('update own profile', updErr?.message ?? JSON.stringify(updated));
  } else {
    pass('update own profile reflected');
  }

  // -- Duplicate username ----------------------------------------------------
  step('4. Duplicate username rejected at sign-up');
  const dupClient = clientFor();
  const dup = await dupClient.auth.signUp({
    email: `nexa_c_${rand()}${emailDomain()}`,
    password: 'dup-pass-123456',
    options: { data: { display_name: 'Too', username: userA.username } },
  });
  if (dup.error) {
    pass('duplicate username rejected');
  } else {
    fail('duplicate username rejected', 'no error surfaced');
  }

  // -- Sign out --------------------------------------------------------------
  step('5. Sign out');
  const { error: outErr } = await aDevice.client.auth.signOut();
  if (outErr) {
    fail('sign out', outErr.message);
  } else {
    const { data: sOut } = await aDevice.client.auth.getSession();
    sOut.session ? fail('session cleared after sign out') : pass('sign out clears session');
  }

  // -- Sign in ---------------------------------------------------------------
  step('6. Sign in');
  const { error: inErr } = await aDevice.client.auth.signInWithPassword({
    email: userA.email,
    password: userA.password,
  });
  if (inErr) {
    fail('sign in', inErr.message);
  } else {
    const { data } = await aDevice.client.auth.getSession();
    data.session ? pass('sign in restores session') : fail('sign in left no session');
  }

  // -- Session persistence ---------------------------------------------------
  step('7. Session persistence across client instances (simulated app restart)');
  const live = await aDevice.client.auth.getSession();
  if (!live.data.session) {
    fail('current session available');
  } else {
    // supabase-js persists under a project-scoped key (e.g. "sb-<ref>-auth-token"),
    // not the legacy "supabase.auth.token".
    const tokenKey =
      Object.keys(aDevice.store.items).find((k) => k.endsWith('-auth-token')) ||
      'supabase.auth.token';
    const persisted = aDevice.store.items[tokenKey];
    const restarted = clientFor(memoryStore({ [tokenKey]: persisted }));
    const { data: restored, error: restoreErr } = await restarted.auth.getSession();
    if (restoreErr || !restored.session) {
      fail('session restored from persisted token', restoreErr?.message ?? 'null session');
    } else if (restored.session.user.id !== aId) {
      fail('restored session belongs to the same user');
    } else {
      pass('session restored from persisted token');
    }
  }

  // -- Public profile --------------------------------------------------------
  step('8. Public profile fetch by username');
  const { data: byUser, error: byUserErr } = await aDevice.client
    .from('profiles')
    .select('*')
    .eq('username', userA.username)
    .single();
  if (byUserErr || !byUser) {
    fail('fetch profile by username', byUserErr?.message ?? 'not found');
  } else {
    pass('fetch profile by username');
  }

  // -- Cross-user writes blocked ---------------------------------------------
  step('9. Register user B on a separate device and verify cross-user writes are blocked');
  bClient = clientFor(bStore);
  const signUpB = await bClient.auth.signUp({
    email: userB.email,
    password: userB.password,
    options: { data: { display_name: userB.display_name, username: userB.username } },
  });

  if (signUpB.error || !signUpB.data.session) {
    fail('register user B', signUpB.error?.message ?? 'no session');
  } else {
    pass('register user B');
    const bId = signUpB.data.user.id;

    // user A (aDevice.client) tries to modify user B's profile -> must fail.
    // RLS filters the row out, so the update touches 0 rows (no error surfaced).
    const { data: crossRows, error: crossErr } = await aDevice.client
      .from('profiles')
      .update({ display_name: 'HACKED' })
      .eq('id', bId)
      .select('id');
    if (crossErr || !crossRows || crossRows.length === 0) {
      pass(`RLS blocks updating another user (${crossErr?.code ?? 'no row returned'})`);
    } else {
      fail('RLS blocks updating another user â€” write unexpectedly succeeded');
    }

    // -- Storage RLS ---------------------------------------------------------
    step('10. Avatar storage RLS');
    const ownPath = `${bId}/avatar.png`;
    const { error: upOwn } = await bClient.storage.from('avatars').upload(ownPath, tinyPng, {
      contentType: 'image/png',
      upsert: true,
    });
    if (upOwn) {
      fail('upload avatar into own folder', upOwn.message);
    } else {
      pass('upload avatar into own folder');
    }

    const otherPath = `${aId}/unsafe.png`;
    const { error: upOther } = await bClient.storage
      .from('avatars')
      .upload(otherPath, tinyPng, { contentType: 'image/png', upsert: true });
    if (upOther) {
      pass('RLS blocks writing to another userâ€™s avatar folder');
    } else {
      fail('RLS blocks writing to another userâ€™s avatar folder â€” upload succeeded');
    }

    const { data: pub } = bClient.storage.from('avatars').getPublicUrl(ownPath);
    const head = await fetch(pub.publicUrl);
    if (head.ok) {
      pass('public avatar URL is readable');
    } else {
      fail('public avatar URL is readable', `HTTP ${head.status}`);
    }

    // -- Friends: relationship lifecycle --------------------------------------
    const statusOf = async (client, otherId) => {
      const result = await client.rpc('friend_status', { p_other: otherId });
      return result;
    };
    const incomingRows = async (client, viewerId) =>
      client.from('friendships').select('user_id').eq('friend_id', viewerId).eq('status', 'pending');
    const outgoingRows = async (client, viewerId) =>
      client.from('friendships').select('friend_id').eq('user_id', viewerId).eq('status', 'pending');
    const friendRows = async (client, viewerId) =>
      client
        .from('friendships')
        .select('user_id, friend_id')
        .eq('status', 'accepted')
        .or(`user_id.eq.${viewerId},friend_id.eq.${viewerId}`);

    step('11. Friend request (B -> A)');
    const sendReq = await bClient.rpc('request_friend', { p_target: aId });
    if (sendReq.error) {
      fail('send friend request', sendReq.error.message);
    } else {
      pass('send friend request');
    }

    step('12. Pending requests are listed');
    const inc = await incomingRows(aDevice.client, aId);
    const out = await outgoingRows(bClient, bId);
    const incOk = !inc.error && inc.data?.some((row) => row.user_id === bId);
    const outOk = !out.error && out.data?.some((row) => row.friend_id === aId);
    if (incOk && outOk) {
      pass('incoming (A) and outgoing (B) contain each other');
    } else {
      fail(
        'incoming (A) and outgoing (B) contain each other',
        JSON.stringify({ inc: inc.error?.message ?? inc.data, out: out.error?.message ?? out.data }),
      );
    }

    step('13. Status reflects a pending request');
    const aSeesB = await statusOf(aDevice.client, bId);
    const bSeesA = await statusOf(bClient, aId);
    if (aSeesB.data === 'request_received' && bSeesA.data === 'request_sent') {
      pass('A sees request_received, B sees request_sent');
    } else {
      fail(
        'A sees request_received, B sees request_sent',
        JSON.stringify({ aSeesB: aSeesB.data, bSeesA: bSeesA.data }),
      );
    }

    step('14. Rejected request (user C -> A)');
    const cStore = memoryStore();
    const userC = {
      email: `nexa_c_${rand()}${emailDomain()}`,
      password: 'yet-another-pass',
      display_name: 'Chip Test',
      username: `nexa_c_${rand()}`,
    };
    const cClient = clientFor(cStore);
    const signUpC = await cClient.auth.signUp({
      email: userC.email,
      password: userC.password,
      options: { data: { display_name: userC.display_name, username: userC.username } },
    });
    if (signUpC.error || !signUpC.data.session) {
      fail('register user C', signUpC.error?.message ?? 'no session');
    } else {
      pass('register user C');
      const cId = signUpC.data.user.id;
      const cSends = await cClient.rpc('request_friend', { p_target: aId });

      if (cSends.error) {
        fail('send request from C', cSends.error.message);
      } else {
        const reject = await aDevice.client.rpc('respond_friend_request', {
          p_sender: cId,
          p_accept: false,
        });
        if (reject.error) {
          fail('reject request from C', reject.error.message);
        } else {
          const goneStatus = await statusOf(aDevice.client, cId);
          const after = await outgoingRows(cClient, cId);
          const cleared = goneStatus.data === 'none' && !after.data?.some((row) => row.friend_id === aId);
          if (cleared) {
            pass('rejecting clears the pending row on both sides');
          } else {
            fail(
              'rejecting clears the pending row on both sides',
              JSON.stringify({ status: goneStatus.data, outgoing: after.data }),
            );
          }
        }
      }
    }

    step('15. Accept request (A accepts B)');
    const acc = await aDevice.client.rpc('respond_friend_request', { p_sender: bId, p_accept: true });
    if (acc.error) {
      fail('accept friend request', acc.error.message);
    } else {
      const aSaw = await statusOf(aDevice.client, bId);
      const bSaw = await statusOf(bClient, aId);
      if (aSaw.data === 'friends' && bSaw.data === 'friends') {
        pass('accepted â€” both sides report friends');
      } else {
        fail('accepted â€” both sides report friends', JSON.stringify({ aSaw: aSaw.data, bSaw: bSaw.data }));
      }
    }

    step('16. Friend lists include each other');
    const la = await friendRows(aDevice.client, aId);
    const lb = await friendRows(bClient, bId);
    const laHasB = la.data?.some((row) => row.user_id === bId || row.friend_id === bId);
    const lbHasA = lb.data?.some((row) => row.user_id === aId || row.friend_id === aId);
    if (!la.error && !lb.error && laHasB && lbHasA) {
      pass('A and B both list each other as friends');
    } else {
      fail(
        'A and B both list each other as friends',
        JSON.stringify({ la: la.error?.message ?? la.data, lb: lb.error?.message ?? lb.data }),
      );
    }

    step('17. Block and unblock');
    const blk = await aDevice.client.rpc('block_user', { p_target: bId });
    if (blk.error) {
      fail('block user', blk.error.message);
    } else {
      const blockedA = await statusOf(aDevice.client, bId);
      const blockedB = await statusOf(bClient, aId);
      const friendsA = await friendRows(aDevice.client, aId);
      if (blockedA.data !== 'i_blocked' || blockedB.data !== 'they_blocked_me') {
        fail('block status asymmetrical', JSON.stringify({ blockedA: blockedA.data, blockedB: blockedB.data }));
      } else {
        pass('block status asymmetrical (i_blocked / they_blocked_me)');
      }
      if (friendsA.data?.some((row) => row.user_id === bId || row.friend_id === bId)) {
        fail('blocked user removed from friend list');
      } else {
        pass('blocked user removed from friend list');
      }
    }

    const unblk = await aDevice.client.rpc('unblock_user', { p_target: bId });
    if (unblk.error) {
      fail('unblock user', unblk.error.message);
    } else {
      const aSaw = await statusOf(aDevice.client, bId);
      const bSaw = await statusOf(bClient, aId);
      if (aSaw.data === 'none' && bSaw.data === 'none') {
        pass('unblock clears the block (friends not auto-restored)');
      } else {
        fail('unblock clears the block (friends not auto-restored)', JSON.stringify({ aSaw: aSaw.data, bSaw: bSaw.data }));
      }
    }

    step('18. Remove friend (B removes A)');
    const reReq = await bClient.rpc('request_friend', { p_target: aId });
    const reAcc = reReq.error ? null : await aDevice.client.rpc('respond_friend_request', { p_sender: bId, p_accept: true });
    if (reReq.error || reAcc?.error) {
      fail('re-establish friendship before remove', JSON.stringify({ req: reReq.error?.message, acc: reAcc?.error?.message }));
    } else {
      const rm = await bClient.rpc('remove_friend', { p_other: aId });
      if (rm.error) {
        fail('remove friend', rm.error.message);
      } else {
        const aSaw = await statusOf(aDevice.client, bId);
        const bSaw = await statusOf(bClient, aId);
        if (aSaw.data === 'none' && bSaw.data === 'none') {
          pass('remove clears friendship on both sides');
        } else {
          fail('remove clears friendship on both sides', JSON.stringify({ aSaw: aSaw.data, bSaw: bSaw.data }));
        }
      }
    }

    step('19. Search users');
    const res = await aDevice.client
      .from('profiles')
      .select('username')
      .or(`username.ilike.%${userB.username}%,display_name.ilike.%${userB.username}%`)
      .limit(20);
    const found = !res.error && res.data?.some((p) => p.username === userB.username);
    if (found) {
      pass('search finds user B by username');
    } else {
      fail('search finds user B by username', JSON.stringify({ err: res.error?.message, data: res.data }));
    }

    // -- Messaging: one-to-one chat lifecycle --------------------------------
    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let convId = null;
    let msg1 = null;
    let msg2 = null;

    step('20. Start a conversation (A -> B), idempotent both directions');
    const startA = await aDevice.client.rpc('start_conversation', { p_other: bId });
    const startB = await bClient.rpc('start_conversation', { p_other: aId });
    if (startA.error || startB.error || !startA.data || startA.data !== startB.data) {
      fail(
        'conversation created and shared',
        JSON.stringify({ a: startA.error?.message ?? startA.data, b: startB.error?.message ?? startB.data }),
      );
    } else {
      convId = startA.data;
      pass('conversation created and shared');
    }

    step('21. Conversation info and empty chat list');
    const infoA = await aDevice.client.rpc('conversation_info', { p_conversation: convId });
    const listA0 = await aDevice.client.rpc('list_conversations');
    if (
      infoA.data?.[0]?.other_user_id === bId &&
      listA0.data?.some(
        (c) => c.conversation_id === convId && c.other_user_id === bId && c.unread_count === 0,
      )
    ) {
      pass('peer info + conversation listed with zero unread');
    } else {
      fail(
        'peer info + conversation listed with zero unread',
        JSON.stringify({ info: infoA.data, list: listA0.data }),
      );
    }

    step('22. B sends a message; A sees it with an unread count');
    const send1 = await bClient.rpc('send_message', {
      p_conversation: convId,
      p_body: 'hello from B',
    });
    if (send1.error || !send1.data) {
      fail('send message', send1.error?.message ?? 'no id');
    } else {
      pass('send message');
      msg1 = send1.data;
      const listA = await aDevice.client.rpc('list_conversations');
      const rowA = listA.data?.find((c) => c.conversation_id === convId);
      if (rowA?.last_message === 'hello from B' && rowA.unread_count === 1) {
        pass('A list shows last message and unread count');
      } else {
        fail('A list shows last message and unread count', JSON.stringify(rowA));
      }
    }

    step('23. Reply to a message');
    const send2 = await bClient.rpc('send_message', {
      p_conversation: convId,
      p_body: 'and a reply',
      p_reply_to: msg1,
    });
    if (send2.error || !send2.data) {
      fail('send reply', send2.error?.message ?? 'no id');
    } else {
      msg2 = send2.data;
      pass('send reply');
      const listA = await aDevice.client.rpc('list_conversations');
      const rowA = listA.data?.find((c) => c.conversation_id === convId);
      if (rowA?.last_message === 'and a reply') {
        pass('chat list preview updates to the newest message');
      } else {
        fail('chat list preview updates to the newest message', JSON.stringify(rowA));
      }
    }

    step('24. A fetches messages in order with the reply link');
    const { data: msgs, error: msgsErr } = await aDevice.client
      .from('messages')
      .select('id, body, reply_to_id, sender_id, deleted_at, read_at, delivered_at, reactions')
      .eq('conversation_id', convId)
      .order('seq', { ascending: true });
    if (
      !msgsErr &&
      msgs?.length === 2 &&
      msgs[0].id === msg1 &&
      msgs[1].id === msg2 &&
      msgs[1].reply_to_id === msg1 &&
      msgs[0].sender_id === bId
    ) {
      pass('messages ordered with reply reference');
    } else {
      fail('messages ordered with reply reference', JSON.stringify({ err: msgsErr?.message, msgs }));
    }

    step('25. A marks Bâ€™s messages as read');
    const read = await aDevice.client.rpc('mark_messages_read', { p_conversation: convId });
    const listA2 = await aDevice.client.rpc('list_conversations');
    const rowA2 = listA2.data?.find((c) => c.conversation_id === convId);
    if (read.error) {
      fail('mark read', read.error.message);
    } else if (rowA2?.unread_count !== 0) {
      fail('unread count cleared after read', JSON.stringify(rowA2));
    } else {
      pass('unread count cleared after read');
    }

    step('26. B sees delivered + read receipts on its own messages');
    const { data: ownMsg } = await bClient
      .from('messages')
      .select('id, delivered_at, read_at')
      .eq('conversation_id', convId)
      .eq('sender_id', bId);
    if (
      ownMsg?.length === 2 &&
      ownMsg.every((m) => m.delivered_at && m.read_at)
    ) {
      pass('delivered and read timestamps set');
    } else {
      fail('delivered and read timestamps set', JSON.stringify(ownMsg));
    }

    step('27. Emoji reactions (add, dedupe, remove)');
    const r1 = await aDevice.client.rpc('react_to_message', { p_message: msg1, p_emoji: 'ðŸ‘' });
    const r2 = await aDevice.client.rpc('react_to_message', { p_message: msg1, p_emoji: 'ðŸ‘' });
    const r3 = await bClient.rpc('react_to_message', { p_message: msg1, p_emoji: 'â¤ï¸' });
    const { data: reacted } = await aDevice.client
      .from('messages')
      .select('reactions')
      .eq('id', msg1)
      .single();
    const entries = reacted?.reactions ?? [];
    if (
      !r1.error && !r2.error && !r3.error &&
      Array.isArray(entries) &&
      entries.length === 2
    ) {
      pass('reactions dedupe per user+emoji and store on the message');
    } else {
      fail('reactions dedupe per user+emoji and store on the message', JSON.stringify(entries));
    }
    const unreact = await aDevice.client.rpc('unreact_to_message', { p_message: msg1, p_emoji: 'ðŸ‘' });
    const { data: afterUnreact } = await aDevice.client
      .from('messages')
      .select('reactions')
      .eq('id', msg1)
      .single();
    if (!unreact.error && (afterUnreact?.reactions ?? []).length === 1) {
      pass('removing my reaction leaves the other userâ€™s');
    } else {
      fail('removing my reaction leaves the other userâ€™s', JSON.stringify(afterUnreact?.reactions));
    }

    step('28. Soft-delete own message updates the chat preview');
    const del = await bClient.rpc('delete_message', { p_message: msg2 });
    const { data: deletedRow } = await bClient
      .from('messages')
      .select('id, body, deleted_at')
      .eq('id', msg2)
      .single();
    const listA3 = await aDevice.client.rpc('list_conversations');
    const rowA3 = listA3.data?.find((c) => c.conversation_id === convId);
    if (
      !del.error &&
      deletedRow?.deleted_at &&
      deletedRow.body === null &&
      rowA3?.last_message === 'hello from B'
    ) {
      pass('delete scrubs body and preview falls back to the previous message');
    } else {
      fail(
        'delete scrubs body and preview falls back to the previous message',
        JSON.stringify({ deletedRow, rowA3 }),
      );
    }

    step('29. RLS: an outsider cannot write or read the conversation');
    const dStore = memoryStore();
    const userD = {
      email: `nexa_d_${rand()}${emailDomain()}`,
      password: 'outsider-pass-123',
      display_name: 'Dee Test',
      username: `nexa_d_${rand()}`,
    };
    const dClient = clientFor(dStore);
    const signUpD = await dClient.auth.signUp({
      email: userD.email,
      password: userD.password,
      options: { data: { display_name: userD.display_name, username: userD.username } },
    });
    if (signUpD.error || !signUpD.data.session) {
      fail('register user D', signUpD.error?.message ?? 'no session');
    } else {
      const intruder = await dClient.rpc('send_message', {
        p_conversation: convId,
        p_body: 'intrusion attempt',
      });
      const peek = await dClient.from('messages').select('id').eq('conversation_id', convId);
      const infoD = await dClient.rpc('conversation_info', { p_conversation: convId });
      const markD = await dClient.rpc('mark_messages_read', { p_conversation: convId });
      if (
        intruder.error &&
        (peek.data?.length ?? 0) === 0 &&
        (infoD.data?.length ?? 0) === 0 &&
        markD.error
      ) {
        pass('send, read, mark-read and peer info blocked for non-members');
      } else {
        fail(
          'send, read, mark-read and peer info blocked for non-members',
          JSON.stringify({ intruder: intruder.error?.message ?? 'no error', peek: peek.data, infoD: infoD.data, markD: markD.error?.message ?? 'no error' }),
        );
      }
    }

    step('30. Realtime: B sends and A receives the INSERT live');
    const channel = aDevice.client.channel('verify-messages');
    let realtimeRow = null;
    let subStatus = null;
    const receivedP = new Promise((resolve) => {
      channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages' },
          (payload) => {
            if (payload.new?.conversation_id === convId && payload.new?.sender_id === bId) {
              resolve(payload.new);
            }
          },
        )
        .subscribe((status) => {
          subStatus = status;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolve(null);
          }
        });
    });
    for (let i = 0; i < 80 && subStatus !== 'SUBSCRIBED'; i += 1) {
      if (subStatus === 'CHANNEL_ERROR' || subStatus === 'TIMED_OUT') break;
      await delay(100);
    }
    // Allow the Realtime replication reader to warm up before the first send.
    if (subStatus === 'SUBSCRIBED') {
      await delay(1500);
    }
    const live =
      subStatus === 'SUBSCRIBED'
        ? await bClient.rpc('send_message', {
            p_conversation: convId,
            p_body: 'realtime payload',
          })
        : { error: { message: `subscribe status: ${subStatus}` } };
    const raced = await Promise.race([receivedP, delay(12000)]);
    if (!live.error && raced && raced.body === 'realtime payload') {
      pass('message delivered to A over realtime');
    } else {
      fail(
        'message delivered to A over realtime',
        JSON.stringify({ send: live.error?.message ?? 'ok', body: raced?.body ?? null }),
      );
    }
    await channel.unsubscribe();

    // -- Media (photos, videos, voice notes) --------------------------------
    const mediaBucket = () => 'message-attachments';
    let mediaImageId = null;
    let mediaVoiceId = null;

    step('31. Media storage RLS â€” members upload, outsiders are blocked');
    const aImagePath = `${convId}/${aId}/photo.png`;
    const bUploadPath = `${convId}/${bId}/member.png`;
    const upA = await aDevice.client.storage.from(mediaBucket()).upload(aImagePath, tinyPng, {
      contentType: 'image/png',
      upsert: true,
    });
    const upB = await bClient.storage.from(mediaBucket()).upload(bUploadPath, tinyPng, {
      contentType: 'image/png',
      upsert: true,
    });
    const eStore = memoryStore();
    const userE = {
      email: `nexa_e_${rand()}${emailDomain()}`,
      password: 'outsider-e-pass-123',
      display_name: 'Eddie Test',
      username: `nexa_e_${rand()}`,
    };
    const eClient = clientFor(eStore);
    const signUpE = await eClient.auth.signUp({
      email: userE.email,
      password: userE.password,
      options: { data: { display_name: userE.display_name, username: userE.username } },
    });
    if (signUpE.error || !signUpE.data.session) {
      fail('register user E', signUpE.error?.message ?? 'no session');
    } else {
      const eId = signUpE.data.user.id;
      const upE = await eClient.storage.from(mediaBucket()).upload(`${convId}/${eId}/unsafe.png`, tinyPng, {
        contentType: 'image/png',
        upsert: true,
      });
      if (!upA.error && !upB.error && upE.error) {
        pass('member uploads allowed, outsider upload blocked');
      } else {
        fail(
          'member uploads allowed, outsider upload blocked',
          JSON.stringify({ a: upA.error?.message, b: upB.error?.message, e: upE.error?.message }),
        );
      }

      step('32. send_media_message registers an uploaded image');
      const sendImage = await aDevice.client.rpc('send_media_message', {
        p_conversation: convId,
        p_media_path: aImagePath,
        p_mime: 'image/png',
        p_type: 'image',
        p_caption: 'first photo',
        p_width: 1,
        p_height: 1,
        p_size: tinyPng.byteLength,
      });
      if (sendImage.error || !sendImage.data) {
        fail('send media message', sendImage.error?.message ?? 'no id');
      } else {
        mediaImageId = sendImage.data;
        const { data: imageRow } = await aDevice.client
          .from('messages')
          .select('id, message_type, media_path, media_mime, body, media_width, media_height')
          .eq('id', mediaImageId)
          .single();
        if (
          imageRow?.message_type === 'image' &&
          imageRow.media_path === aImagePath &&
          imageRow.body === 'first photo'
        ) {
          pass('media message row created with metadata');
        } else {
          fail('media message row created with metadata', JSON.stringify(imageRow));
        }
      }

      step('33. Members get a working signed URL, outsiders are denied');
      const urlResult = await bClient.storage.from(mediaBucket()).createSignedUrl(aImagePath, 60);
      const outsiderUrl = await eClient.storage.from(mediaBucket()).createSignedUrl(aImagePath, 60);
      let signedReadable = false;
      if (!urlResult.error && urlResult.data?.signedUrl) {
        const head = await fetch(urlResult.data.signedUrl);
        signedReadable = head.ok;
      }
      if (signedReadable && outsiderUrl.error) {
        pass('member signed URL readable, outsider signed URL denied');
      } else {
        fail(
          'member signed URL readable, outsider signed URL denied',
          JSON.stringify({ member: urlResult.error?.message ?? signedReadable, outsider: outsiderUrl.error?.message ?? 'no error' }),
        );
      }

      step('34. Guards â€” media without an object or outsider sends fail');
      const ghost = await aDevice.client.rpc('send_media_message', {
        p_conversation: convId,
        p_media_path: `${convId}/${aId}/ghost.png`,
        p_mime: 'image/png',
        p_type: 'image',
      });
      const outsiderSend = await eClient.rpc('send_media_message', {
        p_conversation: convId,
        p_media_path: `${convId}/${eId}/unsafe.png`,
        p_mime: 'image/png',
        p_type: 'image',
      });
      if (ghost.error && outsiderSend.error) {
        pass('send without upload and outsider send both rejected');
      } else {
        fail(
          'send without upload and outsider send both rejected',
          JSON.stringify({ ghost: ghost.error?.message ?? 'no error', outsider: outsiderSend.error?.message ?? 'no error' }),
        );
      }

      step('35. Chat list preview labels the media message');
      const listB = await bClient.rpc('list_conversations');
      const rowB = listB.data?.find((c) => c.conversation_id === convId);
      if (rowB?.last_message === 'ðŸ“· Photo') {
        pass('chat preview shows a media label');
      } else {
        fail('chat preview shows a media label', JSON.stringify(rowB));
      }

      step('36. Realtime: B sends a voice note and A receives it live');
      const bVoicePath = `${convId}/${bId}/voice-${Date.now()}.m4a`;
      const upVoice = await bClient.storage.from(mediaBucket()).upload(bVoicePath, tinyPng, {
        contentType: 'audio/mp4',
        upsert: true,
      });
      const voiceChannel = aDevice.client.channel('verify-voice');
      let voiceSubStatus = null;
      const voiceReceivedP = new Promise((resolve) => {
        voiceChannel
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'messages' },
            (payload) => {
              if (
                payload.new?.conversation_id === convId &&
                payload.new?.sender_id === bId &&
                payload.new?.message_type === 'voice'
              ) {
                resolve(payload.new);
              }
            },
          )
          .subscribe((status) => {
            voiceSubStatus = status;
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              resolve(null);
            }
          });
      });
      for (let i = 0; i < 80 && voiceSubStatus !== 'SUBSCRIBED'; i += 1) {
        if (voiceSubStatus === 'CHANNEL_ERROR' || voiceSubStatus === 'TIMED_OUT') break;
        await delay(100);
      }
      if (voiceSubStatus === 'SUBSCRIBED') {
        await delay(1500);
      }
      const sentVoice =
        voiceSubStatus === 'SUBSCRIBED'
          ? await bClient.rpc('send_media_message', {
              p_conversation: convId,
              p_media_path: bVoicePath,
              p_mime: 'audio/mp4',
              p_type: 'voice',
              p_duration: 4,
            })
          : { error: { message: `subscribe status: ${voiceSubStatus}` } };
      const voiceRaced = await Promise.race([voiceReceivedP, delay(12000)]);
      if (!upVoice.error && !sentVoice.error && voiceRaced?.message_type === 'voice') {
        mediaVoiceId = sentVoice.data;
        pass('voice message delivered to A over realtime');
      } else {
        fail(
          'voice message delivered to A over realtime',
          JSON.stringify({ up: upVoice.error?.message, send: sentVoice.error?.message, row: voiceRaced?.message_type ?? null }),
        );
      }
      await voiceChannel.unsubscribe();

      step('37. Delete a media message removes the stored object');
      const otherDelete = await bClient.rpc('delete_message', { p_message: mediaImageId });
      const ownDelete = await aDevice.client.rpc('delete_message', { p_message: mediaImageId });
      const urlAfter = await bClient.storage.from(mediaBucket()).createSignedUrl(aImagePath, 60);
      const afterList = await bClient.storage.from(mediaBucket()).list(`${convId}/${aId}`, {
        search: 'photo.png',
      });
      const objectGone = !afterList.error && (afterList.data ?? []).length === 0;
      if (otherDelete.error && !ownDelete.error && urlAfter.error && objectGone) {
        pass('sender-only delete, media object removed, URL revoked');
      } else {
        fail(
          'sender-only delete, media object removed, URL revoked',
          JSON.stringify({
            other: otherDelete.error?.message ?? 'no error',
            own: ownDelete.error?.message ?? 'no error',
            url: urlAfter.error?.message ?? 'still resolved',
            objectGone,
          }),
        );
      }

      // ---- Group chats ------------------------------------------------------

      step('38. Restore friendship A <-> B for group creation');
      const restoreReq = await bClient.rpc('request_friend', { p_target: aId });
      const restoreAcc = await aDevice.client.rpc('respond_friend_request', {
        p_sender: bId,
        p_accept: true,
      });
      const friendsAgain =
        (await aDevice.client.rpc('friend_status', { p_other: bId })).data === 'friends';
      if (!restoreReq.error && !restoreAcc.error && friendsAgain) {
        pass('friendship restored between A and B');
      } else {
        fail(
          'friendship restored between A and B',
          JSON.stringify({
            req: restoreReq.error?.message ?? 'ok',
            acc: restoreAcc.error?.message ?? 'ok',
          }),
        );
      }

      const { data: cSess0 } = await cClient.auth.getSession();
      const cIdM = cSess0?.session?.user?.id;
      let groupId = null;
      let gMsg1 = null;
      let gClient = null;

      step('39. Create group as A with B as a member');
      const createGroup = await aDevice.client.rpc('create_group', {
        p_name: 'Test Crew',
        p_member_ids: [bId],
      });
      if (createGroup.error || !createGroup.data) {
        fail('create group', createGroup.error?.message ?? 'no id');
      } else {
        groupId = createGroup.data;
        const listA = await aDevice.client.rpc('list_group_chats');
        const rowA = listA.data?.find((g) => g.chat_id === groupId);
        const listB = await bClient.rpc('list_group_chats');
        const rowB = listB.data?.find((g) => g.chat_id === groupId);
        if (
          rowA?.name === 'Test Crew' &&
          rowA?.my_role === 'owner' &&
          rowA?.member_count === 2 &&
          rowA?.unread_count === 0 &&
          rowB?.my_role === 'member'
        ) {
          pass('group created, roles and membership correct');
        } else {
          fail('group created, roles and membership correct', JSON.stringify({ a: rowA, b: rowB }));
        }
      }

      if (groupId) {
        step('40. Group info + members list (profiles, roles ordered)');
        const infoA = await aDevice.client.rpc('group_chat_info', { p_chat: groupId });
        const membersA = await aDevice.client.rpc('group_members_list', { p_chat: groupId });
        const ownerFirst = membersA.data?.[0];
        if (
          infoA.data?.[0]?.name === 'Test Crew' &&
          infoA.data?.[0]?.my_role === 'owner' &&
          membersA.data?.length === 2 &&
          ownerFirst?.role === 'owner' &&
          ownerFirst?.user_id === aId &&
          membersA.data?.some(
            (m) => m.user_id === bId && m.display_name === userB.display_name && m.role === 'member',
          )
        ) {
          pass('info + members listed with roles and profiles');
        } else {
          fail(
            'info + members listed with roles and profiles',
            JSON.stringify({ info: infoA.data, members: membersA.data }),
          );
        }

        step('41. Outsider blocked from group data and actions');
        const gStore = memoryStore();
        const userG = {
          email: `nexa_g_${rand()}${emailDomain()}`,
          password: 'outsider-g-pass-123',
          display_name: 'Gee Test',
          username: `nexa_g_${rand()}`,
        };
        gClient = clientFor(gStore);
        const signUpG = await gClient.auth.signUp({
          email: userG.email,
          password: userG.password,
          options: { data: { display_name: userG.display_name, username: userG.username } },
        });
        if (signUpG.error || !signUpG.data.session) {
          fail('register outsider G', signUpG.error?.message ?? 'no session');
        } else {
          const gInfo = await gClient.rpc('group_chat_info', { p_chat: groupId });
          const gSend = await gClient.rpc('send_group_message', { p_chat: groupId, p_body: 'intrusion' });
          const gPeek = await gClient.from('group_messages').select('id').eq('chat_id', groupId);
          if ((gInfo.data?.length ?? 0) === 0 && gSend.error && (gPeek.data?.length ?? 0) === 0) {
            pass('outside read/list/send blocked');
          } else {
            fail(
              'outside read/list/send blocked',
              JSON.stringify({ info: gInfo.data, send: gSend.error?.message ?? 'no error', peek: gPeek.data }),
            );
          }
        }

        step('42. B sends a message + reply; A lists ordered with sender profiles');
        const gSend1 = await bClient.rpc('send_group_message', { p_chat: groupId, p_body: 'hello crew' });
        if (gSend1.error || !gSend1.data) {
          fail('B sends group message', gSend1.error?.message ?? 'no id');
        } else {
          gMsg1 = gSend1.data;
          const gSend2 = await bClient.rpc('send_group_message', {
            p_chat: groupId,
            p_body: 'and reply',
            p_reply_to: gMsg1,
          });
          const feed = await aDevice.client.rpc('list_group_messages', { p_chat: groupId });
          const rows = feed.data ?? [];
          if (
            !gSend2.error &&
            rows.length === 2 &&
            rows[0].id === gMsg1 &&
            rows[0].sender_id === bId &&
            rows[0].sender_display_name === userB.display_name &&
            rows[1].reply_to_id === gMsg1
          ) {
            pass('group messages ordered with profile info and reply link');
          } else {
            fail(
              'group messages ordered with profile info and reply link',
              JSON.stringify({ err: gSend2.error?.message ?? feed.error?.message, rows }),
            );
          }
        }

        step('43. Unread count appears and mark_group_read clears it');
        const listBefore = await aDevice.client.rpc('list_group_chats');
        const rowBefore = listBefore.data?.find((g) => g.chat_id === groupId);
        const gRead = await aDevice.client.rpc('mark_group_read', { p_chat: groupId });
        const listAfter = await aDevice.client.rpc('list_group_chats');
        const rowAfter = listAfter.data?.find((g) => g.chat_id === groupId);
        if (!gRead.error && rowBefore?.unread_count === 2 && rowAfter?.unread_count === 0) {
          pass('group unread tracked via read watermark');
        } else {
          fail('group unread tracked via read watermark', JSON.stringify({ before: rowBefore?.unread_count, after: rowAfter?.unread_count, err: gRead.error?.message }));
        }

        step('44. Reactions on group messages (add, dedupe, remove)');
        const gr1 = await aDevice.client.rpc('react_to_group_message', { p_message: gMsg1, p_emoji: 'ðŸ‘' });
        const gr2 = await aDevice.client.rpc('react_to_group_message', { p_message: gMsg1, p_emoji: 'ðŸ‘' });
        const gr3 = await bClient.rpc('react_to_group_message', { p_message: gMsg1, p_emoji: 'â¤ï¸' });
        const { data: gReacted } = await aDevice.client
          .from('group_messages')
          .select('reactions')
          .eq('id', gMsg1)
          .single();
        const gEntries = gReacted?.reactions ?? [];
        if (!gr1.error && !gr2.error && !gr3.error && Array.isArray(gEntries) && gEntries.length === 2) {
          pass('group reactions dedupe per user+emoji');
        } else {
          fail(
            'group reactions dedupe per user+emoji',
            JSON.stringify({ entries: gEntries, gr1: gr1.error?.message, gr2: gr2.error?.message, gr3: gr3.error?.message }),
          );
        }
        const gUnreact = await aDevice.client.rpc('unreact_to_group_message', { p_message: gMsg1, p_emoji: 'ðŸ‘' });
        const { data: gAfter } = await aDevice.client
          .from('group_messages')
          .select('reactions')
          .eq('id', gMsg1)
          .single();
        if (!gUnreact.error && (gAfter?.reactions ?? []).length === 1) {
          pass('removing my group reaction leaves the otherâ€™s');
        } else {
          fail('removing my group reaction leaves the otherâ€™s', JSON.stringify({ reactions: gAfter?.reactions, err: gUnreact.error?.message }));
        }

        step('45. Member (B) permission limits');
        const aGroupMsg = await aDevice.client.rpc('send_group_message', { p_chat: groupId, p_body: 'A-owned message' });
        const bRename = await bClient.rpc('rename_group', { p_chat: groupId, p_name: 'Hacked' });
        const bAdd = await bClient.rpc('add_group_members', { p_chat: groupId, p_member_ids: [cIdM] });
        const bRole = await bClient.rpc('set_group_member_role', { p_chat: groupId, p_member: bId, p_role: 'admin' });
        const bDelete = aGroupMsg.error
          ? { error: { message: aGroupMsg.error.message } }
          : await bClient.rpc('delete_group_message', { p_message: aGroupMsg.data });
        const bAvatarUp = await bClient.storage
          .from('group-avatars')
          .upload(`${groupId}/member.png`, tinyPng, { contentType: 'image/png', upsert: true });
        if (bRename.error && bAdd.error && bRole.error && bDelete.error && bAvatarUp.error) {
          pass('members cannot rename/add/set-roles/delete othersâ€™ messages/upload avatars');
        } else {
          fail(
            'members cannot rename/add/set-roles/delete othersâ€™ messages/upload avatars',
            JSON.stringify({
              rename: bRename.error?.message ?? 'no error',
              add: bAdd.error?.message ?? 'no error',
              role: bRole.error?.message ?? 'no error',
              del: bDelete.error?.message ?? 'no error',
              avatar: bAvatarUp.error?.message ?? 'no error',
            }),
          );
        }

        step('46. Owner promotes B to admin');
        const promote = await aDevice.client.rpc('set_group_member_role', { p_chat: groupId, p_member: bId, p_role: 'admin' });
        const memAfter = await aDevice.client.rpc('group_members_list', { p_chat: groupId });
        const bRoleNow = memAfter.data?.find((m) => m.user_id === bId)?.role;
        if (!promote.error && bRoleNow === 'admin') {
          pass('owner can change roles');
        } else {
          fail('owner can change roles', JSON.stringify({ err: promote.error?.message, role: bRoleNow }));
        }

        step('47. Admin renames the group');
        const renameG = await bClient.rpc('rename_group', { p_chat: groupId, p_name: 'Crew Alpha' });
        const infoAfter = await aDevice.client.rpc('group_chat_info', { p_chat: groupId });
        if (!renameG.error && infoAfter.data?.[0]?.name === 'Crew Alpha') {
          pass('admin can rename the group');
        } else {
          fail('admin can rename the group', JSON.stringify({ err: renameG.error?.message, info: infoAfter.data }));
        }

        step('48. Admin adds a friend (B adds C) and C becomes a member');
        if (!cIdM) {
          fail('recover C session for group tests', 'no session');
        } else {
          const cReq = await bClient.rpc('request_friend', { p_target: cIdM });
          const cAcc = await cClient.rpc('respond_friend_request', { p_sender: bId, p_accept: true });
          const addG = await bClient.rpc('add_group_members', { p_chat: groupId, p_member_ids: [cIdM] });
          const memList = await aDevice.client.rpc('group_members_list', { p_chat: groupId });
          const cRow = memList.data?.find((m) => m.user_id === cIdM);
          if (!cReq.error && !cAcc.error && !addG.error && cRow?.role === 'member' && memList.data?.length === 3) {
            pass('admin adds a friend; C becomes a member');
          } else {
            fail('admin adds a friend; C becomes a member', JSON.stringify({ req: cReq.error?.message, acc: cAcc.error?.message, add: addG.error?.message, members: memList.data }));
          }
        }

        step('49. Role guards â€” owner removes admins; admins cannot');
        if (!cIdM) {
          fail('recover C session for role guards', 'no session');
        } else {
          const promoC = await aDevice.client.rpc('set_group_member_role', { p_chat: groupId, p_member: cIdM, p_role: 'admin' });
          const bRemovesAdmin = await bClient.rpc('remove_group_member', { p_chat: groupId, p_member: cIdM });
          const bRemovesOwner = await bClient.rpc('remove_group_member', { p_chat: groupId, p_member: aId });
          const aRemovesAdmin = await aDevice.client.rpc('remove_group_member', { p_chat: groupId, p_member: cIdM });
          const memFinal = await aDevice.client.rpc('group_members_list', { p_chat: groupId });
          if (
            !promoC.error &&
            bRemovesAdmin.error &&
            bRemovesOwner.error &&
            !aRemovesAdmin.error &&
            (memFinal.data?.length ?? 0) === 2
          ) {
            pass('owner removes admins; admins cannot remove admin/owner');
          } else {
            fail('owner removes admins; admins cannot remove admin/owner', JSON.stringify({ promo: promoC.error?.message, bAdmin: bRemovesAdmin.error?.message ?? 'no error', bOwner: bRemovesOwner.error?.message ?? 'no error', aAdmin: aRemovesAdmin.error?.message, members: memFinal.data }));
          }
        }

        step('50. Group media â€” members upload, outsider blocked, signed URLs');
        const mediaImagePath = `${groupId}/${aId}/pic.png`;
        const upMediaA = await aDevice.client.storage
          .from('group-attachments')
          .upload(mediaImagePath, tinyPng, { contentType: 'image/png', upsert: true });
        const upMediaOut = await gClient.storage
          .from('group-attachments')
          .upload(`${groupId}/outsider/x.png`, tinyPng, { contentType: 'image/png', upsert: true });
        const sendMediaG = upMediaA.error
          ? { error: { message: 'upload failed' } }
          : await aDevice.client.rpc('send_group_media_message', {
              p_chat: groupId,
              p_media_path: mediaImagePath,
              p_mime: 'image/png',
              p_type: 'image',
              p_caption: 'group photo',
              p_width: 1,
              p_height: 1,
              p_size: tinyPng.byteLength,
            });
        if (!upMediaA.error && upMediaOut.error && !sendMediaG.error && sendMediaG.data) {
          pass('member upload allowed, outsider upload blocked, image registered');
          const listLabel = await aDevice.client.rpc('list_group_chats');
          const rowLabel = listLabel.data?.find((g) => g.chat_id === groupId);
          if (rowLabel?.last_message === 'ðŸ“· Photo') {
            pass('group chat preview shows a media label');
          } else {
            fail('group chat preview shows a media label', JSON.stringify(rowLabel));
          }
          const signedMember = await bClient.storage.from('group-attachments').createSignedUrl(mediaImagePath, 60);
          let memberReadable = false;
          if (!signedMember.error && signedMember.data?.signedUrl) {
            memberReadable = (await fetch(signedMember.data.signedUrl)).ok;
          }
          const signedOut = await gClient.storage.from('group-attachments').createSignedUrl(mediaImagePath, 60);
          if (memberReadable && signedOut.error) {
            pass('group media signed URL readable by member, denied to outsider');
          } else {
            fail('group media signed URL readable by member, denied to outsider', JSON.stringify({ member: memberReadable, out: signedOut.error?.message ?? 'no error' }));
          }
        } else {
          fail('group media upload/send/signed-url', JSON.stringify({ a: upMediaA.error?.message, out: upMediaOut.error?.message ?? 'no error', send: sendMediaG.error?.message ?? 'no id' }));
        }

        step('51. Admin can delete another memberâ€™s media message');
        const delByAdmin = await bClient.rpc('delete_group_message', { p_message: sendMediaG?.data });
        const urlGone = await bClient.storage.from('group-attachments').createSignedUrl(mediaImagePath, 60);
        if (!delByAdmin.error && urlGone.error) {
          pass('admin delete scrubs the message and removes the object');
        } else {
          fail('admin delete scrubs the message and removes the object', JSON.stringify({ err: delByAdmin.error?.message, url: urlGone.error?.message ?? 'still resolved' }));
        }

        step('52. Group photo â€” owner uploads, members can read, outsiders denied');
        const avatarPath = `${groupId}/team-avatar.png`;
        const upAvatar = await aDevice.client.storage
          .from('group-avatars')
          .upload(avatarPath, tinyPng, { contentType: 'image/png', upsert: true });
        const setAvatar = upAvatar.error
          ? { error: { message: 'upload failed' } }
          : await aDevice.client.rpc('set_group_avatar', { p_chat: groupId, p_avatar_path: avatarPath });
        if (!upAvatar.error && !setAvatar.error) {
          const listAfterAvatar = await bClient.rpc('list_group_chats');
          const rowAvatar = listAfterAvatar.data?.find((g) => g.chat_id === groupId);
          const signedAvatar = await bClient.storage.from('group-avatars').createSignedUrl(avatarPath, 60);
          const signedAvatarOut = await gClient.storage.from('group-avatars').createSignedUrl(avatarPath, 60);
          if (rowAvatar?.avatar_path === avatarPath && !signedAvatar.error && signedAvatarOut.error) {
            pass('avatar set, readable by member, denied to outsider');
          } else {
            fail('avatar set, readable by member, denied to outsider', JSON.stringify({ row: rowAvatar, member: signedAvatar.error?.message ?? 'ok', out: signedAvatarOut.error?.message ?? 'no error' }));
          }
        } else {
          fail('group photo upload/set', JSON.stringify({ up: upAvatar.error?.message, set: setAvatar.error?.message }));
        }

        step('53. Realtime: B sends and A receives the group INSERT live');
        const groupChannel = aDevice.client.channel('verify-group-messages');
        let groupSubStatus = null;
        const groupReceivedP = new Promise((resolve) => {
          groupChannel
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'group_messages' },
              (payload) => {
                if (payload.new?.chat_id === groupId && payload.new?.sender_id === bId) {
                  resolve(payload.new);
                }
              },
            )
            .subscribe((status) => {
              groupSubStatus = status;
              if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                resolve(null);
              }
            });
        });
        for (let i = 0; i < 80 && groupSubStatus !== 'SUBSCRIBED'; i += 1) {
          if (groupSubStatus === 'CHANNEL_ERROR' || groupSubStatus === 'TIMED_OUT') break;
          await delay(100);
        }
        if (groupSubStatus === 'SUBSCRIBED') {
          await delay(1500);
        }
        const liveGroup =
          groupSubStatus === 'SUBSCRIBED'
            ? await bClient.rpc('send_group_message', { p_chat: groupId, p_body: 'realtime group' })
            : { error: { message: `subscribe status: ${groupSubStatus}` } };
        const grouped = await Promise.race([groupReceivedP, delay(12000)]);
        if (!liveGroup.error && grouped && grouped.body === 'realtime group') {
          pass('group message delivered to A over realtime');
        } else {
          fail('group message delivered to A over realtime', JSON.stringify({ send: liveGroup.error?.message ?? 'ok', body: grouped?.body ?? null }));
        }
        await groupChannel.unsubscribe();

        step('54. Owner leaves â€” ownership transfers to the admin');
        const leaveA = await aDevice.client.rpc('leave_group', { p_chat: groupId });
        const listAleft = await aDevice.client.rpc('list_group_chats');
        const listBleft = await bClient.rpc('list_group_chats');
        const bRow = listBleft.data?.find((g) => g.chat_id === groupId);
        if (!leaveA.error && !listAleft.data?.some((g) => g.chat_id === groupId) && bRow?.my_role === 'owner') {
          pass('owner handoff transfers ownership to the next admin');
        } else {
          fail('owner handoff transfers ownership to the next admin', JSON.stringify({ err: leaveA.error?.message, aRows: listAleft.data, bRow }));
        }

        step('55. New owner deletes the group');
        const deleteGroup = await bClient.rpc('delete_group', { p_chat: groupId });
        const listBfinal = await bClient.rpc('list_group_chats');
        const gone = !deleteGroup.error && !listBfinal.data?.some((g) => g.chat_id === groupId);
        if (gone) {
          pass('owner deletes the group and it disappears from the list');
        } else {
          fail('owner deletes the group and it disappears from the list', JSON.stringify({ err: deleteGroup.error?.message, rows: listBfinal.data }));
        }
      }

      // ---- Communities -------------------------------------------------------

      step('56. Give B the same class as A (school/department/level)');
      const bClass = await bClient
        .from('profiles')
        .update({ school: classSchool, department: classDept, level: classLevel })
        .eq('id', bId);
      if (bClass.error) {
        fail('set B class profile', bClass.error.message);
      } else {
        pass('set B class profile');
      }

      let communityId = null;
      let generalChannel = null;
      let announcementsChannel = null;
      let communityMessageId = null;

      step('57. A joins (and creates) the class community');
      const joinA = await aDevice.client.rpc('join_my_class_community');
      if (joinA.error || !joinA.data) {
        fail('create/join class community', joinA.error?.message ?? 'no id');
      } else {
        communityId = joinA.data;
        pass('create/join class community');
      }

      step('58. B joins the same community once A is a member');
      if (communityId) {
        const joinB = await bClient.rpc('join_community', { p_community: communityId });
        if (joinB.error) {
          fail('B joins class community', joinB.error.message);
        } else {
          const listBc = await bClient.rpc('list_communities');
          const rowBc = listBc.data?.find((c) => c.community_id === communityId);
          if (rowBc?.is_member === true && rowBc?.my_role === 'member') {
            pass('B joins class community');
          } else {
            fail('B joins class community', JSON.stringify(rowBc));
          }
        }
      }

      step('59. Community listed for both with membership + roles');
      if (communityId) {
        const listA = await aDevice.client.rpc('list_communities');
        const listB = await bClient.rpc('list_communities');
        const rowA = listA.data?.find((c) => c.community_id === communityId);
        const rowB = listB.data?.find((c) => c.community_id === communityId);
        if (
          rowA?.is_member === true &&
          rowA?.my_role === 'owner' &&
          rowB?.is_member === true &&
          rowB?.my_role === 'member' &&
          rowA?.member_count === 2
        ) {
          pass('community listed for A (owner) and B (member)');
        } else {
          fail('community listed for A (owner) and B (member)', JSON.stringify({ a: rowA, b: rowB }));
        }
      }

      step('60. Fixed channel set â€” General first, Announcements last');
      if (communityId) {
        const channels = await aDevice.client.rpc('list_community_channels', { p_community: communityId });
        const rows = channels.data ?? [];
        generalChannel = rows.find((ch) => ch.kind === 'general');
        announcementsChannel = rows.find((ch) => ch.kind === 'announcements');
        const channelsB = await bClient.rpc('list_community_channels', { p_community: communityId });
        const announcementsB = channelsB.data?.find((ch) => ch.kind === 'announcements');
        if (
          rows.length === 4 &&
          rows[0]?.kind === 'general' &&
          rows[0]?.name === 'General' &&
          rows[3]?.kind === 'announcements' &&
          generalChannel?.can_post === true &&
          announcementsB?.can_post === false
        ) {
          pass('4 fixed channels, general first (postable), announcements read-only for members');
        } else {
          fail('4 fixed channels, general first (postable), announcements read-only for members', JSON.stringify({ a: rows, b: channelsB.data }));
        }
      }

      step('61. Outsider blocked from community data and writes');
      if (communityId) {
        const gInfo = await gClient.rpc('community_info', { p_community: communityId });
        const gChannel = await gClient.rpc('list_community_channels', { p_community: communityId });
        const gSend = generalChannel
          ? await gClient.rpc('send_community_message', { p_channel: generalChannel.channel_id, p_body: 'intrusion' })
          : { error: { message: 'no channel' } };
        const gPeek = await gClient.from('community_messages').select('id').eq('community_id', communityId);
        if (
          (gInfo.data?.length ?? 0) === 0 &&
          (gChannel.data?.length ?? 0) === 0 &&
          gSend.error &&
          (gPeek.data?.length ?? 0) === 0
        ) {
          pass('outside read/list/send blocked');
        } else {
          fail('outside read/list/send blocked', JSON.stringify({ info: gInfo.data, channels: gChannel.data, send: gSend.error?.message ?? 'no error', peek: gPeek.data }));
        }
      }

      step('62. B posts in General and A sees it with unread');
      if (communityId && generalChannel) {
        const send = await bClient.rpc('send_community_message', {
          p_channel: generalChannel.channel_id,
          p_body: 'hello classmates',
        });
        if (send.error || !send.data) {
          fail('send community message', send.error?.message ?? 'no id');
        } else {
          communityMessageId = send.data;
          const listA = await aDevice.client.rpc('list_communities');
          const rowA = listA.data?.find((c) => c.community_id === communityId);
          const feedA = await aDevice.client.rpc('list_channel_messages', { p_channel: generalChannel.channel_id });
          const rows = feedA.data ?? [];
          if (
            rowA?.unread_count === 1 &&
            rows.length === 1 &&
            rows[0].id === communityMessageId &&
            rows[0].sender_display_name === userB.display_name
          ) {
            pass('channel feed has the message with sender profile; unread count tracked');
          } else {
            fail('channel feed has the message with sender profile; unread count tracked', JSON.stringify({ row: rowA, rows }));
          }
        }
      }

      step('63. A can read the channel feed and mark it read');
      if (communityId && generalChannel) {
        const read = await aDevice.client.rpc('mark_channel_read', { p_channel: generalChannel.channel_id });
        const listA = await aDevice.client.rpc('list_communities');
        const rowA = listA.data?.find((c) => c.community_id === communityId);
        const channels = await aDevice.client.rpc('list_community_channels', { p_community: communityId });
        const general = channels.data?.find((ch) => ch.channel_id === generalChannel.channel_id);
        if (!read.error && (rowA?.unread_count ?? 0) === 0 && general?.unread_count === 0) {
          pass('mark_channel_read clears the unread watermark');
        } else {
          fail('mark_channel_read clears the unread watermark', JSON.stringify({ err: read.error?.message, row: rowA, general }));
        }
      }

      step('64. Reactions on community messages (add, dedupe, remove)');
      if (communityId && communityMessageId) {
        const r1 = await aDevice.client.rpc('react_to_community_message', { p_message: communityMessageId, p_emoji: 'ðŸ‘' });
        const r2 = await aDevice.client.rpc('react_to_community_message', { p_message: communityMessageId, p_emoji: 'ðŸ‘' });
        const r3 = await bClient.rpc('react_to_community_message', { p_message: communityMessageId, p_emoji: 'â¤ï¸' });
        const { data: reacted } = await aDevice.client
          .from('community_messages')
          .select('reactions')
          .eq('id', communityMessageId)
          .single();
        const entries = reacted?.reactions ?? [];
        if (Array.isArray(entries) && entries.length === 2 && !r1.error && !r2.error && !r3.error) {
          pass('community reactions dedupe per user+emoji');
        } else {
          fail(
            'community reactions dedupe per user+emoji',
            JSON.stringify({ entries, r1: r1.error?.message, r2: r2.error?.message, r3: r3.error?.message }),
          );
        }
        const unreact = await aDevice.client.rpc('unreact_to_community_message', { p_message: communityMessageId, p_emoji: 'ðŸ‘' });
        const { data: afterUnreact } = await aDevice.client
          .from('community_messages')
          .select('reactions')
          .eq('id', communityMessageId)
          .single();
        if (!unreact.error && (afterUnreact?.reactions ?? []).length === 1) {
          pass('removing my community reaction leaves the otherâ€™s');
        } else {
          fail('removing my community reaction leaves the otherâ€™s', JSON.stringify({ reactions: afterUnreact?.reactions, err: unreact.error?.message }));
        }
      }

      step('65. Member permission limits in a community');
      if (communityId && communityMessageId) {
        const bAnnounce = announcementsChannel
          ? await bClient.rpc('send_community_message', { p_channel: announcementsChannel.channel_id, p_body: 'not allowed' })
          : { error: { message: 'no channel' } };
        const bAdd = await bClient.rpc('add_community_members', { p_community: communityId, p_member_ids: [cIdM] });
        const bRole = await bClient.rpc('set_community_role', { p_community: communityId, p_member: bId, p_role: 'admin' });
        const bAvatar = await bClient.storage
          .from('community-avatars')
          .upload(`${communityId}/member.png`, tinyPng, { contentType: 'image/png', upsert: true });
        if (bAnnounce.error && bAdd.error && bRole.error && bAvatar.error) {
          pass('members cannot post announcements, add members, set roles or upload avatars');
        } else {
          fail('members cannot post announcements, add members, set roles or upload avatars', JSON.stringify({ announce: bAnnounce.error?.message ?? 'no error', add: bAdd.error?.message ?? 'no error', role: bRole.error?.message ?? 'no error', avatar: bAvatar.error?.message ?? 'no error' }));
        }
      }

      step('66. Owner promotes B to admin; B can then post an announcement');
      if (communityId && announcementsChannel) {
        const promote = await aDevice.client.rpc('set_community_role', { p_community: communityId, p_member: bId, p_role: 'admin' });
        if (promote.error) {
          fail('promote B to admin', promote.error.message);
        } else {
          const announce = await bClient.rpc('send_community_message', {
            p_channel: announcementsChannel.channel_id,
            p_body: 'official update',
          });
          if (announce.error || !announce.data) {
            fail('admin posts to announcements', announce.error?.message ?? 'no id');
          } else {
            pass('admin posts to announcements');
            const feed = await bClient.rpc('list_channel_messages', { p_channel: announcementsChannel.channel_id });
            if (feed.data?.[0]?.body === 'official update') {
              pass('announcement visible in the channel feed');
            } else {
              fail('announcement visible in the channel feed', JSON.stringify(feed.data));
            }
          }
        }
      }

      step('67. Community media â€” members upload, outsider blocked, signed URLs');
      if (communityId) {
        const mediaPath = `${communityId}/${bId}/pic.png`;
        const upMember = await bClient.storage.from('community-attachments').upload(mediaPath, tinyPng, {
          contentType: 'image/png',
          upsert: true,
        });
        const upOut = await gClient.storage.from('community-attachments').upload(`${communityId}/outsider/x.png`, tinyPng, {
          contentType: 'image/png',
          upsert: true,
        });
        const sendMedia = upMember.error
          ? { error: { message: 'upload failed' } }
          : generalChannel
            ? await bClient.rpc('send_community_media_message', {
                p_channel: generalChannel.channel_id,
                p_media_path: mediaPath,
                p_mime: 'image/png',
                p_type: 'image',
                p_caption: 'class photo',
                p_width: 1,
                p_height: 1,
                p_size: tinyPng.byteLength,
              })
            : { error: { message: 'no channel' } };
        if (!upMember.error && upOut.error && !sendMedia.error && sendMedia.data) {
          const signedMember = await aDevice.client.storage.from('community-attachments').createSignedUrl(mediaPath, 60);
          let memberReadable = false;
          if (!signedMember.error && signedMember.data?.signedUrl) {
            memberReadable = (await fetch(signedMember.data.signedUrl)).ok;
          }
          const signedOut = await gClient.storage.from('community-attachments').createSignedUrl(mediaPath, 60);
          if (memberReadable && signedOut.error) {
            pass('community media registered; member URL readable, outsider denied');
          } else {
            fail('community media registered; member URL readable, outsider denied', JSON.stringify({ member: memberReadable, out: signedOut.error?.message ?? 'no error' }));
          }
        } else {
          fail('community media upload/send/signed-url', JSON.stringify({ up: upMember.error?.message, out: upOut.error?.message ?? 'no error', send: sendMedia.error?.message ?? 'no id' }));
        }
      }

      step('68. Admin deletes a non-owner memberâ€™s message + object');
      if (communityId && communityMessageId) {
        const del = await bClient.rpc('delete_community_message', { p_message: communityMessageId });
        if (del.error) {
          fail('admin deletes another memberâ€™s message', del.error.message);
        } else {
          const feed = await aDevice.client.rpc('list_channel_messages', { p_channel: generalChannel.channel_id });
          const row = feed.data?.find((m) => m.id === communityMessageId);
          if (row?.deleted_at && row.body === null) {
            pass('admin deletes another memberâ€™s message (scrubs body)');
          } else {
            fail('admin deletes another memberâ€™s message (scrubs body)', JSON.stringify(row));
          }
        }
      }

      step('69. Owner leaves â€” ownership transfers to the admin');
      if (communityId) {
        const leaveA = await aDevice.client.rpc('leave_community', { p_community: communityId });
        const infoB = await bClient.rpc('community_info', { p_community: communityId });
        if (!leaveA.error && infoB.data?.[0]?.my_role === 'owner') {
          pass('owner handoff transfers community ownership to the admin');
        } else {
          fail('owner handoff transfers community ownership to the admin', JSON.stringify({ err: leaveA.error?.message, info: infoB.data }));
        }
      }

      step('70. New owner deletes the community');
      if (communityId) {
        const delCommunity = await bClient.rpc('delete_community', { p_community: communityId });
        const listBfinal = await bClient.rpc('list_communities');
        if (!delCommunity.error && !listBfinal.data?.some((c) => c.community_id === communityId)) {
          pass('owner deletes the community and it disappears from the list');
        } else {
          fail('owner deletes the community and it disappears from the list', JSON.stringify({ err: delCommunity.error?.message, rows: listBfinal.data }));
        }
      }

      // ---- Polls & events (Phase 10) ---------------------------------------

      step('71. Fresh community for polls & events; B is a member');
      let pollCommunityId = null;
      const freshCreate = await aDevice.client.rpc('create_community', {
        p_school: classSchool,
        p_department: classDept,
        p_level: classLevel,
        p_name: 'Polls & Events Lab',
      });
      if (freshCreate.error || !freshCreate.data) {
        fail('create polls/events community', freshCreate.error?.message ?? 'no id');
      } else {
        pollCommunityId = freshCreate.data;
        const joinB = await bClient.rpc('join_community', { p_community: pollCommunityId });
        if (!joinB.error) {
          pass('create polls/events community and add B');
        } else {
          fail('add B to polls/events community', joinB.error.message);
        }
      }

      step('72. A creates a poll and votes; results show one row per option');
      let pollId = null;
      let optionId = null;
      if (pollCommunityId) {
        const created = await aDevice.client.rpc('create_community_poll', {
          p_community: pollCommunityId,
          p_question: 'Where for the study session?',
          p_options: ['Library', 'Cafeteria', 'Online'],
          p_anonymous: false,
        });
        if (created.error || !created.data) {
          fail('create poll', created.error?.message ?? 'no id');
        } else {
          pollId = created.data;
          const feed = await aDevice.client.rpc('list_community_polls', { p_community: pollCommunityId });
          const rows = feed.data ?? [];
          optionId = rows[0]?.option_id ?? null;
          if (feed.error || rows.length !== 3 || rows[0]?.poll_id !== pollId || rows[0]?.option_position !== 0) {
            fail('poll feed lists every option with positions', JSON.stringify(feed.error?.message ?? rows));
          } else {
            const vote = await aDevice.client.rpc('vote_community_poll', { p_poll: pollId, p_option: rows[0].option_id });
            const feed2 = await aDevice.client.rpc('list_community_polls', { p_community: pollCommunityId });
            const rowA = feed2.data?.find((r) => r.option_id === rows[0].option_id);
            if (vote.error || rowA?.option_votes !== 1 || rowA?.total_votes !== 1 || rowA?.my_vote_option_id !== rows[0].option_id || rowA?.is_expired !== false) {
              fail('poll feed reports my vote and tallies', JSON.stringify({ vote: vote.error?.message ?? 'ok', row: rowA }));
            } else {
              pass('poll feed reports my vote and tallies');
            }
          }
        }
      }

      step('73. B votes too; duplicate A vote is rejected');
      if (pollCommunityId && pollId) {
        const feedA = await aDevice.client.rpc('list_community_polls', { p_community: pollCommunityId });
        const aOption = feedA.data?.find((r) => r.option_id === optionId);
        const bOption = feedA.data?.find((r) => r.option_id !== optionId);
        const voteB = bOption ? await bClient.rpc('vote_community_poll', { p_poll: pollId, p_option: bOption.option_id }) : { error: { message: 'no option' } };
        const dupA = aOption ? await aDevice.client.rpc('vote_community_poll', { p_poll: pollId, p_option: aOption.option_id }) : { error: { message: 'no option' } };
        const feed2 = await aDevice.client.rpc('list_community_polls', { p_community: pollCommunityId });
        const totals = feed2.data ?? [];
        if (!voteB.error && dupA.error && totals.every((r) => r.total_votes === 2) && totals.filter((r) => r.option_votes === 1).length === 2) {
          pass('votes stack per option, extra votes rejected');
        } else {
          fail('votes stack per option, extra votes rejected', JSON.stringify({ b: voteB.error?.message ?? 'ok', dup: dupA.error?.message ?? 'no error', rows: totals }));
        }
      }

      step('74. Anonymous polls hide voter identities; breakdown gated');
      if (pollCommunityId) {
        const anonymous = await aDevice.client.rpc('create_community_poll', {
          p_community: pollCommunityId,
          p_question: 'Anonymous: favorite subject?',
          p_options: ['Math', 'Physics', 'English'],
          p_anonymous: true,
        });
        const open = await aDevice.client.rpc('create_community_poll', {
          p_community: pollCommunityId,
          p_question: 'Open: who should present?',
          p_options: ['Alice', 'Bob'],
          p_anonymous: false,
        });
        let anonId = null;
        let openId = null;
        if (anonymous.data) anonId = anonymous.data;
        if (open.data) openId = open.data;
        const openFeed = openId ? await aDevice.client.rpc('list_community_polls', { p_community: pollCommunityId }) : { data: [] };
        const openFirst = openFeed.data?.find((r) => r.poll_id === openId);
        if (anonId && openFirst && !anonymous.error && !open.error) {
          const anonOptionId = openFeed.data?.find((r) => r.poll_id === anonId)?.option_id ?? null;
          if (anonOptionId) {
            await bClient.rpc('vote_community_poll', { p_poll: anonId, p_option: anonOptionId });
          }
          await bClient.rpc('vote_community_poll', { p_poll: openId, p_option: openFirst.option_id });
          const votersAnon = await aDevice.client.rpc('list_community_poll_voters', { p_poll: anonId });
          const votersOpen = await aDevice.client.rpc('list_community_poll_voters', { p_poll: openId });
          const votersOpenB = await bClient.rpc('list_community_poll_voters', { p_poll: openId });
          const votersAnonB = await bClient.rpc('list_community_poll_voters', { p_poll: anonId });
          if (!votersAnon.error && (votersAnon.data?.length ?? 0) === 0 && (votersOpen.data?.length ?? 0) >= 1 && !votersOpenB.error && (votersOpenB.data?.length ?? 0) === 0 && (votersAnonB.data?.length ?? 0) === 0) {
            pass('anonymous poll hides voters; breakdown is owner/admin-only');
          } else {
            fail('anonymous poll hides voters; breakdown is owner/admin-only', JSON.stringify({ anon: votersAnon.data, open: votersOpen.data, openB: votersOpenB.data }));
          }
        } else {
          fail('create anonymous + open polls', JSON.stringify({ anon: anonymous.error?.message ?? 'ok', open: open.error?.message ?? 'ok' }));
        }
      }

      step('75. Guards: past expiry rejected, outsiders blocked, member cannot delete');
      if (pollCommunityId && pollId) {
        const pastExpiry = await aDevice.client.rpc('create_community_poll', {
          p_community: pollCommunityId,
          p_question: 'Bad poll',
          p_options: ['A', 'B'],
          p_anonymous: false,
          p_expires_at: new Date(Date.now() - 60_000).toISOString(),
        });
        const outsiderList = await gClient.rpc('list_community_polls', { p_community: pollCommunityId });
        const outsiderCreate = await gClient.rpc('create_community_poll', { p_community: pollCommunityId, p_question: 'x', p_options: ['a', 'b'] });
        const delByB = await bClient.rpc('delete_community_poll', { p_poll: pollId });
        if (pastExpiry.error && (outsiderList.data?.length ?? 0) === 0 && outsiderCreate.error && delByB.error) {
          pass('expired polls rejected; outsiders blocked; members cannot delete othersâ€™ polls');
        } else {
          fail('expired polls rejected; outsiders blocked; members cannot delete othersâ€™ polls', JSON.stringify({ past: pastExpiry.error?.message ?? 'no error', list: outsiderList.error?.message ?? 'no error', create: outsiderCreate.error?.message ?? 'no error', del: delByB.error?.message ?? 'no error' }));
        }
      }

      step('76. Author/owner deletes a poll; it disappears from the feed');
      if (pollCommunityId && pollId) {
        const del = await aDevice.client.rpc('delete_community_poll', { p_poll: pollId });
        const feed = await aDevice.client.rpc('list_community_polls', { p_community: pollCommunityId });
        if (!del.error && !feed.data?.some((r) => r.poll_id === pollId)) {
          pass('owner deletes a poll and it disappears from the feed');
        } else {
          fail('owner deletes a poll and it disappears from the feed', JSON.stringify({ err: del.error?.message, remaining: feed.data?.map((r) => r.poll_id) }));
        }
      }

      step('77. Events: A creates one; RSVPs stack from each member');
      let eventId = null;
      if (pollCommunityId) {
        const created = await aDevice.client.rpc('create_community_event', {
          p_community: pollCommunityId,
          p_title: 'Study night',
          p_description: 'Bring your notes.',
          p_starts_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
          p_location: 'Library Hall',
        });
        if (created.error || !created.data) {
          fail('create event', created.error?.message ?? 'no id');
        } else {
          eventId = created.data;
          const rsvpA = await aDevice.client.rpc('respond_to_event', { p_event: eventId, p_response: 'maybe' });
          const rsvpB = await bClient.rpc('respond_to_event', { p_event: eventId, p_response: 'going' });
          const feed = await aDevice.client.rpc('list_community_events', { p_community: pollCommunityId });
          const rowA = feed.data?.find((e) => e.event_id === eventId);
          if (!rsvpA.error && !rsvpB.error && rowA?.my_response === 'maybe' && rowA?.going_count === 1 && rowA?.maybe_count === 1 && rowA?.community_id === pollCommunityId) {
            pass('event created; RSVPs counted per response');
          } else {
            fail('event created; RSVPs counted per response', JSON.stringify({ rsvpA: rsvpA.error?.message ?? 'ok', rsvpB: rsvpB.error?.message ?? 'ok', row: rowA }));
          }
        }
      }

      step('78. Reminders toggle independently; RSVP can change');
      if (pollCommunityId && eventId) {
        const onB = await bClient.rpc('toggle_event_reminder', { p_event: eventId });
        const onA = await aDevice.client.rpc('toggle_event_reminder', { p_event: eventId });
        const offB = await bClient.rpc('toggle_event_reminder', { p_event: eventId });
        const changeA = await aDevice.client.rpc('respond_to_event', { p_event: eventId, p_response: 'not_going' });
        const feed = await aDevice.client.rpc('list_community_events', { p_community: pollCommunityId });
        const rowA = feed.data?.find((e) => e.event_id === eventId);
        if (onA.data === true && onB.data === true && offB.data === false && !changeA.error && rowA?.reminding === true && rowA?.my_response === 'not_going' && rowA?.maybe_count === 0 && rowA?.not_going_count === 1) {
          pass('reminders toggle per user; RSVP change moves counts');
        } else {
          fail('reminders toggle per user; RSVP change moves counts', JSON.stringify({ onA: onA.data, onB: onB.data, offB: offB.data, change: changeA.error?.message ?? 'ok', row: rowA }));
        }
      }

      step('79. Event photo: creator uploads, member URL readable, outsider denied');
      if (pollCommunityId) {
        const coverPath = `${pollCommunityId}/${aId}/cover.png`;
        const upB = await aDevice.client.storage.from('event-images').upload(coverPath, tinyPng, {
          contentType: 'image/png',
          upsert: true,
        });
        const upOut = await gClient.storage.from('event-images').upload(`${pollCommunityId}/${cIdM}/x.png`, tinyPng, {
          contentType: 'image/png',
          upsert: true,
        });
        const created = upB.error
          ? { error: { message: 'upload failed' } }
          : await aDevice.client.rpc('create_community_event', {
              p_community: pollCommunityId,
              p_title: 'Covered event',
              p_starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              p_image_path: coverPath,
            });
        if (!upB.error && upOut.error && !created.error && created.data) {
          eventId = created.data;
          const signedMember = await aDevice.client.storage.from('event-images').createSignedUrl(coverPath, 60);
          let readable = false;
          if (!signedMember.error && signedMember.data?.signedUrl) {
            readable = (await fetch(signedMember.data.signedUrl)).ok;
          }
          const signedOut = await gClient.storage.from('event-images').createSignedUrl(coverPath, 60);
          if (readable && signedOut.error) {
            pass('event photo uploaded by member; member URL readable, outsider denied');
          } else {
            fail('event photo uploaded by member; member URL readable, outsider denied', JSON.stringify({ readable, out: signedOut.error?.message ?? 'no error' }));
          }
        } else {
          fail('event photo upload/guard', JSON.stringify({ upB: upB.error?.message ?? 'ok', upOut: upOut.error?.message ?? 'no error', create: created.error?.message ?? 'no id' }));
        }
      }

      step('80. Events: member blocked from editing; author updates then deletes');
      if (pollCommunityId && eventId) {
        const editByB = await bClient.rpc('update_community_event', { p_event: eventId, p_title: 'hijacked' });
        const editByA = await aDevice.client.rpc('update_community_event', { p_event: eventId, p_title: 'Study night + games' });
        const feedAfterEdit = await aDevice.client.rpc('list_community_events', { p_community: pollCommunityId });
        const edited = feedAfterEdit.data?.find((e) => e.event_id === eventId);
        const delByB = await bClient.rpc('delete_community_event', { p_event: eventId });
        const delByA = await aDevice.client.rpc('delete_community_event', { p_event: eventId });
        const feedAfterDel = await aDevice.client.rpc('list_community_events', { p_community: pollCommunityId });
        const imageGone = eventId
          ? await gClient.storage.from('event-images').createSignedUrl(`${pollCommunityId}/${aId}/cover.png`, 60)
          : { error: { message: 'no event' } };
        if (editByB.error && !editByA.error && edited?.title === 'Study night + games' && delByB.error && !delByA.error && !feedAfterDel.data?.some((e) => e.event_id === eventId)) {
          pass('edit/delete require author or admin/owner; image object removed on delete');
        } else {
          fail('edit/delete require author or admin/owner; image object removed on delete', JSON.stringify({ editB: editByB.error?.message ?? 'no error', editA: editByA.error?.message ?? 'ok', title: edited?.title, delB: delByB.error?.message ?? 'no error', delA: delByA.error?.message ?? 'ok', remaining: feedAfterDel.data?.some((e) => e.event_id === eventId) }) );
        }
      }

      step('81. Owner deletes the polls/events community');
      if (pollCommunityId) {
        const delCommunity = await aDevice.client.rpc('delete_community', { p_community: pollCommunityId });
        const listBfinal = await bClient.rpc('list_communities');
        if (!delCommunity.error && !listBfinal.data?.some((c) => c.community_id === pollCommunityId)) {
          pass('polls/events community deleted and gone from the list');
        } else {
          fail('polls/events community deleted and gone from the list', JSON.stringify({ err: delCommunity.error?.message, rows: listBfinal.data }));
        }
      }

      // ---- Notifications (Phase 11) ---------------------------------------

      step('82. Fresh community for notifications; B is a member');
      let notifCommunityId = null;
      const notifCreate = await aDevice.client.rpc('create_community', {
        p_school: classSchool,
        p_department: classDept,
        p_level: classLevel,
        p_name: 'Notifications Lab',
      });
      if (notifCreate.error || !notifCreate.data) {
        fail('create notifications community', notifCreate.error?.message ?? 'no id');
      } else {
        notifCommunityId = notifCreate.data;
        const notifJoinB = await bClient.rpc('join_community', { p_community: notifCommunityId });
        if (!notifJoinB.error) {
          pass('create notifications community and add B');
        } else {
          fail('add B to notifications community', notifJoinB.error.message);
        }
      }

      step('83. Friend request and acceptance create notifications');
      if (aId && bId) {
        const swallowErr = async (p) => void (await p);
        await swallowErr(aDevice.client.rpc('cancel_friend_request', { p_target: bId }));
        await swallowErr(bClient.rpc('cancel_friend_request', { p_target: aId }));
        await swallowErr(aDevice.client.rpc('remove_friend', { p_other: bId }));
        await swallowErr(bClient.rpc('remove_friend', { p_other: aId }));
        const req = await aDevice.client.rpc('request_friend', { p_target: bId });
        const bFeed = await bClient.rpc('list_notifications');
        const unreadB = await bClient.rpc('unread_notification_count');
        const gotRequest = !req.error && (bFeed.data ?? []).some((n) => n.type === 'friend_request' && n.actor_id === aId);
        const accepted = gotRequest
          ? await bClient.rpc('respond_friend_request', { p_sender: aId, p_accept: true })
          : { error: { message: 'no request notif' } };
        const aFeed = await aDevice.client.rpc('list_notifications');
        const gotAccepted = !accepted.error && (aFeed.data ?? []).some((n) => n.type === 'friend_request_accepted' && n.actor_id === bId);
        if (gotRequest && gotAccepted && (unreadB.data ?? 0) > 0) {
          pass('friend_request + friend_request_accepted notifications fire');
        } else {
          fail('friend_request + friend_request_accepted notifications fire', JSON.stringify({ req: req.error?.message ?? 'ok', unread: unreadB.data, gotRequest, accepted: accepted.error?.message ?? 'ok', gotAccepted }));
        }
      }

      step('84. Direct message + reaction notifications carry navigation data');
      let notifConvId = null;
      let notifMsgId = null;
      if (aId && bId) {
        const start = await aDevice.client.rpc('start_conversation', { p_other: bId });
        if (start.error || !start.data) {
          fail('start conversation for notifications', start.error?.message ?? 'no id');
        } else {
          notifConvId = start.data;
          const sendB = await bClient.rpc('send_message', { p_conversation: notifConvId, p_body: 'notifying A' });
          notifMsgId = sendB.data ?? null;
          const aFeed = await aDevice.client.rpc('list_notifications');
          const gotMessage = notifMsgId && (aFeed.data ?? []).some((n) => n.type === 'message' && n.actor_id === bId && n.data?.conversation_id === notifConvId);
          const react = sendB.error || !notifMsgId ? { error: { message: 'no message' } } : await aDevice.client.rpc('react_to_message', { p_message: notifMsgId, p_emoji: 'ðŸ‘' });
          const bFeed = await bClient.rpc('list_notifications');
          const gotReaction = !react.error && (bFeed.data ?? []).some((n) => n.type === 'message_reaction' && n.actor_id === aId);
          if (gotMessage && gotReaction) {
            pass('new-message + message-reaction notifications carry targets');
          } else {
            fail('new-message + message-reaction notifications carry targets', JSON.stringify({ gotMessage, msg: notifMsgId, react: react.error?.message ?? 'ok', gotReaction }));
          }
        }
      }

      step('85. Group @mention notification');
      let notifGroupId = null;
      if (aId && bId) {
        const group = await aDevice.client.rpc('create_group', { p_name: 'Notif Crew', p_member_ids: [bId] });
        if (group.error || !group.data) {
          fail('create group for mentions', group.error?.message ?? 'no id');
        } else {
          notifGroupId = group.data;
          const send = await aDevice.client.rpc('send_group_message', { p_chat: notifGroupId, p_body: `hey @${userB.username} check this out` });
          const bFeed = await bClient.rpc('list_notifications');
          const gotMention = !send.error && (bFeed.data ?? []).some((n) => n.type === 'mention' && n.actor_id === aId && n.data?.chat_id === notifGroupId);
          if (gotMention) {
            pass('group @mention notification reaches the mentioned user');
          } else {
            fail('group @mention notification reaches the mentioned user', JSON.stringify({ send: send.error?.message ?? 'ok', rows: (bFeed.data ?? []).filter((n) => n.type === 'mention') }));
          }
        }
      }

      step('86. Story reaction + reply notifications; reply does not double-notify a DM');
      let notifStoryId = null;
      if (aId && bId) {
        const story = await aDevice.client.rpc('create_story', { p_kind: 'text', p_body: 'Notification hello' });
        if (story.error || !story.data) {
          fail('create story for notifications', story.error?.message ?? 'no id');
        } else {
          notifStoryId = story.data;
          const react = await bClient.rpc('react_to_story', { p_story: notifStoryId, p_emoji: 'ðŸ˜' });
          const reply = await bClient.rpc('send_story_reply', { p_story: notifStoryId, p_body: 'Great story!' });
          const mirrorId = reply.data?.[0]?.message_id ?? null;
          const aFeed = await aDevice.client.rpc('list_notifications');
          const gotReaction = !react.error && (aFeed.data ?? []).some((n) => n.type === 'story_reaction' && n.actor_id === bId);
          const gotReply = !reply.error && (aFeed.data ?? []).some((n) => n.type === 'story_reply' && n.actor_id === bId);
          const noDup = !mirrorId || !(aFeed.data ?? []).some((n) => n.type === 'message' && n.data?.message_id === mirrorId);
          if (gotReaction && gotReply && noDup) {
            pass('story reaction + reply notify; mirrored DM is skipped');
          } else {
            fail('story reaction + reply notify; mirrored DM is skipped', JSON.stringify({ react: react.error?.message ?? 'ok', reply: reply.error?.message ?? 'ok', mirrorId, gotReaction, gotReply, noDup }));
          }
        }
      }

      step('87. Community announcement + poll notifications');
      let notifPollId = null;
      if (notifCommunityId) {
        const channels = await aDevice.client.rpc('list_community_channels', { p_community: notifCommunityId });
        const ann = channels.data?.find((ch) => ch.kind === 'announcements');
        const announce = ann
          ? await aDevice.client.rpc('send_community_message', { p_channel: ann.channel_id, p_body: 'Class trip this Friday' })
          : { error: { message: 'no announcements channel' } };
        const poll = await aDevice.client.rpc('create_community_poll', { p_community: notifCommunityId, p_question: 'Venue for the trip?', p_options: ['Park', 'Museum'] });
        if (poll.data) notifPollId = poll.data;
        const bFeed = await bClient.rpc('list_notifications');
        const gotAnnounce = !announce.error && (bFeed.data ?? []).some((n) => n.type === 'community_announcement' && n.actor_id === aId);
        const gotPoll = notifPollId && (bFeed.data ?? []).some((n) => n.type === 'poll' && n.actor_id === aId && n.data?.poll_id === notifPollId);
        if (gotAnnounce && gotPoll) {
          pass('announcement + poll notifications fan out to members');
        } else {
          fail('announcement + poll notifications fan out to members', JSON.stringify({ announce: announce.error?.message ?? 'ok', poll, gotAnnounce, gotPoll }));
        }
      }

      step('88. Opt-in event reminder notification becomes due');
      let notifEventId = null;
      if (notifCommunityId) {
        const created = await aDevice.client.rpc('create_community_event', {
          p_community: notifCommunityId,
          p_title: 'Trip departure',
          p_starts_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        });
        if (created.error || !created.data) {
          fail('create event for reminder', created.error?.message ?? 'no id');
        } else {
          notifEventId = created.data;
          const toggle = await bClient.rpc('toggle_event_reminder', { p_event: notifEventId });
          const bFeed = await bClient.rpc('list_notifications');
          const gotReminder = !toggle.error && (bFeed.data ?? []).some((n) => n.type === 'event_reminder' && n.data?.event_id === notifEventId);
          if (toggle.data === true && gotReminder) {
            pass('event reminder notification generated when due');
          } else {
            fail('event reminder notification generated when due', JSON.stringify({ toggle: toggle.data, gotReminder }));
          }
        }
      }

      step('89. Mark as read, mark all as read, and RLS privacy');
      if (aId && bId) {
        const before = await bClient.rpc('unread_notification_count');
        const markAll = await bClient.rpc('mark_all_notifications_read');
        const afterAll = await bClient.rpc('unread_notification_count');
        const bFeedAll = await bClient.rpc('list_notifications');
        const allRead = (bFeedAll.data ?? []).every((n) => n.is_read) && (afterAll.data ?? 0) === 0;
        let singleId = null;
        if ((before.data ?? 0) > 0 && allRead && notifConvId) {
          const send = await aDevice.client.rpc('send_message', { p_conversation: notifConvId, p_body: 'one more' });
          const bFeed1 = await bClient.rpc('list_notifications');
          const fresh = (bFeed1.data ?? []).find((n) => n.type === 'message' && !n.is_read);
          if (send.data && fresh?.id) {
            singleId = fresh.id;
            await bClient.rpc('mark_notification_read', { p_id: fresh.id });
          }
        }
        const afterSingle = singleId ? await bClient.rpc('unread_notification_count') : { data: 1 };
        const gFeed = await gClient.rpc('list_notifications');
        const bKnown = (bFeedAll.data ?? []).map((n) => n.id);
        const leaked = (gFeed.data ?? []).some((n) => bKnown.includes(n.id));
        if (allRead && (afterSingle.data ?? 0) === 0 && !leaked) {
          pass('mark all/ single read clears unread; outsiders never see rows');
        } else {
          fail('mark all/ single read clears unread; outsiders never see rows', JSON.stringify({ before: before.data, markAll: markAll.error?.message ?? 'ok', afterAll: afterAll.data, allRead, singleId, afterSingle: afterSingle.data, leaked }));
        }
      }

      step('90. Owner deletes the notifications community');
      if (notifCommunityId) {
        const delCommunity = await aDevice.client.rpc('delete_community', { p_community: notifCommunityId });
        const listBfinal = await bClient.rpc('list_communities');
        if (!delCommunity.error && !listBfinal.data?.some((c) => c.community_id === notifCommunityId)) {
          pass('notifications community deleted and gone from the list');
        } else {
          fail('notifications community deleted and gone from the list', JSON.stringify({ err: delCommunity.error?.message, rows: listBfinal.data }));
        }
      }

      // ---- Global search (Phase 12) ----------------------------------------

      step('91. Fresh community for search; B is a member');
      let searchCommunityId = null;
      const searchCreate = await aDevice.client.rpc('create_community', {
        p_school: classSchool,
        p_department: classDept,
        p_level: classLevel,
        p_name: 'Search Lab',
      });
      if (searchCreate.error || !searchCreate.data) {
        fail('create search community', searchCreate.error?.message ?? 'no id');
      } else {
        searchCommunityId = searchCreate.data;
        const searchJoinB = await bClient.rpc('join_community', { p_community: searchCommunityId });
        if (!searchJoinB.error) {
          pass('create search community and add B');
        } else {
          fail('add B to search community', searchJoinB.error.message);
        }
      }

      let searchGeneral = null;
      let searchAcademics = null;
      step('92. Seed a post, an academic resource and an event');
      if (searchCommunityId) {
        const searchChannels = await aDevice.client.rpc('list_community_channels', { p_community: searchCommunityId });
        searchGeneral = searchChannels.data?.find((ch) => ch.kind === 'general');
        searchAcademics = searchChannels.data?.find((ch) => ch.kind === 'academics');
        const searchPost = searchGeneral
          ? await bClient.rpc('send_community_message', { p_channel: searchGeneral.channel_id, p_body: 'study group meeting for the finals' })
          : { error: { message: 'no general channel' } };
        const searchResource = searchAcademics
          ? await bClient.rpc('send_community_message', { p_channel: searchAcademics.channel_id, p_body: 'oscillation notes and past questions' })
          : { error: { message: 'no academics channel' } };
        const searchEvent = await aDevice.client.rpc('create_community_event', {
          p_community: searchCommunityId,
          p_title: 'Finals revision bootcamp',
          p_description: 'Get exam-ready together.',
          p_starts_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
        if (!searchPost.error && !searchResource.error && !searchEvent.error && searchEvent.data) {
          pass('seeded a post, an academic resource and an event');
        } else {
          fail('seeded a post, an academic resource and an event', JSON.stringify({ post: searchPost.error?.message ?? 'ok', res: searchResource.error?.message ?? 'ok', event: searchEvent.error?.message ?? 'ok' }));
        }
      }

      step('93. search_all covers all five categories');
      if (searchCommunityId) {
        const allRes = await aDevice.client.rpc('search_all', { p_query: 'revision', p_category: 'all' });
        const gotEvent = (allRes.data ?? []).some((r) => r.category === 'event' && r.title === 'Finals revision bootcamp');
        const userRes = await aDevice.client.rpc('search_all', { p_query: userB.display_name.split(' ')[0] });
        const gotUser = (userRes.data ?? []).some((r) => r.category === 'user' && r.title === userB.display_name);
        const commRes = await aDevice.client.rpc('search_all', { p_query: 'Search Lab', p_category: 'communities' });
        const gotCommunity = (commRes.data ?? []).some((r) => r.category === 'community' && r.title === 'Search Lab');
        const resRes = await aDevice.client.rpc('search_all', { p_query: 'oscillation', p_category: 'resources' });
        const gotResource = (resRes.data ?? []).some((r) => r.category === 'resource');
        const postRes = await aDevice.client.rpc('search_all', { p_query: 'study group', p_category: 'posts' });
        const gotPost = (postRes.data ?? []).some((r) => r.category === 'post');
        if (gotEvent && gotUser && gotCommunity && gotResource && gotPost) {
          pass('unified search covers users, communities, posts, events and resources');
        } else {
          fail('unified search covers users, communities, posts, events and resources', JSON.stringify({ event: gotEvent, user: gotUser, community: gotCommunity, resource: gotResource, post: gotPost, rows: allRes.data }));
        }
      }

      step('94. Blocked users are hidden from search');
      if (searchCommunityId) {
        const blockSearch = await aDevice.client.rpc('block_user', { p_target: bId });
        const blockedRes = await aDevice.client.rpc('search_all', { p_query: userB.display_name.split(' ')[0] });
        const leaked = (blockedRes.data ?? []).some((r) => r.category === 'user' && r.data?.user_id === bId);
        if (!blockSearch.error && !leaked) {
          pass('blocked user hidden from user search');
        } else {
          fail('blocked user hidden from user search', JSON.stringify({ blk: blockSearch.error?.message ?? 'ok', leaked }));
        }
        await aDevice.client.rpc('unblock_user', { p_target: bId });
      }

      step('95. Outsiders cannot search another communityâ€™s private content');
      if (searchCommunityId) {
        const outRes = await cClient.rpc('search_all', { p_query: 'oscillation' });
        const leaked = (outRes.data ?? []).some((r) => ['resource', 'post', 'event'].includes(r.category));
        if (!outRes.error && !leaked) {
          pass('outsider search returns no private community content');
        } else {
          fail('outsider search returns no private community content', JSON.stringify({ err: outRes.error?.message, rows: outRes.data }));
        }
      }

      step('96. Recent searches are saved, de-duped and cleared');
      await aDevice.client.rpc('add_recent_search', { p_query: 'oscillation' });
      await aDevice.client.rpc('add_recent_search', { p_query: 'revision' });
      await aDevice.client.rpc('add_recent_search', { p_query: 'oscillation' });
      const recentList = await aDevice.client.rpc('list_recent_searches');
      const recentQueries = (recentList.data ?? []).map((r) => r.query);
      const deduped = recentQueries.filter((q) => q === 'oscillation').length === 1 && recentQueries[0] === 'oscillation';
      if (!recentList.error && recentQueries.length === 2 && deduped) {
        pass('recent searches de-dupe and order by recency');
      } else {
        fail('recent searches de-dupe and order by recency', JSON.stringify(recentList.data));
      }
      await aDevice.client.rpc('clear_recent_searches');
      const recentCleared = await aDevice.client.rpc('list_recent_searches');
      if (!recentCleared.error && (recentCleared.data?.length ?? 0) === 0) {
        pass('clear removes recent searches');
      } else {
        fail('clear removes recent searches', JSON.stringify(recentCleared.data));
      }

      step('97. Owner deletes the search community');
      if (searchCommunityId) {
        const delSearch = await aDevice.client.rpc('delete_community', { p_community: searchCommunityId });
        const searchListB = await bClient.rpc('list_communities');
        if (!delSearch.error && !searchListB.data?.some((c) => c.community_id === searchCommunityId)) {
          pass('search community deleted and gone from the list');
        } else {
          fail('search community deleted and gone from the list', JSON.stringify({ err: delSearch.error?.message, rows: searchListB.data }));
        }
      }

      // ---- Safety & moderation (Phase 13) ---------------------------------

      step('98. Reseed friendship A <-> B for report/mute fixtures');
      const swallowModErr = async (p) => void (await p);
      await swallowModErr(bClient.rpc('cancel_friend_request', { p_target: aId }));
      await swallowModErr(aDevice.client.rpc('cancel_friend_request', { p_target: bId }));
      await swallowModErr(bClient.rpc('remove_friend', { p_other: aId }));
      await swallowModErr(aDevice.client.rpc('remove_friend', { p_other: bId }));
      const resetFriend = await bClient.rpc('request_friend', { p_target: aId });
      const acceptFriend = resetFriend.error
        ? { error: { message: 'skipped' } }
        : await aDevice.client.rpc('respond_friend_request', { p_sender: bId, p_accept: true });
      const friendAgain = (await aDevice.client.rpc('friend_status', { p_other: bId })).data === 'friends';
      if (friendAgain && !acceptFriend.error) {
        pass('A and B are friends again');
      } else {
        fail('A and B are friends again', JSON.stringify({ req: resetFriend.error?.message, acc: acceptFriend.error?.message, status: (await aDevice.client.rpc('friend_status', { p_other: bId })).data }));
      }

      let modConvId = null;
      let modGroupId = null;
      let modCommunityId = null;
      let modGeneralChannel = null;
      let modMessageId = null;
      let modGroupMessageId = null;
      let modCommunityMessageId = null;

      step('99. Fresh DM, group and community for report/mute tests');
      if (friendAgain) {
        const mc = await aDevice.client.rpc('start_conversation', { p_other: bId });
        const mg = mc.error ? { error: { message: 'no conv' } } : await aDevice.client.rpc('create_group', { p_name: 'Moderation Crew', p_member_ids: [bId] });
        modConvId = mc.data ?? null;
        modGroupId = mg.data ?? null;
        const mcomm = await aDevice.client.rpc('create_community', {
          p_school: classSchool,
          p_department: classDept,
          p_level: classLevel,
          p_name: 'Moderation Lab',
        });
        if (mcomm.data) {
          modCommunityId = mcomm.data;
          const jb = await bClient.rpc('join_community', { p_community: modCommunityId });
          if (jb.error) {
            fail('B joins moderation community', jb.error.message);
          }
          const chans = await aDevice.client.rpc('list_community_channels', { p_community: modCommunityId });
          modGeneralChannel = chans.data?.find((c) => c.kind === 'general') ?? null;
        }
        if (modConvId && modGroupId && modCommunityId && modGeneralChannel) {
          pass('DM + group + community ready');
        } else {
          fail('DM + group + community ready', JSON.stringify({ conv: mc.error?.message, group: mg.error?.message, community: modCommunityId }));
        }
      } else {
        fail('DM + group + community ready', 'friendship not restored');
      }

      step('100. Seed a DM message, a group message and a community post');
      if (modConvId && modGroupId && modCommunityId && modGeneralChannel) {
        const dm = await bClient.rpc('send_message', { p_conversation: modConvId, p_body: 'flagged dm content' });
        modMessageId = dm.data ?? null;
        const gm = await bClient.rpc('send_group_message', { p_chat: modGroupId, p_body: 'flagged group content' });
        modGroupMessageId = gm.data ?? null;
        const cm = await bClient.rpc('send_community_message', { p_channel: modGeneralChannel.channel_id, p_body: 'flagged post content' });
        modCommunityMessageId = cm.data ?? null;
        if (modMessageId && modGroupMessageId && modCommunityMessageId) {
          pass('messages seeded for reporting');
        } else {
          fail('messages seeded for reporting', JSON.stringify({ dm: dm.error?.message, gm: gm.error?.message, cm: cm.error?.message }));
        }
      }

      step('101. report_user â€” records a snapshot, rejects self + invalid category');
      if (aId && bId) {
        const self = await aDevice.client.rpc('report_user', { p_target: aId, p_category: 'spam' });
        const badCat = await aDevice.client.rpc('report_user', { p_target: bId, p_category: 'nonsense' });
        const ok = await bClient.rpc('report_user', { p_target: aId, p_category: 'harassment', p_details: 'Repeated abuse.' });
        const { data: own } = ok.error
          ? { data: null }
          : await bClient.from('moderation_reports').select('target_type, target_id, category, content, status').eq('reporter_id', bId).single();
        const valid =
          self.error &&
          badCat.error &&
          !ok.error &&
          own?.target_type === 'user' &&
          own?.target_id === aId &&
          own?.category === 'harassment' &&
          own?.status === 'open' &&
          typeof own.content === 'string';
        if (valid) {
          pass('report_user works; snapshot + guards enforced');
        } else {
          fail('report_user works; snapshot + guards enforced', JSON.stringify({ self: self.error?.message, badCat: badCat.error?.message, ok: ok.error?.message ?? 'ok', own }));
        }
      }

      step('102. Duplicate open report per target is rejected');
      if (bId) {
        const dup = await bClient.rpc('report_user', { p_target: aId, p_category: 'spam' });
        const otherCat = await bClient.rpc('report_user', { p_target: aId, p_category: 'impersonation' });
        if (dup.error && otherCat.error) {
          pass('only one open report per target; duplicates blocked');
        } else {
          fail('only one open report per target; duplicates blocked', JSON.stringify({ dup: dup.error?.message ?? 'no error', other: otherCat.error?.message ?? 'no error' }));
        }
      }

      step('103. report_message requires visibility; stones snapshot body');
      if (modMessageId) {
        const outsider = await gClient.rpc('report_message', { p_message: modMessageId, p_category: 'spam' });
        const own = await aDevice.client.rpc('report_message', { p_message: modMessageId, p_category: 'spam' });
        const { data: mrow } = own.error
          ? { data: null }
          : await aDevice.client.from('moderation_reports').select('target_type, target_id, content, status').eq('reporter_id', aId).single();
        if (
          outsider.error &&
          !own.error &&
          mrow?.target_type === 'message' &&
          mrow?.target_id === modMessageId &&
          mrow?.content === 'flagged dm content' &&
          mrow?.status === 'open'
        ) {
          pass('report_message blocked for outsiders, snapshots the body for members');
        } else {
          fail('report_message blocked for outsiders, snapshots the body for members', JSON.stringify({ outsider: outsider.error?.message ?? 'no error', own: own.error?.message ?? 'ok', row: mrow }));
        }
      }

      step('104. report_group_message â€” member can report, outsider blocked');
      if (modGroupMessageId) {
        const outsider = await gClient.rpc('report_group_message', { p_message: modGroupMessageId, p_category: 'harassment' });
        const member = await aDevice.client.rpc('report_group_message', { p_message: modGroupMessageId, p_category: 'harassment' });
        if (outsider.error && !member.error) {
          pass('group message reportable by members only');
        } else {
          fail('group message reportable by members only', JSON.stringify({ outsider: outsider.error?.message ?? 'no error', member: member.error?.message ?? 'ok' }));
        }
      }

      step('105. report_community_message â€” member can report, outsider blocked');
      if (modCommunityMessageId) {
        const outsider = await gClient.rpc('report_community_message', { p_message: modCommunityMessageId, p_category: 'inappropriate_content' });
        const member = await aDevice.client.rpc('report_community_message', { p_message: modCommunityMessageId, p_category: 'inappropriate_content' });
        if (outsider.error && !member.error) {
          pass('community message reportable by members only');
        } else {
          fail('community message reportable by members only', JSON.stringify({ outsider: outsider.error?.message ?? 'no error', member: member.error?.message ?? 'ok' }));
        }
      }

      step('106. Reports are read-only for the reporter via RLS');
      if (aId) {
        const { data: myRows } = await aDevice.client.from('moderation_reports').select('id');
        const { data: outRows } = await gClient.from('moderation_reports').select('id');
        const reporterOnly =
          (myRows?.length ?? 0) >= 3 &&
          (outRows?.length ?? 0) === 0;
        if (reporterOnly) {
          pass('A sees its own reports; outsider sees none');
        } else {
          fail('A sees its own reports; outsider sees none', JSON.stringify({ mine: myRows?.length, outsider: outRows?.length }));
        }
      }

      step('107. Mute + unmute a DM conversation (per user)');
      if (modConvId) {
        const before = await aDevice.client.rpc('is_conversation_muted', { p_scope: 'dm', p_target: modConvId });
        const mute = await aDevice.client.rpc('mute_conversation', { p_scope: 'dm', p_target: modConvId });
        const after = await aDevice.client.rpc('is_conversation_muted', { p_scope: 'dm', p_target: modConvId });
        const peer = await bClient.rpc('is_conversation_muted', { p_scope: 'dm', p_target: modConvId });
        const unmute = await aDevice.client.rpc('unmute_conversation', { p_scope: 'dm', p_target: modConvId });
        const cleared = await aDevice.client.rpc('is_conversation_muted', { p_scope: 'dm', p_target: modConvId });
        if (before.data === false && !mute.error && after.data === true && peer.data === false && !unmute.error && cleared.data === false) {
          pass('mute is per-user and toggleable');
        } else {
          fail('mute is per-user and toggleable', JSON.stringify({ before: before.data, mute: mute.error?.message ?? 'ok', after: after.data, peer: peer.data, unmute: unmute.error?.message ?? 'ok', cleared: cleared.data }));
        }
      }

      step('108. Mute guards â€” only members can mute, bad scope rejected');
      if (modGroupId && modConvId) {
        const outsiderGroup = await gClient.rpc('mute_conversation', { p_scope: 'group', p_target: modGroupId });
        const badScope = await aDevice.client.rpc('mute_conversation', { p_scope: 'weird', p_target: modConvId });
        const muteGroup = await aDevice.client.rpc('mute_conversation', { p_scope: 'group', p_target: modGroupId });
        const mutedGroup = await aDevice.client.rpc('is_conversation_muted', { p_scope: 'group', p_target: modGroupId });
        const unmuteGroup = await aDevice.client.rpc('unmute_conversation', { p_scope: 'group', p_target: modGroupId });
        if (outsiderGroup.error && badScope.error && !muteGroup.error && mutedGroup.data === true && !unmuteGroup.error) {
          pass('mute guards block outsiders and invalid scopes');
        } else {
          fail('mute guards block outsiders and invalid scopes', JSON.stringify({ outsider: outsiderGroup.error?.message ?? 'no error', scope: badScope.error?.message ?? 'no error', mute: muteGroup.error?.message ?? 'ok', muted: mutedGroup.data, unmute: unmuteGroup.error?.message ?? 'ok' }));
        }
      }

      step('109. Community mute applies and clears');
      if (modCommunityId) {
        const mute = await aDevice.client.rpc('mute_conversation', { p_scope: 'community', p_target: modCommunityId });
        const muted = await aDevice.client.rpc('is_conversation_muted', { p_scope: 'community', p_target: modCommunityId });
        const unmute = await aDevice.client.rpc('unmute_conversation', { p_scope: 'community', p_target: modCommunityId });
        const cleared = await aDevice.client.rpc('is_conversation_muted', { p_scope: 'community', p_target: modCommunityId });
        if (!mute.error && muted.data === true && !unmute.error && cleared.data === false) {
          pass('community mute toggles per user');
        } else {
          fail('community mute toggles per user', JSON.stringify({ mute: mute.error?.message ?? 'ok', muted: muted.data, unmute: unmute.error?.message ?? 'ok', cleared: cleared.data }));
        }
      }

      step('110. Unmute without a mute raises an error');
      if (modCommunityId) {
        const err = await aDevice.client.rpc('unmute_conversation', { p_scope: 'community', p_target: modCommunityId });
        if (err.error) {
          pass('unmuting a non-muted conversation is rejected');
        } else {
          fail('unmuting a non-muted conversation is rejected', JSON.stringify(err));
        }
      }

      step('111. Blocked user can no longer react in an existing DM');
      if (modMessageId) {
        const blk = await aDevice.client.rpc('block_user', { p_target: bId });
        const react = blk.error ? { error: { message: 'block failed' } } : await bClient.rpc('react_to_message', { p_message: modMessageId, p_emoji: 'ðŸ‘' });
        const unblk = blk.error ? { error: { message: 'block failed' } } : await aDevice.client.rpc('unblock_user', { p_target: bId });
        if (!blk.error && react.error && !unblk.error) {
          pass('blocked peer cannot react; unblock restores access');
        } else {
          fail('blocked peer cannot react; unblock restores access', JSON.stringify({ blk: blk.error?.message, react: react.error?.message ?? 'no error', unblk: unblk.error?.message ?? 'ok' }));
        }
      }

      step('112. Clean up the moderation fixtures');
      if (modCommunityId) {
        const del = await aDevice.client.rpc('delete_community', { p_community: modCommunityId });
        if (!del.error) {
          pass('moderation community deleted');
        } else {
          fail('moderation community deleted', del.error.message);
        }
      }
      if (modGroupId) {
        const del = await aDevice.client.rpc('delete_group', { p_chat: modGroupId });
        if (!del.error) {
          pass('moderation group deleted');
        } else {
          fail('moderation group deleted', del.error.message);
        }
      }
    }
  }
}

console.log('\nâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€');
console.log(`Result: ${passCount} passed, ${failCount} failed`);
if (failCount) {
  console.log('Failed checks:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}