/**
 * agentmail skill — entry point.
 *
 * Exports the tool definitions and their handler implementations.
 * Every tool that surfaces email content wraps results with the
 * untrusted-content safety banner (see src/safety.ts).
 *
 * Tool allowlist:
 *   list_threads
 *   get_thread
 *   get_message
 *   extract_verification_codes
 *   send_email
 *   reply_email
 */

import { ZodError } from "zod";

import * as client from "./agentmailClient.js";
import {
  ListThreadsInput,
  GetThreadInput,
  GetMessageInput,
  ExtractVerificationCodesInput,
  SendEmailInput,
  ReplyEmailInput,
} from "./schemas.js";
import { htmlToPlainText, truncate } from "./sanitize.js";
import { extractVerificationCodes } from "./otp.js";
import { safeAttachmentMeta, wrapUntrusted } from "./safety.js";

// ---------------------------------------------------------------------------
// Tool result type
// ---------------------------------------------------------------------------

export interface ToolResult {
  /** True when the tool executed successfully. */
  ok: boolean;
  /** Payload returned to the calling agent. */
  result: unknown;
  /** Human-readable error when ok === false. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validationError(err: ZodError): ToolResult {
  return {
    ok: false,
    result: null,
    error: `Validation failed: ${err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
  };
}

function runtimeError(err: unknown): ToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { ok: false, result: null, error: message };
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export async function listThreads(raw: unknown): Promise<ToolResult> {
  const parsed = ListThreadsInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { inbox_id, limit, cursor } = parsed.data;

  try {
    const data = await client.listThreads(inbox_id, limit, cursor);
    return { ok: true, result: data };
  } catch (err) {
    return runtimeError(err);
  }
}

export async function getThread(raw: unknown): Promise<ToolResult> {
  const parsed = GetThreadInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const data = await client.getThread(parsed.data.thread_id);
    // Thread detail may contain message snippets — mark untrusted.
    return { ok: true, result: wrapUntrusted(data) };
  } catch (err) {
    return runtimeError(err);
  }
}

export async function getMessage(raw: unknown): Promise<ToolResult> {
  const parsed = GetMessageInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const msg = await client.getMessage(parsed.data.message_id);

    // Sanitise body: convert HTML → plain text, never return raw HTML.
    const bodyPlain =
      msg.body_text || htmlToPlainText(msg.body_html) || "(empty body)";

    const safe = {
      id: msg.id,
      thread_id: msg.thread_id,
      from: msg.from,
      to: msg.to,
      subject: truncate(msg.subject ?? "", 200),
      date: msg.date,
      body_text: bodyPlain,
      attachments: safeAttachmentMeta(msg.attachments),
    };

    return { ok: true, result: wrapUntrusted(safe) };
  } catch (err) {
    return runtimeError(err);
  }
}

export async function extractCodes(raw: unknown): Promise<ToolResult> {
  const parsed = ExtractVerificationCodesInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const msg = await client.getMessage(parsed.data.message_id);
    const plainText =
      msg.body_text || htmlToPlainText(msg.body_html) || "";
    const codes = extractVerificationCodes(plainText);
    return { ok: true, result: { codes } };
  } catch (err) {
    return runtimeError(err);
  }
}

export async function sendEmail(raw: unknown): Promise<ToolResult> {
  const parsed = SendEmailInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { inbox_id, to, subject, body_text } = parsed.data;

  try {
    const data = await client.sendEmail(inbox_id, to, subject, body_text);
    return { ok: true, result: data };
  } catch (err) {
    return runtimeError(err);
  }
}

export async function replyEmail(raw: unknown): Promise<ToolResult> {
  const parsed = ReplyEmailInput.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const data = await client.replyEmail(
      parsed.data.thread_id,
      parsed.data.body_text
    );
    return { ok: true, result: data };
  } catch (err) {
    return runtimeError(err);
  }
}

// ---------------------------------------------------------------------------
// Tool registry — maps tool names to handlers.
// ---------------------------------------------------------------------------

export const TOOLS: Record<
  string,
  (input: unknown) => Promise<ToolResult>
> = {
  list_threads: listThreads,
  get_thread: getThread,
  get_message: getMessage,
  extract_verification_codes: extractCodes,
  send_email: sendEmail,
  reply_email: replyEmail,
};

/**
 * Dispatch a tool call by name.
 *
 * Returns a ToolResult. Unknown tool names produce an error result
 * rather than throwing, so callers always get a structured response.
 */
export async function dispatch(
  toolName: string,
  input: unknown
): Promise<ToolResult> {
  const handler = TOOLS[toolName];
  if (!handler) {
    return {
      ok: false,
      result: null,
      error: `Unknown tool "${toolName}". Allowed: ${Object.keys(TOOLS).join(", ")}`,
    };
  }
  return handler(input);
}
