import React, { useState, useEffect } from 'react';
import {
  Webhook,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Send,
  RefreshCw,
  Copy,
  Check,
  Key,
  Shield,
  Sliders,
  Terminal,
  Activity,
  History,
  FileCode,
  Zap,
  Lock,
  Eye,
  EyeOff,
  Trash2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { formatPrice } from '../utils/format';
import { AnalysisResult } from '../types';

export interface WebhookConfig {
  enabled: boolean;
  webhookUrl: string;
  signingSecret: string;
  authType: 'HMAC_SHA256' | 'BEARER' | 'CUSTOM_HEADER' | 'NONE';
  customHeaderName?: string;
  customHeaderValue?: string;
  formatPreset: 'botx_tradingview' | 'endellion_full' | 'cornix' | 'three_commas';
  exchange: string;
  autoDispatch: boolean;
  minConfidence: number;
  defaultLeverage: number;
  defaultSize: string;
  dca: {
    enabled: boolean;
    triggerDropPercent: number;
    stepDropPercent?: number;
    amountMode: 'FIXED' | 'PERCENT_EQUITY';
    amount: number;
    maxSteps: number;
  };
  partialTps: {
    enabled: boolean;
    tp1Percent: number;
    tp2Percent: number;
    tp3Percent: number;
  };
  breakeven: {
    enabled: boolean;
    moveAtProfitPercent: number;
    safeProfitPercent?: number;
  };
  trailing: {
    enabled: boolean;
    callbackPercent: number;
  };
}

export interface WebhookDeliveryLog {
  id: string;
  timestamp: string;
  symbol: string;
  action: string;
  webhookUrl: string;
  statusCode: number | null;
  statusText: string;
  success: boolean;
  latencyMs: number;
  requestHeaders: Record<string, string>;
  requestPayload: any;
  responseBody: string;
  error?: string;
}

interface WebhookEngineModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSymbol: string;
  currentPrice: number;
  activeAnalysis?: AnalysisResult | null;
}

