import { requireAdmin, adminJson } from "./admin-auth.js";

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);

    if (!auth.ok) {
      return adminJson(
        {
          success: false,
          message: auth.message
        },
        auth.status
      );
    }

    const result = await env.DB.prepare(
      `SELECT
         c.id,
         c.full_name,
         c.email,
         c.phone,
         c.status,
         c.created_at
       FROM customers c
       ORDER BY c.created_at DESC
       LIMIT 200`
    ).all();

    return adminJson({
      success: true,
      customers: result.results.map((customer) => ({
        id: customer.id,
        fullName: customer.full_name,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        createdAt: customer.created_at
      }))
    });
  } catch (error) {
    return adminJson(
      {
        success: false,
        message: "Unable to load customers."
      },
      500
    );
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);

    if (!auth.ok) {
      return adminJson(
        {
          success: false,
          message: auth.message
        },
        auth.status
      );
    }

    let body;

    try {
      body = await request.json();
    } catch {
      return adminJson(
        {
          success: false,
          message: "Invalid request data."
        },
        400
      );
    }

    const customerId =
      typeof body.customerId === "string"
        ? body.customerId.trim()
        : "";

    const status =
      typeof body.status === "string"
        ? body.status.trim().toLowerCase()
        : "";

    if (!customerId || customerId.length > 100) {
      return adminJson(
        {
          success: false,
          message: "A valid customer ID is required."
        },
        400
      );
    }

    if (!["active", "suspended"].includes(status)) {
      return adminJson(
        {
          success: false,
          message: "Choose active or suspended."
        },
        400
      );
    }

    // Prevent an administrator from suspending their own account.
    const currentAdmin = await env.DB.prepare(
      `SELECT customer_id
       FROM admin_users
       WHERE customer_id = ?
         AND is_active = 1
       LIMIT 1`
    ).bind(auth.customerId).first();

    if (currentAdmin && customerId === auth.customerId && status === "suspended") {
      return adminJson(
        {
          success: false,
          message: "You cannot suspend your own account here."
        },
        400
      );
    }

    const customer = await env.DB.prepare(
      "SELECT id FROM customers WHERE id = ? LIMIT 1"
    ).bind(customerId).first();

    if (!customer) {
      return adminJson(
        {
          success: false,
          message: "Customer not found."
        },
        404
      );
    }

    await env.DB.prepare(
      `UPDATE customers
       SET status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
    ).bind(status, customerId).run();

    return adminJson({
      success: true,
      message:
        status === "suspended"
          ? "Customer account suspended."
          : "Customer account reactivated."
    });
  } catch (error) {
    return adminJson(
      {
        success: false,
        message: "Unable to update the customer
