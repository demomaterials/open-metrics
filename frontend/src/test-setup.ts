import "@testing-library/jest-dom/vitest";

class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Recharts' ResponsiveContainer needs ResizeObserver.
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
