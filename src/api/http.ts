/**
 * Shared plumbing for kenari's own endpoints (images, web/X) — error extraction
 * and request deadlines.
 */

/**
 * kenari reports a failure as `{ "error": { "message": "..." } }`. Pull that
 * message out so callers see what kenari said instead of a wall of JSON, and
 * fall back to the raw body when it is some other shape.
 */
export async function kenariErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as {
      error?: { message?: string } | string;
    };
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
    if (typeof parsed.error === "object" && parsed.error?.message) {
      return parsed.error.message;
    }
  } catch {
    // not JSON — fall through to the raw body
  }
  return text;
}

/** Pull a message out of an `error` value that arrived with a 200 status. */
export function errorMessage(error: unknown): string {
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return JSON.stringify(error).slice(0, 400);
}
/** Throw kenari's own message for a failed response. */
export async function throwKenariError(
  label: string,
  response: Response,
): Promise<never> {
  const message = await kenariErrorMessage(response);
  throw new Error(`kenari ${label} failed (${response.status}): ${message}`);
}

/**
 * Combine the caller's signal with a deadline. Returns the caller's signal
 * untouched when no deadline is set, so an abort reason still reaches them.
 */
export function withDeadline(
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): AbortSignal | undefined {
  if (timeoutMs === undefined) return signal;
  const deadline = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, deadline]) : deadline;
}
