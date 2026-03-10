/**
 * PDF Report Generator
 *
 * Uses PDFKit to generate professional compliance reports.
 * Report includes cover page, executive summary, violation breakdowns,
 * top incidents, policies, vendors, and regulatory compliance.
 */

import PDFDocument from "pdfkit";
import type { ReportData } from "./service";

// ---------------------------------------------------------------------------
// Colors and styling constants
// ---------------------------------------------------------------------------

const COLORS = {
  primary: "#1a1a2e",
  secondary: "#16213e",
  accent: "#0f3460",
  text: "#333333",
  muted: "#666666",
  light: "#f0f0f0",
  white: "#ffffff",
  green: "#22c55e",
  red: "#ef4444",
  orange: "#f97316",
} as const;

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 495; // 595 - 2 * 50

// ---------------------------------------------------------------------------
// PDF Generator
// ---------------------------------------------------------------------------

export async function generatePDF(reportData: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: PAGE_MARGIN, bottom: 80, left: PAGE_MARGIN, right: PAGE_MARGIN },
      info: {
        Title: "Interdict Compliance Report",
        Author: "Interdict Control Plane",
        Subject: `Compliance Report ${reportData.dateRange.from} - ${reportData.dateRange.to}`,
      },
    });

    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Track page numbers for footer.
    // Guard against re-entrant pageAdded: footer text positioned near the bottom
    // margin triggers another addPage() → pageAdded → infinite recursion.
    let pageNum = 0;
    let addingFooter = false;
    doc.on("pageAdded", () => {
      if (addingFooter) return;
      pageNum++;
      addingFooter = true;
      try {
        addFooter(doc, reportData, pageNum);
      } finally {
        addingFooter = false;
        // Reset cursor to top of new page after footer rendering
        doc.y = doc.page.margins.top;
      }
    });

    // --- Cover Page ---
    renderCoverPage(doc, reportData);
    pageNum = 1;
    addFooter(doc, reportData, pageNum);

    // --- Warnings (Phase 18: surface failures to operator) ---
    if (reportData.warnings.length > 0) {
      doc.addPage();
      renderWarnings(doc, reportData);
    }

    // --- Executive Summary ---
    doc.addPage();
    renderExecutiveSummary(doc, reportData);

    // --- Violations by Type ---
    doc.addPage();
    renderViolationsByType(doc, reportData);

    // --- Violations by Department ---
    renderViolationsByDepartment(doc, reportData);

    // --- Violations by Vendor ---
    renderViolationsByVendor(doc, reportData);

    // --- Top 10 Incidents ---
    doc.addPage();
    renderTopIncidents(doc, reportData);

    // --- Active Policies ---
    doc.addPage();
    renderActivePolicies(doc, reportData);

    // --- Vendor Approval Status ---
    renderVendorStatus(doc, reportData);

    // --- Regulatory Compliance ---
    doc.addPage();
    renderRegulatoryCompliance(doc, reportData);

    doc.end();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function addFooter(doc: PDFKit.PDFDocument, data: ReportData, pageNum: number) {
  const y = doc.page.height - 50;
  doc
    .save()
    .fontSize(8)
    .fillColor(COLORS.muted)
    .text(
      `Report period: ${formatDate(data.dateRange.from)} - ${formatDate(data.dateRange.to)}`,
      PAGE_MARGIN,
      y,
      { width: CONTENT_WIDTH / 2 }
    )
    .text(`Page ${pageNum}`, PAGE_MARGIN + CONTENT_WIDTH / 2, y, {
      width: CONTENT_WIDTH / 2,
      align: "right",
    })
    .restore();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function sectionTitle(doc: PDFKit.PDFDocument, title: string) {
  doc
    .fontSize(16)
    .fillColor(COLORS.primary)
    .text(title, PAGE_MARGIN, doc.y, { underline: false })
    .moveDown(0.5);

  // Underline
  doc
    .moveTo(PAGE_MARGIN, doc.y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, doc.y)
    .strokeColor(COLORS.accent)
    .lineWidth(1)
    .stroke()
    .moveDown(0.8);
}

function tableRow(
  doc: PDFKit.PDFDocument,
  columns: Array<{ text: string; width: number; align?: "left" | "right" | "center" }>,
  y: number,
  bold: boolean = false
) {
  let x = PAGE_MARGIN;
  for (const col of columns) {
    doc
      .fontSize(bold ? 9 : 9)
      .font(bold ? "Helvetica-Bold" : "Helvetica")
      .fillColor(bold ? COLORS.primary : COLORS.text)
      .text(col.text, x, y, {
        width: col.width,
        align: col.align ?? "left",
        lineBreak: false,
      });
    x += col.width;
  }
}

function checkPageSpace(doc: PDFKit.PDFDocument, needed: number): boolean {
  if (doc.y + needed > doc.page.height - 80) {
    doc.addPage();
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Page renderers
// ---------------------------------------------------------------------------

function renderCoverPage(doc: PDFKit.PDFDocument, data: ReportData) {
  doc.moveDown(6);

  doc
    .fontSize(32)
    .fillColor(COLORS.primary)
    .text("Interdict", PAGE_MARGIN, doc.y, { align: "center" })
    .moveDown(0.3);

  doc
    .fontSize(22)
    .fillColor(COLORS.accent)
    .text("Compliance Report", { align: "center" })
    .moveDown(2);

  doc
    .fontSize(14)
    .fillColor(COLORS.muted)
    .text(
      `${formatDate(data.dateRange.from)} - ${formatDate(data.dateRange.to)}`,
      { align: "center" }
    )
    .moveDown(0.5);

  doc
    .fontSize(10)
    .fillColor(COLORS.muted)
    .text(`Generated: ${formatDate(data.generatedAt)}`, { align: "center" });
}

function renderWarnings(doc: PDFKit.PDFDocument, data: ReportData) {
  sectionTitle(doc, "Data Availability Warnings");

  doc
    .fontSize(10)
    .fillColor(COLORS.red)
    .text(
      "The following report sections could not be loaded. " +
      "Data shown as unavailable may indicate a backend connectivity issue.",
      PAGE_MARGIN,
      doc.y,
      { width: CONTENT_WIDTH }
    )
    .moveDown(1);

  for (const w of data.warnings) {
    doc
      .fontSize(9)
      .fillColor(COLORS.text)
      .text(`Section: ${w.section}`, PAGE_MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 20 })
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(`Error: ${w.message}`, PAGE_MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 20 })
      .moveDown(0.5);
  }
}

function renderExecutiveSummary(doc: PDFKit.PDFDocument, data: ReportData) {
  sectionTitle(doc, "Executive Summary");

  if (!data.summary) {
    doc.fontSize(10).fillColor(COLORS.red).text("Summary data unavailable — see warnings.");
    doc.moveDown(2);
    return;
  }

  const kpis = [
    { label: "Total Requests", value: data.summary.totalRequests.toLocaleString() },
    { label: "Total Violations", value: data.summary.totalViolations.toLocaleString() },
    { label: "Unique Actors", value: data.summary.uniqueActors.toLocaleString() },
    { label: "Unique Vendors", value: data.summary.uniqueVendors.toLocaleString() },
  ];

  const boxWidth = CONTENT_WIDTH / 4 - 10;
  let x = PAGE_MARGIN;
  const startY = doc.y;

  for (const kpi of kpis) {
    doc
      .save()
      .roundedRect(x, startY, boxWidth, 60, 4)
      .fill(COLORS.light)
      .restore();

    doc
      .fontSize(20)
      .fillColor(COLORS.primary)
      .text(kpi.value, x + 8, startY + 10, { width: boxWidth - 16, align: "center" });

    doc
      .fontSize(8)
      .fillColor(COLORS.muted)
      .text(kpi.label, x + 8, startY + 38, { width: boxWidth - 16, align: "center" });

    x += boxWidth + 13;
  }

  doc.y = startY + 80;
  doc.moveDown(1);

  // Key findings
  doc
    .fontSize(12)
    .fillColor(COLORS.primary)
    .text("Key Findings", PAGE_MARGIN)
    .moveDown(0.3);

  const violationRate =
    data.summary.totalRequests > 0
      ? ((data.summary.totalViolations / data.summary.totalRequests) * 100).toFixed(1)
      : "0";

  const activePolicyCount = data.activePolicies?.filter((p) => p.enabled).length ?? 0;
  const vendorCount = data.vendorStatus?.length ?? 0;
  const frameworkCount = data.activeFrameworks?.length ?? 0;

  const findings = [
    `Violation rate: ${violationRate}% of all AI requests triggered policy enforcement.`,
    `${activePolicyCount} policies actively enforcing across ${vendorCount} registered vendors.`,
    `${frameworkCount} regulatory framework(s) active during the reporting period.`,
  ];

  for (const finding of findings) {
    doc
      .fontSize(10)
      .fillColor(COLORS.text)
      .text(`  - ${finding}`, PAGE_MARGIN + 10, doc.y, { width: CONTENT_WIDTH - 20 })
      .moveDown(0.3);
  }
}

function renderViolationsByType(doc: PDFKit.PDFDocument, data: ReportData) {
  sectionTitle(doc, "Violations by Type");

  if (!data.violationsByType || data.violationsByType.length === 0) {
    doc.fontSize(10).fillColor(COLORS.muted).text("No violation data available for this period.");
    doc.moveDown(2);
    return;
  }

  const cols = [
    { text: "Action", width: 200 },
    { text: "Count", width: 150, align: "right" as const },
    { text: "% of Total", width: 145, align: "right" as const },
  ];

  tableRow(doc, cols, doc.y, true);
  doc.moveDown(0.6);

  const total = data.violationsByType.reduce((s, v) => s + v.count, 0);

  for (const row of data.violationsByType) {
    const pct = total > 0 ? ((row.count / total) * 100).toFixed(1) : "0";
    tableRow(
      doc,
      [
        { text: row.action, width: 200 },
        { text: row.count.toLocaleString(), width: 150, align: "right" },
        { text: `${pct}%`, width: 145, align: "right" },
      ],
      doc.y
    );
    doc.moveDown(0.5);
  }

  doc.moveDown(1.5);
}

function renderViolationsByDepartment(doc: PDFKit.PDFDocument, data: ReportData) {
  checkPageSpace(doc, 100);
  sectionTitle(doc, "Violations by Department");

  if (!data.violationsByDepartment || data.violationsByDepartment.length === 0) {
    doc.fontSize(10).fillColor(COLORS.muted).text("No department violation data available.");
    doc.moveDown(2);
    return;
  }

  tableRow(
    doc,
    [
      { text: "Department", width: 300 },
      { text: "Violations", width: 195, align: "right" },
    ],
    doc.y,
    true
  );
  doc.moveDown(0.6);

  for (const row of data.violationsByDepartment) {
    checkPageSpace(doc, 20);
    tableRow(
      doc,
      [
        { text: row.department || "Unknown", width: 300 },
        { text: row.count.toLocaleString(), width: 195, align: "right" },
      ],
      doc.y
    );
    doc.moveDown(0.5);
  }

  doc.moveDown(1.5);
}

function renderViolationsByVendor(doc: PDFKit.PDFDocument, data: ReportData) {
  checkPageSpace(doc, 100);
  sectionTitle(doc, "Violations by Vendor");

  if (!data.violationsByVendor || data.violationsByVendor.length === 0) {
    doc.fontSize(10).fillColor(COLORS.muted).text("No vendor violation data available.");
    doc.moveDown(2);
    return;
  }

  tableRow(
    doc,
    [
      { text: "Vendor", width: 300 },
      { text: "Violations", width: 195, align: "right" },
    ],
    doc.y,
    true
  );
  doc.moveDown(0.6);

  for (const row of data.violationsByVendor) {
    checkPageSpace(doc, 20);
    tableRow(
      doc,
      [
        { text: row.vendor, width: 300 },
        { text: row.count.toLocaleString(), width: 195, align: "right" },
      ],
      doc.y
    );
    doc.moveDown(0.5);
  }
}

function renderTopIncidents(doc: PDFKit.PDFDocument, data: ReportData) {
  sectionTitle(doc, "Top 10 Incidents");

  if (!data.topIncidents || data.topIncidents.length === 0) {
    doc.fontSize(10).fillColor(COLORS.muted).text("No incidents during this period.");
    doc.moveDown(2);
    return;
  }

  const cols = [
    { text: "Timestamp", width: 120 },
    { text: "Actor", width: 100 },
    { text: "Vendor", width: 80 },
    { text: "Action", width: 60 },
    { text: "Tokens", width: 65, align: "right" as const },
  ];

  tableRow(doc, cols, doc.y, true);
  doc.moveDown(0.6);

  for (const incident of data.topIncidents) {
    checkPageSpace(doc, 20);
    tableRow(
      doc,
      [
        { text: formatDate(incident.timestamp), width: 120 },
        { text: (incident.actor || "Unknown").slice(0, 16), width: 100 },
        { text: incident.vendor.slice(0, 12), width: 80 },
        { text: incident.action, width: 60 },
        { text: incident.tokenCount.toLocaleString(), width: 65, align: "right" },
      ],
      doc.y
    );
    doc.moveDown(0.5);
  }
}

function renderActivePolicies(doc: PDFKit.PDFDocument, data: ReportData) {
  sectionTitle(doc, "Active Policies");

  if (!data.activePolicies || data.activePolicies.length === 0) {
    doc.fontSize(10).fillColor(COLORS.muted).text("No policies configured.");
    doc.moveDown(2);
    return;
  }

  tableRow(
    doc,
    [
      { text: "Policy Name", width: 220 },
      { text: "Enabled", width: 100, align: "center" },
      { text: "Compilation", width: 175, align: "center" },
    ],
    doc.y,
    true
  );
  doc.moveDown(0.6);

  for (const p of data.activePolicies) {
    checkPageSpace(doc, 20);
    tableRow(
      doc,
      [
        { text: p.name, width: 220 },
        { text: p.enabled ? "Yes" : "No", width: 100, align: "center" },
        { text: p.compilationStatus ?? "N/A", width: 175, align: "center" },
      ],
      doc.y
    );
    doc.moveDown(0.5);
  }

  doc.moveDown(1.5);
}

function renderVendorStatus(doc: PDFKit.PDFDocument, data: ReportData) {
  checkPageSpace(doc, 100);
  sectionTitle(doc, "Vendor Approval Status");

  if (!data.vendorStatus || data.vendorStatus.length === 0) {
    doc.fontSize(10).fillColor(COLORS.muted).text("No vendors registered.");
    doc.moveDown(2);
    return;
  }

  tableRow(
    doc,
    [
      { text: "Vendor", width: 200 },
      { text: "Status", width: 100, align: "center" },
      { text: "Models", width: 195, align: "right" },
    ],
    doc.y,
    true
  );
  doc.moveDown(0.6);

  for (const v of data.vendorStatus) {
    checkPageSpace(doc, 20);
    tableRow(
      doc,
      [
        { text: v.displayName, width: 200 },
        { text: v.status, width: 100, align: "center" },
        { text: v.modelCount.toString(), width: 195, align: "right" },
      ],
      doc.y
    );
    doc.moveDown(0.5);
  }
}

function renderRegulatoryCompliance(doc: PDFKit.PDFDocument, data: ReportData) {
  sectionTitle(doc, "Regulatory Compliance");

  if (!data.activeFrameworks || data.activeFrameworks.length === 0) {
    doc
      .fontSize(10)
      .fillColor(COLORS.muted)
      .text("No active regulatory frameworks during this period.");
    return;
  }

  tableRow(
    doc,
    [
      { text: "Framework", width: 200 },
      { text: "Jurisdiction", width: 150 },
      { text: "Active Policies", width: 145, align: "right" },
    ],
    doc.y,
    true
  );
  doc.moveDown(0.6);

  for (const fw of data.activeFrameworks) {
    checkPageSpace(doc, 20);
    tableRow(
      doc,
      [
        { text: fw.name, width: 200 },
        { text: fw.jurisdiction ?? "Global", width: 150 },
        { text: fw.activePolicyCount.toString(), width: 145, align: "right" },
      ],
      doc.y
    );
    doc.moveDown(0.5);
  }
}
