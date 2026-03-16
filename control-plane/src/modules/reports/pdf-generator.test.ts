/**
 * PDF Generator Tests
 *
 * Mocks PDFKit's PDFDocument to verify generatePDF() calls the correct
 * methods in the expected order. Tests structure, not pixel-perfect layout.
 */

import { describe, expect, it, mock } from "bun:test";
import type { ReportData } from "./service";

// ---------------------------------------------------------------------------
// Track method calls for verification
// ---------------------------------------------------------------------------

const methodCalls: Array<{ method: string; args: unknown[] }> = [];

function trackCall(method: string) {
  return (...args: unknown[]) => {
    methodCalls.push({ method, args });
    return mockDocInstance; // chain pattern
  };
}

const mockDocInstance = {
  on: mock((event: string, cb: (...args: unknown[]) => void) => {
    if (event === "end") {
      // Store the end callback to call later
      (mockDocInstance as unknown as Record<string, unknown>)._endCb = cb;
    }
    return mockDocInstance;
  }),
  addPage: trackCall("addPage"),
  text: trackCall("text"),
  fontSize: trackCall("fontSize"),
  fillColor: trackCall("fillColor"),
  moveDown: trackCall("moveDown"),
  save: trackCall("save"),
  restore: trackCall("restore"),
  roundedRect: trackCall("roundedRect"),
  fill: trackCall("fill"),
  moveTo: trackCall("moveTo"),
  lineTo: trackCall("lineTo"),
  strokeColor: trackCall("strokeColor"),
  lineWidth: trackCall("lineWidth"),
  stroke: trackCall("stroke"),
  font: trackCall("font"),
  end: mock(() => {
    // Trigger the end callback to resolve the promise
    const endCb = (mockDocInstance as unknown as Record<string, () => void>)._endCb;
    if (endCb) endCb();
  }),
  y: 100,
  page: {
    margins: { top: 50 },
    height: 842,
  },
};

mock.module("pdfkit", () => ({
  default: class MockPDFDocument {
    constructor() {
      methodCalls.length = 0; // Reset between tests
      Object.assign(this, mockDocInstance);
      // Reset mock call counts
      mockDocInstance.on.mockClear();
      mockDocInstance.end.mockClear();
    }
  },
}));

// Import after mocking
const { generatePDF } = await import("./pdf-generator");

// ---------------------------------------------------------------------------
// Minimal ReportData
// ---------------------------------------------------------------------------

function createMinimalReportData(overrides: Partial<ReportData> = {}): ReportData {
  return {
    dateRange: { from: "2025-01-01T00:00:00Z", to: "2025-01-31T23:59:59Z" },
    generatedAt: "2025-02-01T12:00:00Z",
    warnings: [],
    summary: {
      totalRequests: 100,
      totalViolations: 5,
      uniqueActors: 3,
      uniqueVendors: 2,
    },
    violationsByType: [{ action: "block", count: 5 }],
    violationsByDepartment: [{ department: "Eng", count: 5 }],
    violationsByVendor: [{ vendor: "openai", count: 5 }],
    topIncidents: [
      {
        timestamp: "2025-01-15T10:00:00Z",
        actor: "alice",
        vendor: "openai",
        model: "gpt-4",
        action: "block",
        tokenCount: 1000,
      },
    ],
    activePolicies: [{ name: "PII Detection", enabled: true, compilationStatus: "compiled" }],
    vendorStatus: [{ name: "openai", displayName: "OpenAI", status: "approved", modelCount: 5 }],
    activeFrameworks: [{ name: "EU AI Act", jurisdiction: "EU", activePolicyCount: 2 }],
    ...overrides,
  };
}

describe("generatePDF", () => {
  it("returns a Buffer", async () => {
    const data = createMinimalReportData();
    const result = await generatePDF(data);

    // The mock produces an empty buffer since no actual data events fire
    expect(result).toBeInstanceOf(Buffer);
  });

  it("calls doc.end() to finalize the document", async () => {
    const data = createMinimalReportData();
    await generatePDF(data);

    expect(mockDocInstance.end).toHaveBeenCalledTimes(1);
  });

  it("adds multiple pages for different sections", async () => {
    const data = createMinimalReportData();
    await generatePDF(data);

    const addPageCalls = methodCalls.filter((c) => c.method === "addPage");
    // Cover page is page 1, then executive summary, violations, incidents, policies, regulatory
    expect(addPageCalls.length).toBeGreaterThanOrEqual(4);
  });

  it("renders text content for section titles", async () => {
    const data = createMinimalReportData();
    await generatePDF(data);

    const textCalls = methodCalls.filter((c) => c.method === "text");
    const textValues = textCalls.map((c) => String(c.args[0]));

    // Should contain key section titles
    expect(textValues.some((t) => t.includes("Interdict"))).toBe(true);
    expect(textValues.some((t) => t.includes("Compliance Report"))).toBe(true);
  });

  it("renders executive summary KPI values", async () => {
    const data = createMinimalReportData({
      summary: {
        totalRequests: 500,
        totalViolations: 25,
        uniqueActors: 8,
        uniqueVendors: 4,
      },
    });
    await generatePDF(data);

    const textCalls = methodCalls.filter((c) => c.method === "text");
    const textValues = textCalls.map((c) => String(c.args[0]));

    // KPI values should appear in text
    expect(textValues.some((t) => t.includes("500"))).toBe(true);
    expect(textValues.some((t) => t.includes("25"))).toBe(true);
  });

  it("renders warnings page when warnings present", async () => {
    const data = createMinimalReportData({
      warnings: [{ section: "summary", message: "DB connection failed" }],
    });
    await generatePDF(data);

    const textCalls = methodCalls.filter((c) => c.method === "text");
    const textValues = textCalls.map((c) => String(c.args[0]));

    expect(textValues.some((t) => t.includes("Data Availability Warnings"))).toBe(true);
    expect(textValues.some((t) => t.includes("summary"))).toBe(true);
  });

  it("handles null summary gracefully", async () => {
    const data = createMinimalReportData({ summary: null });

    // Should not throw
    const result = await generatePDF(data);
    expect(result).toBeInstanceOf(Buffer);

    const textCalls = methodCalls.filter((c) => c.method === "text");
    const textValues = textCalls.map((c) => String(c.args[0]));
    expect(textValues.some((t) => t.includes("unavailable"))).toBe(true);
  });

  it("handles empty arrays in all data sections", async () => {
    const data = createMinimalReportData({
      violationsByType: [],
      violationsByDepartment: [],
      violationsByVendor: [],
      topIncidents: [],
      activePolicies: [],
      vendorStatus: [],
      activeFrameworks: [],
    });

    // Should not throw
    const result = await generatePDF(data);
    expect(result).toBeInstanceOf(Buffer);
  });

  it("registers event handlers for data, end, and error", async () => {
    const data = createMinimalReportData();
    await generatePDF(data);

    const onCalls = mockDocInstance.on.mock.calls;
    const events = onCalls.map((c: unknown[]) => c[0]);
    expect(events).toContain("data");
    expect(events).toContain("end");
    expect(events).toContain("error");
  });
});
