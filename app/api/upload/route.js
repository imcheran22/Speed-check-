export async function POST(request) {
  const data = await request.arrayBuffer();
  return Response.json({
    received: data.byteLength,
    timestamp: Date.now(),
  });
}
