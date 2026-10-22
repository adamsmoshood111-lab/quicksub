const json = (data, status = 200, headers = {}) =>
Response.json(data, {
status,
headers: {
"Cache-Control": "no-store",
...headers
}
});

const validNetworks = ["MTN", "Airtel", "Glo", "9mobile"];

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

async function hashToken(token) {
const digest = await crypto.subtle.digest(
"SHA-256",
new TextEncoder().encode(token)
);

return Array.from(new Uint8Array(digest), (byte) =>
byte.toString(16).padStart(2, "0")
).join("");
}

async function getCustomer(request, env) {
const token = getSessionToken(request);
if (!token) return null;

const tokenHash = await hashToken(token);

const customer = await env.DB.prepare(
"SELECT customers.id FROM sessions JOIN customers ON customers.id = sessions.customer_id WHERE sessions.id_hash = ? AND customers.status = 'active' AND sessions.expires_at > ? LIMIT 1"
).bind(tokenHash, new Date().toISOString()).first();

return customer || null;
}

function validateNumber(body) {
  if (
  !body ||
  typeof body !== "object" ||
  Array.isArray(body)
) {
  return { error: "Invalid request data." };
  }
const label =
typeof body.label === "string" ? body.label.trim() : "";

const phone =
typeof body.phone === "string" ? body.phone.trim() : "";

const network =
typeof body.network === "string"
? body.network.trim()
: "";

const isFavourite =
body.isFavourite === true || body.isFavourite === 1
? 1
: body.isFavourite === false || body.isFavourite === 0 ||
body.isFavourite === undefined
? 0
: null;

if (!label || label.length > 50) {
return { error: "Enter a label of 1 to 50 characters." };
}

if (!/^\+?[0-9\s()-]{7,20}$/.test(phone)) {
return { error: "Enter a valid phone number." };
}

if (!validNetworks.includes(network)) {
return { error: "Choose a supported network." };
}

if (isFavourite === null) {
return { error: "The favourite setting is invalid." };
}

return { label, phone, network, isFavourite };
}

export async function onRequestGet({ request, env }) {
try {
if (!env.DB) {
return json({ success: false, message: "Service unavailable." }, 503);
}

const customer = await getCustomer(request, env);

if (!customer) {
  return json({ success: false, message: "Please sign in first." }, 401);
}

const result = await env.DB.prepare(
  `SELECT id, label, phone, network, is_favourite, created_at, updated_at
   FROM saved_numbers
   WHERE customer_id = ?
   ORDER BY is_favourite DESC, label COLLATE NOCASE ASC`
).bind(customer.id).all();

return json({
  success: true,
  savedNumbers: result.results.map((item) => ({
    id: item.id,
    label: item.label,
    phone: item.phone,
    network: item.network,
    isFavourite: Boolean(item.is_favourite),
    createdAt: item.created_at,
    updatedAt: item.updated_at
  }))
});

} catch (error) {
return json({ success: false, message: "Unable to load saved numbers." }, 500);
}
}

export async function onRequestPost({ request, env }) {
try {
if (!env.DB) {
return json({ success: false, message: "Service unavailable." }, 503);
}

const customer = await getCustomer(request, env);

if (!customer) {
  return json({ success: false, message: "Please sign in first." }, 401);
}

let body;

try {
  body = await request.json();
} catch {
  return json({ success: false, message: "Invalid request data." }, 400);
}

const valid = validateNumber(body);

if (valid.error) {
  return json({ success: false, message: valid.error }, 400);
}

const id = crypto.randomUUID();

await env.DB.prepare(
  `INSERT INTO saved_numbers
   (id, customer_id, label, phone, network, is_favourite)
   VALUES (?, ?, ?, ?, ?, ?)`
).bind(
  id,
  customer.id,
  valid.label,
  valid.phone,
  valid.network,
  valid.isFavourite
).run();

return json({
  success: true,
  message: "Number saved successfully.",
  id
}, 201);

} catch (error) {
return json({ success: false, message: "Unable to save this number." }, 500);
}
}

export async function onRequestPut({ request, env }) {
try {
if (!env.DB) {
return json({ success: false, message: "Service unavailable." }, 503);
}

const customer = await getCustomer(request, env);

if (!customer) {
  return json({ success: false, message: "Please sign in first." }, 401);
}

let body;

try {
  body = await request.json();
} catch {
  return json({ success: false, message: "Invalid request data." }, 400);
}

const id = typeof body.id === "string" ? body.id.trim() : "";

if (!id) {
  return json({ success: false, message: "A saved number ID is required." }, 400);
}

const valid = validateNumber(body);

if (valid.error) {
  return json({ success: false, message: valid.error }, 400);
}

const result = await env.DB.prepare(
  `UPDATE saved_numbers
   SET label = ?, phone = ?, network = ?, is_favourite = ?,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = ? AND customer_id = ?`
).bind(
  valid.label,
  valid.phone,
  valid.network,
  valid.isFavourite,
  id,
  customer.id
).run();

if (!result.meta.changes) {
  return json({ success: false, message: "Saved number not found." }, 404);
}

return json({ success: true, message: "Saved number updated." });

} catch (error) {
return json({ success: false, message: "Unable to update this number." }, 500);
}
}

export async function onRequestDelete({ request, env }) {
try {
if (!env.DB) {
return json({ success: false, message: "Service unavailable." }, 503);
}

const customer = await getCustomer(request, env);

if (!customer) {
  return json({ success: false, message: "Please sign in first." }, 401);
}

const url = new URL(request.url);
const id = url.searchParams.get("id");

if (!id || id.length > 100) {
  return json({ success: false, message: "A valid saved number ID is required." }, 400);
}

const result = await env.DB.prepare(
  "DELETE FROM saved_numbers WHERE id = ? AND customer_id = ?"
).bind(id, customer.id).run();

if (!result.meta.changes) {
  return json({ success: false, message: "Saved number not found." }, 404);
}

return json({ success: true, message: "Saved number deleted." });

} catch (error) {
return json({ success: false, message: "Unable to delete this number." }, 500);
}
       }
