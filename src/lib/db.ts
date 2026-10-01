import { supabase } from './supabase';
import type { Inspection, TimelineEvent, InspectionView, ExtractedField, EvidenceNode, InspectionIssue, HumanReview, CorrectiveAction } from './types';

export async function saveInspection(inspection: Inspection): Promise<string | null> {
  const { data: insData, error: insError } = await supabase
    .from('inspections')
    .insert({
      passport_id: inspection.passportId,
      product_name: inspection.productName,
      product_category: inspection.productCategory,
      overall_score: inspection.overallScore,
      status: inspection.status,
      rule_set_id: inspection.ruleSetId,
      rule_version: inspection.ruleVersion,
      engine_version: inspection.engineVersion,
      summary: inspection.summary,
      reviewer_name: inspection.reviewerName,
      timeline: inspection.timeline,
    })
    .select('id')
    .single();

  if (insError || !insData) {
    console.error('Failed to save inspection:', insError);
    return null;
  }

  const inspectionId = insData.id;

  for (const view of inspection.views) {
    const { data: viewData, error: viewError } = await supabase
      .from('inspection_views')
      .insert({
        inspection_id: inspectionId,
        view_label: view.viewLabel,
        image_url: view.imageUrl,
        image_quality: view.imageQuality,
        ocr_raw_text: view.ocrRawText,
        processing_status: view.processingStatus,
        processing_log: view.processingLog,
      })
      .select('id')
      .single();

    if (viewError || !viewData) continue;
    const viewId = viewData.id;

    const viewFields = inspection.fields.filter((f) => f.viewLabel === view.viewLabel);
    for (const field of viewFields) {
      const { data: fieldData } = await supabase
        .from('inspection_fields')
        .insert({
          inspection_id: inspectionId,
          view_id: viewId,
          field_name: field.fieldName,
          field_value: field.fieldValue,
          confidence: field.confidence,
          ocr_confidence: field.ocrConfidence,
          bbox: field.bbox,
          status: field.status,
          source: field.source,
        })
        .select('id')
        .single();

      if (fieldData) {
        field.id = fieldData.id;
        field.viewId = viewId;
      }
    }
  }

  for (const ev of inspection.evidence) {
    const field = inspection.fields.find(
      (f) => f.fieldName === ev.fieldName && f.viewLabel === ev.viewLabel,
    );
    await supabase.from('inspection_evidence').insert({
      inspection_id: inspectionId,
      rule_id: ev.ruleId,
      rule_description: ev.ruleDescription,
      field_id: field?.id || null,
      view_id: field?.viewId || null,
      field_name: ev.fieldName,
      bbox: ev.bbox,
      ocr_confidence: ev.ocrConfidence,
      validation_result: ev.validationResult,
      validation_message: ev.validationMessage,
    });
  }

  for (const issue of inspection.issues) {
    const { data: issueData } = await supabase
      .from('inspection_issues')
      .insert({
        inspection_id: inspectionId,
        issue_type: issue.issueType,
        severity: issue.severity,
        field_name: issue.fieldName,
        rule_id: issue.ruleId,
        description: issue.description,
        details: issue.details,
        status: issue.status,
      })
      .select('id')
      .single();
    if (issueData) issue.id = issueData.id;
  }

  return inspectionId;
}

