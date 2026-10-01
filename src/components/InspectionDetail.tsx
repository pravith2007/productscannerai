import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft, Package, ShieldCheck, AlertTriangle, Eye,
  FileDown, Clock, MapPin, CheckCircle2, XCircle, Edit3,
  MessageSquare, Layers, Activity, ChevronRight,
} from 'lucide-react';
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer, PolarRadiusAxis,
} from 'recharts';
import type {
  Inspection, ViewLabel, EvidenceNode, InspectionIssue,
  HumanReview, TimelineEvent,
} from '@/lib/types';
import { FIELD_LABELS, VIEW_LABELS_DISPLAY, FIELD_DEFINITIONS } from '@/lib/types';
import { loadInspections, saveHumanReview, saveCorrectiveAction, updateCorrectiveAction } from '@/lib/db';
import { generateComplianceReport, generateQRCodeDataUrl } from '@/lib/reportGenerator';

interface InspectionDetailProps {
  passportId: string;
  onBack: () => void;
}

type Tab = 'overview' | 'twin' | 'evidence' | 'heatmap' | 'timeline' | 'review' | 'report';

export default function InspectionDetail({ passportId, onBack }: InspectionDetailProps) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [selectedEvidence, setSelectedEvidence] = useState<EvidenceNode | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<InspectionIssue | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    loadInspections().then((data) => {
      const found = data.find((i) => i.passportId === passportId);
      setInspection(found || null);
      setLoading(false);
      if (found) {
        generateQRCodeDataUrl(`PASSPORT:${found.passportId}`).then(setQrCodeUrl);
      }
    });
  }, [passportId]);

  if (loading) {
    return <div className="py-12 text-center text-slate-400">Loading inspection...</div>;
  }

  if (!inspection) {
    return (
      <div className="py-12 text-center">
        <p className="text-slate-500">Inspection not found.</p>
        <button onClick={onBack} className="btn-secondary mt-4">Back</button>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'twin', label: 'Package Twin', icon: Package },
    { id: 'evidence', label: 'Evidence Graph', icon: Layers },
    { id: 'heatmap', label: 'Heatmap', icon: MapPin },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'review', label: 'Human Review', icon: Eye },
    { id: 'report', label: 'Report & Passport', icon: FileDown },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button onClick={onBack} className="p-2 rounded-md hover:bg-slate-100 transition-colors flex-shrink-0">
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 font-mono">{inspection.passportId}</h1>
            <StatusBadge status={inspection.status} />
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {inspection.productName || 'Unknown product'} | Score: {inspection.overallScore}/100 | {new Date(inspection.createdAt).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && <OverviewTab inspection={inspection} />}
      {activeTab === 'twin' && <PackageTwinTab inspection={inspection} />}
      {activeTab === 'evidence' && (
        <EvidenceTab
          inspection={inspection}
          onSelectEvidence={setSelectedEvidence}
          selectedEvidence={selectedEvidence}
          onOpenIssue={(issue) => { setSelectedIssue(issue); setActiveTab('review'); }}
        />
      )}
      {activeTab === 'heatmap' && (
        <HeatmapTab inspection={inspection} onSelectEvidence={setSelectedEvidence} selectedEvidence={selectedEvidence} />
      )}
      {activeTab === 'timeline' && <TimelineTab inspection={inspection} />}
      {activeTab === 'review' && (
        <ReviewTab
          inspection={inspection}
          selectedIssue={selectedIssue}
          onReviewSubmitted={() => {
            loadInspections().then((data) => {
              const found = data.find((i) => i.passportId === passportId);
              setInspection(found || null);
            });
          }}
        />
      )}
      {activeTab === 'report' && (
        <ReportTab inspection={inspection} qrCodeUrl={qrCodeUrl} />
      )}
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