export const WebhookEngineModal: React.FC<WebhookEngineModalProps> = ({
  isOpen,
  onClose,
  currentSymbol,
  currentPrice,
  activeAnalysis,
}) => {
  const [activeTab, setActiveTab] = useState<'config' | 'live' | 'logs' | 'docs'>('config');
  const [config, setConfig] = useState<WebhookConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Live signal test state
  const [testSymbol, setTestSymbol] = useState(currentSymbol);
  const [testDirection, setTestDirection] = useState<'LONG' | 'SHORT' | 'MANAGE' | 'CLOSE_LONG' | 'CLOSE_SHORT' | 'PARTIAL_EXIT'>('LONG');
  const [testPrice, setTestPrice] = useState(currentPrice || 96450);
  const [testLimitEntry, setTestLimitEntry] = useState<number | undefined>(
    activeAnalysis?.limitEntry || (currentPrice ? (activeAnalysis?.signal === 'SHORT' ? currentPrice * 1.005 : currentPrice * 0.995) : 96100)
  );
  const [testSl, setTestSl] = useState(
    activeAnalysis?.sl || (currentPrice ? (activeAnalysis?.signal === 'SHORT' ? currentPrice * 1.02 : currentPrice * 0.98) : 94800)
  );
  const [testTp1, setTestTp1] = useState(activeAnalysis?.tp1 || 0);
  const [testTp2, setTestTp2] = useState(activeAnalysis?.tp2 || 0);
  const [testTp3, setTestTp3] = useState(activeAnalysis?.tp3 || activeAnalysis?.tp || 0);
  const [previewPayload, setPreviewPayload] = useState<any>(null);
  const [previewHeaders, setPreviewHeaders] = useState<Record<string, string>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{ success: boolean; message: string; statusCode?: number } | null>(null);

  // Delivery history
  const [deliveries, setDeliveries] = useState<WebhookDeliveryLog[]>([]);
  const [selectedLog, setSelectedLog] = useState<WebhookDeliveryLog | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);

  // Secret visibility toggle
  const [showSecret, setShowSecret] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchConfig();
      fetchLogs();
      if (currentSymbol) setTestSymbol(currentSymbol);
      if (currentPrice) setTestPrice(currentPrice);
      if (activeAnalysis?.signal && activeAnalysis.signal !== 'NO TRADE') {
        setTestDirection(activeAnalysis.signal as any);
      }
      if (activeAnalysis?.limitEntry) setTestLimitEntry(activeAnalysis.limitEntry);
      if (activeAnalysis?.sl) setTestSl(activeAnalysis.sl);
      if (activeAnalysis?.tp1) setTestTp1(activeAnalysis.tp1);
      if (activeAnalysis?.tp2) setTestTp2(activeAnalysis.tp2);
      if (activeAnalysis?.tp3) setTestTp3(activeAnalysis.tp3);
    }
  }, [isOpen, currentSymbol, currentPrice, activeAnalysis]);

  useEffect(() => {
    if (config) {
      fetchPreview();
    }
  }, [config, testSymbol, testDirection, testPrice, testLimitEntry, testSl, testTp1, testTp2, testTp3]);

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/webhook/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (err) {
      console.error('Failed to fetch webhook config:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      setLogsLoading(true);
      const res = await fetch('/api/webhook/history');
      if (res.ok) {
        const data = await res.json();
        setDeliveries(data.deliveries || []);
      }
    } catch (err) {
      console.error('Failed to fetch webhook logs:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;
    try {
      setSaving(true);
      const res = await fetch('/api/webhook/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        const updated = await res.json();
        setConfig(updated);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error('Failed to save config:', err);
    } finally {
      setSaving(false);
    }
  };

  const fetchPreview = async () => {
    if (!config) return;
    try {
      setPreviewLoading(true);
      const risk = Math.abs((testLimitEntry || testPrice) - testSl);
      const isLong = testDirection === 'LONG' || testDirection === 'BUY';
      const dirMult = isLong ? 1 : -1;
      const baseEntry = testLimitEntry || testPrice;

      const calcTp1 = testTp1 || baseEntry + dirMult * risk * 1.8;
      const calcTp2 = testTp2 || baseEntry + dirMult * risk * 3.0;
      const calcTp3 = testTp3 || baseEntry + dirMult * risk * 5.0;

      const signalData = {
        symbol: testSymbol,
        direction: testDirection,
        entryPrice: testPrice,
        limitEntry: testLimitEntry,
        sl: testSl,
        tp1: calcTp1,
        tp2: calcTp2,
        tp3: calcTp3,
        confidence: activeAnalysis?.confidence || 92.5,
        analysis: activeAnalysis || undefined,
        timeframe: '15m',
        session: 'London Killzone',
      };

      const res = await fetch('/api/webhook/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: signalData, config }),
      });

      if (res.ok) {
        const data = await res.json();
        setPreviewPayload(data.payload);
        setPreviewHeaders(data.headers);
      }
    } catch (err) {
      console.error('Failed to generate preview:', err);
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendSignal = async () => {
    try {
      setDispatching(true);
      setDispatchResult(null);

      const risk = Math.abs((testLimitEntry || testPrice) - testSl);
      const isLong = testDirection === 'LONG' || testDirection === 'BUY';
      const dirMult = isLong ? 1 : -1;
      const baseEntry = testLimitEntry || testPrice;

      const calcTp1 = testTp1 || baseEntry + dirMult * risk * 1.8;
      const calcTp2 = testTp2 || baseEntry + dirMult * risk * 3.0;
      const calcTp3 = testTp3 || baseEntry + dirMult * risk * 5.0;

      const signalData = {
        symbol: testSymbol,
        direction: testDirection,
        entryPrice: testPrice,
        limitEntry: testLimitEntry,
        sl: testSl,
        tp1: calcTp1,
        tp2: calcTp2,
        tp3: calcTp3,
        confidence: activeAnalysis?.confidence || 92.5,
        analysis: activeAnalysis || undefined,
        timeframe: '15m',
        session: 'Active Killzone',
      };

      const res = await fetch('/api/webhook/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: signalData, config }),
      });

      const data = await res.json();
      setDispatchResult({
        success: data.success,
        message: data.message || (data.success ? 'Delivered successfully' : 'Delivery failed'),
        statusCode: data.statusCode,
      });

      fetchLogs();
    } catch (err: any) {
      setDispatchResult({
        success: false,
        message: err.message || 'Network error sending webhook',
      });
    } finally {
      setDispatching(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch('/api/webhook/history', { method: 'DELETE' });
      setDeliveries([]);
      setSelectedLog(null);
    } catch (err) {
      console.error('Failed to clear logs:', err);
    }
  };

  const handleRetryLog = async (logId: string) => {
    try {
      setDispatching(true);
      const res = await fetch('/api/webhook/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deliveryId: logId }),
      });
      const data = await res.json();
      setDispatchResult({
        success: data.success,
        message: data.message || 'Retry completed',
        statusCode: data.statusCode,
      });
      fetchLogs();
    } catch (err: any) {
      console.error('Retry failed:', err);
    } finally {
      setDispatching(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="bg-[#0A0A0A] border border-white/15 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#0E0E0E]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-wide m-0">
                  Webhook Dispatch Engine
                </h2>
                <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full">
                  LIVE SIGNAL INGRESS
                </span>
              </div>
              <p className="text-xs text-white/50 m-0 mt-0.5">
                Paste any webhook URL to pipe complete entry, limit pullback, DCA, SL, and multi-TP signals into your bot
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-white/40 hover:text-white hover:bg-white/5 p-2 rounded-lg transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-5 border-b border-white/10 bg-[#080808] text-xs font-mono">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('config')}
              className={`flex items-center gap-2 px-3.5 py-3 border-b-2 font-medium transition-colors cursor-pointer ${
                activeTab === 'config'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Configuration & Target</span>
            </button>
            <button
              onClick={() => setActiveTab('live')}
              className={`flex items-center gap-2 px-3.5 py-3 border-b-2 font-medium transition-colors cursor-pointer ${
                activeTab === 'live'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>Live Signal Dispatcher</span>
            </button>
            <button
              onClick={() => {
                setActiveTab('logs');
                fetchLogs();
              }}
              className={`flex items-center gap-2 px-3.5 py-3 border-b-2 font-medium transition-colors cursor-pointer ${
                activeTab === 'logs'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Delivery History ({deliveries.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`hidden sm:flex items-center gap-2 px-3.5 py-3 border-b-2 font-medium transition-colors cursor-pointer ${
                activeTab === 'docs'
                  ? 'border-emerald-500 text-emerald-400 bg-emerald-500/5'
                  : 'border-transparent text-white/50 hover:text-white hover:bg-white/5'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>Integration Guide</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {config?.enabled && config?.webhookUrl && (
              <span className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Webhook Active
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* TAB 1: CONFIGURATION */}
          {activeTab === 'config' && config && (
            <div className="space-y-6">
              {/* Main Webhook URL Field */}
              <div className="bg-[#111111] border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-mono font-bold text-white flex items-center gap-2">
                    <Webhook className="w-4 h-4 text-emerald-400" />
                    Target Webhook URL
                  </label>
                  <span className="text-[10px] text-white/40 font-mono">
                    TradingView, Bybit BOTX, Cornix, Discord, or Custom Bot
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="url"
                    value={config.webhookUrl}
                    onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
                    placeholder="https://web-blue-delta-17.vercel.app/api/webhooks/tradingview/endpoint_id..."
                    className="w-full bg-black/60 border border-white/15 focus:border-emerald-500 rounded-lg px-3.5 py-2.5 text-xs font-mono text-emerald-300 placeholder:text-white/20 focus:outline-none transition-colors"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={config.enabled}
                        onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                        className="rounded border-white/20 text-emerald-500 focus:ring-0 bg-white/5 w-4 h-4 cursor-pointer"
                      />
                      <span className="font-mono text-white/90">Enable Webhook Engine</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={config.autoDispatch}
                        onChange={(e) => setConfig({ ...config, autoDispatch: e.target.checked })}
                        className="rounded border-white/20 text-emerald-500 focus:ring-0 bg-white/5 w-4 h-4 cursor-pointer"
                      />
                      <span className="font-mono text-white/90 text-emerald-400">
                        ⚡ 24/7 Auto-Dispatch Live Scanner Signals
                      </span>
                    </label>
                  </div>

                  <span className="text-[11px] text-white/40 font-mono">
                    Min Conf: <b>{config.minConfidence}%</b>
                  </span>
                </div>
              </div>

              {/* Signing Secret & Security */}
              <div className="bg-[#111111] border border-white/10 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                    <Shield className="w-4 h-4 text-emerald-400" />
                    Authentication & Cryptographic Signing
                  </div>
                  <span className="text-[10px] text-white/40 font-mono">
                    HMAC-SHA256 headers generated automatically
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[11px] text-white/60 font-mono block mb-1.5">
                      Authentication Mode
                    </label>
                    <select
                      value={config.authType}
                      onChange={(e) => setConfig({ ...config, authType: e.target.value as any })}
                      className="w-full bg-black/60 border border-white/15 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none cursor-pointer"
                    >
                      <option value="HMAC_SHA256">HMAC-SHA256 (x-tradingview-signature header)</option>
                      <option value="BEARER">Bearer Token (Authorization: Bearer)</option>
                      <option value="CUSTOM_HEADER">Custom Header</option>
                      <option value="NONE">None / Open Ingress</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-white/60 font-mono block mb-1.5">
                      Target Exchange & Format Schema
                    </label>
                    <select
                      value={config.formatPreset}
                      onChange={(e) => setConfig({ ...config, formatPreset: e.target.value as any })}
                      className="w-full bg-black/60 border border-white/15 focus:border-emerald-500 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none cursor-pointer"
                    >
                      <option value="botx_tradingview">BOTX / TradingView / Bybit Standard Format</option>
                      <option value="endellion_full">Endellion AI Full Comprehensive Signal</option>
                      <option value="cornix">Cornix / Telegram Trading Bot Format</option>
                      <option value="three_commas">3Commas / Custom Bot Format</option>
                    </select>
                  </div>
                </div>

                {config.authType !== 'NONE' && config.authType !== 'CUSTOM_HEADER' && (
                  <div>
                    <label className="text-[11px] text-white/60 font-mono block mb-1.5">
                      Signing Secret / Password Key
                    </label>
                    <div className="relative">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        value={config.signingSecret}
                        onChange={(e) => setConfig({ ...config, signingSecret: e.target.value })}
                        placeholder="Paste your webhook signing secret or bot password..."
                        className="w-full bg-black/60 border border-white/15 focus:border-emerald-500 rounded-lg pl-3.5 pr-10 py-2 text-xs font-mono text-white placeholder:text-white/20 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 hover:text-white cursor-pointer p-1"
                      >
                        {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                )}

                {config.authType === 'CUSTOM_HEADER' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] text-white/60 font-mono block mb-1.5">Header Name</label>
                      <input
                        type="text"
                        value={config.customHeaderName || ''}
                        onChange={(e) => setConfig({ ...config, customHeaderName: e.target.value })}
                        placeholder="x-api-key"
                        className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-white/60 font-mono block mb-1.5">Header Value</label>
                      <input
                        type="text"
                        value={config.customHeaderValue || ''}
                        onChange={(e) => setConfig({ ...config, customHeaderValue: e.target.value })}
                        placeholder="secret_token..."
                        className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Signal Parameters & DCA/TP Customization */}
              <div className="bg-[#111111] border border-white/10 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    Default Signal Architecture (DCA, Stop Loss & Partial TPs)
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono">
                    All parameters transmitted accurately
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Leverage</label>
                    <input
                      type="number"
                      min={1}
                      max={125}
                      value={config.defaultLeverage}
                      onChange={(e) => setConfig({ ...config, defaultLeverage: Number(e.target.value) })}
                      className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Order Size</label>
                    <input
                      type="text"
                      value={config.defaultSize}
                      onChange={(e) => setConfig({ ...config, defaultSize: e.target.value })}
                      placeholder="0.01 or %10"
                      className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Min Conf (%)</label>
                    <input
                      type="number"
                      min={60}
                      max={100}
                      value={config.minConfidence}
                      onChange={(e) => setConfig({ ...config, minConfidence: Number(e.target.value) })}
                      className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Trailing Callback</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step={0.1}
                        min={0.1}
                        max={10}
                        value={config.trailing.callbackPercent}
                        onChange={(e) =>
                          setConfig({
                            ...config,
                            trailing: { ...config.trailing, callbackPercent: Number(e.target.value) },
                          })
                        }
                        className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-white focus:outline-none"
                      />
                      <span className="text-white/40">%</span>
                    </div>
                  </div>
                </div>

                {/* DCA & Partial TPs Subgrid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-white/5 text-xs font-mono">
                  {/* DCA Controls */}
                  <div className="bg-black/40 border border-white/5 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
                        DCA (Average Down) Engine
                      </span>
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.dca.enabled}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              dca: { ...config.dca, enabled: e.target.checked },
                            })
                          }
                          className="rounded border-white/20 text-emerald-500 w-3.5 h-3.5"
                        />
                        <span className="text-white/60">Active</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-white/40 block">Drop Trigger %</span>
                        <input
                          type="number"
                          step={0.5}
                          value={config.dca.triggerDropPercent}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              dca: { ...config.dca, triggerDropPercent: Number(e.target.value) },
                            })
                          }
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white text-xs mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-white/40 block">Step Spacing %</span>
                        <input
                          type="number"
                          step={0.5}
                          value={config.dca.stepDropPercent || 3.5}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              dca: { ...config.dca, stepDropPercent: Number(e.target.value) },
                            })
                          }
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white text-xs mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-white/40 block">Max Steps</span>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={config.dca.maxSteps}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              dca: { ...config.dca, maxSteps: Number(e.target.value) },
                            })
                          }
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white text-xs mt-1"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Partial TPs Controls */}
                  <div className="bg-black/40 border border-white/5 rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        Partial Take Profits (% of position)
                      </span>
                      <label className="flex items-center gap-1.5 text-[11px] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.partialTps.enabled}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              partialTps: { ...config.partialTps, enabled: e.target.checked },
                            })
                          }
                          className="rounded border-white/20 text-emerald-500 w-3.5 h-3.5"
                        />
                        <span className="text-white/60">Active</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <span className="text-[10px] text-white/40 block">TP1 Book %</span>
                        <input
                          type="number"
                          value={config.partialTps.tp1Percent}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              partialTps: { ...config.partialTps, tp1Percent: Number(e.target.value) },
                            })
                          }
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white text-xs mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-white/40 block">TP2 Book %</span>
                        <input
                          type="number"
                          value={config.partialTps.tp2Percent}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              partialTps: { ...config.partialTps, tp2Percent: Number(e.target.value) },
                            })
                          }
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white text-xs mt-1"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-white/40 block">TP3 Runner %</span>
                        <input
                          type="number"
                          value={config.partialTps.tp3Percent}
                          onChange={(e) =>
                            setConfig({
                              ...config,
                              partialTps: { ...config.partialTps, tp3Percent: Number(e.target.value) },
                            })
                          }
                          className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-white text-xs mt-1"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-between pt-2">
                <div className="text-xs font-mono text-white/50">
                  {saveSuccess && (
                    <span className="text-emerald-400 flex items-center gap-1.5 font-bold animate-in fade-in">
                      <CheckCircle2 className="w-4 h-4" />
                      Configuration saved & active for live trading
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSaveConfig}
                  disabled={saving}
                  className="bg-emerald-500 hover:bg-emerald-400 text-black font-mono font-bold text-xs px-6 py-2.5 rounded-xl transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 cursor-pointer"
                >
                  {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save Webhook Engine Configuration
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: LIVE SIGNAL DISPATCHER */}
          {activeTab === 'live' && (
            <div className="space-y-6">
              {/* Signal Parameters Grid */}
              <div className="bg-[#111111] border border-white/10 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                    <Activity className="w-4 h-4 text-emerald-400" />
                    Test / Manual Signal Parameters
                  </div>
                  <span className="text-[10px] text-white/40 font-mono">
                    Populated from active chart & live indicators
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs">
                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Symbol</label>
                    <input
                      type="text"
                      value={testSymbol}
                      onChange={(e) => setTestSymbol(e.target.value.toUpperCase())}
                      className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-white uppercase focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Action / Direction</label>
                    <select
                      value={testDirection}
                      onChange={(e) => setTestDirection(e.target.value as any)}
                      className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-white focus:outline-none cursor-pointer"
                    >
                      <option value="LONG">LONG (Buy Entry)</option>
                      <option value="SHORT">SHORT (Sell Entry)</option>
                      <option value="MANAGE">MANAGE (Position Tick)</option>
                      <option value="CLOSE_LONG">CLOSE_LONG</option>
                      <option value="CLOSE_SHORT">CLOSE_SHORT</option>
                      <option value="PARTIAL_EXIT">PARTIAL_EXIT</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Current Price (CMP)</label>
                    <input
                      type="number"
                      step="any"
                      value={testPrice}
                      onChange={(e) => setTestPrice(Number(e.target.value))}
                      className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-white focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-white/60 block mb-1">Limit (Pullback) Entry</label>
                    <input
                      type="number"
                      step="any"
                      value={testLimitEntry || ''}
                      onChange={(e) => setTestLimitEntry(e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="Calculated pullback"
                      className="w-full bg-black/60 border border-white/15 rounded-lg px-3 py-1.5 text-emerald-300 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-xs pt-1">
                  <div>
                    <label className="text-[11px] text-rose-400 block mb-1">Stop Loss (SL)</label>
                    <input
                      type="number"
                      step="any"
                      value={testSl}
                      onChange={(e) => setTestSl(Number(e.target.value))}
                      className="w-full bg-black/60 border border-rose-500/30 rounded-lg px-3 py-1.5 text-rose-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-emerald-400 block mb-1">TP1 Price (50%)</label>
                    <input
                      type="number"
                      step="any"
                      value={testTp1 || ''}
                      onChange={(e) => setTestTp1(Number(e.target.value))}
                      placeholder="Auto R:R 1.8x"
                      className="w-full bg-black/60 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-emerald-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-emerald-400 block mb-1">TP2 Price (30%)</label>
                    <input
                      type="number"
                      step="any"
                      value={testTp2 || ''}
                      onChange={(e) => setTestTp2(Number(e.target.value))}
                      placeholder="Auto R:R 3.0x"
                      className="w-full bg-black/60 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-emerald-400 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-emerald-400 block mb-1">TP3 Runner (20%)</label>
                    <input
                      type="number"
                      step="any"
                      value={testTp3 || ''}
                      onChange={(e) => setTestTp3(Number(e.target.value))}
                      placeholder="Auto R:R 5.0x"
                      className="w-full bg-black/60 border border-emerald-500/30 rounded-lg px-3 py-1.5 text-emerald-400 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Live Payload Preview */}
              <div className="bg-[#111111] border border-white/10 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                    <FileCode className="w-4 h-4 text-emerald-400" />
                    Exact Outgoing Webhook Payload (Byte-Accurate)
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(JSON.stringify(previewPayload, null, 2))}
                      className="text-xs font-mono text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {copiedPayload ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedPayload ? 'Copied' : 'Copy JSON'}</span>
                    </button>
                  </div>
                </div>

                {previewHeaders && Object.keys(previewHeaders).length > 0 && (
                  <div className="bg-black/60 border border-white/5 rounded-lg p-2.5 text-[11px] font-mono text-white/70 space-y-1">
                    <span className="text-[10px] text-white/40 block font-bold uppercase">HTTP Headers:</span>
                    {Object.entries(previewHeaders).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2">
                        <span className="text-emerald-400">{k}:</span>
                        <span className="text-white/90 truncate max-w-[500px]">{v}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="bg-black/80 border border-white/10 rounded-lg p-3 max-h-64 overflow-y-auto">
                  <pre className="text-[11px] font-mono text-emerald-300 leading-relaxed m-0 whitespace-pre-wrap">
                    {previewPayload ? JSON.stringify(previewPayload, null, 2) : 'Generating payload preview...'}
                  </pre>
                </div>
              </div>

              {/* Action Button & Status Result */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <div className="text-xs font-mono">
                  {dispatchResult && (
                    <div
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                        dispatchResult.success
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      {dispatchResult.success ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0" />
                      )}
                      <span>{dispatchResult.message}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSendSignal}
                  disabled={dispatching || !config?.webhookUrl}
                  className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 disabled:bg-white/10 disabled:text-white/30 text-black font-mono font-bold text-xs px-8 py-3 rounded-xl transition-all shadow-[0_0_25px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  {dispatching ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Transmit Signal to Webhook Target Now</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DELIVERY HISTORY & LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-white">
                  <History className="w-4 h-4 text-emerald-400" />
                  Recent Webhook Transmissions
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={fetchLogs}
                    className="text-xs font-mono text-white/60 hover:text-white bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${logsLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh</span>
                  </button>

                  {deliveries.length > 0 && (
                    <button
                      onClick={handleClearLogs}
                      className="text-xs font-mono text-rose-400/70 hover:text-rose-400 bg-rose-500/5 hover:bg-rose-500/10 px-2.5 py-1 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                </div>
              </div>

              {deliveries.length === 0 ? (
                <div className="text-center py-12 border border-white/5 rounded-xl bg-black/40 space-y-2">
                  <History className="w-8 h-8 text-white/20 mx-auto" />
                  <p className="text-xs font-mono text-white/40 m-0">No webhook transmissions recorded yet</p>
                  <p className="text-[11px] font-mono text-white/20 m-0">
                    Use the Live Signal Dispatcher or enable Auto-Dispatch to start sending signals
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deliveries.map((log) => (
                    <div
                      key={log.id}
                      className={`border rounded-xl p-3.5 transition-all text-xs font-mono ${
                        log.success
                          ? 'bg-[#101010] border-white/10 hover:border-emerald-500/30'
                          : 'bg-rose-950/20 border-rose-500/20 hover:border-rose-500/40'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              log.success ? 'bg-emerald-400 shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-rose-500'
                            }`}
                          />
                          <span className="font-bold text-white text-sm">{log.symbol}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              log.action === 'LONG' || log.action === 'BUY'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : log.action === 'SHORT' || log.action === 'SELL'
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                            }`}
                          >
                            {log.action}
                          </span>

                          <span
                            className={`px-2 py-0.5 rounded text-[10px] ${
                              log.success ? 'bg-white/5 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {log.statusCode ? `HTTP ${log.statusCode}` : log.statusText}
                          </span>

                          <span className="text-white/40 text-[11px]">{log.latencyMs}ms</span>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-white/40 text-[11px]">
                            {new Date(log.timestamp).toLocaleTimeString()}
                          </span>

                          <button
                            onClick={() => setSelectedLog(selectedLog?.id === log.id ? null : log)}
                            className="text-white/60 hover:text-white bg-white/5 px-2 py-1 rounded text-[10px] transition-colors cursor-pointer"
                          >
                            {selectedLog?.id === log.id ? 'Hide Details' : 'View Payload'}
                          </button>

                          <button
                            onClick={() => handleRetryLog(log.id)}
                            className="text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded text-[10px] transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <RefreshCw className="w-2.5 h-2.5" />
                            <span>Resend</span>
                          </button>
                        </div>
                      </div>

                      {/* Expanded Payload & Response Log */}
                      {selectedLog?.id === log.id && (
                        <div className="mt-3 pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] animate-in fade-in">
                          <div>
                            <span className="text-white/40 block mb-1 font-bold">Request Payload:</span>
                            <pre className="bg-black/90 p-2.5 rounded-lg text-emerald-300 overflow-x-auto max-h-48 border border-white/5 m-0 text-[10px]">
                              {JSON.stringify(log.requestPayload, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <span className="text-white/40 block mb-1 font-bold">Target Response:</span>
                            <pre className="bg-black/90 p-2.5 rounded-lg text-white/80 overflow-x-auto max-h-48 border border-white/5 m-0 text-[10px]">
                              {log.responseBody || log.error || '(No response body returned)'}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: INTEGRATION GUIDE */}
          {activeTab === 'docs' && (
            <div className="space-y-4 text-xs font-mono leading-relaxed text-white/80">
              <div className="bg-[#111111] border border-white/10 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 m-0">
                  <Webhook className="w-4 h-4 text-emerald-400" />
                  How to Connect to Any Trading Bot or Webhook Platform
                </h3>
                <p className="text-white/60 m-0">
                  The Endellion Webhook Engine translates complex multi-timeframe confluent setups into standardized,
                  cryptographically signed JSON payloads with exact entry price, pullback limit entry, DCA average-down
                  levels, dynamic stop losses, and 3-stage partial take profit targets.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                  <div className="bg-black/40 border border-white/5 p-3 rounded-lg space-y-1">
                    <span className="font-bold text-emerald-400 block">1. Bybit BOTX / TV</span>
                    <p className="text-[11px] text-white/50 m-0">
                      Select <b>BOTX / TradingView</b> preset. Paste endpoint URL and secret. Receives HMAC-SHA256
                      verified orders with reduce-only SL/TP brackets.
                    </p>
                  </div>

                  <div className="bg-black/40 border border-white/5 p-3 rounded-lg space-y-1">
                    <span className="font-bold text-emerald-400 block">2. Cornix / Telegram</span>
                    <p className="text-[11px] text-white/50 m-0">
                      Select <b>Cornix</b> preset. Emits clean entry ranges, DCA ladders, and TP1/TP2/TP3 targets
                      optimized for automated channel trading.
                    </p>
                  </div>

                  <div className="bg-black/40 border border-white/5 p-3 rounded-lg space-y-1">
                    <span className="font-bold text-emerald-400 block">3. Custom AI Agent / API</span>
                    <p className="text-[11px] text-white/50 m-0">
                      Select <b>Endellion AI Full Signal</b>. Contains every technical indicator value, confluence
                      layer, killzone session, and risk score.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-[#111111] border border-white/10 rounded-xl p-4 space-y-2">
                <span className="text-xs font-bold text-white block">Quick Curl Verification Test</span>
                <pre className="bg-black/90 p-3 rounded-lg text-emerald-300 overflow-x-auto border border-white/5 text-[11px]">
{`curl -X POST https://your-trading-bot.com/api/webhook \\
  -H "Content-Type: application/json" \\
  -H "x-tradingview-signature: <hmac_sha256_hex>" \\
  -d '{"exchange":"bybit","symbol":"BTC/USDT:USDT","action":"LONG","size":"0.01","stop_loss":"94800","take_profit":["97500","98900","101200"]}'`}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
