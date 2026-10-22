const json = (data, status = 200) =>
Response.json(data, {
status,
headers: {
"Cache-Control": "no-store"
}
});

const validServices = [
"data",
"airtime",
"electricity",
"cable_tv",
"educational_pins"
];

export async function onRequestGet({ request, env }) {
try {
if (!env.DB) {
return json({
success: false,
message: "Service temporarily unavailable."
}, 503);
}

const url = new URL(request.url);

const service = (url.searchParams.get("service") || "")
  .trim()
  .toLowerCase();

const network = (url.searchParams.get("network") || "")
  .trim();

const category = (url.searchParams.get("category") || "")
  .trim();

if (service && !validServices.includes(service)) {
  return json({
    success: false,
    message: "Unsupported service type."
  }, 400);
}

if (network.length > 50 || category.length > 100) {
  return json({
    success: false,
    message: "The requested filter is too long."
  }, 400);
}

let query = `
  SELECT
    id,
    service_type,
    network,
    category,
    name,
    selling_price_minor
  FROM service_plans
  WHERE is_active = 1
    AND selling_price_minor IS NOT NULL
    AND selling_price_minor > 0
`;

const values = [];

if (service) {
  query += " AND service_type = ?";
  values.push(service);
}

if (network) {
  query += " AND network = ?";
  values.push(network);
}

if (category) {
  query += " AND category = ?";
  values.push(category);
}

query += " ORDER BY service_type, network, category, name";

const statement = env.DB.prepare(query);

const result = await statement.bind(...values).all();

return json({
  success: true,
  plans: result.results.map((plan) => ({
    id: plan.id,
    service: plan.service_type,
    network: plan.network,
    category: plan.category,
    name: plan.name,
    sellingPriceMinor: plan.selling_price_minor,
    currency: "NGN"
  }))
});

} catch (error) {
return json({
success: false,
message: "Unable to load available plans right now."
}, 500);
}
}
