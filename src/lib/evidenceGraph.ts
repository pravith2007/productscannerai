import type {
  ExtractedField,
  EvidenceNode,
  InspectionIssue,
  ComplianceRule,
  ViewLabel,
  EvidenceStatus,
  ValidationResult,
  ConsistencyConflict,
} from './types';
import { FIELD_LABELS } from './types';

export function buildEvidenceGraph(
  fields: ExtractedField[],
  rules: ComplianceRule[],
  conflicts: ConsistencyConflict[],
): { evidence: EvidenceNode[]; issues: InspectionIssue[] } {
  const evidence: EvidenceNode[] = [];
  const issues: InspectionIssue[] = [];
  const conflictFieldNames = new Set(conflicts.map((c) => c.fieldName));

  const fieldsByRule = new Map<string, ExtractedField[]>();
  for (const rule of rules) {
    const matchingFields = fields.filter((f) => rule.requiredFields.includes(f.fieldName));
    fieldsByRule.set(rule.id, matchingFields);
  }

  for (const rule of rules) {
    const requiredFields = rule.requiredFields;
    if (requiredFields.length === 0) continue;

    for (const reqFieldName of requiredFields) {
      const matchingFields = fields.filter((f) => f.fieldName === reqFieldName);

      if (matchingFields.length === 0) {
        const status: EvidenceStatus = 'not_detected';
        const result: ValidationResult = 'fail';
        evidence.push({
          id: `${rule.id}-${reqFieldName}-missing`,
          ruleId: rule.id,
          ruleDescription: rule.description,
          fieldName: reqFieldName,
          fieldValue: null,
          viewLabel: 'front',
          bbox: null,
          ocrConfidence: 0,
          validationResult: result,
          validationMessage: `Required field "${FIELD_LABELS[reqFieldName] || reqFieldName}" was not detected on any view of the package.`,
          status,
        });

        if (rule.severity !== 'low') {
          issues.push({
            issueType: 'missing_field',
            severity: rule.severity,
            fieldName: reqFieldName,
            ruleId: rule.id,
            description: `Required declaration "${FIELD_LABELS[reqFieldName] || reqFieldName}" not found on any package view. Rule: ${rule.name}.`,
            details: { ruleName: rule.name, ruleDescription: rule.description, requiredField: reqFieldName },
            status: 'open',
          });
        }
      } else {
        for (const field of matchingFields) {
          const isConflicted = conflictFieldNames.has(field.fieldName);
          let status: EvidenceStatus = 'verified';
          let result: ValidationResult = 'pass';
          let message = `Field "${FIELD_LABELS[field.fieldName] || field.fieldName}" detected on ${field.viewLabel} view with ${field.confidence}% confidence.`;

          if (isConflicted) {
            status = 'cross_view';
            result = 'warning';
            message = `Field "${FIELD_LABELS[field.fieldName] || field.fieldName}" detected on ${field.viewLabel} but conflicts with values on other views.`;
          } else if (field.confidence < 60) {
            status = 'review';
            result = 'warning';
            message = `Field "${FIELD_LABELS[field.fieldName] || field.fieldName}" detected on ${field.viewLabel} with low confidence (${field.confidence}%). Requires manual verification.`;
          } else if (field.confidence < 80) {
            status = 'review';
            result = 'warning';
            message = `Field "${FIELD_LABELS[field.fieldName] || field.fieldName}" detected on ${field.viewLabel} with moderate confidence (${field.confidence}%). Review recommended.`;
          }

          evidence.push({
            id: `${rule.id}-${field.fieldName}-${field.viewLabel}-${evidence.length}`,
            ruleId: rule.id,
            ruleDescription: rule.description,
            fieldName: field.fieldName,
            fieldValue: field.fieldValue,
            viewLabel: field.viewLabel,
            bbox: field.bbox,
            ocrConfidence: field.ocrConfidence,
            validationResult: result,
            validationMessage: message,
            status,
          });

          if (field.confidence < 60 && !isConflicted) {
            issues.push({
              issueType: 'low_confidence',
              severity: 'medium',
              fieldName: field.fieldName,
              ruleId: rule.id,
              description: `Low confidence (${field.confidence}%) for "${FIELD_LABELS[field.fieldName] || field.fieldName}" on ${field.viewLabel} view. Manual review required.`,
              details: { confidence: field.confidence, viewLabel: field.viewLabel, value: field.fieldValue },
              status: 'open',
            });
          }
        }
      }
    }
  }

  for (const conflict of conflicts) {
    const rule = rules.find((r) => r.id === 'R013');
    evidence.push({
      id: `conflict-${conflict.fieldName}-${evidence.length}`,
      ruleId: 'R013',
      ruleDescription: rule?.description || 'Cross-view consistency',
      fieldName: conflict.fieldName,
      fieldValue: conflict.values.map((v) => `${v.viewLabel}: ${v.value}`).join(' | '),
      viewLabel: conflict.values[0].viewLabel,
      bbox: conflict.values[0].bbox,
      ocrConfidence: conflict.values[0].confidence,
      validationResult: 'warning',
      validationMessage: conflict.description,
      status: 'cross_view',
    });

    issues.push({
      issueType: 'cross_view_conflict',
      severity: 'high',
      fieldName: conflict.fieldName,
      ruleId: 'R013',
      description: conflict.description,
      details: {
        values: conflict.values,
        recommendation: conflict.recommendation,
      },
      status: 'open',
    });
  }

  return { evidence, issues };
}

export function calculateComplianceScore(
  evidence: EvidenceNode[],
  issues: InspectionIssue[],
  totalRules: number,
): number {
  if (totalRules === 0) return 0;

  const passedEvidence = evidence.filter((e) => e.validationResult === 'pass').length;
  const warningEvidence = evidence.filter((e) => e.validationResult === 'warning').length;
  const failedEvidence = evidence.filter((e) => e.validationResult === 'fail').length;
  const total = evidence.length;
  if (total === 0) return 0;

  const passRate = (passedEvidence / total) * 100;
  const warningPenalty = (warningEvidence / total) * 15;
  const failPenalty = (failedEvidence / total) * 25;

  const criticalIssues = issues.filter((i) => i.severity === 'critical').length;
  const highIssues = issues.filter((i) => i.severity === 'high').length;

  const issuePenalty = criticalIssues * 8 + highIssues * 3;

  const score = Math.max(0, Math.min(100, Math.round(passRate - warningPenalty - failPenalty - issuePenalty)));
  return score;
}
