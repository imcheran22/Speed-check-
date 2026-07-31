export async function GET() {
  return Response.json({ t: Date.now() });
}
