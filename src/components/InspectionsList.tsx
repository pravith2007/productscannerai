import { useState, useEffect } from 'react';
import { FileSearch, Eye, AlertTriangle, ChevronRight } from 'lucide-react';
import type { Inspection } from '@/lib/types';
import { loadInspections } from '@/lib/db';

interface InspectionsListProps {
  onOpenInspection: (passportId: string) => void;
}

export default function InspectionsList({ onOpenInspection }: InspectionsListProps) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    loadInspections().then((data) => {
      setInspections(data);
      setLoading(false);
    });
  }, []);

  const filtered = filter === 'all'
    ? inspections
    : inspections.filter((i) => i.status === filter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inspections</h1>
        <p className="text-sm text-slate-500 mt-1">All digital compliance inspections</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', 'completed', 'pending_review', 'in_progress'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {f === 'all' ? 'All' : f === 'pending_review' ? 'Pending Review' : f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      <div className="card p-5">
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <FileSearch className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No inspections found</p>
          </div>
        ) : (
          <>
          <div className="sm:hidden space-y-3">
            {filtered.map((ins) => (
              <button
                key={ins.passportId}
                onClick={() => onOpenInspection(ins.passportId)}
                className="w-full text-left p-3 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-xs text-teal-700">{ins.passportId}</span>
                  <StatusBadge status={ins.status} />
                </div>
                <p className="text-sm text-slate-700 font-medium truncate">{ins.productName || 'Unknown'}</p>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                  <span className={`font-semibold ${ins.overallScore >= 80 ? 'text-green-700' : ins.overallScore >= 60 ? 'text-amber-700' : 'text-red-700'}`}>{ins.overallScore}/100</span>
                  <span className="flex items-center gap-0.5">{ins.issues.length > 0 ? <><AlertTriangle className="w-3 h-3" />{ins.issues.length}</> : '0 issues'}</span>
                  <span>{ins.views.length} views</span>
                  <span>{new Date(ins.createdAt).toLocaleDateString()}</span>
                </div>
              </button>
            ))}
          </div>
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wider">
                  <th className="pb-2 pr-4 font-medium">Passport ID</th>
                  <th className="pb-2 pr-4 font-medium">Product</th>
                  <th className="pb-2 pr-4 font-medium">Score</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Issues</th>
                  <th className="pb-2 pr-4 font-medium">Views</th>
                  <th className="pb-2 pr-4 font-medium">Date</th>
                  <th className="pb-2 pr-4 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((ins) => (
                  <tr
                    key={ins.passportId}
                    onClick={() => onOpenInspection(ins.passportId)}
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <td className="py-2.5 pr-4 font-mono text-xs text-teal-700">{ins.passportId}</td>
                    <td className="py-2.5 pr-4 text-slate-700">{ins.productName || 'Unknown'}</td>
                    <td className="py-2.5 pr-4">
                      <span className={`font-semibold ${ins.overallScore >= 80 ? 'text-green-700' : ins.overallScore >= 60 ? 'text-amber-700' : 'text-red-700'}`}>
                        {ins.overallScore}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4">
                      <StatusBadge status={ins.status} />
                    </td>
                    <td className="py-2.5 pr-4">
                      {ins.issues.length > 0 ? (
                        <span className="flex items-center gap-1 text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {ins.issues.length}
                        </span>
                      ) : (
                        <span className="text-green-600">0</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-slate-600">{ins.views.length}</td>
                    <td className="py-2.5 pr-4 text-slate-500 text-xs">{new Date(ins.createdAt).toLocaleDateString()}</td>
                    <td className="py-2.5 pr-4">
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    completed: { cls: 'badge-green', label: 'Completed' },
    pending_review: { cls: 'badge-yellow', label: 'Pending Review' },
    in_progress: { cls: 'badge-gray', label: 'In Progress' },
    analyzing: { cls: 'badge-blue', label: 'Analyzing' },
    failed: { cls: 'badge-red', label: 'Failed' },
  };
  const config = map[status] || map.in_progress;
  return <span className={`badge ${config.cls}`}>{config.label}</span>;
}
