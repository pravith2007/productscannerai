import type { ExtractedField, ConsistencyConflict, ViewLabel } from './types';

const COMPARABLE_FIELDS = [
  'mrp',
  'net_quantity',
  'product_name',
  'manufacturing_date',
  'expiry_date',
  'batch_lot',
  'manufacturer',
  'importer',
  'country_of_origin',
];

function normalizeValue(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();
}

function isNumericField(fieldName: string): boolean {
  return ['mrp', 'net_quantity'].includes(fieldName);
}

function extractNumeric(value: string): number | null {
  const match = value.match(/[\d,.]+/);
  if (!match) return null;
  return parseFloat(match[0].replace(/,/g, ''));
}

export function detectCrossViewConflicts(fields: ExtractedField[]): ConsistencyConflict[] {
  const conflicts: ConsistencyConflict[] = [];

  for (const fieldName of COMPARABLE_FIELDS) {
    const fieldValues = fields.filter((f) => f.fieldName === fieldName && f.fieldValue);
    if (fieldValues.length < 2) continue;

    const byView = new Map<ViewLabel, ExtractedField>();
    for (const f of fieldValues) {
      if (!byView.has(f.viewLabel)) {
        byView.set(f.viewLabel, f);
      }
    }

    if (byView.size < 2) continue;

    const views = Array.from(byView.entries());

    if (isNumericField(fieldName)) {
      const numericValues = new Map<string, number>();
      let hasDifference = false;
      const valueMap = new Map<string, number>();

      for (const [viewLabel, field] of views) {
        const num = extractNumeric(field.fieldValue!);
        if (num !== null) {
          numericValues.set(viewLabel, num);
          valueMap.set(field.fieldValue!, num);
        }
      }

      if (numericValues.size >= 2) {
        const nums = Array.from(numericValues.values());
        const uniqueNums = new Set(nums.map((n) => Math.round(n * 100) / 100));
        if (uniqueNums.size > 1) {
          hasDifference = true;
        }
      }

      if (hasDifference) {
        conflicts.push({
          fieldName,
          values: views.map(([viewLabel, field]) => ({
            viewLabel,
            value: field.fieldValue!,
            confidence: field.confidence,
            bbox: field.bbox,
          })),
          description: `Potential cross-view declaration inconsistency detected for ${fieldName}. Values differ across captured views.`,
          recommendation: 'Verify the printed declaration on the physical package against all views. Confirm the correct value through manual inspection.',
        });
      }
    } else {
      const normalizedValues = new Map<string, string>();
      for (const [viewLabel, field] of views) {
        normalizedValues.set(viewLabel, normalizeValue(field.fieldValue!));
      }

      const uniqueValues = new Set(normalizedValues.values());
      if (uniqueValues.size > 1) {
        const values = Array.from(normalizedValues.values());
        const areSimilar = values.some((v1, i1) =>
          values.some((v2, i2) => {
            if (i1 >= i2) return false;
            const longer = v1.length >= v2.length ? v1 : v2;
            const shorter = v1.length >= v2.length ? v2 : v1;
            return longer.includes(shorter) && shorter.length > 3;
          })
        );

        if (!areSimilar) {
          conflicts.push({
            fieldName,
            values: views.map(([viewLabel, field]) => ({
              viewLabel,
              value: field.fieldValue!,
              confidence: field.confidence,
              bbox: field.bbox,
            })),
            description: `Potential cross-view declaration inconsistency detected for ${fieldName}. Text declarations differ across captured views.`,
            recommendation: 'Verify the printed text on the physical package. OCR errors may cause false differences - check the image evidence regions.',
          });
        }
      }
    }
  }

  return conflicts;
}
