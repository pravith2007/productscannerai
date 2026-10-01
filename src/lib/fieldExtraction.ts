import type { OcrResult, ExtractedField, ViewLabel, BoundingBox } from './types';

interface FieldPattern {
  fieldName: string;
  patterns: RegExp[];
  extract: (match: RegExpMatchArray, fullText: string) => string;
}

const FIELD_PATTERNS: FieldPattern[] = [
  {
    fieldName: 'mrp',
    patterns: [
      /(?:MRP|Maximum\s+Retail\s+Price|M\.?R\.?P\.?)\s*[:.]?\s*(?:Rs\.?|INR|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
      /(?:Rs\.?|INR|₹)\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:\/-)?\s*(?:MRP|Maximum\s+Retail\s+Price)?/i,
      /(?:MRP|Maximum\s+Retail\s+Price)\s*[:.]?\s*(?:Rs\.?|INR|₹)?\s*([0-9]+(?:\.[0-9]{1,2})?)/i,
    ],
    extract: (m) => `₹${m[1]}`,
  },
  {
    fieldName: 'net_quantity',
    patterns: [
      /(?:Net\s+(?:Weight|Quantity|Content|Volume)|Net\s*Wt\.?|N\.?W\.?)\s*[:.]?\s*([0-9]+(?:\.[0-9]+)?\s*(?:kg|g|gm|gram|l|ml|litre|liter|mg|pcs|pieces|count|tablets|capsules))/i,
      /([0-9]+(?:\.[0-9]+)?\s*(?:kg|g|gm|gram|l|ml|litre|liter|mg))\s*\(?(?:Net|N\.?W\.?)\)?/i,
      /\b([0-9]+(?:\.[0-9]+)?\s*(?:kg|g|gm|ml|l|litre|liter))\b/i,
    ],
    extract: (m) => m[1].trim(),
  },
  {
    fieldName: 'manufacturing_date',
    patterns: [
      /(?:Mfg\.?\s*Date|Mfg\.?|Manufacturing\s*Date|M\.?\s*Date|Date\s+of\s+Manufacturing)\s*[:.]?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s*[0-9]{2,4}|[0-9]{2,4}[-/][0-9]{1,2}[-/][0-9]{1,2})/i,
      /(?:Mfg\.?|Manufacturing)\s*[:.]?\s*([0-9]{1,2}[-/][A-Za-z]{3,9}[-/][0-9]{2,4})/i,
    ],
    extract: (m) => m[1].trim(),
  },
  {
    fieldName: 'expiry_date',
    patterns: [
      /(?:Exp\.?\s*Date|Exp\.?|Expiry\s*Date|Best\s+Before|Use\s+By|Date\s+of\s+Expiry|EXP)\s*[:.]?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}|[A-Za-z]{3,9}\s+[0-9]{1,2},?\s*[0-9]{2,4}|[0-9]{2,4}[-/][0-9]{1,2}[-/][0-9]{1,2})/i,
      /(?:Best\s+Before|Use\s+By)\s*[:.]?\s*([0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{2,4})/i,
    ],
    extract: (m) => m[1].trim(),
  },
  {
    fieldName: 'batch_lot',
    patterns: [
      /(?:Batch(?:\s*No\.?)?|Lot(?:\s*No\.?)?|Batch\s+ID|B\.?\s*No\.?)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-/]{2,20})/i,
      /(?:Batch|Lot)\s*[:.]?\s*([A-Z0-9][A-Z0-9\-/]{2,20})/i,
    ],
    extract: (m) => m[1].trim(),
  },
  {
    fieldName: 'fssai_license',
    patterns: [
      /(?:FSSAI|F\.?S\.?S\.?A\.?I\.?)\s*(?:License|Lic\.?|Reg\.?|Registration)?\s*[:.]?\s*(?:No\.?\s*)?([0-9]{14})/i,
      /\b(FSSAI)\s*[:.]?\s*([0-9]{14})\b/i,
    ],
    extract: (m) => m[2] ? m[2] : m[1],
  },
  {
    fieldName: 'country_of_origin',
    patterns: [
      /(?:Country\s+of\s+Origin|Origin|Made\s+in)\s*[:.]?\s*([A-Za-z][A-Za-z\s,]{2,30})/i,
    ],
    extract: (m) => m[1].trim(),
  },
  {
    fieldName: 'manufacturer',
    patterns: [
      /(?:Manufactured\s+by|Manufacturer|Mfd\.?\s+by|Marketed\s+by|Packed\s+by)\s*[:.]?\s*([A-Z][A-Za-z0-9\s&,.\-]{2,50})/i,
    ],
    extract: (m) => m[1].trim().replace(/\s+/g, ' '),
  },
  {
    fieldName: 'manufacturer_address',
    patterns: [
      /(?:Address|Factory\s+Address|Works\s*[:.]?)\s*[:.]?\s*([A-Za-z0-9\s,\-.\/]{10,100})/i,
    ],
    extract: (m) => m[1].trim().replace(/\s+/g, ' '),
  },
  {
    fieldName: 'importer',
    patterns: [
      /(?:Imported\s+by|Importer)\s*[:.]?\s*([A-Z][A-Za-z0-9\s&,.\-]{2,50})/i,
    ],
    extract: (m) => m[1].trim().replace(/\s+/g, ' '),
  },
  {
    fieldName: 'consumer_care',
    patterns: [
      /(?:Consumer\s+Care|Customer\s+Care|Helpline|Toll\s+Free|Contact\s+Us|For\s+Complaints?)\s*[:.]?\s*([0-9+\-\s()]{8,20})/i,
      /(?:Consumer\s+Care|Customer\s+Care)\s*[:.]?\s*([A-Za-z0-9\s@.,\-:+/]{10,60})/i,
    ],
    extract: (m) => m[1].trim(),
  },
  {
    fieldName: 'veg_nonveg',
    patterns: [
      /\b(VEG|VEGETARIAN|NON[-\s]?VEG|NON[-\s]?VEGETARIAN)\b/i,
      /\b(Veg|Non[-\s]?Veg)\b/i,
    ],
    extract: (m) => m[1].toUpperCase().replace(/\s/g, ' '),
  },
  {
    fieldName: 'storage_instructions',
    patterns: [
      /(?:Store\s+at|Storage|Keep\s+in|Storage\s+Condition)\s*[:.]?\s*([A-Za-z0-9\s,.\-°]{5,80})/i,
    ],
    extract: (m) => m[1].trim(),
  },
  {
    fieldName: 'ingredients',
    patterns: [
      /(?:Ingredients?|Composition)\s*[:.]?\s*([A-Za-z0-9\s,.\-()]{10,200})/i,
    ],
    extract: (m) => m[1].trim().replace(/\s+/g, ' '),
  },
  {
    fieldName: 'nutritional_info',
    patterns: [
      /(?:Nutrition(?:al)?\s+(?:Info|Information|Facts)|Nutritional)\s*[:.]?\s*([A-Za-z0-9\s,.\-%()]{10,200})/i,
    ],
    extract: (m) => m[1].trim().replace(/\s+/g, ' '),
  },
  {
    fieldName: 'warnings',
    patterns: [
      /(?:Warning[s]?|Caution|Precaution[s]?)\s*[:.]?\s*([A-Za-z0-9\s,.\-!]{5,150})/i,
    ],
    extract: (m) => m[1].trim(),
  },
  {
    fieldName: 'usage_instructions',
    patterns: [
      /(?:Direction[s]?\s+for\s+Use|How\s+to\s+Use|Usage|Instructions?|Direction[s]?)\s*[:.]?\s*([A-Za-z0-9\s,.\-()]{5,150})/i,
    ],
    extract: (m) => m[1].trim(),
  },
];

