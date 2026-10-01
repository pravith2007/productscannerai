import type {
  Inspection,
  InspectionView,
  ExtractedField,
  EvidenceNode,
  InspectionIssue,
  TimelineEvent,
  ViewLabel,
  ConsistencyConflict,
} from './types';
import { runOcr, getImageQualityScore } from './ocr';
import { extractFields } from './fieldExtraction';
import { getActiveRuleSet } from './ruleEngine';
import { detectCrossViewConflicts } from './consistencyEngine';
import { buildEvidenceGraph, calculateComplianceScore } from './evidenceGraph';
import { FIELD_LABELS } from './types';

function now(): string {
  return new Date().toISOString();
}

function makeEvent(step: string, label: string, status: TimelineEvent['status'], message?: string): TimelineEvent {
  return { step, label, status, timestamp: now(), message };
}

export function generatePassportId(): string {
  const year = new Date().getFullYear();
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `MTR-${year}-${suffix}`;
}

export async function processView(
  viewLabel: ViewLabel,
  imageUrl: string,
  onTimeline?: (events: TimelineEvent[]) => void,
): Promise<{ view: InspectionView; fields: ExtractedField[]; timeline: TimelineEvent[] }> {
  const timeline: TimelineEvent[] = [];
  const addEvent = (e: TimelineEvent) => {
    timeline.push(e);
    onTimeline?.(timeline);
  };

  addEvent(makeEvent(`view_${viewLabel}_received`, `${viewLabel.toUpperCase()} Image Received`, 'in_progress'));
  await new Promise((r) => setTimeout(r, 100));
  addEvent(makeEvent(`view_${viewLabel}_received`, `${viewLabel.toUpperCase()} Image Received`, 'completed'));

  addEvent(makeEvent(`view_${viewLabel}_quality`, `${viewLabel.toUpperCase()} Image Quality Check`, 'in_progress'));
  const quality = await getImageQualityScore(imageUrl);
  addEvent(makeEvent(`view_${viewLabel}_quality`, `${viewLabel.toUpperCase()} Image Quality Check`, 'completed', `Quality score: ${quality}%`));

  if (quality < 30) {
    addEvent(makeEvent(`view_${viewLabel}_ocr`, `${viewLabel.toUpperCase()} OCR`, 'skipped', 'Image quality too low for reliable OCR'));
    const view: InspectionView = {
      viewLabel,
      imageUrl,
      imageQuality: quality,
      ocrRawText: '',
      processingStatus: 'skipped',
      processingLog: [...timeline],
    };
    return { view, fields: [], timeline };
  }

  addEvent(makeEvent(`view_${viewLabel}_ocr`, `${viewLabel.toUpperCase()} OCR Processing`, 'in_progress'));
  const ocrResult = await runOcr(imageUrl);
  addEvent(makeEvent(`view_${viewLabel}_ocr`, `${viewLabel.toUpperCase()} OCR Processing`, 'completed', `${ocrResult.words.length} words detected, avg confidence: ${Math.round(ocrResult.confidence)}%`));

  addEvent(makeEvent(`view_${viewLabel}_extraction`, `${viewLabel.toUpperCase()} Field Extraction`, 'in_progress'));
  const fields = extractFields(ocrResult, viewLabel);
  addEvent(makeEvent(`view_${viewLabel}_extraction`, `${viewLabel.toUpperCase()} Field Extraction`, 'completed', `${fields.length} fields extracted`));

  const view: InspectionView = {
    viewLabel,
    imageUrl,
    imageQuality: quality,
    ocrRawText: ocrResult.text,
    processingStatus: 'completed',
    processingLog: [...timeline],
  };

  return { view, fields, timeline };
}

