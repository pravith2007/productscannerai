import { useState, useEffect } from 'react';
import { Wrench, ChevronRight, AlertCircle } from 'lucide-react';
import type { Inspection, CorrectiveAction } from '@/lib/types';
import { loadInspections, updateCorrectiveAction } from '@/lib/db';

interface CorrectiveActionsProps {
  onOpenInspection: (passportId: string) => void;
}

export default function CorrectiveActions({ onOpenInspection }: CorrectiveActionsProps) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    loadInspections().then((data) => {
      setInspections(data);
      setLoading(false);
    });
  }, []);

  const allActions: Array<{ action: CorrectiveAction; inspection: Inspection }> = [];
  for (const ins of inspections) {
    for (const action of ins.correctiveActions) {
      allActions.push({ action, inspection: ins });
    }
  }

  const filtered = statusFilter === 'all'
    ? allActions
    : allActions.filter((a) => a.action.status === statusFilter);

  const statusColors: Record<string, string> = {
    open: 'badge-red',
    under_review: 'badge-yellow',
    corrected: 'badge-blue',
    verified: 'badge-green',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Corrective Actions</h1>
        <p className="text-sm text-slate-500 mt-1">Track and resolve compliance issues</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {['all', 'open', 'under_review', 'corrected', 'verified'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              statusFilter === s ? 'bg-teal-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {s === 'all' ? 'All' : s === 'under_review' ? 'Under Review' : s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      <div className="card p-5">
        {loading ? (
          <div className="py-8 text-center text-slate-400">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Wrench className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No corrective actions</p>
            <p className="text-xs text-slate-400 mt-1">Actions are created from issues in the Human Review tab</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(({ action, inspection }, idx) => (
              <div key={action.id || idx} className="p-4 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`badge ${statusColors[action.status] || 'badge-gray'}`}>
                        {action.status.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      <span className="text-xs font-mono text-teal-700">{inspection.passportId}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-700">{action.title}</p>
                    <p className="text-xs text-slate-500 mt-1">{action.description}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <select
                      value={action.status}
                      onChange={(e) => action.id && updateCorrectiveAction(action.id, e.target.value)}
                      className="text-xs border border-slate-300 rounded-md px-2 py-1.5"
                    >
                      <option value="open">Open</option>
                      <option value="under_review">Under Review</option>
                      <option value="corrected">Corrected</option>
                      <option value="verified">Verified</option>
                    </select>
                    <button
                      onClick={() => onOpenInspection(inspection.passportId)}
                      className="p-1.5 rounded-md hover:bg-slate-100"
                    >
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-600">
            Corrective actions turn compliance violations into trackable tasks. Each action follows the lifecycle:
            <span className="font-medium text-slate-700"> Open → Under Review → Corrected → Verified</span>.
            This transforms the platform from a scanner into a compliance workflow tool.
          </p>
        </div>
      </div>
    </div>
  );
}
