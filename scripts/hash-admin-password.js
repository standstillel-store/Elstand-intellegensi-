#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Generates an ADMIN_PASSWORD_HASH value for Phase 6.6.0.1's admin login.
//
// Usage:
//   node scripts/hash-admin-password.js "your-password-here"
//
// Run this locally (or in a private terminal), then paste ONLY the printed
// hash into the ADMIN_PASSWORD_HASH env var on Vercel. Never commit the
// plaintext password anywhere, never commit the hash to source control
// either (it still goes in an env var, not a file in the repo).
// ---------------------------------------------------------------------------

const { randomBytes, scryptSync } = require("crypto");

const password = process.argv[2];

if (!password) {
  console.error("Usage: node scripts/hash-admin-password.js \"your-password-here\"");
  process.exit(1);
}

const salt = randomBytes(16);
const derived = scryptSync(password, salt, 64);
const hash = `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;

console.log("\nADMIN_PASSWORD_HASH=" + hash + "\n");
console.log("Paste the line above into your Vercel env vars (or .env.local for local dev). Do not commit it to git.\n");

// Bonus: also print a fresh ADMIN_SESSION_SECRET suggestion, since you'll
// need one of those too and it's the same "run locally, paste into env"
// workflow.
const sessionSecret = randomBytes(32).toString("hex");
console.log("Suggested ADMIN_SESSION_SECRET=" + sessionSecret + "\n");
