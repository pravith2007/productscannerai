export type ViewLabel = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export type InspectionStatus = 'in_progress' | 'analyzing' | 'pending_review' | 'completed' | 'failed';

export type FieldStatus = 'detected' | 'verified' | 'rejected' | 'review' | 'not_detected';

export type ValidationResult = 'pass' | 'fail' | 'warning' | 'pending' | 'not_applicable';

export type IssueType = 'missing_field' | 'cross_view_conflict' | 'low_confidence' | 'rule_violation' | 'image_quality';

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export type IssueStatus = 'open' | 'under_review' | 'resolved' | 'verified';

export type ReviewDecision = 'accept' | 'reject' | 'edit' | 'verify' | 'add_evidence';

export type CorrectiveStatus = 'open' | 'under_review' | 'corrected' | 'verified';

export type EvidenceStatus = 'verified' | 'review' | 'issue' | 'cross_view' | 'not_detected' | 'not_applicable';

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  bbox: BoundingBox;
}

export interface OcrResult {
  text: string;
  words: OcrWord[];
  confidence: number;
}

export interface ExtractedField {
  id?: string;
  fieldName: string;
  fieldValue: string | null;
  confidence: number;
  ocrConfidence: number;
  bbox: BoundingBox | null;
  viewLabel: ViewLabel;
  viewId?: string;
  status: FieldStatus;
  source: 'ai' | 'human';
}

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  requiredFields: string[];
  validationLogic: string;
  severity: IssueSeverity;
}

export interface RuleSet {
  id: string;
  ruleSetId: string;
  version: string;
  name: string;
  description: string;
  rules: ComplianceRule[];
  isActive: boolean;
  createdAt: string;
}

export interface EvidenceNode {
  id: string;
  ruleId: string;
  ruleDescription: string;
  fieldName: string;
  fieldValue: string | null;
  viewLabel: ViewLabel;
  bbox: BoundingBox | null;
  ocrConfidence: number;
  validationResult: ValidationResult;
  validationMessage: string;
  status: EvidenceStatus;
}

export interface InspectionIssue {
  id?: string;
  inspectionId?: string;
  issueType: IssueType;
  severity: IssueSeverity;
  fieldName: string;
  ruleId: string | null;
  description: string;
  details: Record<string, unknown>;
  status: IssueStatus;
}

export interface HumanReview {
  id?: string;
  inspectionId?: string;
  fieldId?: string;
  issueId?: string;
  reviewerName: string;
  decision: ReviewDecision;
  originalValue: string | null;
  correctedValue: string | null;
  comment: string;
}

export interface CorrectiveAction {
  id?: string;
  inspectionId?: string;
  issueId?: string;
  title: string;
  description: string;
  status: CorrectiveStatus;
  assignedTo: string | null;
}

export interface InspectionView {
  id?: string;
  inspectionId?: string;
  viewLabel: ViewLabel;
  imageUrl: string;
  imageQuality: number;
  ocrRawText: string;
  processingStatus: string;
  processingLog: TimelineEvent[];
}

export interface TimelineEvent {
  step: string;
  label: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  timestamp: string;
  message?: string;
  duration?: number;
}

export interface Inspection {
  id?: string;
  passportId: string;
  productName: string | null;
  productCategory: string | null;
  overallScore: number;
  status: InspectionStatus;
  ruleSetId: string | null;
  ruleVersion: string | null;
  engineVersion: string;
  summary: Record<string, unknown>;
  reviewerName: string | null;
  views: InspectionView[];
  fields: ExtractedField[];
  evidence: EvidenceNode[];
  issues: InspectionIssue[];
  reviews: HumanReview[];
  correctiveActions: CorrectiveAction[];
  timeline: TimelineEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface HeatmapRegion {
  viewLabel: ViewLabel;
  bbox: BoundingBox;
  fieldName: string;
  status: EvidenceStatus;
  confidence: number;
  evidenceId: string;
}

export interface ConsistencyConflict {
  fieldName: string;
  values: Array<{
    viewLabel: ViewLabel;
    value: string;
    confidence: number;
    bbox: BoundingBox | null;
  }>;
  description: string;
  recommendation: string;
}

export const VIEW_LABELS: ViewLabel[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

export const VIEW_LABELS_DISPLAY: Record<ViewLabel, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

export const FIELD_DEFINITIONS = [
  { name: 'product_name', label: 'Product Name', category: 'identity' },
  { name: 'mrp', label: 'MRP (Maximum Retail Price)', category: 'pricing' },
  { name: 'net_quantity', label: 'Net Quantity', category: 'quantity' },
  { name: 'manufacturing_date', label: 'Manufacturing Date', category: 'dates' },
  { name: 'expiry_date', label: 'Expiry Date', category: 'dates' },
  { name: 'batch_lot', label: 'Batch / Lot Number', category: 'traceability' },
  { name: 'manufacturer', label: 'Manufacturer Name', category: 'identity' },
  { name: 'manufacturer_address', label: 'Manufacturer Address', category: 'identity' },
  { name: 'importer', label: 'Importer', category: 'identity' },
  { name: 'country_of_origin', label: 'Country of Origin', category: 'origin' },
  { name: 'consumer_care', label: 'Consumer Care Contact', category: 'contact' },
  { name: 'ingredients', label: 'Ingredients', category: 'composition' },
  { name: 'nutritional_info', label: 'Nutritional Information', category: 'composition' },
  { name: 'fssai_license', label: 'FSSAI License Number', category: 'regulatory' },
  { name: 'veg_nonveg', label: 'Veg / Non-Veg Indicator', category: 'dietary' },
  { name: 'storage_instructions', label: 'Storage Instructions', category: 'handling' },
  { name: 'usage_instructions', label: 'Usage Instructions', category: 'handling' },
  { name: 'warnings', label: 'Warnings / Cautions', category: 'safety' },
] as const;

export const FIELD_LABELS: Record<string, string> = Object.fromEntries(
  FIELD_DEFINITIONS.map((f) => [f.name, f.label])
);

export const FIELD_CATEGORIES: Record<string, string> = Object.fromEntries(
  FIELD_DEFINITIONS.map((f) => [f.name, f.category])
);
