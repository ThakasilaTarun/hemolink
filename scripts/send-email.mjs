/**
 * Send a test email via SendGrid from the terminal.
 *
 * Usage (from hemo-connect-main folder):
 *   node scripts/send-email.mjs
 *   node scripts/send-email.mjs you@example.com "Subject" "Message body"
 *
 * Requires in .env:
 *   SENDGRID_API_KEY=your-sendgrid-api-key
 *   FROM_EMAIL=verified-sender@yourdomain.com
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env");

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(envPath, "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      env[key] = value;
    }
  } catch {
    console.error("Could not read .env at:", envPath);
    process.exit(1);
  }
  return env;
}

const env = loadEnv();
const SENDGRID_API_KEY = env.SENDGRID_API_KEY;
const FROM_EMAIL = env.FROM_EMAIL;

const [to = env.TEST_EMAIL, subject = "HEMO LINK Test Email", message = "Email sent successfully from terminal."] =
  process.argv.slice(2);

if (!SENDGRID_API_KEY || !FROM_EMAIL) {
  console.error("Missing SENDGRID_API_KEY or FROM_EMAIL in .env");
  console.error("Add these lines to hemo-connect-main/.env:");
  console.error("  SENDGRID_API_KEY=your-sendgrid-api-key");
  console.error("  FROM_EMAIL=verified-sender@yourdomain.com");
  process.exit(1);
}

if (!to) {
  console.error("Provide recipient email: node scripts/send-email.mjs you@example.com");
  process.exit(1);
}

console.log(`Sending email to: ${to}`);

const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${SENDGRID_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    personalizations: [{ to: [{ email: to }] }],
    from: { email: FROM_EMAIL },
    subject,
    content: [{ type: "text/plain", value: message }],
  }),
});

if (!response.ok) {
  const error = await response.text();
  console.error("SendGrid error:", response.status, error);
  process.exit(1);
}

console.log("Email sent successfully.");
