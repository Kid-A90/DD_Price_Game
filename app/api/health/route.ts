export async function GET() {
  return Response.json({ ok: true, service: "dd-live-price-game", timestamp: new Date().toISOString() });
}
