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

export async function onRequestGet({ request, env }) {
try {
if (!env.DB) {
return json({
success: false,
message: "Service temporarily unavailable."
}, 503);
}

const cookieHeader = request.headers.get("Cookie") || "";

const sessionCookie = cookieHeader
  .split(";")
  .map((part) => part.trim())
  .find((part) => part.startsWith("quicksub_session="));

if (!sessionCookie) {
  return json({
    success: false,
    message: "You are not signed in."
  }, 401);
}

const token = sessionCookie.slice("quicksub_session=".length);

if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
  return json({
    success: false,
    message: "Your session is invalid. Please sign in again."
  }, 401, {
    "Set-Cookie":
      "quicksub_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
  });
}

const tokenHash = await hashToken(token);

const session = await env.DB.prepare(
  `SELECT
     customers.id,
     customers.full_name,
     customers.email,
     customers.phone,
     customers.status,
     sessions.expires_at
   FROM sessions
   JOIN customers ON customers.id = sessions.customer_id
   WHERE sessions.id_hash = ?
   LIMIT 1`
).bind(tokenHash).first();

if (
  !session ||
  session.status !== "active" ||
  new Date(session.expires_at).getTime() <= Date.now()
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

return json({
  success: true,
  customer: {
    id: session.id,
    fullName: session.full_name,
    email: session.email,
    phone: session.phone
  }
});

} catch (error) {
return json({
success: false,
message: "Unable to verify your session. Please try again."
}, 500);
}
}
