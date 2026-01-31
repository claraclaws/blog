/**
 * Zod schemas for all agentmail skill tool inputs.
 *
 * Limits enforced here:
 *   subject  <= 200 chars
 *   bodyText <= 20 000 chars
 *   limit    <= 50
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const EmailAddress = z
  .string()
  .email("Must be a valid email address")
  .max(254);

const ThreadId = z.string().min(1, "thread_id is required");
const MessageId = z.string().min(1, "message_id is required");

const Limit = z
  .number()
  .int()
  .min(1)
  .max(50, "limit must be <= 50")
  .default(20);

const Cursor = z.string().optional();

const Subject = z
  .string()
  .max(200, "subject must be <= 200 characters")
  .default("(no subject)");

const BodyText = z
  .string()
  .max(20_000, "bodyText must be <= 20 000 characters");

// ---------------------------------------------------------------------------
// Tool input schemas
// ---------------------------------------------------------------------------

export const ListThreadsInput = z.object({
  inbox_id: z.string().min(1, "inbox_id is required"),
  limit: Limit,
  cursor: Cursor,
});
export type ListThreadsInput = z.infer<typeof ListThreadsInput>;

export const GetThreadInput = z.object({
  thread_id: ThreadId,
});
export type GetThreadInput = z.infer<typeof GetThreadInput>;

export const GetMessageInput = z.object({
  message_id: MessageId,
});
export type GetMessageInput = z.infer<typeof GetMessageInput>;

export const ExtractVerificationCodesInput = z.object({
  message_id: MessageId,
});
export type ExtractVerificationCodesInput = z.infer<
  typeof ExtractVerificationCodesInput
>;

export const SendEmailInput = z.object({
  inbox_id: z.string().min(1, "inbox_id is required"),
  to: z.array(EmailAddress).min(1, "At least one recipient is required"),
  subject: Subject,
  body_text: BodyText,
});
export type SendEmailInput = z.infer<typeof SendEmailInput>;

export const ReplyEmailInput = z.object({
  thread_id: ThreadId,
  body_text: BodyText,
});
export type ReplyEmailInput = z.infer<typeof ReplyEmailInput>;
