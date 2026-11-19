declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    TWITCH_CLIENT_ID?: string;
    TWITCH_CLIENT_SECRET?: string;
    TWITCH_TOKEN_ENCRYPTION_KEY?: string;
  }
}
