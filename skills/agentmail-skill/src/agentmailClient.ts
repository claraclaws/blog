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
 * Get a single message by ID, including body and attachment metadata.
 */
export async function getMessage(messageId: string): Promise<Message> {
  return request<Message>({
    method: "GET",
    path: `/v0/messages/${encodeURIComponent(messageId)}`,
  });
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
  return request<SendResponse>({
    method: "POST",
    path: `/v0/inboxes/${encodeURIComponent(inboxId)}/messages`,
    body: { to, subject, body_text: bodyText },
  });
}

/**
 * Reply to an existing thread.
 */
export async function replyEmail(
  threadId: string,
  bodyText: string
): Promise<SendResponse> {
  return request<SendResponse>({
    method: "POST",
    path: `/v0/threads/${encodeURIComponent(threadId)}/replies`,
    body: { body_text: bodyText },
  });
}
