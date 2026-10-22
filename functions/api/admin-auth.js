export async function requireAdmin(request, env) {
if (!env.DB) {
return {
ok: false,
status: 503,
message: "Service temporarily unavailable."
};
}

const cookieHeader = request.headers.get("Cookie") || "";

const sessionCookie = cookieHeader
.split(";")
.map((part) => part.trim())
.find((part) => part.startsWith("quicksub_session="));

if (!sessionCookie) {
return {
ok: false,
status: 401,
message: "Please sign in with an administrator account."
};
}

const token = sessionCookie.slice("quicksub_session=".length);

if (!/^[A-Za-z0-9_-]{43}$/.test(token)) {
return {
ok: false,
status: 401,
message: "Your session is invalid. Please sign in again."
};
}

const digest = await crypto.subtle.digest(
"SHA-256",
new TextEncoder().encode(token)
);

const tokenHash = Array.from(new Uint8Array(digest), (byte) =>
byte.toString(16).padStart(2, "0")
).join("");

const record = await env.DB.prepare(
"SELECT customers.id AS customer_id, customers.status AS customer_status, sessions.expires_at, admin_users.role FROM sessions JOIN customers ON customers.id = sessions.customer_id JOIN admin_users ON admin_users.customer_id = customers.id WHERE sessions.id_hash = ? AND sessions.expires_at > ? AND customers.status = 'active' AND admin_users.is_active = 1 LIMIT 1"
).bind(tokenHash, new Date().toISOString()).first();

if (!record) {
return {
ok: false,
status: 403,
message: "Administrator access is required."
};
}

return {
ok: true,
customerId: record.customer_id,
role: record.role
};
}

export function adminJson(data, status = 200) {
return Response.json(data, {
status,
headers: {
"Cache-Control": "no-store"
}
});
}
