import { requireAdmin, adminJson } from "./admin-auth.js";

const validStatuses = [
  "pending",
  "successful",
  "failed",
  "reversed"
];

const validServices = [
  "data",
  "airtime",
  "electricity",
  "cable_tv",
  "educational_pins"
];

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

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const service = url.searchParams.get("service");
    const requestedLimit = Number(url.searchParams.get("limit") || 50);
    const requestedOffset = Number(url.searchParams.get("offset") || 0);

    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    const offset = Number.isInteger(requestedOffset)
      ? Math.max(requestedOffset, 0)
      : 0;

    if (status && !validStatuses.includes(status)) {
      return adminJson(
        {
          success: false,
          message: "Invalid transaction status."
        },
        400
      );
    }

    if (service && !validServices.includes(service)) {
      return adminJson(
        {
          success: false,
          message: "Invalid service type."
        },
        400
      );
    }

    let sql = `
      SELECT
        t.id,
        t.customer_id,
        c.full_name,
        c.email,
        t.service_type,
        t.plan_id,
        t.recipient,
        t.amount_minor,
        t.supplier_cost_minor,
        t.status,
        t.reference,
        t.supplier_reference,
        t.failure_reason,
        t.created_at,
        t.updated_at
      FROM transactions t
      JOIN customers c ON c.id = t.customer_id
    `;

    const conditions = [];
    const values = [];

    if (status) {
      conditions.push("t.status = ?");
      values.push(status);
    }

    if (service) {
      conditions.push("t.service_type = ?");
      values.push(service);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }

    sql += `
      ORDER BY t.created_at DESC
      LIMIT ? OFFSET ?
    `;

    values.push(limit, offset);

    const result = await env.DB.prepare(sql)
      .bind(...values)
      .all();

    return adminJson({
      success: true,
      transactions: result.results.map((transaction) => ({
        id: transaction.id,
        customerId: transaction.customer_id,
        customerName: transaction.full_name,
        customerEmail: transaction.email,
        service: transaction.service_type,
        planId: transaction.plan_id,
        recipient: transaction.recipient,
        amountMinor: transaction.amount_minor,
        supplierCostMinor: transaction.supplier_cost_minor,
        status: transaction.status,
        reference: transaction.reference,
        supplierReference: transaction.supplier_reference,
        failureReason: transaction.failure_reason,
        createdAt: transaction.created_at,
        updatedAt: transaction.updated_at
      })),
      pagination: {
        limit,
        offset,
        returned: result.results.length
      }
    });
  } catch (error) {
    return adminJson(
      {
        success: false,
        message: "Unable to load transactions."
      },
      500
    );
  }
        }