function OverviewTab({ inspection }: { inspection: Inspection }) {
  const summary = inspection.summary as Record<string, number>;
  const radarData = FIELD_DEFINITIONS.slice(0, 8).map((def) => {
    const field = inspection.fields.find((f) => f.fieldName === def.name);
    return {
      field: def.label.slice(0, 12),
      confidence: field ? field.confidence : 0,
    };
  });

  const stats = [
    { label: 'Views Captured', value: summary.totalViews || 0, icon: Package },
    { label: 'Fields Extracted', value: summary.totalFields || 0, icon: Layers },
    { label: 'Evidence Nodes', value: summary.totalEvidence || 0, icon: ShieldCheck },
    { label: 'Issues Detected', value: summary.totalIssues || 0, icon: AlertTriangle },
    { label: 'Low Confidence', value: summary.lowConfidenceCount || 0, icon: Eye },
    { label: 'Cross-View Conflicts', value: summary.conflictCount || 0, icon: AlertTriangle },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card p-4">
              <Icon className="w-5 h-5 text-slate-400 mb-2" />
              <p className="text-2xl font-bold text-slate-900">{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Field Confidence Radar</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="#e2e8f0" />
              <PolarAngleAxis dataKey="field" tick={{ fontSize: 9 }} />
              <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
              <Radar dataKey="confidence" stroke="#0f766e" fill="#0f766e" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Issues Summary</h3>
          {inspection.issues.length === 0 ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
              <p className="text-sm text-slate-500">No issues detected</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {inspection.issues.map((issue, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-md bg-slate-50 border border-slate-100">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                    issue.severity === 'critical' ? 'bg-red-500' :
                    issue.severity === 'high' ? 'bg-orange-500' :
                    issue.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-700">
                      {issue.issueType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{issue.description}</p>
                  </div>
                  <span className={`badge ${
                    issue.severity === 'critical' ? 'badge-red' :
                    issue.severity === 'high' ? 'badge-yellow' :
                    issue.severity === 'medium' ? 'badge-yellow' : 'badge-gray'
                  }`}>{issue.severity}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Explainable Compliance Summary</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Rule Set</p>
              <p className="text-sm font-medium text-slate-700">{inspection.ruleSetId} v{inspection.ruleVersion}</p>
            </div>
            <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Engine Version</p>
              <p className="text-sm font-medium text-slate-700">{inspection.engineVersion}</p>
            </div>
            <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Average Confidence</p>
              <p className="text-sm font-medium text-slate-700">{summary.avgConfidence || 0}%</p>
            </div>
            <div className="p-3 rounded-md bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">Missing Declarations</p>
              <p className="text-sm font-medium text-slate-700">{summary.missingCount || 0}</p>
            </div>
          </div>
          <div className="p-4 rounded-md border border-teal-200 bg-teal-50">
            <p className="text-sm text-teal-800">
              <ShieldCheck className="w-4 h-4 inline mr-1" />
              Every compliance decision in this inspection is traceable to visual evidence captured from the product package.
              Click the Evidence Graph tab to inspect the source of each decision.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PackageTwinTab({ inspection }: { inspection: Inspection }) {
  const viewFields = new Map<ViewLabel, typeof inspection.fields>();
  for (const field of inspection.fields) {
    if (!viewFields.has(field.viewLabel)) viewFields.set(field.viewLabel, []);
    viewFields.get(field.viewLabel)!.push(field);
  }

  const allFieldNames = new Set(inspection.fields.map((f) => f.fieldName));

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Package className="w-5 h-5 text-teal-700" />
          <h3 className="text-sm font-semibold text-slate-700">Digital Package Twin</h3>
          <span className="text-xs text-slate-400">— Combined compliance record across all views</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          {(['front', 'back', 'left', 'right', 'top', 'bottom'] as ViewLabel[]).map((label) => {
            const view = inspection.views.find((v) => v.viewLabel === label);
            const fields = viewFields.get(label) || [];
            return (
              <div key={label} className="text-center">
                {view ? (
                  <div className="relative aspect-square rounded-lg overflow-hidden border-2 border-teal-500 mb-2">
                    <img src={view.imageUrl} alt={label} className="w-full h-full object-cover" />
                    <div className="absolute top-1 left-1">
                      <span className="badge bg-teal-600 text-white text-xs">{VIEW_LABELS_DISPLAY[label]}</span>
                    </div>
                  </div>
                ) : (
                  <div className="aspect-square rounded-lg border-2 border-dashed border-slate-200 mb-2 flex items-center justify-center">
                    <span className="text-xs text-slate-400">{VIEW_LABELS_DISPLAY[label]}</span>
                  </div>
                )}
                <p className="text-xs text-slate-500">{fields.length} fields</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Package Declaration Map</h3>
        {/* Mobile: card layout */}
        <div className="sm:hidden space-y-3">
          {Array.from(allFieldNames).map((fieldName) => {
            const label = FIELD_LABELS[fieldName] || fieldName;
            const consolidated = inspection.fields.find((f) => f.fieldName === fieldName);
            const foundViews = (['front', 'back', 'left', 'right', 'top', 'bottom'] as ViewLabel[]).filter((v) =>
              inspection.fields.some((f) => f.fieldName === fieldName && f.viewLabel === v)
            );
            return (
              <div key={fieldName} className="p-3 rounded-md border border-slate-100 bg-slate-50">
                <p className="text-xs font-medium text-slate-700 mb-1">{label}</p>
                <p className="text-sm text-slate-600 font-mono mb-2">{consolidated?.fieldValue || 'Not detected'}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(['front', 'back', 'left', 'right', 'top', 'bottom'] as ViewLabel[]).map((v) => {
                    const field = inspection.fields.find((f) => f.fieldName === fieldName && f.viewLabel === v);
                    return field ? (
                      <span key={v} className="inline-flex items-center gap-1 text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" />
                        {VIEW_LABELS_DISPLAY[v]} {field.confidence}%
                      </span>
                    ) : null;
                  })}
                  {foundViews.length === 0 && <span className="text-xs text-slate-400">Not detected on any view</span>}
                </div>
              </div>
            );
          })}
        </div>
        {/* Desktop: table layout */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500 uppercase tracking-wider">
                <th className="pb-2 pr-4 font-medium">Field</th>
                {(['front', 'back', 'left', 'right', 'top', 'bottom'] as ViewLabel[]).map((v) => (
                  <th key={v} className="pb-2 px-2 font-medium text-center">{VIEW_LABELS_DISPLAY[v]}</th>
                ))}
                <th className="pb-2 pl-4 font-medium">Consolidated Value</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(allFieldNames).map((fieldName) => {
                const label = FIELD_LABELS[fieldName] || fieldName;
                const consolidated = inspection.fields.find((f) => f.fieldName === fieldName);
                return (
                  <tr key={fieldName} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-2 pr-4 text-slate-700 font-medium text-xs">{label}</td>
                    {(['front', 'back', 'left', 'right', 'top', 'bottom'] as ViewLabel[]).map((v) => {
                      const field = inspection.fields.find((f) => f.fieldName === fieldName && f.viewLabel === v);
                      return (
                        <td key={v} className="py-2 px-2 text-center">
                          {field ? (
                            <div className="inline-flex flex-col items-center">
                              <CheckCircle2 className="w-4 h-4 text-green-500" />
                              <span className="text-xs text-slate-400 mt-0.5">{field.confidence}%</span>
                            </div>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 pl-4 text-slate-600 text-xs">
                      {consolidated?.fieldValue || 'Not detected'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function EvidenceTab({
  inspection,
  onSelectEvidence,
  selectedEvidence,
  onOpenIssue,
}: {
  inspection: Inspection;
  onSelectEvidence: (e: EvidenceNode | null) => void;
  selectedEvidence: EvidenceNode | null;
  onOpenIssue: (issue: InspectionIssue) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Evidence Graph — Compliance Rule Chain</h3>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {inspection.evidence.map((ev) => (
            <button
              key={ev.id}
              onClick={() => onSelectEvidence(ev)}
              className={`w-full text-left p-3 rounded-md border transition-colors ${
                selectedEvidence?.id === ev.id
                  ? 'border-teal-500 bg-teal-50'
                  : 'border-slate-200 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${
                  ev.status === 'verified' ? 'bg-green-500' :
                  ev.status === 'review' ? 'bg-amber-400' :
                  ev.status === 'issue' ? 'bg-red-500' :
                  ev.status === 'cross_view' ? 'bg-blue-500' : 'bg-slate-300'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-teal-700">{ev.ruleId}</span>
                    <span className="text-sm font-medium text-slate-700">
                      {FIELD_LABELS[ev.fieldName] || ev.fieldName}
                    </span>
                    <span className={`badge text-xs ${
                      ev.validationResult === 'pass' ? 'badge-green' :
                      ev.validationResult === 'warning' ? 'badge-yellow' :
                      ev.validationResult === 'fail' ? 'badge-red' : 'badge-gray'
                    }`}>{ev.validationResult}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{ev.validationMessage}</p>
                  {ev.fieldValue && (
                    <p className="text-xs text-slate-600 mt-1 font-mono bg-slate-50 px-2 py-1 rounded">
                      {ev.fieldValue}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-slate-400 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </div>

      {selectedEvidence && (
        <div className="card p-5 animate-slide-in">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Evidence Detail</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="space-y-2 text-sm">
                <div><span className="text-slate-500">Rule:</span> <span className="font-medium text-slate-700">{selectedEvidence.ruleId}</span></div>
                <div><span className="text-slate-500">Rule Description:</span> <span className="text-slate-700">{selectedEvidence.ruleDescription}</span></div>
                <div><span className="text-slate-500">Field:</span> <span className="text-slate-700">{FIELD_LABELS[selectedEvidence.fieldName] || selectedEvidence.fieldName}</span></div>
                <div><span className="text-slate-500">Detected Value:</span> <span className="font-mono text-slate-700">{selectedEvidence.fieldValue || 'Not detected'}</span></div>
                <div><span className="text-slate-500">View:</span> <span className="text-slate-700">{VIEW_LABELS_DISPLAY[selectedEvidence.viewLabel]}</span></div>
                <div><span className="text-slate-500">OCR Confidence:</span> <span className="text-slate-700">{selectedEvidence.ocrConfidence}%</span></div>
                <div><span className="text-slate-500">Validation:</span> <span className="text-slate-700">{selectedEvidence.validationResult}</span></div>
              </div>
            </div>
            <div>
              <div className="space-y-2 text-sm">
                <div><span className="text-slate-500">What was checked:</span> <span className="text-slate-700">{selectedEvidence.ruleDescription}</span></div>
                <div><span className="text-slate-500">What was detected:</span> <span className="text-slate-700">{selectedEvidence.fieldValue || 'Nothing'}</span></div>
                <div><span className="text-slate-500">Where detected:</span> <span className="text-slate-700">{VIEW_LABELS_DISPLAY[selectedEvidence.viewLabel]} view</span></div>
                <div><span className="text-slate-500">Why flagged:</span> <span className="text-slate-700">{selectedEvidence.validationMessage}</span></div>
                {selectedEvidence.bbox && (
                  <div><span className="text-slate-500">Image region:</span> <span className="text-slate-700 font-mono text-xs">x:{selectedEvidence.bbox.x}, y:{selectedEvidence.bbox.y}, w:{selectedEvidence.bbox.width}, h:{selectedEvidence.bbox.height}</span></div>
                )}
              </div>
            </div>
          </div>

          {selectedEvidence.status === 'cross_view' && (
            <div className="mt-4 p-3 rounded-md bg-blue-50 border border-blue-200">
              <p className="text-sm text-blue-800">
                <AlertTriangle className="w-4 h-4 inline mr-1" />
                Cross-view conflict detected. This value differs from values found on other views.
              </p>
              {inspection.issues.find((i) => i.fieldName === selectedEvidence.fieldName && i.issueType === 'cross_view_conflict') && (
                <button
                  onClick={() => onOpenIssue(inspection.issues.find((i) => i.fieldName === selectedEvidence.fieldName && i.issueType === 'cross_view_conflict')!)}
                  className="mt-2 text-sm text-blue-700 hover:text-blue-800 font-medium flex items-center gap-1"
                >
                  Review this conflict <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HeatmapTab({
  inspection,
  onSelectEvidence,
  selectedEvidence,
}: {
  inspection: Inspection;
  onSelectEvidence: (e: EvidenceNode | null) => void;
  selectedEvidence: EvidenceNode | null;
}) {
  const [selectedView, setSelectedView] = useState<ViewLabel>(
    inspection.views[0]?.viewLabel || 'front'
  );
  const [imgDims, setImgDims] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const currentView = inspection.views.find((v) => v.viewLabel === selectedView);
  const viewEvidence = inspection.evidence.filter((e) => e.viewLabel === selectedView && e.bbox);

  const colorMap: Record<string, string> = {
    verified: 'border-green-500 bg-green-500/20',
    review: 'border-amber-400 bg-amber-400/20',
    issue: 'border-red-500 bg-red-500/20',
    cross_view: 'border-blue-500 bg-blue-500/20',
    not_detected: 'border-slate-300 bg-slate-300/20',
  };

  const handleImgLoad = () => {
    if (imgRef.current) {
      setImgDims({ w: imgRef.current.clientWidth, h: imgRef.current.clientHeight });
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="w-5 h-5 text-teal-700" />
          <h3 className="text-sm font-semibold text-slate-700">Compliance Heatmap</h3>
        </div>

        <div className="flex gap-2 mb-4 flex-wrap">
          {inspection.views.map((v) => (
            <button
              key={v.viewLabel}
              onClick={() => setSelectedView(v.viewLabel)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                selectedView === v.viewLabel
                  ? 'bg-teal-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {VIEW_LABELS_DISPLAY[v.viewLabel]}
            </button>
          ))}
        </div>

        {currentView ? (
          <div className="relative inline-block max-w-full" style={{ lineHeight: 0 }}>
            <img
              ref={imgRef}
              src={currentView.imageUrl}
              alt={selectedView}
              className="max-w-full rounded-lg"
              style={{ maxHeight: '500px', display: 'block' }}
              onLoad={handleImgLoad}
            />
            {viewEvidence.map((ev) => {
              if (!ev.bbox || !imgDims) return null;
              const naturalW = imgRef.current?.naturalWidth || 1;
              const naturalH = imgRef.current?.naturalHeight || 1;
              const scaleX = imgDims.w / naturalW;
              const scaleY = imgDims.h / naturalH;
              return (
                <button
                  key={ev.id}
                  onClick={() => onSelectEvidence(ev)}
                  className={`absolute border-2 rounded transition-all hover:scale-105 ${colorMap[ev.status] || colorMap.not_detected} ${
                    selectedEvidence?.id === ev.id ? 'ring-2 ring-teal-500 ring-offset-2' : ''
                  }`}
                  style={{
                    left: `${ev.bbox.x * scaleX}px`,
                    top: `${ev.bbox.y * scaleY}px`,
                    width: `${ev.bbox.width * scaleX}px`,
                    height: `${ev.bbox.height * scaleY}px`,
                  }}
                  title={`${FIELD_LABELS[ev.fieldName] || ev.fieldName}: ${ev.fieldValue || 'N/A'} (${ev.ocrConfidence}%)`}
                />
              );
            })}
          </div>
        ) : (
          <div className="py-12 text-center text-slate-400">No image for this view</div>
        )}

        <div className="mt-4 flex flex-wrap gap-4 text-xs">
          <LegendItem color="bg-green-500" label="Verified" />
          <LegendItem color="bg-amber-400" label="Low Confidence / Review" />
          <LegendItem color="bg-red-500" label="Potential Issue" />
          <LegendItem color="bg-blue-500" label="Cross-View Evidence" />
          <LegendItem color="bg-slate-300" label="Not Detected" />
        </div>
      </div>

      {selectedEvidence && (
        <div className="card p-5 animate-slide-in">
          <h4 className="text-sm font-semibold text-slate-700 mb-2">Selected Region Evidence</h4>
          <div className="text-sm space-y-1">
            <div><span className="text-slate-500">Field:</span> <span className="font-medium text-slate-700">{FIELD_LABELS[selectedEvidence.fieldName] || selectedEvidence.fieldName}</span></div>
            <div><span className="text-slate-500">Value:</span> <span className="font-mono text-slate-700">{selectedEvidence.fieldValue || 'Not detected'}</span></div>
            <div><span className="text-slate-500">Confidence:</span> <span className="text-slate-700">{selectedEvidence.ocrConfidence}%</span></div>
            <div><span className="text-slate-500">Status:</span> <span className="text-slate-700">{selectedEvidence.validationResult}</span></div>
            <div><span className="text-slate-500">Message:</span> <span className="text-slate-700">{selectedEvidence.validationMessage}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-3 h-3 rounded ${color}`} />
      <span className="text-slate-600">{label}</span>
    </div>
  );
}

function TimelineTab({ inspection }: { inspection: Inspection }) {
  const timeline = inspection.timeline.length > 0 ? inspection.timeline : generateFallbackTimeline(inspection);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-teal-700" />
        <h3 className="text-sm font-semibold text-slate-700">Inspection Timeline</h3>
      </div>
      <div className="space-y-1">
        {timeline.map((event, idx) => (
          <div key={idx} className="flex gap-4">
            <div className="flex flex-col items-center">
              <div className={`w-3 h-3 rounded-full ${
                event.status === 'completed' ? 'bg-green-500' :
                event.status === 'in_progress' ? 'bg-teal-500 animate-pulse-soft' :
                event.status === 'pending' ? 'bg-amber-400' :
                event.status === 'failed' ? 'bg-red-500' : 'bg-slate-300'
              }`} />
              {idx < timeline.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 min-h-[24px]" />}
            </div>
            <div className="pb-4">
              <p className="text-sm font-medium text-slate-700">{event.label}</p>
              {event.message && <p className="text-xs text-slate-500 mt-0.5">{event.message}</p>}
              <p className="text-xs text-slate-400 mt-0.5">{new Date(event.timestamp).toLocaleTimeString()}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function generateFallbackTimeline(inspection: Inspection): TimelineEvent[] {
  const steps = [
    { step: 'pipeline_start', label: 'Inspection Pipeline Started' },
    { step: 'image_received', label: 'Image Received' },
    { step: 'image_quality', label: 'Image Quality Check' },
    { step: 'ocr', label: 'OCR Processing' },
    { step: 'field_extraction', label: 'Field Extraction' },
    { step: 'rule_validation', label: 'Rule Validation' },
    { step: 'cross_view_check', label: 'Cross-View Consistency Check' },
    { step: 'evidence_graph', label: 'Evidence Graph Construction' },
    { step: 'risk_analysis', label: 'Risk Analysis & Confidence Scoring' },
    { step: 'human_review', label: 'Human Review' },
    { step: 'report_generation', label: 'Report Generated' },
  ];
  return steps.map((s) => ({
    ...s,
    status: 'completed' as const,
    timestamp: inspection.createdAt,
  }));
}

function ReviewTab({
  inspection,
  selectedIssue,
  onReviewSubmitted,
}: {
  inspection: Inspection;
  selectedIssue: InspectionIssue | null;
  onReviewSubmitted: () => void;
}) {
  const [reviewerName, setReviewerName] = useState('');
  const [reviewComment, setReviewComment] = useState('');
  const [editValue, setEditValue] = useState('');
  const [decision, setDecision] = useState<HumanReview['decision']>('accept');
  const [activeIssueId, setActiveIssueId] = useState<string | null>(selectedIssue?.id || null);
  const [actionTitle, setActionTitle] = useState('');
  const [actionDescription, setActionDescription] = useState('');

  useEffect(() => {
    if (selectedIssue) {
      setActiveIssueId(selectedIssue.id || null);
    }
  }, [selectedIssue]);

  const handleSubmitReview = async () => {
    if (!reviewerName.trim() || !inspection.id) return;
    const issue = inspection.issues.find((i) => i.id === activeIssueId);
    const field = issue ? inspection.fields.find((f) => f.fieldName === issue.fieldName) : null;

    const review: HumanReview = {
      inspectionId: inspection.id,
      fieldId: field?.id,
      issueId: issue?.id,
      reviewerName,
      decision,
      originalValue: field?.fieldValue || null,
      correctedValue: decision === 'edit' ? editValue : null,
      comment: reviewComment,
    };

    await saveHumanReview(inspection.id, review);
    onReviewSubmitted();
    setReviewComment('');
    setEditValue('');
    setActiveIssueId(null);
  };

  const handleCreateAction = async () => {
    if (!actionTitle.trim() || !inspection.id) return;
    await saveCorrectiveAction(inspection.id, {
      inspectionId: inspection.id,
      issueId: activeIssueId || undefined,
      title: actionTitle,
      description: actionDescription,
      status: 'open',
      assignedTo: null,
    });
    setActionTitle('');
    setActionDescription('');
    onReviewSubmitted();
  };

  const pendingIssues = inspection.issues.filter((i) => i.status === 'open');
  const activeIssue = inspection.issues.find((i) => i.id === activeIssueId);

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Eye className="w-5 h-5 text-teal-700" />
          <h3 className="text-sm font-semibold text-slate-700">Human Review — AI-Assisted Inspection</h3>
        </div>

        {inspection.reviews.length > 0 && (
          <div className="mb-4 p-3 rounded-md bg-green-50 border border-green-200">
            <p className="text-sm text-green-800">
              <CheckCircle2 className="w-4 h-4 inline mr-1" />
              {inspection.reviews.length} review decision(s) recorded. AI results and human decisions are stored separately for audit trail.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Issues List */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Items Requiring Review</h4>
            {pendingIssues.length === 0 ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm text-slate-500">All items reviewed</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {pendingIssues.map((issue) => (
                  <button
                    key={issue.id}
                    onClick={() => setActiveIssueId(issue.id || null)}
                    className={`w-full text-left p-3 rounded-md border transition-colors ${
                      activeIssueId === issue.id
                        ? 'border-teal-500 bg-teal-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        issue.severity === 'critical' ? 'bg-red-500' :
                        issue.severity === 'high' ? 'bg-orange-500' :
                        issue.severity === 'medium' ? 'bg-amber-500' : 'bg-slate-400'
                      }`} />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-700">
                          {issue.issueType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{issue.description}</p>
                        {issue.issueType === 'cross_view_conflict' && Array.isArray(issue.details.values) && (
                          <div className="mt-2 space-y-1">
                            {(issue.details.values as Array<{ viewLabel: ViewLabel; value: string; confidence: number }>).map((v, i) => (
                              <div key={i} className="text-xs text-slate-600 flex items-center gap-2">
                                <span className="badge badge-blue">{VIEW_LABELS_DISPLAY[v.viewLabel]}</span>
                                <span className="font-mono">{v.value}</span>
                                <span className="text-slate-400">({v.confidence}%)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Review Form */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Review Decision</h4>
            {activeIssue ? (
              <div className="space-y-4">
                <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                  <p className="text-xs text-slate-500">AI Result:</p>
                  <p className="text-sm text-slate-700 mt-1">{activeIssue.description}</p>
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Reviewer Name</label>
                  <input
                    type="text"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="Enter your name"
                    className="input-field"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Decision</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['accept', 'reject', 'edit', 'verify'] as HumanReview['decision'][]).map((d) => (
                      <button
                        key={d}
                        onClick={() => setDecision(d)}
                        className={`px-3 py-2 rounded-md text-sm font-medium border transition-colors ${
                          decision === d
                            ? 'border-teal-500 bg-teal-50 text-teal-700'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {d === 'accept' && 'Accept AI Result'}
                        {d === 'reject' && 'Reject AI Result'}
                        {d === 'edit' && 'Edit Value'}
                        {d === 'verify' && 'Mark Verified'}
                      </button>
                    ))}
                  </div>
                </div>

                {decision === 'edit' && (
                  <div>
                    <label className="text-xs font-medium text-slate-600 block mb-1">Corrected Value</label>
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Enter corrected value"
                      className="input-field"
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs font-medium text-slate-600 block mb-1">Comment</label>
                  <textarea
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Add review comment..."
                    rows={3}
                    className="input-field"
                  />
                </div>

                <button
                  onClick={handleSubmitReview}
                  disabled={!reviewerName.trim()}
                  className="btn-primary w-full"
                >
                  Submit Review Decision
                </button>
              </div>
            ) : (
              <div className="py-8 text-center text-sm text-slate-400">
                Select an issue to review
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Corrective Actions */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Edit3 className="w-5 h-5 text-teal-700" />
          <h3 className="text-sm font-semibold text-slate-700">Corrective Actions</h3>
        </div>

        {inspection.correctiveActions.length > 0 && (
          <div className="space-y-2 mb-4">
            {inspection.correctiveActions.map((action) => (
              <div key={action.id} className="flex items-center gap-3 p-3 rounded-md bg-slate-50 border border-slate-100">
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-700">{action.title}</p>
                  <p className="text-xs text-slate-500">{action.description}</p>
                </div>
                <select
                  value={action.status}
                  onChange={(e) => action.id && updateCorrectiveAction(action.id, e.target.value)}
                  className="text-xs border border-slate-300 rounded-md px-2 py-1"
                >
                  <option value="open">Open</option>
                  <option value="under_review">Under Review</option>
                  <option value="corrected">Corrected</option>
                  <option value="verified">Verified</option>
                </select>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            type="text"
            value={actionTitle}
            onChange={(e) => setActionTitle(e.target.value)}
            placeholder="Action title (e.g., Verify MRP declaration)"
            className="input-field"
          />
          <input
            type="text"
            value={actionDescription}
            onChange={(e) => setActionDescription(e.target.value)}
            placeholder="Action description"
            className="input-field"
          />
        </div>
        <button
          onClick={handleCreateAction}
          disabled={!actionTitle.trim()}
          className="btn-secondary mt-3"
        >
          Add Corrective Action
        </button>
      </div>
    </div>
  );
}

function ReportTab({ inspection, qrCodeUrl }: { inspection: Inspection; qrCodeUrl: string }) {
  const [generating, setGenerating] = useState(false);

  const handleDownload = async () => {
    setGenerating(true);
    try {
      await generateComplianceReport(inspection);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileDown className="w-5 h-5 text-teal-700" />
          <h3 className="text-sm font-semibold text-slate-700">Digital Compliance Passport</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="p-4 rounded-lg border-2 border-teal-200 bg-teal-50">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-teal-600 uppercase tracking-wider">Passport ID</p>
                  <p className="text-xl font-bold text-teal-800 font-mono">{inspection.passportId}</p>
                </div>
                {qrCodeUrl && <img src={qrCodeUrl} alt="QR Code" className="w-20 h-20" />}
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Product:</span>
                  <span className="font-medium text-slate-700">{inspection.productName || 'Unknown'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Date:</span>
                  <span className="font-medium text-slate-700">{new Date(inspection.createdAt).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Rule Version:</span>
                  <span className="font-medium text-slate-700">{inspection.ruleSetId} v{inspection.ruleVersion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Score:</span>
                  <span className="font-bold text-slate-700">{inspection.overallScore}/100</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Issues:</span>
                  <span className="font-medium text-slate-700">{inspection.issues.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reviewer:</span>
                  <span className="font-medium text-slate-700">{inspection.reviewerName || 'Pending'}</span>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-slate-700 mb-3">Generate Report</h4>
            <p className="text-sm text-slate-500 mb-4">
              Download a complete PDF compliance report with all evidence, issues, and review decisions.
              The report is auditable and traceable to visual evidence.
            </p>
            <button
              onClick={handleDownload}
              disabled={generating}
              className="btn-primary flex items-center gap-2"
            >
              {generating ? 'Generating...' : 'Download PDF Report'}
              <FileDown className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Explainable Compliance */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Explainable Compliance Report</h3>
        <div className="space-y-3">
          {inspection.evidence.slice(0, 10).map((ev) => (
            <div key={ev.id} className="p-3 rounded-md border border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono text-teal-700">{ev.ruleId}</span>
                <span className={`badge text-xs ${
                  ev.validationResult === 'pass' ? 'badge-green' :
                  ev.validationResult === 'warning' ? 'badge-yellow' :
                  ev.validationResult === 'fail' ? 'badge-red' : 'badge-gray'
                }`}>{ev.validationResult}</span>
              </div>
              <div className="text-xs space-y-1 text-slate-600">
                <div><strong>What was checked:</strong> {ev.ruleDescription}</div>
                <div><strong>What was detected:</strong> {ev.fieldValue || 'Not detected'}</div>
                <div><strong>Where:</strong> {VIEW_LABELS_DISPLAY[ev.viewLabel]} view | <strong>OCR Confidence:</strong> {ev.ocrConfidence}%</div>
                <div><strong>Why flagged:</strong> {ev.validationMessage}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
