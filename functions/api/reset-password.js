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

    if (!body || typeof body !== "object" || Array.isArray(body)) {
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
    const now = new Date().toISOString();

    const passwordHash = await createPasswordHash(password);

    /*
     * The batch is transactional. The conditional token update
     * claims the token only if it remains unused and unexpired.
     * The following statements proceed only if that claim succeeded.
     */
    const result = await env.DB.batch([
      env.DB.prepare(
        `UPDATE password_reset_tokens
         SET used_at = ?
         WHERE token_hash = ?
           AND used_at IS NULL
           AND expires_at > ?
         RETURNING id, customer_id`
      ).bind(now, tokenHash, now),

      env.DB.prepare(
        `UPDATE customers
         SET password_hash = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = (
           SELECT customer_id
           FROM password_reset_tokens
           WHERE token_hash = ?
             AND used_at = ?
         )
         AND EXISTS (
           SELECT 1
           FROM password_reset_tokens
           WHERE token_hash = ?
             AND used_at = ?
         )`
      ).bind(passwordHash, tokenHash, now, tokenHash, now),

      env.DB.prepare(
        `DELETE FROM sessions
         WHERE customer_id = (
           SELECT customer_id
           FROM password_reset_tokens
           WHERE token_hash = ?
             AND used_at = ?
         )
         AND EXISTS (
           SELECT 1
           FROM password_reset_tokens
           WHERE token_hash = ?
             AND used_at = ?
         )`
      ).bind(tokenHash, now, tokenHash, now),

      env.DB.prepare(
        `DELETE FROM password_reset_tokens
         WHERE customer_id = (
           SELECT customer_id
           FROM password_reset_tokens
           WHERE token_hash = ?
             AND used_at = ?
         )
           AND token_hash != ?
           AND EXISTS (
             SELECT 1
             FROM password_reset_tokens
             WHERE token_hash = ?
               AND used_at = ?
           )`
      ).bind(tokenHash, now, tokenHash, tokenHash, now)
    ]);

    const claimedToken = result[0]?.results?.[0];
    const passwordUpdateChanges = result[1]?.meta?.changes;

    if (!claimedToken) {
      return json({
        success: false,
        message: "This reset link is invalid or has expired."
      }, 400);
    }

    if (passwordUpdateChanges !== 1) {
      return json({
        success: false,
        message: "Unable to reset your password. Please try again."
      }, 500);
    }

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
