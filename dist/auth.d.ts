/**
 * Authentication for kenari.
 *
 * Resolves the kn- API key from (in order):
 * 1. Stored credential (from ~/.pi/agent/auth.json via pi's credential store)
 * 2. KENARI_API_KEY environment variable
 */
import type { ApiKeyAuth } from "@earendil-works/pi-ai";
/** Build the standard API-key auth for kenari. */
export declare function kenariApiKeyAuth(): ApiKeyAuth;
//# sourceMappingURL=auth.d.ts.map