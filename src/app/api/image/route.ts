const COMMONS_URL = "https://commons.wikimedia.org/w/api.php";
// Wikimedia rejects requests without a descriptive User-Agent.
const USER_AGENT = "my-vite-app/0.1 (slide image proxy)";

type CommonsResponse = { query?: { pages?: Record<string, { index?: number; imageinfo?: { thumburl?: string }[] }> } };

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) || "abstract";
  const photo = await findPhoto(query, request.signal);
  const location = photo ?? `https://picsum.photos/seed/${query.toLowerCase().replace(/[^a-z0-9]+/g, "-")}/800/600`;
  const cache = photo ? "public, max-age=86400" : "no-store";
  return new Response(null, { status: 302, headers: { location, "cache-control": cache } });
}

async function findPhoto(query: string, signal: AbortSignal): Promise<string | null> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "search",
    gsrnamespace: "6",
    gsrlimit: "3",
    gsrsearch: `${query} filetype:bitmap`,
    prop: "imageinfo",
    iiprop: "url",
    iiurlwidth: "1200",
  });
  try {
    const response = await fetch(`${COMMONS_URL}?${params}`, {
      headers: { "user-agent": USER_AGENT },
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
    });
    if (!response.ok) {
      console.warn(`[image] Wikimedia ${response.status} for "${query}"`);
      return null;
    }
    const { query: result } = (await response.json()) as CommonsResponse;
    const pages = Object.values(result?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const url = pages.map((page) => page.imageinfo?.[0]?.thumburl).find((thumb) => thumb?.startsWith("https://"));
    if (url) return url;
    console.warn(`[image] Wikimedia returned no photo for "${query}"`);
  } catch (error) {
    console.warn(`[image] Wikimedia request failed for "${query}":`, error);
  }
  return null;
}
