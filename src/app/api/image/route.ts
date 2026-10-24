const OPENVERSE_URL = "https://api.openverse.org/v1/images/";

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "abstract";
  const location = await findPhoto(query, request.signal);
  return new Response(null, { status: 302, headers: { location, "cache-control": "public, max-age=86400" } });
}

async function findPhoto(query: string, signal: AbortSignal): Promise<string> {
  const params = new URLSearchParams({ q: query, page_size: "1", license_type: "commercial", category: "photograph" });
  try {
    const response = await fetch(`${OPENVERSE_URL}?${params}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) });
    if (response.ok) {
      const { results } = (await response.json()) as { results?: { url?: string }[] };
      const url = results?.[0]?.url;
      if (url?.startsWith("https://")) return url;
    }
  } catch {}
  const seed = query.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `https://picsum.photos/seed/${seed}/800/600`;
}
