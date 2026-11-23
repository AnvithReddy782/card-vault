import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Smartphone,
  Wifi,
  ShieldCheck,
  ShieldAlert,
  Copy,
  Check,
  X,
  ExternalLink,
  RefreshCw,
  Camera,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface NetworkInfo {
  lanIps: string[];
  primaryIp: string;
  httpPort: number;
  httpsPort: number;
  httpUrl: string;
  httpsUrl: string;
  isSecureContextRecommended: boolean;
  lastMobileDevice?: {
    connectedAt: number | null;
    userAgent: string;
    ip: string;
    isRecentlyActive: boolean;
  };
}

interface MobileConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileConnectModal: React.FC<MobileConnectModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [activeProtocol, setActiveProtocol] = useState<'https' | 'http'>('https');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const fetchNetworkInfo = async () => {
    try {
      setIsRefreshing(true);
      const res = await fetch('/api/network-info');
      if (res.ok) {
        const data: NetworkInfo = await res.json();
        setNetworkInfo(data);
      }
    } catch (err) {
      console.warn('Failed to load network info:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchNetworkInfo();
    const interval = setInterval(fetchNetworkInfo, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  const targetUrl =
    activeProtocol === 'https'
      ? networkInfo?.httpsUrl || `https://${window.location.hostname}:3001`
      : networkInfo?.httpUrl || `http://${window.location.hostname}:3000`;

  useEffect(() => {
    if (!isOpen || !targetUrl) return;
    let isCancelled = false;

    QRCode.toDataURL(targetUrl, {
      width: 220,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!isCancelled) setQrDataUrl(url);
      })
      .catch((err) => {
        console.warn('QR code generation error:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, targetUrl]);

  const handleCopy = () => {
    if (!targetUrl) return;
    navigator.clipboard.writeText(targetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  if (!isOpen) return null;

  const isConnected = Boolean(networkInfo?.lastMobileDevice?.isRecentlyActive);
  const userAgentSummary = networkInfo?.lastMobileDevice?.userAgent
    ? networkInfo.lastMobileDevice.userAgent.includes('iPhone')
      ? 'iPhone (Safari)'
      : networkInfo.lastMobileDevice.userAgent.includes('iPad')
      ? 'iPad'
      : networkInfo.lastMobileDevice.userAgent.includes('Android')
      ? 'Android Device'
      : 'Mobile Browser'
    : 'Unknown Device';

  return (
    <div className="fixed inset-0 z-50 flex items-stretch sm:items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in overflow-hidden">
      <div className="relative w-full h-[100dvh] sm:h-auto max-w-2xl bg-white rounded-none sm:rounded-3xl shadow-2xl sm:border border-slate-200 overflow-hidden flex flex-col sm:max-h-[94vh]">
        {/* Header with Safe Area Top Padding */}
        <div className="px-5 pt-[max(env(safe-area-inset-top),12px)] pb-3.5 sm:py-3.5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Connect Mobile Phone
                {isConnected ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    Waiting for Phone
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500">
                Scan your physical business cards using your mobile phone camera
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-white/80 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 p-4 sm:p-5 overflow-y-auto overscroll-contain space-y-3.5">
          {/* Live Status Banner */}
          {isConnected ? (
            <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3 shadow-xs">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Check className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <span>{userAgentSummary} is Active</span>
                  <span className="text-[10px] font-normal text-emerald-700 bg-emerald-200/60 px-1.5 py-0.2 rounded font-mono">
                    {networkInfo?.lastMobileDevice?.ip.replace('::ffff:', '')}
                  </span>
                </div>
                <div className="text-[11px] text-emerald-700 truncate">
                  Ready to scan cards on mobile! Captured cards sync instantly to your PC & Sheets.
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center gap-2.5 text-xs">
              <Wifi className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                <strong>Same Wi-Fi Required:</strong> Connect your phone to the same Wi-Fi network as this PC (
                <span className="font-mono font-semibold">192.168.1.x</span>).
              </span>
            </div>
          )}

          {/* Protocol Toggle (HTTPS vs HTTP) */}
          <div className="flex items-center justify-between gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveProtocol('https')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                activeProtocol === 'https'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>HTTPS (Port {networkInfo?.httpsPort || 3001})</span>
              <span className="text-[10px] bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                Camera Live
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveProtocol('http')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                activeProtocol === 'http'
                  ? 'bg-white text-slate-900 font-semibold shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-amber-500" />
              <span>HTTP (Port {networkInfo?.httpPort || 3000})</span>
              <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded">
                Gallery Only
              </span>
            </button>
          </div>

          {/* QR Code and URL box */}
          <div className="flex flex-col sm:flex-row items-center gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
            <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs shrink-0">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Scan to open CardVault on Mobile"
                  className="w-36 h-36 object-contain rounded-lg"
                />
              ) : (
                <div className="w-36 h-36 flex items-center justify-center text-xs text-slate-400">
                  Generating QR...
                </div>
              )}
            </div>

            <div className="flex-1 w-full space-y-3">
              <div>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Step 1: Open on Phone
                </span>
                <p className="text-xs text-slate-600 mt-0.5">
                  Point your phone's Camera app at the QR code, or type this URL into Safari or Chrome:
                </p>
              </div>

              {/* URL with Copy Button */}
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1.5 shadow-2xs">
                <input
                  type="text"
                  readOnly
                  value={targetUrl}
                  className="flex-1 bg-transparent px-2 text-xs font-mono font-medium text-slate-800 focus:outline-none truncate select-all"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer ${
                    copied
                      ? 'bg-slate-900 text-white'
                      : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200'
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-1">
                <span>LAN IP:</span>
                <span className="font-mono font-semibold text-slate-700">
                  {networkInfo?.primaryIp || '192.168.1.71'}
                </span>
                <button
                  type="button"
                  onClick={fetchNetworkInfo}
                  className="p-1 hover:text-slate-900 ml-auto flex items-center gap-1 text-[10px] text-slate-500 cursor-pointer"
                  title="Refresh network IP"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
            </div>
          </div>

          {/* Step 2: One-Time SSL Acceptance Guide (Crucial for HTTPS Camera) */}
          {activeProtocol === 'https' && (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5">
                <Info className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-bold text-slate-800">
                  Step 2: One-Time SSL Security Prompt (How to Proceed)
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Because CardVault runs on your local computer's private Wi-Fi IP, the browser will show a standard local certificate safety notice. Tap proceed to unlock the camera:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {/* Safari Guide */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    Apple iPhone (Safari)
                  </div>
                  <ol className="text-[11px] text-slate-600 space-y-1 list-decimal list-inside pl-0.5">
                    <li>Tap <strong className="text-slate-800">"Show Details"</strong></li>
                    <li>Tap <strong className="text-slate-800">"visit this website"</strong> at the bottom</li>
                    <li>Confirm <strong className="text-blue-700">"Visit Website"</strong></li>
                  </ol>
                </div>

                {/* Chrome Guide */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    Android (Chrome)
                  </div>
                  <ol className="text-[11px] text-slate-600 space-y-1 list-decimal list-inside pl-0.5">
                    <li>Tap <strong className="text-slate-800">"Advanced"</strong></li>
                    <li>Tap <strong className="text-blue-700">"Proceed to 192.168.1.71 (unsafe)"</strong></li>
                    <li>Allow camera permission when prompted</li>
                  </ol>
                </div>
              </div>
            </div>
          )}

          {/* Troubleshooting Accordion */}
          <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-1 text-xs text-amber-900">
            <div className="font-bold flex items-center gap-1.5 text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Still showing "Site can't be reached" or not loading?</span>
            </div>
            <ul className="text-[11px] text-amber-800/90 space-y-0.5 list-disc list-inside pl-1">
              <li>
                <strong>Turn off Mobile Data (5G/4G):</strong> Make sure your phone is exclusively on Wi-Fi.
              </li>
              <li>
                <strong>Router AP Isolation:</strong> Some guest Wi-Fi networks block devices from seeing each other. Connect both to the main Wi-Fi network.
              </li>
              <li>
                <strong>Windows Firewall:</strong> Inbound Node.js traffic on ports 3000 and 3001 must be allowed (already configured).
              </li>
            </ul>
          </div>
        </div>

        {/* Footer with Safe Area Bottom Padding */}
        <div className="shrink-0 px-4 sm:px-6 py-3 pb-[max(env(safe-area-inset-bottom),14px)] border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="text-[11px] sm:text-xs text-slate-500 truncate mr-2">
            Scanning on phone automatically adds leads to this PC in real-time.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
