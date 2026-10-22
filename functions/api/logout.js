const json = (data, status = 200) =>
Response.json(data, {
status,
headers: {
"Cache-Control": "no-store",
"Set-Cookie":
"quicksub_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
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

export async function onRequestPost({ request, env }) {
try {
const cookieHeader = request.headers.get("Cookie") || "";

const sessionCookie = cookieHeader
  .split(";")
  .map((part) => part.trim())
  .find((part) => part.startsWith("quicksub_session="));

if (sessionCookie && env.DB) {
  const token = sessionCookie.slice("quicksub_session=".length);

  if (/^[A-Za-z0-9_-]{43}$/.test(token)) {
    const tokenHash = await hashToken(token);

    await env.DB.prepare(
      "DELETE FROM sessions WHERE id_hash = ?"
    ).bind(tokenHash).run();
  }
}

return json({
  success: true,
  message: "You have been signed out."
});

} catch (error) {
return json({
success: false,
message: "Logout could not be completed. Please try again."
}, 500);
}
}
