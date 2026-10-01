import { BookOpen, ShieldCheck, Info } from 'lucide-react';
import { DEFAULT_RULES } from '@/lib/ruleEngine';
import { FIELD_LABELS } from '@/lib/types';

export default function RuleManager() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Rule Manager</h1>
        <p className="text-sm text-slate-500 mt-1">
          Versioned compliance rules stored as structured data. Rules can be updated independently of the application.
        </p>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <ShieldCheck className="w-5 h-5 text-teal-700" />
          <div>
            <h3 className="text-sm font-semibold text-slate-700">Active Rule Set</h3>
            <p className="text-xs text-slate-500">FSSAI-2026 v1.0.0 — FSSAI Packaging Compliance Rules</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Rule Set ID</p>
            <p className="text-sm font-medium text-slate-700 mt-1">FSSAI-2026</p>
          </div>
          <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Version</p>
            <p className="text-sm font-medium text-slate-700 mt-1">1.0.0</p>
          </div>
          <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
            <p className="text-xs text-slate-500 uppercase tracking-wider">Total Rules</p>
            <p className="text-sm font-medium text-slate-700 mt-1">{DEFAULT_RULES.length}</p>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-5 h-5 text-teal-700" />
          <h3 className="text-sm font-semibold text-slate-700">Compliance Rules</h3>
        </div>

        <div className="space-y-3">
          {DEFAULT_RULES.map((rule) => (
            <div key={rule.id} className="p-4 rounded-md border border-slate-200 hover:bg-slate-50 transition-colors">
              <div className="flex items-start gap-3">
                <span className="text-xs font-mono text-teal-700 bg-teal-50 px-2 py-1 rounded">{rule.id}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="text-sm font-semibold text-slate-700">{rule.name}</h4>
                    <span className={`badge text-xs ${
                      rule.severity === 'critical' ? 'badge-red' :
                      rule.severity === 'high' ? 'badge-yellow' :
                      rule.severity === 'medium' ? 'badge-yellow' : 'badge-gray'
                    }`}>{rule.severity}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{rule.description}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rule.requiredFields.map((field) => (
                      <span key={field} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded">
                        {FIELD_LABELS[field] || field}
                      </span>
                    ))}
                    {rule.requiredFields.length === 0 && (
                      <span className="text-xs text-slate-400 italic">Cross-cutting rule</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-600">
            Every inspection stores the Rule Set ID, Rule Version, Inspection Timestamp, and Engine Version.
            This ensures compliance decisions are always traceable to the exact rules that were in effect at the time of inspection.
            Rules are stored as structured data in the database, not hard-coded in frontend components.
          </p>
        </div>
      </div>
    </div>
  );
}