function findBboxForMatch(words: { text: string; confidence: number; bbox: BoundingBox }[], matchText: string): BoundingBox | null {
  const matchLower = matchText.toLowerCase();
  let bestMatch: { bbox: BoundingBox; score: number } | null = null;

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    if (matchLower.includes(w.text.toLowerCase())) {
      if (!bestMatch || w.confidence > bestMatch.score) {
        bestMatch = { bbox: w.bbox, score: w.confidence };
      }
    }
  }

  if (bestMatch) return bestMatch.bbox;

  const matchStart = matchLower.slice(0, Math.min(5, matchLower.length));
  for (let i = 0; i < words.length; i++) {
    if (words[i].text.toLowerCase().startsWith(matchStart.slice(0, 3))) {
      const startIdx = i;
      let endIdx = Math.min(i + 3, words.length - 1);
      return {
        x: words[startIdx].bbox.x,
        y: words[startIdx].bbox.y,
        width: words[endIdx].bbox.x + words[endIdx].bbox.width - words[startIdx].bbox.x,
        height: Math.max(words[endIdx].bbox.height, words[startIdx].bbox.height),
      };
    }
  }

  return null;
}

function guessProductName(text: string): string | null {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 3);
  if (lines.length === 0) return null;

  const stopWords = ['ingredients', 'nutrition', 'manufactured', 'importer', 'batch', 'mrp', 'net', 'storage', 'warning', 'directions', 'consumer'];
  for (const line of lines.slice(0, 5)) {
    const lower = line.toLowerCase();
    if (stopWords.some((sw) => lower.startsWith(sw))) continue;
    if (line.length >= 4 && line.length <= 50 && /^[A-Z]/.test(line)) {
      return line;
    }
  }
  return lines[0] || null;
}

export function extractFields(ocrResult: OcrResult, viewLabel: ViewLabel): ExtractedField[] {
  const fields: ExtractedField[] = [];
  const text = ocrResult.text;

  for (const pattern of FIELD_PATTERNS) {
    let found = false;
    for (const regex of pattern.patterns) {
      const match = text.match(regex);
      if (match && match[0]) {
        const value = pattern.extract(match, text);
        if (value && value.trim().length > 0) {
          const bbox = findBboxForMatch(ocrResult.words, match[0]);
          const ocrConf = ocrResult.confidence;
          const confidence = Math.min(100, ocrConf * 0.7 + 30);
          fields.push({
            fieldName: pattern.fieldName,
            fieldValue: value,
            confidence: Math.round(confidence),
            ocrConfidence: Math.round(ocrConf),
            bbox,
            viewLabel,
            status: confidence < 60 ? 'review' : 'detected',
            source: 'ai',
          });
          found = true;
          break;
        }
      }
    }
    if (!found && pattern.fieldName === 'product_name') {
      const name = guessProductName(text);
      if (name) {
        fields.push({
          fieldName: 'product_name',
          fieldValue: name,
          confidence: 50,
          ocrConfidence: Math.round(ocrResult.confidence),
          bbox: ocrResult.words[0]?.bbox || null,
          viewLabel,
          status: 'review',
          source: 'ai',
        });
      }
    }
  }

  if (!fields.some((f) => f.fieldName === 'product_name')) {
    const name = guessProductName(text);
    if (name) {
      fields.push({
        fieldName: 'product_name',
        fieldValue: name,
        confidence: 50,
        ocrConfidence: Math.round(ocrResult.confidence),
        bbox: ocrResult.words[0]?.bbox || null,
        viewLabel,
        status: 'review',
        source: 'ai',
      });
    }
  }

  return fields;
}
