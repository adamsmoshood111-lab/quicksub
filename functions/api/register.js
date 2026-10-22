const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });

export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const fullName =
      typeof body.fullName === "string" ? body.fullName.trim() : "";
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";
    const phone =
      typeof body.phone === "string" ? body.phone.trim() : "";
    const password =
      typeof body.password === "string" ? body.password : "";

    if (!fullName || fullName.length > 100) {
      return json({ success: false, message: "Enter a valid full name." }, 400);
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return json({ success: false, message: "Enter a valid email address." }, 400);
    }

    if (!/^\+?[0-9\s()-]{7,20}$/.test(phone)) {
      return json({ success: false, message: "Enter a valid phone number." }, 400);
    }

    if (password.length < 12 || password.length > 128) {
      return json({
        success: false,
        message: "Your password must be between 12 and 128 characters."
      }, 400);
    }

    if (!env.DB) {
      return json({ success: false, message: "Service temporarily unavailable." }, 503);
    }

    const existing = await env.DB.prepare(
      "SELECT id FROM customers WHERE email = ? LIMIT 1"
    ).bind(email).first();

    if (existing) {
      return json({
        success: false,
        message: "An account with this email already exists."
      }, 409);
    }

    // Web Crypto derives a password hash using PBKDF2.
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt,
        iterations: 600000,
        hash: "SHA-256"
      },
      passwordKey,
      256
    );

    const toBase64 = (bytes) =>
      btoa(String.fromCharCode(...bytes));

    const passwordHash =
      `pbkdf2_sha256$600000$${toBase64(salt)}$` +
      toBase64(new Uint8Array(derivedBits));

    const customerId = crypto.randomUUID();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO customers
          (id, full_name, email, phone, password_hash)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(customerId, fullName, email, phone, passwordHash),

      env.DB.prepare(
        "INSERT INTO wallets (customer_id, balance_minor) VALUES (?, 0)"
      ).bind(customerId)
    ]);

    return json({
      success: true,
      message: "Your account has been created. Please sign in."
    }, 201);
  } catch (error) {
    return json({
      success: false,
      message: "Registration could not be completed. Please try again."
    }, 500);
  }
}
