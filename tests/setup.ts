import "@testing-library/jest-dom/vitest";

// Recharts mede o container via ResizeObserver, ausente no jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// Sem credencial nos testes: os conectores devem cair no modo mock.
process.env.QYRA_FORCE_MOCK = "true";
