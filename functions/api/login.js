const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...headers
    }
  });

function decodeBase64(value) {
  const binary = atob(value);

  return Uint8Array.from(
    binary,
    (char) => char.charCodeAt(0)
  );
}

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

async function verifyPassword(password, storedHash) {
  try {
    if (typeof storedHash !== "string") {
      return false;
    }

    const parts = storedHash.split("$");

    if (
      parts.length !== 4 ||
      parts[0] !== "pbkdf2_sha256" ||
      parts[1] !== "600000"
    ) {
      return false;
    }

    const salt = decodeBase64(parts[2]);
    const expected = decodeBase64(parts[3]);

    if (salt.length !== 16 || expected.length !== 32) {
      return false;
    }

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

    const actual = new Uint8Array(result);

    let difference = 0;

    for (let i = 0; i < actual.length; i++) {
      difference |= actual[i] ^ expected[i];
    }

    return difference === 0;
  } catch {
    return false;
  }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.DB) {
      return json(
        {
          success: false,
          message: "Service temporarily unavailable."
        },
        503
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return json(
        {
          success: false,
          message: "Invalid request data."
        },
        400
      );
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(
        {
          success: false,
          message: "Invalid request data."
        },
        400
      );
    }

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    const password =
      typeof body.password === "string"
        ? body.password
        : "";

    if (
      !email ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      !password ||
      password.length > 128
    ) {
      return json(
        {
          success: false,
          message: "Enter a valid email address and password."
        },
        400
      );
    }

    const customer = await env.DB.prepare(
      `SELECT id, full_name, email, password_hash, status
       FROM customers
       WHERE email = ?
       LIMIT 1`
    )
      .bind(email)
      .first();

    if (
      !customer ||
      customer.status !== "active" ||
      !(await verifyPassword(password, customer.password_hash))
    ) {
      return json(
        {
          success: false,
          message: "Invalid email or password."
        },
        401
      );
    }

    // Generate a cryptographically random session token.
    const randomBytes = crypto.getRandomValues(
      new Uint8Array(32)
    );

    const token = btoa(
      String.fromCharCode(...randomBytes)
    )
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    // Store only the SHA-256 hash of the session token.
    const tokenHash = await hashToken(token);

    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    await env.DB.prepare(
      `INSERT INTO sessions (
         id_hash,
         customer_id,
         expires_at
       )
       VALUES (?, ?, ?)`
    )
      .bind(tokenHash, customer.id, expiresAt)
      .run();

    const cookie =
      `quicksub_session=${token}; ` +
      "Max-Age=604800; " +
      "Path=/; " +
      "HttpOnly; " +
      "Secure; " +
      "SameSite=Lax";

    return json(
      {
        success: true,
        message: "Login successful.",
        customer: {
          id: customer.id,
          fullName: customer.full_name,
          email: customer.email
        }
      },
      200,
      {
        "Set-Cookie": cookie
      }
    );
  } catch (error) {
    return json(
      {
        success: false,
        message: "Unable to sign in right now. Please try again."
      },
      500
    );
  }
}
