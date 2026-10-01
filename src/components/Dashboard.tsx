import { useEffect, useState } from 'react';
import {
  ShieldCheck, AlertTriangle, FileCheck, Eye,
  TrendingUp, ScanLine, ArrowRight, Clock,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';
import type { Inspection } from '@/lib/types';
import { loadInspections } from '@/lib/db';
import type { Page } from './Layout';

interface DashboardProps {
  onNavigate: (page: Page) => void;
  onOpenInspection: (passportId: string) => void;
}

export default function Dashboard({ onNavigate, onOpenInspection }: DashboardProps) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInspections().then((data) => {
      setInspections(data);
      setLoading(false);
    });
  }, []);

  const total = inspections.length;
  const completed = inspections.filter((i) => i.status === 'completed').length;
  const pendingReview = inspections.filter((i) => i.status === 'pending_review').length;
  const avgScore = total > 0
    ? Math.round(inspections.reduce((s, i) => s + i.overallScore, 0) / total)
    : 0;
  const totalIssues = inspections.reduce((s, i) => s + i.issues.length, 0);

  const scoreData = inspections.slice(0, 10).reverse().map((i) => ({
    name: i.passportId.slice(-4),
    score: i.overallScore,
  }));

  const statusData = [
    { name: 'Completed', value: completed, color: '#16a34a' },
    { name: 'Pending Review', value: pendingReview, color: '#f59e0b' },
    { name: 'In Progress', value: total - completed - pendingReview, color: '#64748b' },
  ];

  const stats = [
    { label: 'Total Inspections', value: total, icon: FileCheck, color: 'text-teal-700', bg: 'bg-teal-50' },
    { label: 'Pending Review', value: pendingReview, icon: Eye, color: 'text-amber-700', bg: 'bg-amber-50' },
    { label: 'Avg Compliance Score', value: `${avgScore}/100`, icon: TrendingUp, color: 'text-blue-700', bg: 'bg-blue-50' },
    { label: 'Total Issues', value: totalIssues, icon: AlertTriangle, color: 'text-red-700', bg: 'bg-red-50' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Inspection Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Overview of compliance inspections and findings</p>
        </div>
        <button onClick={() => onNavigate('scan')} className="btn-primary flex items-center gap-2 self-start sm:self-auto">
          <ScanLine className="w-4 h-4" />
          New Inspection
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">{stat.label}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Compliance Score Trend</h3>
          {scoreData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={scoreData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="score" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
              No inspections yet
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Inspection Status Distribution</h3>
          {total > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-sm text-slate-400">
              No data available
            </div>
          )}
        </div>
      </div>

      {/* Recent Inspections */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-700">Recent Inspections</h3>
          <button onClick={() => onNavigate('inspections')} className="text-sm text-teal-700 hover:text-teal-800 flex items-center gap-1">
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {loading ? (
          <div className="py-8 text-center text-sm text-slate-400">Loading...</div>
        ) : inspections.length === 0 ? (
          <div className="py-8 text-center">
            <ShieldCheck className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No inspections yet. Start by scanning a product.</p>
          </div>
        ) : (
          <>
          <div className="sm:hidden space-y-3">
            {inspections.slice(0, 8).map((ins) => (
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
                  <span>{ins.issues.length} issues</span>
                  <span className="flex items-center gap-0.5"><Clock className="w-3 h-3" />{new Date(ins.createdAt).toLocaleDateString()}</span>
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
                  <th className="pb-2 pr-4 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {inspections.slice(0, 8).map((ins) => (
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
                    <td className="py-2.5 pr-4 text-slate-600">{ins.issues.length}</td>
                    <td className="py-2.5 pr-4 text-slate-500 text-xs">
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(ins.createdAt).toLocaleDateString()}
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