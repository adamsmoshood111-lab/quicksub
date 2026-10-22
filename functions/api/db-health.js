export async function onRequestGet({ env }) {
  try {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).all();

    return Response.json({
      success: true,
      app: "QuickSub",
      database: "connected",
      tables: result.results.map((table) => table.name)
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        app: "QuickSub",
        database: "error",
        message: "Could not connect to the database."
      },
      { status: 500 }
    );
  }
}
