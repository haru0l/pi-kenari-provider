/**
 * Shared plumbing for kenari's own endpoints (images, web/X) — error extraction
 * and request deadlines.
 */
/**
 * kenari reports a failure as `{ "error": { "message": "..." } }`. Pull that
 * message out so callers see what kenari said instead of a wall of JSON, and
 * fall back to the raw body when it is some other shape.
 */
export async function kenariErrorMessage(response) {
    const text = await response.text();
    try {
        const parsed = JSON.parse(text);
        if (typeof parsed.error === "string" && parsed.error)
            return parsed.error;
        if (typeof parsed.error === "object" && parsed.error?.message) {
            return parsed.error.message;
        }
    }
    catch {
        // not JSON — fall through to the raw body
    }
    return text;
}
/** Throw kenari's own message for a failed response. */
export async function throwKenariError(label, response) {
    const message = await kenariErrorMessage(response);
    throw new Error(`kenari ${label} failed (${response.status}): ${message}`);
}
/**
 * Combine the caller's signal with a deadline. Returns the caller's signal
 * untouched when no deadline is set, so an abort reason still reaches them.
 */
export function withDeadline(signal, timeoutMs) {
    if (timeoutMs === undefined)
        return signal;
    const deadline = AbortSignal.timeout(timeoutMs);
    return signal ? AbortSignal.any([signal, deadline]) : deadline;
}
