import { useState, useEffect } from 'react';
import { History, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import type { Inspection } from '@/lib/types';
import { loadInspections } from '@/lib/db';

interface ProductHistoryProps {
  onOpenInspection: (passportId: string) => void;
}

export default function ProductHistory({ onOpenInspection }: ProductHistoryProps) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInspections().then((data) => {
      setInspections(data);
      setLoading(false);
    });
  }, []);

  const byProduct = new Map<string, Inspection[]>();
  for (const ins of inspections) {
    const key = ins.productName || 'Unknown Product';
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key)!.push(ins);
  }

  const multiInspectionProducts = Array.from(byProduct.entries())
    .filter(([_, items]) => items.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Product Compliance History</h1>
        <p className="text-sm text-slate-500 mt-1">
          Compare inspections across time for the same product to track improvement or recurring issues.
        </p>
      </div>

      <div className="card p-5">
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading...</div>
        ) : multiInspectionProducts.length === 0 ? (
          <div className="py-12 text-center">
            <History className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No products with multiple inspections yet</p>
            <p className="text-xs text-slate-400 mt-1">
              Inspect the same product multiple times to see compliance history and trend comparison.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {multiInspectionProducts.map(([productName, items]) => {
              const sorted = items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
              const previous = sorted[sorted.length - 2];
              const current = sorted[sorted.length - 1];
              const scoreDiff = current.overallScore - previous.overallScore;

              const previousIssueFields = new Set(previous.issues.map((i) => i.fieldName));
              const currentIssueFields = new Set(current.issues.map((i) => i.fieldName));
              const resolved = Array.from(previousIssueFields).filter((f) => !currentIssueFields.has(f));
              const newIssues = Array.from(currentIssueFields).filter((f) => !previousIssueFields.has(f));
              const repeated = Array.from(previousIssueFields).filter((f) => currentIssueFields.has(f));

              return (
                <div key={productName} className="border border-slate-200 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-slate-700">{productName}</h3>
                    <span className="text-xs text-slate-400">{sorted.length} inspections</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-500 mb-1">Previous Inspection</p>
                      <p className="text-xs font-mono text-teal-700">{previous.passportId}</p>
                      <p className="text-lg font-bold text-slate-700 mt-1">{previous.overallScore}/100</p>
                      <p className="text-xs text-slate-400">{new Date(previous.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
                      <p className="text-xs text-slate-500 mb-1">Current Inspection</p>
                      <p className="text-xs font-mono text-teal-700">{current.passportId}</p>
                      <p className="text-lg font-bold text-slate-700 mt-1">{current.overallScore}/100</p>
                      <p className="text-xs text-slate-400">{new Date(current.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 mb-4">
                    <div className={`flex items-center gap-1 ${scoreDiff > 0 ? 'text-green-700' : scoreDiff < 0 ? 'text-red-700' : 'text-slate-500'}`}>
                      {scoreDiff > 0 ? <TrendingUp className="w-4 h-4" /> : scoreDiff < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                      <span className="text-sm font-medium">
                        {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff} points
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="p-2 rounded-md bg-green-50 border border-green-100">
                      <p className="text-xs font-medium text-green-700 mb-1">Resolved Issues ({resolved.length})</p>
                      {resolved.length > 0 ? resolved.map((f) => (
                        <p key={f} className="text-xs text-green-600">{f.replace(/_/g, ' ')}</p>
                      )) : <p className="text-xs text-slate-400">None</p>}
                    </div>
                    <div className="p-2 rounded-md bg-amber-50 border border-amber-100">
                      <p className="text-xs font-medium text-amber-700 mb-1">New Issues ({newIssues.length})</p>
                      {newIssues.length > 0 ? newIssues.map((f) => (
                        <p key={f} className="text-xs text-amber-600">{f.replace(/_/g, ' ')}</p>
                      )) : <p className="text-xs text-slate-400">None</p>}
                    </div>
                    <div className="p-2 rounded-md bg-red-50 border border-red-100">
                      <p className="text-xs font-medium text-red-700 mb-1">Repeated Issues ({repeated.length})</p>
                      {repeated.length > 0 ? repeated.map((f) => (
                        <p key={f} className="text-xs text-red-600">{f.replace(/_/g, ' ')}</p>
                      )) : <p className="text-xs text-slate-400">None</p>}
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={() => onOpenInspection(current.passportId)}
                      className="text-sm text-teal-700 hover:text-teal-800 flex items-center gap-1"
                    >
                      View current <ArrowRight className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => onOpenInspection(previous.passportId)}
                      className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
                    >
                      View previous <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="mt-3 p-2 rounded-md bg-slate-50">
                    <p className="text-xs text-slate-500">
                      Note: A compliance score is a quality indicator, not a legal determination. Manual verification of specific declarations is always recommended.
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
