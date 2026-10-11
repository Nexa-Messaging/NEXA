import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

// ============================================================================
// NEXA push delivery worker
// ----------------------------------------------------------------------------
// Mirrors `notifications` rows (created server-side by notify_user()) to
// Expo Push. Reads with the service role key, so no secret ever reaches the
// mobile app. The DB trigger `trg_enqueue_push_delivery` POSTs a
// notification_id here as soon as a row is inserted; this function then:
//   1. loads the notification and its recipient
//   2. skips muted conversations (conversation_mutes)
//   3. resolves the recipient's active device tokens (all devices)
//   4. sends to Expo Push API (chunked, max 100 messages/request)
//   5. queries push receipts and invalidates dead tokens
//   6. marks push_delivered_at (idempotency => no duplicates)
//
// A payload of `{}` runs a "sweep" over any notifications missed while the
// service was down (push_delivered_at is null), making this work even when
// the webhook could not fire.
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';

/**
 * Resolves the service-role key.
 *
 * The platform used to export `SUPABASE_SERVICE_ROLE_KEY` directly. It now
 * provisions named keys as JSON instead:
 *
 *   SUPABASE_SECRET_KEYS -> { "default": "sb_secret_...", ... }
 *
 * Reading only the old name yields '', and `createClient(url, '')` throws
 * during module evaluation — before Deno.serve is ever registered. That is why
 * a GET, which needs no database at all, came back as a bare 500 with no JSON
 * body. Accept every shape the platform and the CLI are known to provide.
 */
function resolveServiceRoleKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;

  for (const name of ['SUPABASE_SECRET_KEYS', 'SUPABASE_SECRET_KEY']) {
    const raw = Deno.env.get(name);
    if (!raw) continue;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === 'string' && parsed) return parsed;
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        typeof (parsed as Record<string, unknown>).default === 'string'
      ) {
        const key = (parsed as Record<string, string>).default;
        if (key) return key;
      }
    } catch {
      // Some runtimes hand back the bare key rather than JSON.
      return raw;
    }
  }
  return '';
}

const SUPABASE_SERVICE_ROLE_KEY = resolveServiceRoleKey();

if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    '[send-push] No service-role key available. The platform now exports ' +
      'SUPABASE_SECRET_KEYS (JSON object; use its "default" entry) instead of ' +
      'SUPABASE_SERVICE_ROLE_KEY. Grant the function access to the project ' +
      'secret key so it can read notifications and device_tokens.',
  );
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';
const MAX_TOKENS_PER_REQUEST = 100;
const SWEEP_LIMIT = 50;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nexa-push-secret',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

interface NotificationRow {
  id: string;
  user_id: string;
  actor_id: string | null;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  is_read: boolean;
  created_at: string;
  push_delivered_at: string | null;
}

interface DeviceTokenRow {
  token: string;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoReceipt {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

/** Resolves the mute scope/target for a notification, if any. */
function muteScopeFor(row: NotificationRow): { scope: string; target: string } | null {
  const data = row.data ?? {};
  if (typeof data.chat_id === 'string') {
    return { scope: 'group', target: data.chat_id };
  }
  if (typeof data.conversation_id === 'string') {
    return { scope: 'dm', target: data.conversation_id };
  }
  if (typeof data.community_id === 'string') {
    return { scope: 'community', target: data.community_id };
  }
  return null;
}

async function isMuted(recipientId: string, row: NotificationRow): Promise<boolean> {
  const mute = muteScopeFor(row);
  if (!mute) return false;
  const { data } = await supabase
    .from('conversation_mutes')
    .select('user_id')
    .eq('user_id', recipientId)
    .eq('scope', mute.scope)
    .eq('target_id', mute.target)
    .maybeSingle();
  return !!data;
}

async function loadActiveTokens(recipientId: string): Promise<DeviceTokenRow[]> {
  const { data } = await supabase
    .from('device_tokens')
    .select('token')
    .eq('user_id', recipientId)
    .is('invalidated_at', null);
  return (data ?? []) as DeviceTokenRow[];
}

/**
 * Errors that mean "this token will never work again". Anything else
 * (MessageTooBig, MessageRateExceeded, ...) is transient or content-specific
 * and must NOT invalidate the token, otherwise one oversized message would
 * silently disconnect every device.
 */
const FATAL_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials']);

/** Sends every token, chunked. Returns any tokens Expo flagged as dead. */
async function sendToExpo(
  tokens: string[],
  title: string,
  body: string,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const invalidTokens = new Set<string>();

  for (let i = 0; i < tokens.length; i += MAX_TOKENS_PER_REQUEST) {
    const chunk = tokens.slice(i, i + MAX_TOKENS_PER_REQUEST);
    const messages = chunk.map((token) => ({
      to: token,
      title,
      body,
      data: payload,
      sound: 'default',
      channelId: 'messages',
      priority: 'high',
    }));

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (EXPO_ACCESS_TOKEN) {
      headers['Authorization'] = `Bearer ${EXPO_ACCESS_TOKEN}`;
    }

    let tickets: ExpoTicket[] = [];
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });
      const parsed = (await res.json()) as { data?: ExpoTicket[] };
      tickets = parsed.data ?? [];
    } catch {
      // Transient network error — the idempotency guard (push_delivered_at)
      // ensures the next sweep retries without duplicating to healthy devices.
      return [...invalidTokens];
    }

