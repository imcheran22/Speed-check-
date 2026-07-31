export async function GET(request) {
  const url = new URL(request.url);
  const sizeMB = Math.min(parseInt(url.searchParams.get('size') || '5', 10), 25);
  const bytes = sizeMB * 1024 * 1024;

  const chunk = new Uint8Array(65536);
  for (let i = 0; i < chunk.length; i++) {
    chunk[i] = Math.random() * 256;
  }

  const chunks = Math.ceil(bytes / chunk.length);
  const stream = new ReadableStream({
    start(controller) {
      for (let i = 0; i < chunks; i++) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(chunks * chunk.length),
      'Cache-Control': 'no-store',
    },
  });
}
