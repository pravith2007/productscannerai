import jsPDF from 'jspdf';
import QRCode from 'qrcode';
import type { Inspection } from './types';
import { FIELD_LABELS, VIEW_LABELS_DISPLAY } from './types';

export async function generateQRCodeDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { width: 200, margin: 1 });
}

export async function generateComplianceReport(inspection: Inspection): Promise<void> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = 20;

  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Digital Compliance Report', margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100);
  doc.text('Evidence-Driven Digital Inspection Platform', margin, y);
  y += 10;
  doc.setTextColor(0);

  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Passport ID: ${inspection.passportId}`, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Product: ${inspection.productName || 'Not identified'}`, margin, y); y += 5;
  doc.text(`Inspection Date: ${new Date(inspection.createdAt).toLocaleString()}`, margin, y); y += 5;
  doc.text(`Rule Set: ${inspection.ruleSetId} v${inspection.ruleVersion}`, margin, y); y += 5;
  doc.text(`Engine Version: ${inspection.engineVersion}`, margin, y); y += 5;
  doc.text(`Status: ${inspection.status.toUpperCase()}`, margin, y); y += 5;
  doc.text(`Compliance Score: ${inspection.overallScore}/100`, margin, y); y += 10;

  const qrDataUrl = await generateQRCodeDataUrl(`PASSPORT:${inspection.passportId}`);
  doc.addImage(qrDataUrl, 'PNG', pageWidth - 50, 20, 35, 35);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Inspection Summary', margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const summary = inspection.summary as Record<string, number>;
  doc.text(`Views Captured: ${summary.totalViews || 0}`, margin, y); y += 5;
  doc.text(`Fields Extracted: ${summary.totalFields || 0}`, margin, y); y += 5;
  doc.text(`Evidence Nodes: ${summary.totalEvidence || 0}`, margin, y); y += 5;
  doc.text(`Issues Detected: ${summary.totalIssues || 0}`, margin, y); y += 5;
  doc.text(`Low Confidence Items: ${summary.lowConfidenceCount || 0}`, margin, y); y += 5;
  doc.text(`Cross-View Conflicts: ${summary.conflictCount || 0}`, margin, y); y += 5;
  doc.text(`Missing Declarations: ${summary.missingCount || 0}`, margin, y); y += 5;
  doc.text(`Average Confidence: ${summary.avgConfidence || 0}%`, margin, y); y += 10;

  if (y > pageHeight - 60) { doc.addPage(); y = 20; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Extracted Fields', margin, y);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const fieldsByView = new Map<string, typeof inspection.fields>();
  for (const field of inspection.fields) {
    const key = field.viewLabel;
    if (!fieldsByView.has(key)) fieldsByView.set(key, []);
    fieldsByView.get(key)!.push(field);
  }

  for (const [viewLabel, fields] of fieldsByView) {
    if (y > pageHeight - 30) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(`${VIEW_LABELS_DISPLAY[viewLabel as keyof typeof VIEW_LABELS_DISPLAY] || viewLabel}:`, margin, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const field of fields) {
      if (y > pageHeight - 15) { doc.addPage(); y = 20; }
      const label = FIELD_LABELS[field.fieldName] || field.fieldName;
      const val = field.fieldValue || 'N/A';
      const conf = `${field.confidence}%`;
      doc.text(`  ${label}: ${val} (Confidence: ${conf})`, margin, y);
      y += 5;
    }
    y += 3;
  }

  if (inspection.issues.length > 0) {
    if (y > pageHeight - 40) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Detected Issues', margin, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const issue of inspection.issues) {
      if (y > pageHeight - 20) { doc.addPage(); y = 20; }
      doc.setFont('helvetica', 'bold');
      doc.text(`[${issue.severity.toUpperCase()}] ${issue.issueType.replace(/_/g, ' ')}`, margin, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(issue.description, pageWidth - 2 * margin);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 3;
    }
  }

  if (inspection.reviews.length > 0) {
    if (y > pageHeight - 30) { doc.addPage(); y = 20; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Human Review Decisions', margin, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    for (const review of inspection.reviews) {
      if (y > pageHeight - 20) { doc.addPage(); y = 20; }
      doc.text(`Reviewer: ${review.reviewerName} | Decision: ${review.decision}`, margin, y); y += 5;
      if (review.correctedValue) { doc.text(`  Corrected value: ${review.correctedValue}`, margin, y); y += 5; }
      if (review.comment) { doc.text(`  Comment: ${review.comment}`, margin, y); y += 5; }
    }
  }

  if (y > pageHeight - 30) { doc.addPage(); y = 20; }
  y += 10;
  doc.setDrawColor(200);
  doc.line(margin, y, pageWidth - margin, y);
  y += 7;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text('This report was generated by the Evidence-Driven Digital Inspection Platform.', margin, y); y += 4;
  doc.text('Every compliance decision is traceable to visual evidence captured from the product.', margin, y); y += 4;
  doc.text(`Report generated: ${new Date().toLocaleString()}`, margin, y);

  doc.save(`compliance-report-${inspection.passportId}.pdf`);
}