    // Map each accepted ticket id back to the token it was minted for. This
    // must be built from the ORIGINAL chunk index: looking tokens up by
    // position in a filtered list misaligns as soon as any ticket in the same
    // chunk was rejected, and would invalidate the wrong devices.
    const ticketIdToToken = new Map<string, string>();
    tickets.forEach((ticket, index) => {
      const token = chunk[index];
      if (!token) {
        return;
      }
      if (ticket.status === 'error') {
        if (FATAL_TOKEN_ERRORS.has(ticket.details?.error ?? '')) {
          invalidTokens.add(token);
        }
        return;
      }
      if (ticket.status === 'ok' && ticket.id) {
        ticketIdToToken.set(ticket.id, token);
      }
    });

    const ticketIds = [...ticketIdToToken.keys()];
    if (ticketIds.length > 0) {
      for (let r = 0; r < ticketIds.length; r += MAX_TOKENS_PER_REQUEST) {
        const ids = ticketIds.slice(r, r + MAX_TOKENS_PER_REQUEST);
        try {
          const res = await fetch(EXPO_RECEIPTS_URL, {
            method: 'POST',
            headers,
            body: JSON.stringify({ ids }),
          });
          const parsed = (await res.json()) as { data?: Record<string, ExpoReceipt> };
          const receipts = parsed.data ?? {};
          for (const id of ids) {
            const receipt = receipts[id];
            const token = ticketIdToToken.get(id);
            if (!token || !receipt || receipt.status !== 'error') {
              continue;
            }
            // A receipt error is only fatal for the token itself; other
            // failures (e.g. MessageTooBig) leave the token perfectly usable.
            if (FATAL_TOKEN_ERRORS.has(receipt.details?.error ?? '')) {
              invalidTokens.add(token);
            }
          }
        } catch {
          // Best-effort receipt check; the sweep will revisit on retry.
        }
      }
    }
  }

  return [...invalidTokens];
}

async function invalidateTokens(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  // Only the active rows are touched; double-chunking is guarded by the set.
  await supabase
    .from('device_tokens')
    .update({ invalidated_at: new Date().toISOString() })
    .in('token', tokens)
    .is('invalidated_at', null);
}

/** Delivers one notification. Returns the outcome for logging. */
async function deliverNotification(notificationId: string): Promise<Record<string, unknown>> {
  const { data: row } = await supabase
    .from('notifications')
    .select('*')
    .eq('id', notificationId)
    .single();

  const notif = row as NotificationRow | null;
  if (!notif) return { delivered: false, reason: 'not_found' };
  if (notif.push_delivered_at) return { delivered: false, reason: 'already_delivered' };

  if (await isMuted(notif.user_id, notif)) {
    await supabase
      .from('notifications')
      .update({ push_delivered_at: new Date().toISOString() })
      .eq('id', notif.id)
      .is('push_delivered_at', null);
    return { delivered: false, reason: 'muted' };
  }

  const tokens = await loadActiveTokens(notif.user_id);
  if (tokens.length === 0) {
    // No device to deliver to right now; leave push_delivered_at null so a
    // later token registration doesn't lock this out forever.
    return { delivered: false, reason: 'no_tokens' };
  }

  const invalid = await sendToExpo(
    tokens.map((t) => t.token),
    notif.title,
    notif.body,
    { ...(typeof notif.data === 'object' && notif.data ? notif.data : {}), notification_id: notif.id },
  );

  if (invalid.length > 0) {
    await invalidateTokens(invalid);
  }

  await supabase
    .from('notifications')
    .update({ push_delivered_at: new Date().toISOString() })
    .eq('id', notif.id)
    .is('push_delivered_at', null);

  return { delivered: true, devices: tokens.length, invalidated: invalid.length };
}

/** Catches anything the webhook missed (downtime / retry). */
async function sweepPending(): Promise<{ processed: number; results: Record<string, unknown>[] }> {
  const { data } = await supabase
    .from('notifications')
    .select('id')
    .is('push_delivered_at', null)
    .order('created_at', { ascending: true })
    .limit(SWEEP_LIMIT);

  const rows = (data ?? []) as { id: string }[];
  const results: Record<string, unknown>[] = [];
  for (const row of rows) {
    results.push(await deliverNotification(row.id));
  }
  return { processed: rows.length, results };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method === 'GET') {
    return json({ ok: true });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // Verify the internal webhook secret carried on the TRIGGER's request.
  // Stored server-side in push_config; the mobile app never sees it. When a
  // secret is configured (the migration seeds one) it is required on every
  // POST, including sweeps, so nothing can force sends from the outside.
  const sentSecret = req.headers.get('x-nexa-push-secret') ?? '';
  const { data: secretRow } = await supabase
    .from('push_config')
    .select('value')
    .eq('key', 'push_webhook_secret')
    .maybeSingle();
  const configuredSecret = secretRow?.value as string | undefined;
  if (configuredSecret) {
    if (!sentSecret || sentSecret !== configuredSecret) {
      return json({ error: 'Unauthorized' }, 401);
    }
  } else if (!sentSecret) {
    // No secret configured yet (fresh install) — accept unauthenticated
    // trigger calls so nothing blocks a first deployment.
  }

  try {
    const body = await req.json();
    if (body && typeof body.notification_id === 'string') {
      return json(await deliverNotification(body.notification_id));
    }
    return json(await sweepPending());
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Unknown error' }, 500);
  }
});