/**
 * AgentMail API client.
 *
 * Credential resolution order:
 *   1. AGENTMAIL_API_KEY environment variable
 *   2. /home/clara/.config/agentmail/credentials.json  (local-dev fallback)
 *
 * Base URL defaults to https://api.agentmail.to but can be overridden via
 * AGENTMAIL_BASE_URL for testing or staging environments.
 */

import { readFileSync } from "node:fs";

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

const CREDENTIALS_PATH = "/home/clara/.config/agentmail/credentials.json";

function loadApiKey(): string {
  // 1. Environment variable (preferred)
  const envKey = process.env.AGENTMAIL_API_KEY;
  if (envKey) return envKey;

  // 2. Local credentials file (dev fallback)
  try {
    const raw = readFileSync(CREDENTIALS_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "api_key" in parsed &&
      typeof (parsed as Record<string, unknown>).api_key === "string"
    ) {
      return (parsed as Record<string, string>).api_key;
    }
  } catch {
    // File missing or unreadable — fall through to error.
  }

  throw new Error(
    "AgentMail API key not found. " +
      "Set AGENTMAIL_API_KEY env var or create " +
      CREDENTIALS_PATH +
      ' with { "api_key": "..." }.'
  );
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.AGENTMAIL_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.agentmail.to";

interface RequestOptions {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

async function request<T>(opts: RequestOptions): Promise<T> {
  const apiKey = loadApiKey();

  const url = new URL(opts.path, BASE_URL);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const init: RequestInit = {
    method: opts.method,
    headers,
  };

  if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opts.body);
  }

  const res = await fetch(url, init);

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(
      `AgentMail API error: ${res.status} ${res.statusText} — ${text}`
    );
  }

  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// API types (minimal — only what we surface to the skill)
// ---------------------------------------------------------------------------

export interface Thread {
  id: string;
  subject: string;
  last_message_at: string;
  message_count: number;
  participants: string[];
  [key: string]: unknown;
}

export interface ThreadListResponse {
  threads: Thread[];
  cursor: string | null;
}

export interface ThreadDetail {
  id: string;
  subject: string;
  messages: MessageSummary[];
  [key: string]: unknown;
}

export interface MessageSummary {
  id: string;
  from: string;
  to: string[];
  subject: string;
  date: string;
  snippet: string;
  [key: string]: unknown;
}

export interface Message {
  id: string;
  thread_id: string;
  from: string;
  to: string[];
  subject: string;
  date: string;
  body_text: string | null;
  body_html: string | null;
  attachments: Array<{
    filename?: string;
    content_type?: string;
    size?: number;
    [key: string]: unknown;
  }> | null;
  [key: string]: unknown;
}

export interface SendResponse {
  message_id: string;
  thread_id: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Endpoint functions
// ---------------------------------------------------------------------------

/**
 * List threads for a given inbox.
 */
export async function listThreads(
  inboxId: string,
  limit: number,
  cursor?: string
): Promise<ThreadListResponse> {
  return request<ThreadListResponse>({
    method: "GET",
    path: `/v0/inboxes/${encodeURIComponent(inboxId)}/threads`,
    query: { limit, cursor },
  });
}

/**
 * Get full thread detail including message summaries.
 */
export async function getThread(threadId: string): Promise<ThreadDetail> {
  return request<ThreadDetail>({
    method: "GET",
    path: `/v0/threads/${encodeURIComponent(threadId)}`,
  });
}

/**
 * Get a single message by ID.
 *
 * AgentMail v0 appears to use RFC Message-Id strings (e.g. "<...@...>") as IDs.
 * Some deployments may not support `/v0/messages/:id` for those IDs.
 *
 * Strategy:
 * 1) Try direct message fetch endpoint.
 * 2) If 404, fall back to scanning recent threads in the inbox and returning
 *    the first matching message payload.
 */
export async function getMessage(messageId: string): Promise<Message> {
  try {
    return await request<Message>({
      method: "GET",
      path: `/v0/messages/${encodeURIComponent(messageId)}`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // If endpoint not found for this id, fall back.
    if (msg.includes("404") || msg.includes("Not Found")) {
      return await findMessageViaThreads(messageId);
    }
    throw err;
  }
}

async function findMessageViaThreads(messageId: string): Promise<Message> {
  // Minimal fallback: list a few pages of threads and look for a matching message_id.
  // NOTE: This is intentionally bounded to avoid expensive scans.
  const inboxId = process.env.AGENTMAIL_INBOX_ID;
  if (!inboxId) {
    throw new Error(
      "Message fetch fallback requires AGENTMAIL_INBOX_ID env var to be set (e.g. claraclaws@agentmail.to)."
    );
  }

  let cursor: string | undefined;
  for (let page = 0; page < 3; page++) {
    const list = await request<{ threads: Array<{ thread_id: string }>; cursor?: string | null }>({
      method: "GET",
      path: `/v0/inboxes/${encodeURIComponent(inboxId)}/threads`,
      query: { limit: 20, cursor },
    });

    for (const t of list.threads ?? []) {
      const thread = await getThread(t.thread_id);
      const messages = (thread as any).messages as any[] | undefined;
      if (!messages) continue;
      const found = messages.find((m) => m && m.message_id === messageId);
      if (found) {
        // Thread message payloads include text/html and metadata but not attachments.
        return {
          id: found.message_id,
          thread_id: found.thread_id,
          from: found.from,
          to: found.to,
          subject: found.subject,
          date: found.timestamp,
          body_text: found.text ?? found.extracted_text ?? null,
          body_html: found.html ?? found.extracted_html ?? null,
          attachments: null,
        } as Message;
      }
    }

    cursor = (list as any).cursor || undefined;
    if (!cursor) break;
  }

  throw new Error(`Message not found via thread scan: ${messageId}`);
}

/**
 * Send a new email (starts a new thread).
 */
export async function sendEmail(
  inboxId: string,
  to: string[],
  subject: string,
  bodyText: string
): Promise<SendResponse> {
  // AgentMail docs: client.inboxes.messages.send(inbox_id=..., to=..., subject=..., text=...)
  // Empirically works at: POST /v0/inboxes/{inbox_id}/messages/send
  return request<SendResponse>({
    method: "POST",
    path: `/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
    body: { to, subject, text: bodyText },
  });
}

/**
 * Reply to an existing thread.
 *
 * AgentMail v0 does not appear to expose a simple thread-reply endpoint.
 * For now, callers should use sendEmail (new thread) or implement a provider-
 * specific reply mechanism once AgentMail exposes it.
 */
export async function replyEmail(
  threadId: string,
  bodyText: string
): Promise<SendResponse> {
  throw new Error(
    `reply_email not implemented for AgentMail v0 (threadId=${threadId}). Use send_email to start a new thread instead.`
  );
}
