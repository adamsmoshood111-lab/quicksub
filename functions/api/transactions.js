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
    message: "Please sign in to view your transactions."
  }, 401);
}

const tokenHash = await hashToken(token);

const customer = await env.DB.prepare(
  `SELECT customers.id, customers.status, sessions.expires_at
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

const url = new URL(request.url);

const requestedPage = Number(url.searchParams.get("page") || "1");
const requestedLimit = Number(url.searchParams.get("limit") || "20");

const page = Number.isInteger(requestedPage) && requestedPage > 0
  ? Math.min(requestedPage, 1000000)
  : 1;

const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
  ? Math.min(requestedLimit, 50)
  : 20;

const offset = (page - 1) * limit;

const result = await env.DB.prepare(
  `SELECT
     id,
     service_type,
     recipient,
     amount_minor,
     status,
     reference,
     failure_reason,
     created_at,
     updated_at
   FROM transactions
   WHERE customer_id = ?
   ORDER BY created_at DESC, id DESC
   LIMIT ? OFFSET ?`
).bind(customer.id, limit, offset).all();

const countResult = await env.DB.prepare(
  `SELECT COUNT(*) AS total
   FROM transactions
   WHERE customer_id = ?`
).bind(customer.id).first();

const total = countResult ? countResult.total : 0;

return json({
  success: true,
  transactions: result.results.map((transaction) => ({
    id: transaction.id,
    service: transaction.service_type,
    recipient: transaction.recipient,
    amountMinor: transaction.amount_minor,
    status: transaction.status,
    reference: transaction.reference,
    failureReason: transaction.failure_reason,
    createdAt: transaction.created_at,
    updatedAt: transaction.updated_at
  })),
  pagination: {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit)
  }
});

} catch (error) {
return json({
success: false,
message: "Unable to load your transaction history right now."
}, 500);
}
}
