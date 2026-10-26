import { describe, expect, it } from "vitest";
import { clientKey, RATE_LIMITS, takeToken } from "./rateLimit";

describe("takeToken", () => {
  it("allows the per-minute budget, then blocks until the oldest request ages out", () => {
    const t0 = 1_000_000;
    for (let i = 0; i < RATE_LIMITS.perMinute; i++) expect(takeToken("minute", t0 + i).ok).toBe(true);
    expect(takeToken("minute", t0 + 1_000)).toEqual({ ok: false, retryAfterSec: 59 });
    expect(takeToken("minute", t0 + 60_000).ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("prefers the first forwarded address, then the real IP", () => {
    expect(clientKey(new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } }))).toBe("1.1.1.1");
    expect(clientKey(new Request("http://x", { headers: { "x-real-ip": "3.3.3.3" } }))).toBe("3.3.3.3");
    expect(clientKey(new Request("http://x"))).toBe("local");
  });
});
