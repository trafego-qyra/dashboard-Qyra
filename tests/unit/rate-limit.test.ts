import { beforeEach, describe, expect, it } from "vitest";

import { clientIdentifier, rateLimit, resetRateLimit } from "@/server/lib/rate-limit";

describe("rateLimit", () => {
  beforeEach(resetRateLimit);

  it("libera enquanto estiver abaixo do teto", () => {
    for (let i = 0; i < 3; i++) {
      expect(rateLimit("ip-1", 3, 60_000).ok).toBe(true);
    }
  });

  it("bloqueia ao estourar o teto", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip-2", 3, 60_000);
    const result = rateLimit("ip-2", 3, 60_000);
    expect(result.ok).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("isola identificadores diferentes", () => {
    for (let i = 0; i < 3; i++) rateLimit("ip-3", 3, 60_000);
    expect(rateLimit("ip-4", 3, 60_000).ok).toBe(true);
  });

  it("libera de novo quando a janela expira", () => {
    rateLimit("ip-5", 1, 1);
    // Janela de 1ms: a chamada seguinte já cai em outro balde.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(rateLimit("ip-5", 1, 1).ok).toBe(true);
        resolve();
      }, 5);
    });
  });
});

describe("clientIdentifier", () => {
  it("usa o primeiro IP do x-forwarded-for", () => {
    const request = new Request("https://exemplo.com", {
      headers: { "x-forwarded-for": "203.0.113.9, 70.41.3.18" },
    });
    expect(clientIdentifier(request)).toBe("203.0.113.9");
  });

  it("cai para x-real-ip e depois para anon", () => {
    expect(
      clientIdentifier(
        new Request("https://exemplo.com", { headers: { "x-real-ip": "198.51.100.5" } }),
      ),
    ).toBe("198.51.100.5");
    expect(clientIdentifier(new Request("https://exemplo.com"))).toBe("anon");
  });
});
