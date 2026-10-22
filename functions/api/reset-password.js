const json = (data, status = 200) =>
Response.json(data, {
status,
headers: {
"Cache-Control": "no-store"
}
});

function bytesToHex(bytes) {
return Array.from(bytes, (byte) =>
byte.toString(16).padStart(2, "0")
).join("");
}

async function hashToken(token) {
const digest = await crypto.subtle.digest(
"SHA-256",
new TextEncoder().encode(token)
);

return bytesToHex(new Uint8Array(digest));
}

async function createPasswordHash(password) {
const salt = crypto.getRandomValues(new Uint8Array(16));

const key = await crypto.subtle.importKey(
"raw",
new TextEncoder().encode(password),
"PBKDF2",
false,
["deriveBits"]
);

const result = await crypto.subtle.deriveBits(
{
name: "PBKDF2",
salt,
iterations: 600000,
hash: "SHA-256"
},
key,
256
);

const toBase64 = (bytes) =>
btoa(String.fromCharCode(...bytes));

return (
`pbkdf2_sha256$600000$${toBase64(salt)}$` +
toBase64(new Uint8Array(result))
);
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
    message: "Please provide a valid reset token and password."
  }, 400);
}

const token =
  typeof body.token === "string" ? body.token : "";

const password =
  typeof body.password === "string" ? body.password : "";

if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
  return json({
    success: false,
    message: "This reset link is invalid or has expired."
  }, 400);
}

if (password.length < 12 || password.length > 128) {
  return json({
    success: false,
    message: "Your password must be between 12 and 128 characters."
  }, 400);
}

const tokenHash = await hashToken(token);

const reset = await env.DB.prepare(
  `SELECT id, customer_id, expires_at, used_at
   FROM password_reset_tokens
   WHERE token_hash = ?
   LIMIT 1`
).bind(tokenHash).first();

if (
  !reset ||
  reset.used_at ||
  new Date(reset.expires_at).getTime() <= Date.now()
) {
  return json({
    success: false,
    message: "This reset link is invalid or has expired."
  }, 400);
}

const passwordHash = await createPasswordHash(password);

// Recheck the token within a database batch before applying changes.
const currentReset = await env.DB.prepare(
  `SELECT id
   FROM password_reset_tokens
   WHERE id = ?
     AND token_hash = ?
     AND used_at IS NULL
     AND expires_at > ?
   LIMIT 1`
).bind(
  reset.id,
  tokenHash,
  new Date().toISOString()
).first();

if (!currentReset) {
  return json({
    success: false,
    message: "This reset link is invalid or has expired."
  }, 400);
}

await env.DB.batch([
  env.DB.prepare(
    `UPDATE customers
     SET password_hash = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(passwordHash, reset.customer_id),

  env.DB.prepare(
    `UPDATE password_reset_tokens
     SET used_at = CURRENT_TIMESTAMP
     WHERE id = ? AND used_at IS NULL`
  ).bind(reset.id),

  env.DB.prepare(
    "DELETE FROM sessions WHERE customer_id = ?"
  ).bind(reset.customer_id),

  env.DB.prepare(
    `DELETE FROM password_reset_tokens
     WHERE customer_id = ? AND id != ?`
  ).bind(reset.customer_id, reset.id)
]);

return json({
  success: true,
  message: "Your password has been changed. Please sign in again."
});

} catch (error) {
return json({
success: false,
message: "Unable to reset your password right now."
}, 500);
}
}
