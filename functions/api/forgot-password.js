const json = (data, status = 200) =>
Response.json(data, {
status,
headers: {
"Cache-Control": "no-store"
}
});

async function hashToken(token) {
const digest = await crypto.subtle.digest(
"SHA-256",
new TextEncoder().encode(token)
);

return Array.from(new Uint8Array(digest), (byte) =>
byte.toString(16).padStart(2, "0")
).join("");
}

export async function onRequestPost({ request, env }) {
try {
if (!env.DB) {
return json({
success: false,
message: "Service temporarily unavailable."
}, 503);
}

let body;

try {
  body = await request.json();
} catch {
  return json({
    success: false,
    message: "Please provide a valid email address."
  }, 400);
}

const email =
  typeof body.email === "string"
    ? body.email.trim().toLowerCase()
    : "";

if (
  email.length > 254 ||
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
) {
  return json({
    success: false,
    message: "Please provide a valid email address."
  }, 400);
}

const customer = await env.DB.prepare(
  `SELECT id
   FROM customers
   WHERE email = ? AND status = 'active'
   LIMIT 1`
).bind(email).first();

// Use the same response whether or not the account exists.
const genericResponse = {
  success: true,
  message:
    "If an eligible account exists, instructions will be sent to its registered email."
};

if (!customer) {
  return json(genericResponse);
}

const randomBytes = crypto.getRandomValues(
  new Uint8Array(32)
);

const token = btoa(
  String.fromCharCode(...randomBytes)
)
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/g, "");

const tokenHash = await hashToken(token);
const resetId = crypto.randomUUID();

const expiresAt = new Date(
  Date.now() + 30 * 60 * 1000
).toISOString();

await env.DB.prepare(
  `DELETE FROM password_reset_tokens
   WHERE customer_id = ?`
).bind(customer.id).run();

await env.DB.prepare(
  `INSERT INTO password_reset_tokens
   (id, customer_id, token_hash, expires_at)
   VALUES (?, ?, ?, ?)`
).bind(
  resetId,
  customer.id,
  tokenHash,
  expiresAt
).run();

// Email delivery is not configured yet.
// Do not return the reset token to the browser.

return json(genericResponse);

} catch (error) {
return json({
success: false,
message: "Unable to process the request right now."
}, 500);
}
}