export async function loadInspections(): Promise<Inspection[]> {
  const { data: inspections, error } = await supabase
    .from('inspections')
    .select('*')
    .order('created_at', { ascending: false });

  if (error || !inspections) return [];

  const results: Inspection[] = [];
  for (const ins of inspections) {
    const [viewsRes, fieldsRes, evidenceRes, issuesRes, reviewsRes, actionsRes] = await Promise.all([
      supabase.from('inspection_views').select('*').eq('inspection_id', ins.id),
      supabase.from('inspection_fields').select('*').eq('inspection_id', ins.id),
      supabase.from('inspection_evidence').select('*').eq('inspection_id', ins.id),
      supabase.from('inspection_issues').select('*').eq('inspection_id', ins.id),
      supabase.from('human_reviews').select('*').eq('inspection_id', ins.id),
      supabase.from('corrective_actions').select('*').eq('inspection_id', ins.id),
    ]);

    const views: InspectionView[] = (viewsRes.data || []).map((v: Record<string, unknown>) => ({
      id: v.id as string,
      inspectionId: v.inspection_id as string,
      viewLabel: v.view_label as InspectionView['viewLabel'],
      imageUrl: v.image_url as string,
      imageQuality: v.image_quality as number,
      ocrRawText: v.ocr_raw_text as string,
      processingStatus: v.processing_status as string,
      processingLog: (v.processing_log as TimelineEvent[]) || [],
    }));

    const fields: ExtractedField[] = (fieldsRes.data || []).map((f: Record<string, unknown>) => ({
      id: f.id as string,
      viewId: f.view_id as string,
      fieldName: f.field_name as string,
      fieldValue: f.field_value as string | null,
      confidence: f.confidence as number,
      ocrConfidence: f.ocr_confidence as number,
      bbox: f.bbox as ExtractedField['bbox'],
      viewLabel: views.find((v) => v.id === f.view_id)?.viewLabel || 'front',
      status: f.status as ExtractedField['status'],
      source: f.source as ExtractedField['source'],
    }));

    const evidence: EvidenceNode[] = (evidenceRes.data || []).map((e: Record<string, unknown>, idx: number) => ({
      id: e.id as string || `ev-${idx}`,
      ruleId: e.rule_id as string,
      ruleDescription: e.rule_description as string,
      fieldName: ((e as Record<string, unknown>).field_name as string) || (fields.find((f) => f.id === e.field_id)?.fieldName || ''),
      fieldValue: fields.find((f) => f.id === e.field_id)?.fieldValue || null,
      viewLabel: views.find((v) => v.id === e.view_id)?.viewLabel || 'front',
      bbox: e.bbox as EvidenceNode['bbox'],
      ocrConfidence: e.ocr_confidence as number,
      validationResult: e.validation_result as EvidenceNode['validationResult'],
      validationMessage: e.validation_message as string,
      status: mapValidationToStatus(e.validation_result as string),
    }));

    const issues: InspectionIssue[] = (issuesRes.data || []).map((i: Record<string, unknown>) => ({
      id: i.id as string,
      inspectionId: i.inspection_id as string,
      issueType: i.issue_type as InspectionIssue['issueType'],
      severity: i.severity as InspectionIssue['severity'],
      fieldName: i.field_name as string,
      ruleId: i.rule_id as string | null,
      description: i.description as string,
      details: i.details as Record<string, unknown>,
      status: i.status as InspectionIssue['status'],
    }));

    const reviews: HumanReview[] = (reviewsRes.data || []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      inspectionId: r.inspection_id as string,
      fieldId: r.field_id as string,
      issueId: r.issue_id as string,
      reviewerName: r.reviewer_name as string,
      decision: r.decision as HumanReview['decision'],
      originalValue: r.original_value as string | null,
      correctedValue: r.corrected_value as string | null,
      comment: r.comment as string,
    }));

    const correctiveActions: CorrectiveAction[] = (actionsRes.data || []).map((a: Record<string, unknown>) => ({
      id: a.id as string,
      inspectionId: a.inspection_id as string,
      issueId: a.issue_id as string,
      title: a.title as string,
      description: a.description as string,
      status: a.status as CorrectiveAction['status'],
      assignedTo: a.assigned_to as string | null,
    }));

    results.push({
      id: ins.id,
      passportId: ins.passport_id,
      productName: ins.product_name,
      productCategory: ins.product_category,
      overallScore: ins.overall_score,
      status: ins.status,
      ruleSetId: ins.rule_set_id,
      ruleVersion: ins.rule_version,
      engineVersion: ins.engine_version,
      summary: ins.summary || {},
      reviewerName: ins.reviewer_name,
      views,
      fields,
      evidence,
      issues,
      reviews,
      correctiveActions,
      timeline: (ins.timeline as TimelineEvent[]) || [],
      createdAt: ins.created_at,
      updatedAt: ins.updated_at,
    });
  }

  return results;
}

function mapValidationToStatus(result: string): EvidenceNode['status'] {
  switch (result) {
    case 'pass': return 'verified';
    case 'warning': return 'review';
    case 'fail': return 'issue';
    default: return 'review';
  }
}

export async function saveHumanReview(
  inspectionId: string,
  review: HumanReview,
): Promise<void> {
  await supabase.from('human_reviews').insert({
    inspection_id: inspectionId,
    field_id: review.fieldId || null,
    issue_id: review.issueId || null,
    reviewer_name: review.reviewerName,
    decision: review.decision,
    original_value: review.originalValue,
    corrected_value: review.correctedValue,
    comment: review.comment,
  });

  if (review.decision === 'edit' && review.fieldId && review.correctedValue) {
    await supabase.from('inspection_fields')
      .update({ field_value: review.correctedValue, status: 'verified', source: 'human' })
      .eq('id', review.fieldId);
  } else if (review.decision === 'accept' && review.fieldId) {
    await supabase.from('inspection_fields')
      .update({ status: 'verified' })
      .eq('id', review.fieldId);
  } else if (review.decision === 'reject' && review.fieldId) {
    await supabase.from('inspection_fields')
      .update({ status: 'rejected' })
      .eq('id', review.fieldId);
  }

  if (review.issueId) {
    await supabase.from('inspection_issues')
      .update({ status: 'resolved' })
      .eq('id', review.issueId);
  }

  await supabase.from('inspections')
    .update({ status: 'completed', reviewer_name: review.reviewerName, updated_at: new Date().toISOString() })
    .eq('id', inspectionId);
}

export async function saveCorrectiveAction(
  inspectionId: string,
  action: CorrectiveAction,
): Promise<void> {
  await supabase.from('corrective_actions').insert({
    inspection_id: inspectionId,
    issue_id: action.issueId || null,
    title: action.title,
    description: action.description,
    status: action.status,
    assigned_to: action.assignedTo,
  });
}

export async function updateCorrectiveAction(
  actionId: string,
  status: string,
): Promise<void> {
  await supabase.from('corrective_actions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', actionId);
}

export async function updateInspectionField(
  fieldId: string,
  value: string,
): Promise<void> {
  await supabase.from('inspection_fields')
    .update({ field_value: value, status: 'verified', source: 'human' })
    .eq('id', fieldId);
}