export async function runFullInspection(
  images: Array<{ viewLabel: ViewLabel; imageUrl: string }>,
  onTimeline?: (events: TimelineEvent[]) => void,
): Promise<Inspection> {
  const allTimeline: TimelineEvent[] = [];
  const updateTimeline = (events: TimelineEvent[]) => {
    allTimeline.length = 0;
    allTimeline.push(...events);
    onTimeline?.(allTimeline);
  };

  const addGlobalEvent = (e: TimelineEvent) => {
    allTimeline.push(e);
    onTimeline?.(allTimeline);
  };

  addGlobalEvent(makeEvent('pipeline_start', 'Inspection Pipeline Started', 'completed'));

  const ruleSet = getActiveRuleSet();
  const passportId = generatePassportId();

  const views: InspectionView[] = [];
  const allFields: ExtractedField[] = [];

  for (const img of images) {
    const { view, fields, timeline } = await processView(img.viewLabel, img.imageUrl, (tl) => {
      const filtered = allTimeline.filter((t) => !t.step.startsWith(`view_${img.viewLabel}`));
      allTimeline.length = 0;
      allTimeline.push(...filtered, ...tl);
      onTimeline?.(allTimeline);
    });
    views.push(view);
    allFields.push(...fields);
  }

  addGlobalEvent(makeEvent('field_extraction', 'Semantic Field Extraction', 'completed', `${allFields.length} total fields extracted across ${views.length} views`));

  addGlobalEvent(makeEvent('rule_validation', 'Rule Validation', 'in_progress'));
  await new Promise((r) => setTimeout(r, 200));

  addGlobalEvent(makeEvent('cross_view_check', 'Cross-View Consistency Check', 'in_progress'));
  const conflicts: ConsistencyConflict[] = detectCrossViewConflicts(allFields);
  addGlobalEvent(makeEvent('cross_view_check', 'Cross-View Consistency Check', 'completed', conflicts.length > 0 ? `${conflicts.length} potential inconsistencies detected` : 'No inconsistencies detected'));

  const { evidence, issues } = buildEvidenceGraph(allFields, ruleSet.rules, conflicts);
  addGlobalEvent(makeEvent('rule_validation', 'Rule Validation', 'completed', `${evidence.length} evidence nodes, ${issues.length} issues`));

  addGlobalEvent(makeEvent('evidence_graph', 'Evidence Graph Construction', 'completed', `${evidence.length} evidence relationships built`));

  addGlobalEvent(makeEvent('risk_analysis', 'Risk Analysis & Confidence Scoring', 'in_progress'));
  const score = calculateComplianceScore(evidence, issues, ruleSet.rules.length);
  addGlobalEvent(makeEvent('risk_analysis', 'Risk Analysis & Confidence Scoring', 'completed', `Compliance score: ${score}/100`));

  const lowConfidenceCount = allFields.filter((f) => f.confidence < 60).length;
  const conflictCount = conflicts.length;
  const missingCount = issues.filter((i) => i.issueType === 'missing_field').length;

  const productName = allFields.find((f) => f.fieldName === 'product_name')?.fieldValue || null;

  const status = lowConfidenceCount > 0 || conflictCount > 0 ? 'pending_review' : 'completed';

  addGlobalEvent(makeEvent('human_review', 'Human Review', 'pending', status === 'pending_review' ? `${lowConfidenceCount + conflictCount} items require manual review` : 'No manual review required'));

  addGlobalEvent(makeEvent('report_generation', 'Report Generation', 'completed', `Digital Compliance Passport ${passportId} created`));

  const inspection: Inspection = {
    passportId,
    productName,
    productCategory: null,
    overallScore: score,
    status,
    ruleSetId: ruleSet.ruleSetId,
    ruleVersion: ruleSet.version,
    engineVersion: '1.0.0',
    summary: {
      totalViews: views.length,
      totalFields: allFields.length,
      totalEvidence: evidence.length,
      totalIssues: issues.length,
      lowConfidenceCount,
      conflictCount,
      missingCount,
      avgConfidence: allFields.length > 0 ? Math.round(allFields.reduce((s, f) => s + f.confidence, 0) / allFields.length) : 0,
    },
    reviewerName: null,
    views,
    fields: allFields,
    evidence,
    issues,
    reviews: [],
    correctiveActions: [],
    timeline: [...allTimeline],
    createdAt: now(),
    updatedAt: now(),
  };

  return inspection;
}
