import type { ComplianceRule, RuleSet } from './types';

export const DEFAULT_RULES: ComplianceRule[] = [
  {
    id: 'R001',
    name: 'MRP Declaration',
    description: 'Maximum Retail Price must be clearly printed on the package.',
    requiredFields: ['mrp'],
    validationLogic: 'mrp_required',
    severity: 'critical',
  },
  {
    id: 'R002',
    name: 'Net Quantity Declaration',
    description: 'Net weight, volume, or quantity must be declared on the package.',
    requiredFields: ['net_quantity'],
    validationLogic: 'net_quantity_required',
    severity: 'critical',
  },
  {
    id: 'R003',
    name: 'Product Identity',
    description: 'Product name must be clearly visible on the front of the package.',
    requiredFields: ['product_name'],
    validationLogic: 'product_name_required',
    severity: 'high',
  },
  {
    id: 'R004',
    name: 'Manufacturer Declaration',
    description: 'Manufacturer name and address must be declared on the package.',
    requiredFields: ['manufacturer', 'manufacturer_address'],
    validationLogic: 'manufacturer_required',
    severity: 'high',
  },
  {
    id: 'R005',
    name: 'Batch/Lot Traceability',
    description: 'Batch or lot number must be printed for traceability.',
    requiredFields: ['batch_lot'],
    validationLogic: 'batch_lot_required',
    severity: 'high',
  },
  {
    id: 'R006',
    name: 'Date Marking',
    description: 'Manufacturing date and expiry date must be printed on the package.',
    requiredFields: ['manufacturing_date', 'expiry_date'],
    validationLogic: 'dates_required',
    severity: 'high',
  },
  {
    id: 'R007',
    name: 'Country of Origin',
    description: 'Country of origin must be declared on imported products.',
    requiredFields: ['country_of_origin'],
    validationLogic: 'origin_required',
    severity: 'medium',
  },
  {
    id: 'R008',
    name: 'Consumer Care Contact',
    description: 'Consumer care contact information should be provided for complaints.',
    requiredFields: ['consumer_care'],
    validationLogic: 'consumer_care_recommended',
    severity: 'medium',
  },
  {
    id: 'R009',
    name: 'FSSAI License (Food Products)',
    description: 'FSSAI license number must be displayed on food product packaging.',
    requiredFields: ['fssai_license'],
    validationLogic: 'fssai_required_if_food',
    severity: 'critical',
  },
  {
    id: 'R010',
    name: 'Veg/Non-Veg Indicator',
    description: 'Vegetarian or non-vegetarian indicator must be displayed on food products.',
    requiredFields: ['veg_nonveg'],
    validationLogic: 'veg_indicator_required_if_food',
    severity: 'medium',
  },
  {
    id: 'R011',
    name: 'Importer Declaration (Imported Products)',
    description: 'Importer name must be declared on imported product packaging.',
    requiredFields: ['importer'],
    validationLogic: 'importer_required_if_imported',
    severity: 'high',
  },
  {
    id: 'R012',
    name: 'Storage Instructions',
    description: 'Storage instructions should be provided where applicable.',
    requiredFields: ['storage_instructions'],
    validationLogic: 'storage_recommended',
    severity: 'low',
  },
  {
    id: 'R013',
    name: 'Cross-View Consistency',
    description: 'All declarations must be consistent across all views of the package.',
    requiredFields: [],
    validationLogic: 'cross_view_consistency',
    severity: 'high',
  },
];

export const DEFAULT_RULE_SET: RuleSet = {
  id: '',
  ruleSetId: 'FSSAI-2026',
  version: '1.0.0',
  name: 'FSSAI Packaging Compliance Rules',
  description: 'Standard compliance rules for food product packaging declarations based on FSSAI regulations.',
  rules: DEFAULT_RULES,
  isActive: true,
  createdAt: new Date().toISOString(),
};

export function getActiveRuleSet(): RuleSet {
  return DEFAULT_RULE_SET;
}
