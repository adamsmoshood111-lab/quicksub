const json = (data, status = 200, headers = {}) =>
Response.json(data, {
status,
headers: {
"Cache-Control": "no-store",
...headers
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

function getSessionToken(request) {
const cookieHeader = request.headers.get("Cookie") || "";

const cookie = cookieHeader
.split(";")
.map((part) => part.trim())
.find((part) => part.startsWith("quicksub_session="));

if (!cookie) return null;

const token = cookie.slice("quicksub_session=".length);

return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
}

export async function onRequestGet({ request, env }) {
try {
if (!env.DB) {
return json({
success: false,
message: "Service temporarily unavailable."
}, 503);
}

const token = getSessionToken(request);

if (!token) {
  return json({
    success: false,
    message: "Please sign in to view your dashboard."
  }, 401);
}

const tokenHash = await hashToken(token);

const customer = await env.DB.prepare(
  `SELECT
     customers.id,
     customers.full_name,
     customers.email,
     customers.phone,
     customers.status,
     sessions.id_hash,
     sessions.expires_at
   FROM sessions
   JOIN customers ON customers.id = sessions.customer_id
   WHERE sessions.id_hash = ?
   LIMIT 1`
).bind(tokenHash).first();

if (
  !customer ||
  customer.status !== "active" ||
  new Date(customer.expires_at).getTime() <= Date.now()
) {
  await env.DB.prepare(
    "DELETE FROM sessions WHERE id_hash = ?"
  ).bind(tokenHash).run();

  return json({
    success: false,
    message: "Your session has expired. Please sign in again."
  }, 401, {
    "Set-Cookie":
      "quicksub_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
  });
}

const wallet = await env.DB.prepare(
  `SELECT balance_minor
   FROM wallets
   WHERE customer_id = ?
   LIMIT 1`
).bind(customer.id).first();

return json({
  success: true,
  customer: {
    id: customer.id,
    fullName: customer.full_name,
    email: customer.email,
    phone: customer.phone
  },
  wallet: {
    // Amounts are stored in the smallest currency unit.
    // For Nigerian naira, 100 kobo equals ₦1.
    balanceMinor: wallet ? wallet.balance_minor : 0,
    currency: "NGN"
  }
});

} catch (error) {
return json({
success: false,
message: "Unable to load your dashboard right now."
}, 500);
}
}
