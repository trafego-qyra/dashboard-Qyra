import { beforeEach, describe, expect, it, vi } from "vitest";

import { cached, clearCache } from "@/server/lib/cache";

describe("cached", () => {
  beforeEach(clearCache);

  it("carrega uma vez e reaproveita dentro do TTL", async () => {
    const loader = vi.fn().mockResolvedValue({ valor: 1 });
    await cached("k", loader, 60);
    await cached("k", loader, 60);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("não guarda nada com TTL zero", async () => {
    const loader = vi.fn().mockResolvedValue(1);
    await cached("k", loader, 0);
    await cached("k", loader, 0);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("separa chaves diferentes", async () => {
    const loader = vi.fn().mockImplementation((): Promise<number> => Promise.resolve(1));
    await cached("a", loader, 60);
    await cached("b", loader, 60);
    expect(loader).toHaveBeenCalledTimes(2);
  });
});
