import Tesseract from 'tesseract.js';
import type { OcrResult, OcrWord, BoundingBox } from './types';

export async function runOcr(
  imageUrl: string,
  onProgress?: (progress: number) => void
): Promise<OcrResult> {
  const result = await Tesseract.recognize(imageUrl, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(m.progress);
      }
    },
  });

  const words: OcrWord[] = [];
  let fullText = '';

  const rawWords = (result.data as { words?: Array<{ text: string; confidence: number; bbox: { x0: number; y0: number; x1: number; y1: number } }> }).words;
  if (rawWords && rawWords.length > 0) {
    for (const w of rawWords) {
      if (!w.text || w.text.trim() === '') continue;
      const bbox: BoundingBox = {
        x: w.bbox.x0,
        y: w.bbox.y0,
        width: w.bbox.x1 - w.bbox.x0,
        height: w.bbox.y1 - w.bbox.y0,
      };
      words.push({
        text: w.text,
        confidence: w.confidence,
        bbox,
      });
      fullText += w.text + ' ';
    }
  } else {
    fullText = result.data.text || '';
  }

  fullText = fullText.trim();

  const avgConfidence =
    words.length > 0
      ? words.reduce((sum, w) => sum + w.confidence, 0) / words.length
      : result.data.confidence || 0;

  return {
    text: fullText,
    words,
    confidence: avgConfidence,
  };
}

export function getImageQualityScore(imageUrl: string): Promise<number> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(75);
        return;
      }
      const maxSize = 200;
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let sum = 0;
        let sumSq = 0;
        const pixelCount = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          sum += gray;
          sumSq += gray * gray;
        }
        const mean = sum / pixelCount;
        const variance = sumSq / pixelCount - mean * mean;
        const stdDev = Math.sqrt(Math.max(0, variance));
        let quality = Math.min(100, (stdDev / 50) * 100);
        if (img.width < 300 || img.height < 300) quality *= 0.7;
        resolve(Math.round(Math.max(20, Math.min(100, quality))));
      } catch {
        resolve(75);
      }
    };
    img.onerror = () => resolve(60);
    img.src = imageUrl;
  });
}
