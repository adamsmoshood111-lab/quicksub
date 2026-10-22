export async function onRequestGet() {
  return Response.json({
    success: true,
    app: "QuickSub",
    message: "QuickSub backend endpoint is ready.",
    timestamp: new Date().toISOString()
  });
}
