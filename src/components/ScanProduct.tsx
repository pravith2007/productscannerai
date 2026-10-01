import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle, AlertTriangle, Check, CheckCircle2, ChevronRight, Image as ImageIcon,
  Loader2, Package, RotateCcw, ScanLine, SwitchCamera, Trash2, Upload, Video, Zap, ZapOff,
} from 'lucide-react';
import type { Inspection, TimelineEvent, ViewLabel } from '@/lib/types';
import { VIEW_LABELS, VIEW_LABELS_DISPLAY } from '@/lib/types';
import { runFullInspection } from '@/lib/inspectionPipeline';
import { saveInspection } from '@/lib/db';

interface ScanProductProps {
  onInspectionComplete: (passportId: string) => void;
}

interface CapturedImage {
  viewLabel: ViewLabel;
  imageUrl: string;
  preview: string;
  quality: number;
}

interface QualityAssessment {
  score: number;
  warnings: string[];
}

interface PendingCapture {
  image: CapturedImage;
  assessment: QualityAssessment;
}

const MANDATORY_VIEWS: ViewLabel[] = ['front', 'back'];

async function assessCapture(imageUrl: string): Promise<QualityAssessment> {
  const image = new Image();
  image.src = imageUrl;
  await new Promise<void>((resolve) => {
    image.onload = () => resolve();
    image.onerror = () => resolve();
  });

  if (!image.naturalWidth || !image.naturalHeight) {
    return { score: 0, warnings: ['The image could not be inspected.'] };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 120;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { score: 70, warnings: [] };
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const grayscale = new Float32Array(canvas.width * canvas.height);
  let brightness = 0;
  let glarePixels = 0;
  for (let pixel = 0; pixel < grayscale.length; pixel += 1) {
    const offset = pixel * 4;
    const value = 0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
    grayscale[pixel] = value;
    brightness += value;
    if (value > 247) glarePixels += 1;
  }

  brightness /= grayscale.length;
  let laplacianTotal = 0;
  let centerEdges = 0;
  let centerPixels = 0;
  for (let y = 1; y < canvas.height - 1; y += 1) {
    for (let x = 1; x < canvas.width - 1; x += 1) {
      const index = y * canvas.width + x;
      const laplacian = grayscale[index - canvas.width] + grayscale[index - 1]
        + grayscale[index + 1] + grayscale[index + canvas.width] - 4 * grayscale[index];
      laplacianTotal += Math.abs(laplacian);
      if (x > 20 && x < 140 && y > 18 && y < 102) {
        centerPixels += 1;
        if (Math.abs(laplacian) > 28) centerEdges += 1;
      }
    }
  }

  const blurMeasure = laplacianTotal / ((canvas.width - 2) * (canvas.height - 2));
  const centerDetail = centerEdges / centerPixels;
  const glareRatio = glarePixels / grayscale.length;
  const warnings: string[] = [];
  let score = 100;

  if (image.naturalWidth < 640 || image.naturalHeight < 480) {
    warnings.push('Low resolution may make small print difficult to read.');
    score -= 18;
  }
  if (brightness < 48 || brightness > 218) {
    warnings.push(brightness < 48 ? 'The image is too dark.' : 'The image is overexposed.');
    score -= 24;
  }
  if (blurMeasure < 9) {
    warnings.push('The image may be out of focus.');
    score -= 28;
  }
  if (glareRatio > 0.18) {
    warnings.push('Strong reflections may obscure label details.');
    score -= 22;
  }
  if (centerDetail < 0.012) {
    warnings.push('Label detail is not clear in the center of the frame.');
    score -= 20;
  }

  return { score: Math.max(0, score), warnings };
}

export default function ScanProduct({ onInspectionComplete }: ScanProductProps) {
  const [captured, setCaptured] = useState<Map<ViewLabel, CapturedImage>>(new Map());
  const [processing, setProcessing] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [captureView, setCaptureView] = useState<ViewLabel | null>(null);
  const [pendingCapture, setPendingCapture] = useState<PendingCapture | null>(null);
  const [qualityNotice, setQualityNotice] = useState<{ label: ViewLabel; score: number } | null>(null);
  const [previewLabel, setPreviewLabel] = useState<ViewLabel | null>(null);
  const [centerDetailVisible, setCenterDetailVisible] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const alignmentCanvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const currentView = captureView || VIEW_LABELS.find((label) => !captured.has(label)) || null;
  const hasMandatoryViews = MANDATORY_VIEWS.every((label) => captured.has(label));
  const maxReached = captured.size === VIEW_LABELS.length;

  useEffect(() => {
    if (!cameraOpen) return;
    let cancelled = false;
    setCameraError(null);
    setTorchAvailable(false);

    const openCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera unavailable. Upload Front and Back images manually.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const track = stream.getVideoTracks()[0] as MediaStreamTrack & {
          getCapabilities?: () => { torch?: boolean };
        };
        const capabilities = track.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
        setTorchAvailable(Boolean(capabilities?.torch));
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => undefined);
        }
      } catch (cameraFailure) {
        const failureName = cameraFailure instanceof DOMException ? cameraFailure.name : '';
        const message = failureName === 'NotAllowedError' || failureName === 'SecurityError'
          ? 'Camera permission was denied. Upload Front and Back images manually.'
          : failureName === 'NotFoundError' || failureName === 'OverconstrainedError'
            ? 'No camera is available. Upload Front and Back images manually.'
            : 'Camera unavailable. Upload Front and Back images manually.';
        setCameraError(message);
      }
    };

    void openCamera();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      setTorchEnabled(false);
    };
  }, [cameraOpen, facingMode]);

  useEffect(() => {
    if (!cameraOpen || cameraError) return;
    let frame = 0;
    let active = true;
    const canvas = alignmentCanvasRef.current;
    const context = canvas?.getContext('2d', { willReadFrequently: true });

    const inspectFrame = () => {
      const video = videoRef.current;
      if (active && canvas && context && video && video.readyState >= 2) {
        canvas.width = 64;
        canvas.height = 48;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let edges = 0;
        let samples = 0;
        for (let y = 1; y < 47; y += 1) {
          for (let x = 1; x < 63; x += 1) {
            if (x < 9 || x > 55 || y < 6 || y > 42) continue;
            const center = (y * 64 + x) * 4;
            const right = center + 4;
            const below = center + 64 * 4;
            const centerGray = pixels[center] * 0.299 + pixels[center + 1] * 0.587 + pixels[center + 2] * 0.114;
            const rightGray = pixels[right] * 0.299 + pixels[right + 1] * 0.587 + pixels[right + 2] * 0.114;
            const belowGray = pixels[below] * 0.299 + pixels[below + 1] * 0.587 + pixels[below + 2] * 0.114;
            if (Math.abs(centerGray - rightGray) + Math.abs(centerGray - belowGray) > 42) edges += 1;
            samples += 1;
          }
        }
        setCenterDetailVisible(samples > 0 && edges / samples > 0.095);
      }
      if (active) frame = window.requestAnimationFrame(inspectFrame);
    };

    frame = window.requestAnimationFrame(inspectFrame);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
    };
  }, [cameraOpen, cameraError]);

  const acceptCapture = useCallback((pending: PendingCapture) => {
    setCaptured((previous) => {
      const next = new Map(previous);
      next.set(pending.image.viewLabel, pending.image);
      return next;
    });
    setQualityNotice({ label: pending.image.viewLabel, score: pending.assessment.score });
    setPendingCapture(null);
    setCaptureView(null);
    setPreviewLabel(null);
  }, []);

  const reviewCapture = useCallback(async (viewLabel: ViewLabel, imageUrl: string) => {
    const assessment = await assessCapture(imageUrl);
    const image = { viewLabel, imageUrl, preview: imageUrl, quality: assessment.score };
    if (assessment.score < 65 || assessment.warnings.length >= 2) {
      setPendingCapture({ image, assessment });
    } else {
      acceptCapture({ image, assessment });
    }
  }, [acceptCapture]);

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !currentView || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      setError('Unable to capture an image from this camera.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    await reviewCapture(currentView, canvas.toDataURL('image/jpeg', 0.92));
  };

  const handleFileSelect = (viewLabel: ViewLabel, file?: File) => {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setError('The selected image could not be read.');
    reader.onload = () => {
      const imageUrl = reader.result as string;
      void reviewCapture(viewLabel, imageUrl);
    };
    reader.readAsDataURL(file);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0] as (MediaStreamTrack & {
      applyConstraints?: (constraints: MediaTrackConstraints) => Promise<void>;
    }) | undefined;
    if (!track?.applyConstraints) return;
    const nextTorch = !torchEnabled;
    try {
      await track.applyConstraints({ advanced: [{ torch: nextTorch } as MediaTrackConstraintSet] });
      setTorchEnabled(nextTorch);
    } catch {
      setTorchAvailable(false);
    }
  };

  const removeImage = (viewLabel: ViewLabel) => {
    setCaptured((previous) => {
      const next = new Map(previous);
      next.delete(viewLabel);
      return next;
    });
    setQualityNotice(null);
    setPreviewLabel(null);
  };

  const retakeImage = (viewLabel: ViewLabel) => {
    setPreviewLabel(null);
    setPendingCapture(null);
    setCaptureView(viewLabel);
    setCameraOpen(true);
  };

  const handleAnalyze = async () => {
    if (!hasMandatoryViews || processing) return;
    setProcessing(true);
    setError(null);
    setTimeline([]);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setCameraOpen(false);

    try {
      const images = VIEW_LABELS
        .map((viewLabel) => captured.get(viewLabel))
        .filter((image): image is CapturedImage => Boolean(image))
        .map(({ viewLabel, imageUrl }) => ({ viewLabel, imageUrl }));

      const inspection: Inspection = await runFullInspection(images, (events) => {
        setTimeline([...events]);
      });

      // The existing persistence layer stores each image alongside its view_label.
      const inspectionId = await saveInspection(inspection);
      if (!inspectionId) {
        throw new Error('Analysis completed, but the inspection could not be saved. Please try again.');
      }
      onInspectionComplete(inspection.passportId);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Processing failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Scan Product</h1>
        <p className="mt-1 text-sm text-slate-500">
          Capture the front and back labels, then add other sides for a more complete inspection.
        </p>
      </div>

      {error && <AlertBanner message={error} />}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-teal-700" />
            <h2 className="text-sm font-semibold text-slate-800">Multi-view package scan</h2>
          </div>
          <span className="text-xs font-medium text-slate-500">{captured.size}/6 images</span>
        </div>

        <div className="p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2" aria-label="Capture progress">
            {VIEW_LABELS.map((label) => {
              const isCaptured = captured.has(label);
              const isCurrent = !isCaptured && label === currentView;
              return (
                <div key={label} className={`flex items-center gap-1.5 text-xs font-semibold uppercase ${
                  isCaptured ? 'text-green-700' : isCurrent ? 'text-blue-700' : 'text-slate-400'
                }`}>
                  {isCaptured ? <Check className="h-3.5 w-3.5" /> : <span className={`h-2.5 w-2.5 rounded-full ${isCurrent ? 'bg-blue-600' : 'bg-slate-300'}`} />}
                  {VIEW_LABELS_DISPLAY[label]}
                </div>
              );
            })}
          </div>

          {cameraOpen ? (
            <div className="overflow-hidden rounded-md bg-slate-950">
              <div className="px-4 pb-3 pt-4 text-center text-white">
                <p className="text-xs font-bold uppercase tracking-wider text-teal-300">Current view</p>
                <h3 className="mt-1 text-lg font-bold sm:text-xl">
                  {maxReached ? 'ALL VIEWS CAPTURED' : `CAPTURE ${currentView ? VIEW_LABELS_DISPLAY[currentView].toUpperCase() : ''} SIDE`}
                </h3>
              </div>

              <div className="relative mx-auto aspect-[4/3] w-full max-w-3xl overflow-hidden bg-black sm:aspect-video">
                {cameraError ? (
                  <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 px-6 text-center text-white">
                    <Video className="h-9 w-9 text-slate-400" />
                    <p className="max-w-sm text-sm">{cameraError}</p>
                  </div>
                ) : (
                  <>
                    <video ref={videoRef} autoPlay muted playsInline className="h-full w-full object-cover" />
                    <div className="pointer-events-none absolute left-[12%] right-[12%] top-[12%] bottom-[12%] flex items-center justify-center border-[3px] border-white shadow-[0_0_0_999px_rgba(0,0,0,0.12)]">
                      <span className="bg-black/45 px-3 py-1 text-center text-xs font-semibold text-white sm:text-sm">Align the complete label inside the frame</span>
                    </div>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/65 px-3 py-1.5 text-xs font-semibold text-white">
                      {centerDetailVisible ? '✓ CENTER DETAIL VISIBLE' : '⚠ CHECK LABEL POSITION'}
                    </div>
                  </>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 px-4 py-4 text-white">
                <button
                  type="button"
                  onClick={() => { setFacingMode((mode) => mode === 'environment' ? 'user' : 'environment'); setCenterDetailVisible(false); }}
                  className="rounded-full border border-white/30 p-3 hover:bg-white/10"
                  aria-label="Switch camera"
                  title="Switch camera"
                >
                  <SwitchCamera className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void capturePhoto()}
                  disabled={Boolean(cameraError) || !currentView || maxReached || Boolean(pendingCapture)}
                  className="flex min-w-36 items-center justify-center gap-2 rounded-full bg-teal-500 px-6 py-3 text-sm font-bold text-white hover:bg-teal-400 disabled:cursor-not-allowed disabled:bg-slate-600"
                >
                  <ScanLine className="h-5 w-5" />
                  {maxReached ? 'MAXIMUM 6 IMAGES REACHED' : 'CAPTURE'}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleTorch()}
                  disabled={!torchAvailable}
                  className="rounded-full border border-white/30 p-3 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label={torchEnabled ? 'Turn flash off' : 'Turn flash on'}
                  title={torchAvailable ? 'Toggle flash' : 'Flash is not supported by this camera'}
                >
                  {torchEnabled ? <ZapOff className="h-5 w-5" /> : <Zap className="h-5 w-5" />}
                </button>
              </div>
              <div className="flex items-center justify-between border-t border-white/10 px-4 py-3 text-xs text-slate-300">
                <span>{captured.size}/6 captured</span>
                <span>{currentView ? VIEW_LABELS_DISPLAY[currentView] : 'Complete'}</span>
                <button type="button" onClick={() => setCameraOpen(false)} className="text-white underline underline-offset-2">Close camera</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => { setCaptureView(null); setCameraOpen(true); }}
              disabled={maxReached || processing}
              className="flex w-full flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-slate-700 hover:border-teal-500 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Video className="h-8 w-8 text-teal-700" />
              <span className="text-sm font-semibold">{maxReached ? 'All package views captured' : 'Open camera to capture next view'}</span>
              {!maxReached && <span className="text-xs text-slate-500">{currentView ? `Next: ${VIEW_LABELS_DISPLAY[currentView]}` : 'All views captured'}</span>}
            </button>
          )}

          {cameraError && (
            <div className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Camera unavailable. Upload Front and Back images manually.</span>
            </div>
          )}
          <canvas ref={alignmentCanvasRef} className="hidden" />
        </div>
      </section>

      {pendingCapture && (
        <div className="flex flex-col gap-4 rounded-md border border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center">
          <img src={pendingCapture.image.preview} alt={`${VIEW_LABELS_DISPLAY[pendingCapture.image.viewLabel]} quality check`} className="h-24 w-24 rounded object-cover" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900"><AlertTriangle className="h-4 w-4" /> IMAGE QUALITY LOW</p>
            <p className="mt-1 text-sm text-amber-800">The product label may not be readable. Quality estimate: {pendingCapture.assessment.score}%.</p>
            {pendingCapture.assessment.warnings.length > 0 && <p className="mt-1 text-xs text-amber-800">{pendingCapture.assessment.warnings.join(' ')}</p>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { setCaptureView(pendingCapture.image.viewLabel); setPendingCapture(null); setCameraOpen(true); }} className="btn-secondary flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Retake</button>
            <button type="button" onClick={() => acceptCapture(pendingCapture)} className="btn-primary whitespace-nowrap">Use Anyway</button>
          </div>
        </div>
      )}

      {qualityNotice && !pendingCapture && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span><strong>{VIEW_LABELS_DISPLAY[qualityNotice.label].toUpperCase()} IMAGE ACCEPTED</strong> · Image quality: {qualityNotice.score}%</span>
        </div>
      )}

      <section aria-label="Captured package views">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Captured images</h2>
          <span className="text-xs text-slate-500">{captured.size}/6 images</span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {VIEW_LABELS.map((label) => {
            const image = captured.get(label);
            return (
              <div key={label} className="overflow-hidden rounded-md border border-slate-200 bg-white">
                <input
                  ref={(element) => { fileInputRefs.current[label] = element; }}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(event) => {
                    handleFileSelect(label, event.target.files?.[0]);
                    event.target.value = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => image ? setPreviewLabel(label) : fileInputRefs.current[label]?.click()}
                  disabled={processing || (!image && maxReached)}
                  className="relative block aspect-[4/3] w-full bg-slate-100 text-left disabled:cursor-not-allowed"
                  aria-label={image ? `Preview ${VIEW_LABELS_DISPLAY[label]} image` : `Upload ${VIEW_LABELS_DISPLAY[label]} image`}
                >
                  {image ? <img src={image.preview} alt={`${VIEW_LABELS_DISPLAY[label]} package view`} className="h-full w-full object-cover" /> : (
                    <span className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
                      <Upload className="h-5 w-5" /><span className="text-xs">Upload view</span>
                    </span>
                  )}
                  <span className="absolute left-1.5 top-1.5 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-white">{VIEW_LABELS_DISPLAY[label]}</span>
                  {image && <span className="absolute right-1.5 top-1.5 rounded-full bg-green-600 p-1 text-white"><Check className="h-3 w-3" /></span>}
                </button>
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className={`text-xs font-medium ${image ? 'text-green-700' : 'text-slate-400'}`}>{image ? `Quality ${image.quality}%` : 'Not captured'}</span>
                  {image && <div className="flex gap-1">
                    <button type="button" onClick={() => retakeImage(label)} disabled={processing} className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-teal-700" aria-label={`Retake ${VIEW_LABELS_DISPLAY[label]}`} title="Retake"><RotateCcw className="h-3.5 w-3.5" /></button>
                    <button type="button" onClick={() => removeImage(label)} disabled={processing} className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-700" aria-label={`Delete ${VIEW_LABELS_DISPLAY[label]}`} title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {previewLabel && captured.get(previewLabel) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={`${VIEW_LABELS_DISPLAY[previewLabel]} image preview`} onClick={() => setPreviewLabel(null)}>
          <div className="w-full max-w-xl rounded-md bg-white p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">{VIEW_LABELS_DISPLAY[previewLabel]} view</h3>
              <button type="button" onClick={() => setPreviewLabel(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close preview">×</button>
            </div>
            <img src={captured.get(previewLabel)?.preview} alt={`${VIEW_LABELS_DISPLAY[previewLabel]} package view enlarged`} className="max-h-[65vh] w-full rounded object-contain" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => removeImage(previewLabel)} className="btn-secondary flex items-center gap-1.5"><Trash2 className="h-4 w-4" /> Delete</button>
              <button type="button" onClick={() => retakeImage(previewLabel)} className="btn-primary flex items-center gap-1.5"><RotateCcw className="h-4 w-4" /> Retake</button>
            </div>
          </div>
        </div>
      )}

      {processing && (
        <section className="card p-5">
          <div className="mb-4 flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin text-teal-700" /><h2 className="text-sm font-semibold text-slate-700">Processing pipeline</h2></div>
          <div className="space-y-2">
            {timeline.map((event, index) => <div key={`${event.step}-${index}`} className="flex items-center gap-3 text-sm">
              <div className={`h-2 w-2 rounded-full ${event.status === 'completed' ? 'bg-green-500' : event.status === 'in_progress' ? 'animate-pulse bg-teal-500' : event.status === 'failed' ? 'bg-red-500' : 'bg-slate-300'}`} />
              <span className="font-medium text-slate-700">{event.label}</span>
              {event.message && <span className="text-xs text-slate-400">{event.message}</span>}
            </div>)}
          </div>
        </section>
      )}

      <section className="border-t border-slate-200 pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">{captured.size}/6 images captured</p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {MANDATORY_VIEWS.map((label) => <span key={label} className={captured.has(label) ? 'text-green-700' : 'text-amber-700'}>
                {captured.has(label) ? '✓' : '○'} {VIEW_LABELS_DISPLAY[label]} {captured.has(label) ? 'captured' : 'required'}
              </span>)}
            </div>
            {hasMandatoryViews ? (
              <p className="mt-2 max-w-2xl text-sm text-teal-800">Mandatory views complete. You can analyze now or capture additional views for a more complete inspection.</p>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-amber-800"><AlertCircle className="h-4 w-4" />Front and Back images are required before package analysis.</p>
            )}
            <p className="mt-1 text-xs text-slate-500">Optional views: Left, Right, Top, Bottom</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {hasMandatoryViews && !maxReached && !cameraOpen && (
              <button type="button" onClick={() => { setCaptureView(null); setCameraOpen(true); }} className="btn-secondary flex items-center justify-center gap-2" disabled={processing}>
                <ImageIcon className="h-4 w-4" /> Capture More Views
              </button>
            )}
            <button type="button" onClick={() => void handleAnalyze()} disabled={!hasMandatoryViews || processing} className="btn-primary flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
              {processing ? <><Loader2 className="h-4 w-4 animate-spin" /> Analyzing...</> : <>Analyze Package <ChevronRight className="h-4 w-4" /></>}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function AlertBanner({ message }: { message: string }) {
  return <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 p-4">
    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
    <p className="text-sm text-red-700">{message}</p>
  </div>;
}