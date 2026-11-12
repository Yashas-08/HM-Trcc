import React, { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { Camera, CameraOff, CheckCircle2, QrCode, Search, Upload, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { DataTable, type TableColumn } from '../components/ui/DataTable';
import { EmptyState, ErrorBanner } from '../components/ui/States';

interface VerificationResponse {
  result: 'success' | 'invalid' | 'expired' | 'duplicate';
  message: string;
  verification: {
    booking_code: string;
    student_name: string;
    student_code: string;
    room_number: string;
    meal_type: string;
    booking_status: string;
    verified_status: string;
  } | null;
}

interface ScanHistoryRow {
  id: number;
  qr_token_raw: string;
  student_code: string | null;
  student_name: string | null;
  room_number: string;
  meal_type: string;
  scan_result: 'success' | 'invalid' | 'expired' | 'duplicate';
  message: string;
  scanned_by_name: string | null;
  scanned_at: string;
}

export const QrScannerPage: React.FC = () => {
  const [mealSession, setMealSession] = useState<'breakfast' | 'lunch' | 'dinner'>(() => {
    const h = new Date().getHours();
    if (h < 11) return 'breakfast';
    if (h < 16) return 'lunch';
    return 'dinner';
  });
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState('Camera idle — ready to scan or use manual lookup');
  const [manualInput, setManualInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [lastResult, setLastResult] = useState<VerificationResponse | null>(null);

  const [scans, setScans] = useState<ScanHistoryRow[]>([]);
  const [resultFilter, setResultFilter] = useState('all');
  const [error, setError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastScannedRef = useRef<{ token: string; time: number }>({ token: '', time: 0 });

  const loadScans = useCallback(async () => {
    try {
      const res = await api.get<{ scans: ScanHistoryRow[] }>(
        `/api/mess/qr/scans?result=${resultFilter}`,
      );
      setScans(res.scans);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load scan history');
    }
  }, [resultFilter]);

  useEffect(() => {
    loadScans();
  }, [loadScans]);

  const stopCamera = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setCameraStatus('Camera stopped');
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const verifyPayload = useCallback(
    async (payload: { qr_token?: string; student_lookup?: string }) => {
      setVerifying(true);
      setError('');
      try {
        const token = localStorage.getItem('hm_trcc_token');
        const res = await fetch('/api/mess/qr/verify', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ ...payload, meal_type: mealSession }),
        });
        const data = (await res.json()) as VerificationResponse & { error?: string };
        if (data.result) {
          setLastResult(data);
        } else {
          setError(data.error || 'Verification failed');
        }
        await loadScans();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to verify QR code');
      } finally {
        setVerifying(false);
      }
    },
    [mealSession, loadScans],
  );

  const scanFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !streamRef.current) return;

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height);
        if (decoded?.data) {
          const now = Date.now();
          if (
            decoded.data !== lastScannedRef.current.token ||
            now - lastScannedRef.current.time > 3000
          ) {
            lastScannedRef.current = { token: decoded.data, time: now };
            verifyPayload({ qr_token: decoded.data });
          }
        }
      }
    }
    rafRef.current = requestAnimationFrame(scanFrame);
  }, [verifyPayload]);

  const startCamera = async () => {
    setError('');
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('Camera API unavailable in this browser. Use QR image upload or manual lookup.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
      setCameraStatus('Camera active — hold meal QR code inside frame');
      rafRef.current = requestAnimationFrame(scanFrame);
    } catch {
      setCameraStatus('Camera permission denied or device unavailable. Use QR image upload or manual lookup.');
    }
  };

  const handleImageQrDecode = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const decoded = jsQR(imageData.data, imageData.width, imageData.height);
      if (decoded?.data) {
        verifyPayload({ qr_token: decoded.data });
      } else {
        setLastResult({
          result: 'invalid',
          message: 'Could not detect a valid QR code in the uploaded image.',
          verification: null,
        });
      }
    };
    img.src = URL.createObjectURL(file);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = manualInput.trim();
    if (!val) return;
    if (val.startsWith('HMTRCC-MEAL-')) {
      verifyPayload({ qr_token: val });
    } else {
      verifyPayload({ student_lookup: val });
    }
  };

  const scanCols: TableColumn<ScanHistoryRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div>
          <div className="font-semibold">{r.student_name || 'Unknown'}</div>
          <div className="text-[14px] leading-[1.45] text-[#777777]">{r.student_code || r.qr_token_raw}</div>
        </div>
      ),
    },
    {
      key: 'meal',
      header: 'Session',
      render: (r) => <span className="capitalize">{r.meal_type}</span>,
    },
    {
      key: 'result',
      header: 'Result',
      render: (r) => (
        <span
          className={`text-[14px] font-semibold leading-[1.35] capitalize ${
            r.scan_result === 'success'
              ? 'text-[#22A06B]'
              : r.scan_result === 'expired'
                ? 'text-[#C97A16]'
                : 'text-[#D9383A]'
          }`}
        >
          {r.scan_result}
        </span>
      ),
    },
    {
      key: 'time',
      header: 'Timestamp',
      align: 'right',
      render: (r) => <span className="text-[14px] leading-[1.45] text-[#777777]">{r.scanned_at}</span>,
    },
  ];

  return (
    <div>
      <PageHeader
        title="QR Meal Scanner"
        subtitle="Verify advance meal bookings via webcam QR scan, QR image upload, or manual Student ID lookup"
        actions={
          <div className="flex items-center gap-2 bg-white border border-[#E9E9E9] rounded-[8px] px-3 py-1.5">
            <span className="text-[14px] font-semibold text-[#777777]">Active Session:</span>
            {(['breakfast', 'lunch', 'dinner'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMealSession(m)}
                className={`px-3 py-1.5 rounded-[6px] text-[15px] font-semibold leading-[1.3] capitalize ${
                  mealSession === m ? 'bg-[#222222] text-white' : 'text-[#292929] hover:bg-[#F4F4F4]'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        }
      />

      {error ? <ErrorBanner message={error} /> : null}

      <div className="grid grid-cols-12 gap-5">
        {/* Left: Scanner & Manual Lookup */}
        <div className="col-span-5 space-y-5">
          <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">Camera Scanner</h2>
              <span className={`text-[14px] font-semibold leading-[1.35] ${cameraActive ? 'text-[#22A06B]' : 'text-[#777777]'}`}>
                {cameraActive ? 'Live' : 'Standby'}
              </span>
            </div>

            <div className="relative bg-[#222222] rounded-[10px] h-[250px] overflow-hidden flex items-center justify-center">
              <video
                ref={videoRef}
                muted
                playsInline
                className={`w-full h-full object-cover ${cameraActive ? 'block' : 'hidden'}`}
              />
              <canvas ref={canvasRef} className="hidden" />
              {!cameraActive ? (
                <div className="text-center text-[#AAAAAA] px-6">
                  <QrCode className="w-10 h-10 mx-auto mb-2 text-[#DDF58A]" />
                  <div className="text-[16px] font-medium leading-[1.5] text-white">{cameraStatus}</div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-3 mt-4">
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="flex-1 h-[40px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px] flex items-center justify-center gap-2 hover:bg-[#333333]"
                >
                  <Camera className="w-4 h-4" />
                  Start Camera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="flex-1 h-[40px] bg-[#D9383A] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px] flex items-center justify-center gap-2"
                >
                  <CameraOff className="w-4 h-4" />
                  Stop Camera
                </button>
              )}
              <label className="h-[40px] px-4 border border-[#E9E9E9] rounded-[8px] text-[15px] font-semibold leading-[1.3] text-[#292929] flex items-center gap-2 cursor-pointer hover:bg-[#F4F4F4]">
                <Upload className="w-4 h-4" />
                Decode QR Image
                <input type="file" accept="image/*" onChange={handleImageQrDecode} className="hidden" />
              </label>
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5">
            <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929] mb-1">
              Manual Lookup & Verification
            </h2>
            <p className="text-[14px] leading-[1.45] text-[#777777] mb-3">
              Enter Student ID (e.g., STU-2026-001), Booking Code, Student Name, or paste QR token.
            </p>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#777777] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  placeholder="Student ID, Booking Code, or QR Token..."
                  className="w-full h-[40px] pl-9 pr-3 text-[16px] font-normal leading-[1.45] border border-[#E9E9E9] rounded-[8px] focus:outline-none focus:border-[#292929]"
                />
              </div>
              <button
                type="submit"
                disabled={verifying || !manualInput.trim()}
                className="px-4 h-[40px] bg-[#222222] text-white text-[15px] font-semibold leading-[1.3] rounded-[8px] disabled:opacity-50"
              >
                {verifying ? 'Checking...' : 'Verify'}
              </button>
            </form>
          </div>
        </div>

        {/* Right: Verification Result & Scan History */}
        <div className="col-span-7 space-y-5">
          <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] p-5">
            <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929] mb-3">Verification Result</h2>
            {!lastResult ? (
              <div className="py-8 text-center text-[16px] leading-[1.5] text-[#777777] bg-[#F4F4F4] rounded-[10px]">
                Scan a meal QR code or submit a manual lookup to display verification status.
              </div>
            ) : (
              <div
                className={`p-4 rounded-[10px] border ${
                  lastResult.result === 'success'
                    ? 'bg-[#22A06B]/10 border-[#22A06B]/30'
                    : 'bg-[#D9383A]/10 border-[#D9383A]/30'
                }`}
              >
                <div className="flex items-center gap-2.5 mb-3">
                  {lastResult.result === 'success' ? (
                    <CheckCircle2 className="w-5 h-5 text-[#22A06B]" />
                  ) : (
                    <XCircle className="w-5 h-5 text-[#D9383A]" />
                  )}
                  <span
                    className={`text-[16px] font-bold leading-[1.4] ${
                      lastResult.result === 'success' ? 'text-[#22A06B]' : 'text-[#D9383A]'
                    }`}
                  >
                    {lastResult.message}
                  </span>
                </div>

                {lastResult.verification ? (
                  <div className="grid grid-cols-3 gap-3 text-[16px] leading-[1.45] bg-white rounded-[8px] p-3.5 border border-[#E9E9E9]">
                    <div>
                      <div className="text-[14px] leading-[1.4] text-[#777777]">Student</div>
                      <div className="font-semibold">{lastResult.verification.student_name}</div>
                    </div>
                    <div>
                      <div className="text-[14px] leading-[1.4] text-[#777777]">Student ID / Room</div>
                      <div className="font-semibold">
                        {lastResult.verification.student_code} · Room {lastResult.verification.room_number}
                      </div>
                    </div>
                    <div>
                      <div className="text-[14px] leading-[1.4] text-[#777777]">Meal & Booking Status</div>
                      <div className="font-semibold capitalize">
                        {lastResult.verification.meal_type} · {lastResult.verification.verified_status}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="bg-[#FFFFFF] border border-[#E9E9E9] rounded-[12px] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#E9E9E9] flex items-center justify-between gap-4">
              <h2 className="font-slab text-[18px] font-semibold leading-[1.3] text-[#292929]">Scan History</h2>
              <div className="flex items-center gap-1.5">
                {(['all', 'success', 'invalid', 'expired', 'duplicate'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setResultFilter(f)}
                    className={`px-3 py-1.5 rounded-[6px] text-[15px] font-semibold leading-[1.3] capitalize ${
                      resultFilter === f
                        ? 'bg-[#222222] text-white'
                        : 'bg-[#F4F4F4] text-[#292929] hover:bg-[#E9E9E9]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {scans.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={QrCode}
                  title="No scans recorded"
                  description="No QR scan logs match the selected result filter."
                />
              </div>
            ) : (
              <DataTable columns={scanCols} data={scans} rowKey={(r) => r.id} compact />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

