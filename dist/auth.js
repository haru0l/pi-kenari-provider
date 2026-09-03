/**
 * Authentication for kenari.
 *
 * Resolves the kn- API key from (in order):
 * 1. Stored credential (from ~/.pi/agent/auth.json via pi's credential store)
 * 2. KENARI_API_KEY environment variable
 */
import { KENARI_API_KEY_ENV } from "./constants.js";
/** Build the standard API-key auth for kenari. */
export function kenariApiKeyAuth() {
    return {
        name: "kenari API key",
        async login(interaction) {
            interaction.signal.throwIfAborted();
            const key = await interaction.prompt({
                type: "secret",
                message: "Enter kenari API key (kn-...)",
            });
            interaction.signal.throwIfAborted();
            return { type: "api_key", key };
        },
        async resolve({ ctx, credential, signal }) {
            signal.throwIfAborted();
            // Stored credential wins.
            if (credential?.key) {
                return { auth: { apiKey: credential.key }, env: credential.env, source: "stored credential" };
            }
            // Fall back to env var.
            const apiKey = await ctx.env(KENARI_API_KEY_ENV);
            signal.throwIfAborted();
            if (apiKey) {
                return { auth: { apiKey }, source: KENARI_API_KEY_ENV };
            }
            return undefined;
        },
    };
}
