/**
 * Shared plumbing for kenari's own endpoints (images, web/X) — error extraction
 * and request deadlines.
 */
/**
 * kenari reports a failure as `{ "error": { "message": "..." } }`. Pull that
 * message out so callers see what kenari said instead of a wall of JSON, and
 * fall back to the raw body when it is some other shape.
 */
export declare function kenariErrorMessage(response: Response): Promise<string>;
/** Throw kenari's own message for a failed response. */
export declare function throwKenariError(label: string, response: Response): Promise<never>;
/**
 * Combine the caller's signal with a deadline. Returns the caller's signal
 * untouched when no deadline is set, so an abort reason still reaches them.
 */
export declare function withDeadline(signal: AbortSignal | undefined, timeoutMs: number | undefined): AbortSignal | undefined;
//# sourceMappingURL=http.d.ts.map