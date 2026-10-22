import { requireAdmin, adminJson } from "./admin-auth.js";

const validServices = [
"data",
"airtime",
"electricity",
"cable_tv",
"educational_pins"
];

const validNetworks = ["MTN", "Airtel", "Glo", "9mobile"];

function validatePlan(body, isUpdate = false) {
const service =
typeof body.service === "string"
? body.service.trim().toLowerCase()
: "";

const network =
typeof body.network === "string" && body.network.trim()
? body.network.trim()
: null;

const category =
typeof body.category === "string" && body.category.trim()
? body.category.trim()
: null;

const name =
typeof body.name === "string" ? body.name.trim() : "";

const supplierPlanId =
typeof body.supplierPlanId === "string" ||
typeof body.supplierPlanId === "number"
? String(body.supplierPlanId).trim()
: "";

const supplierPriceMinor = body.supplierPriceMinor;
const sellingPriceMinor = body.sellingPriceMinor;

if (!validServices.includes(service)) {
return { error: "Choose a supported service type." };
}

if (
network !== null &&
(!validNetworks.includes(network) || network.length > 50)
) {
return { error: "Choose a supported network." };
}

if (category !== null && category.length > 100) {
return { error: "Category must not exceed 100 characters." };
}

if (!name || name.length > 150) {
return { error: "Plan name must be between 1 and 150 characters." };
}

if (!supplierPlanId || supplierPlanId.length > 100) {
return { error: "Enter the supplier's original plan ID." };
}

if (
!Number.isSafeInteger(supplierPriceMinor) ||
supplierPriceMinor < 0
) {
return { error: "Enter a valid supplier cost in minor currency units." };
}

if (
!Number.isSafeInteger(sellingPriceMinor) ||
sellingPriceMinor <= 0
) {
return { error: "Enter a valid selling price in minor currency units." };
}

if (sellingPriceMinor < supplierPriceMinor) {
return {
error: "The selling price must not be below the supplier cost."
};
}

let isActive = 0;

if (isUpdate || body.isActive !== undefined) {
if (
body.isActive !== true &&
body.isActive !== false &&
body.isActive !== 1 &&
body.isActive !== 0
) {
return { error: "The active setting is invalid." };
}

isActive =
  body.isActive === true || body.isActive === 1 ? 1 : 0;

}

return {
service,
network,
category,
name,
supplierPlanId,
supplierPriceMinor,
sellingPriceMinor,
isActive
};
}

export async function onRequestGet({ request, env }) {
try {
const auth = await requireAdmin(request, env);

if (!auth.ok) {
  return adminJson({
    success: false,
    message: auth.message
  }, auth.status);
}

const result = await env.DB.prepare(
  `SELECT
     id,
     service_type,
     network,
     category,
     supplier_plan_id,
     name,
     supplier_price_minor,
     selling_price_minor,
     is_active,
     created_at,
     updated_at
   FROM service_plans
   ORDER BY service_type, network, category, name`
).all();

return adminJson({
  success: true,
  plans: result.results.map((plan) => ({
    id: plan.id,
    service: plan.service_type,
    network: plan.network,
    category: plan.category,
    supplierPlanId: plan.supplier_plan_id,
    name: plan.name,
    supplierPriceMinor: plan.supplier_price_minor,
    sellingPriceMinor: plan.selling_price_minor,
    isActive: Boolean(plan.is_active),
    createdAt: plan.created_at,
    updatedAt: plan.updated_at
  }))
});

} catch (error) {
return adminJson({
success: false,
message: "Unable to load admin plans."
}, 500);
}
}

export async function onRequestPost({ request, env }) {
try {
const auth = await requireAdmin(request, env);

if (!auth.ok) {
  return adminJson({
    success: false,
    message: auth.message
  }, auth.status);
}

let body;

try {
  body = await request.json();
} catch {
  return adminJson({
    success: false,
    message: "Invalid request data."
  }, 400);
}

const valid = validatePlan(body);

if (valid.error) {
  return adminJson({
    success: false,
    message: valid.error
  }, 400);
}

const id = crypto.randomUUID();

await env.DB.prepare(
  `INSERT INTO service_plans (
     id, service_type, network, category,
     supplier_plan_id, name,
     supplier_price_minor, selling_price_minor, is_active
   )
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
).bind(
  id,
  valid.service,
  valid.network,
  valid.category,
  valid.supplierPlanId,
  valid.name,
  valid.supplierPriceMinor,
  valid.sellingPriceMinor,
  valid.isActive
).run();

return adminJson({
  success: true,
  message: "Service plan added.",
  id
}, 201);

} catch (error) {
return adminJson({
success: false,
message: "Unable to add the plan. Check whether this supplier plan ID already exists for the service."
}, 500);
}
}

export async function onRequestPut({ request, env }) {
try {
const auth = await requireAdmin(request, env);

if (!auth.ok) {
  return adminJson({
    success: false,
    message: auth.message
  }, auth.status);
}

let body;

try {
  body = await request.json();
} catch {
  return adminJson({
    success: false,
    message: "Invalid request data."
  }, 400);
}

const id = typeof body.id === "string" ? body.id.trim() : "";

if (!id || id.length > 100) {
  return adminJson({
    success: false,
    message: "A valid plan ID is required."
  }, 400);
}

const valid = validatePlan(body, true);

if (valid.error) {
  return adminJson({
    success: false,
    message: valid.error
  }, 400);
}

const result = await env.DB.prepare(
  `UPDATE service_plans
   SET service_type = ?,
       network = ?,
       category = ?,
       supplier_plan_id = ?,
       name = ?,
       supplier_price_minor = ?,
       selling_price_minor = ?,
       is_active = ?,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = ?`
).bind(
  valid.service,
  valid.network,
  valid.category,
  valid.supplierPlanId,
  valid.name,
  valid.supplierPriceMinor,
  valid.sellingPriceMinor,
  valid.isActive,
  id
).run();

if (!result.meta.changes) {
  return adminJson({
    success: false,
    message: "Service plan not found."
  }, 404);
}

return adminJson({
  success: true,
  message: "Service plan updated."
});

} catch (error) {
return adminJson({
success: false,
message: "Unable to update the plan. Check for duplicate supplier plan IDs."
}, 500);
}
}
