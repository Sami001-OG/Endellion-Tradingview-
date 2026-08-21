import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { AnalysisResult } from './types';
import { formatPrice } from './utils/format';

export interface WebhookConfig {
  enabled: boolean;
  webhookUrl: string;
  signingSecret: string;
  authType: 'HMAC_SHA256' | 'BEARER' | 'CUSTOM_HEADER' | 'PASSPHRASE_BODY' | 'NONE';
  includeSecretInBody?: boolean;
  secretKeyName?: 'secret' | 'passphrase' | 'key' | 'token' | 'api_key';
  customHeaderName?: string;
  customHeaderValue?: string;
  formatPreset: 'botx_tradingview' | 'endellion_full' | 'cornix' | 'three_commas' | 'raw_custom';
  exchange: string; // 'bybit' | 'binance' | 'okx' | 'bitget'
  autoDispatch: boolean;
  minConfidence: number;
  defaultLeverage: number;
  defaultSize: string; // e.g. "0.01" or "%10"
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
    tp1Percent: number; // close % e.g. 30
    tp1PricePercent: number; // price % e.g. 2
    tp2Percent: number; // close % e.g. 30
    tp2PricePercent: number; // price % e.g. 4
    tp3Percent: number; // close % e.g. 40
    tp3PricePercent: number; // price % e.g. 8
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

const CONFIG_FILE = path.join(process.cwd(), 'webhook_config.json');
const DELIVERIES_FILE = path.join(process.cwd(), 'webhook_deliveries.json');

const DEFAULT_CONFIG: WebhookConfig = {
  enabled: false,
  webhookUrl: '',
  signingSecret: '',
  authType: 'HMAC_SHA256',
  customHeaderName: 'x-api-key',
  customHeaderValue: '',
  formatPreset: 'botx_tradingview',
  exchange: 'bybit',
  autoDispatch: false,
  minConfidence: 50,
  defaultLeverage: 10,
  defaultSize: '0.01',
  dca: {
    enabled: true,
    triggerDropPercent: 3,
    stepDropPercent: 3,
    amountMode: 'FIXED',
    amount: 25,
    maxSteps: 3,
  },
  partialTps: {
    enabled: true,
    tp1PricePercent: 2,
    tp1Percent: 30,
    tp2PricePercent: 4,
    tp2Percent: 30,
    tp3PricePercent: 8,
    tp3Percent: 40,
  },
  breakeven: {
    enabled: true,
    moveAtProfitPercent: 1.5,
    safeProfitPercent: 0.2,
  },
  trailing: {
    enabled: true,
    callbackPercent: 1.5,
  },
};

let currentConfig: WebhookConfig = { ...DEFAULT_CONFIG };
let deliveryLogs: WebhookDeliveryLog[] = [];

export function loadWebhookData() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      currentConfig = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('[WebhookEngine] Error loading config:', err);
  }

  try {
    if (fs.existsSync(DELIVERIES_FILE)) {
      const data = fs.readFileSync(DELIVERIES_FILE, 'utf8');
      deliveryLogs = JSON.parse(data);
      if (!Array.isArray(deliveryLogs)) deliveryLogs = [];
    }
  } catch (err) {
    console.error('[WebhookEngine] Error loading deliveries:', err);
    deliveryLogs = [];
  }
}

export function saveWebhookConfig(config: Partial<WebhookConfig>): WebhookConfig {
  currentConfig = { ...currentConfig, ...config };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
  } catch (err) {
    console.error('[WebhookEngine] Error saving config:', err);
  }
  return currentConfig;
}

export function getWebhookConfig(): WebhookConfig {
  return currentConfig;
}

export function getDeliveryLogs(): WebhookDeliveryLog[] {
  return deliveryLogs.slice(0, 100);
}

export function clearDeliveryLogs() {
  deliveryLogs = [];
  try {
    fs.writeFileSync(DELIVERIES_FILE, JSON.stringify([]), 'utf8');
  } catch (err) {
    console.error('[WebhookEngine] Error clearing logs:', err);
  }
}

function recordDelivery(log: WebhookDeliveryLog) {
  deliveryLogs.unshift(log);
  if (deliveryLogs.length > 100) {
    deliveryLogs = deliveryLogs.slice(0, 100);
  }
  try {
    fs.writeFileSync(DELIVERIES_FILE, JSON.stringify(deliveryLogs, null, 2), 'utf8');
  } catch (err) {
    console.error('[WebhookEngine] Error saving deliveries:', err);
  }
}

export function generateNonce(): string {
  return `${Date.now().toString(36)}${crypto.randomBytes(8).toString('hex')}`;
}

export function formatPairSymbol(symbol: string, exchange: string = 'bybit'): {
  raw: string;
  futures: string;
  spot: string;
  base: string;
  quote: string;
} {
  let clean = symbol.toUpperCase().trim().replace(/[^A-Z0-9]/g, '');
  let base = 'BTC';
  let quote = 'USDT';

  if (clean.endsWith('USDT')) {
    base = clean.slice(0, -4);
    quote = 'USDT';
  } else if (clean.endsWith('USDC')) {
    base = clean.slice(0, -4);
    quote = 'USDC';
  } else if (clean.endsWith('BTC')) {
    base = clean.slice(0, -3);
    quote = 'BTC';
  } else if (clean.endsWith('ETH')) {
    base = clean.slice(0, -3);
    quote = 'ETH';
  } else {
    base = clean;
    quote = 'USDT';
  }

  return {
    raw: clean,
    futures: `${base}/${quote}:${quote}`,
    spot: `${base}/${quote}`,
    base,
    quote,
  };
}

export interface SignalInput {
  symbol: string;
  direction: 'LONG' | 'SHORT' | 'BUY' | 'SELL' | 'CLOSE_LONG' | 'CLOSE_SHORT' | 'PARTIAL_EXIT' | 'REVERSE' | 'MANAGE' | 'UPGRADE';
  eventType?: 'SIGNAL_ENTRY' | 'SIGNAL_UPGRADE' | 'DCA_FILLED' | 'TP1_HIT' | 'TP2_HIT' | 'TP3_HIT' | 'SL_HIT' | 'BREAK_EVEN_HIT' | 'MANAGE';
  entryPrice: number;
  limitEntry?: number;
  sl: number;
  tp?: number;
  tp1?: number;
  tp2?: number;
  tp3?: number;
  confidence?: number;
  analysis?: AnalysisResult;
  timeframe?: string;
  customSize?: string;
  customLeverage?: number;
  session?: string;
  closePercent?: number;
  pnlPercent?: number | string;
  isUpgrade?: boolean;
  oldConfidence?: number;
  reason?: string;
  customRawPayload?: any;
}

export function buildSignalPayload(
  input: SignalInput,
  config: WebhookConfig = currentConfig
): { payload: any; rawJsonString: string; headers: Record<string, string> } {
  let payload: any;

  if (input.customRawPayload) {
    payload = typeof input.customRawPayload === 'string' ? JSON.parse(input.customRawPayload) : input.customRawPayload;
  } else {
    const pair = formatPairSymbol(input.symbol, config.exchange);
    const action = input.direction.toUpperCase();
    const eventType = input.eventType || (input.isUpgrade ? 'SIGNAL_UPGRADE' : (['TP1_HIT', 'TP2_HIT', 'TP3_HIT', 'SL_HIT', 'BREAK_EVEN_HIT', 'DCA_FILLED'].includes(action) ? action : 'SIGNAL_ENTRY'));
    const isTradeAction = !['MANAGE', 'DCA_FILLED'].includes(action);
    const isLong = action === 'LONG' || action === 'BUY' || (input.analysis?.signal === 'LONG');

    const entryPrice = input.limitEntry || input.entryPrice;
    const originalPrice = input.entryPrice;
    const slPrice = input.sl;

    // Calculate dynamic TP levels if not passed
    const risk = Math.abs(entryPrice - slPrice);
    const dirMultiplier = isLong ? 1 : -1;
    const tp1 = input.tp1 || entryPrice + dirMultiplier * risk * 1.8;
    const tp2 = input.tp2 || entryPrice + dirMultiplier * risk * 3.0;
    const tp3 = input.tp3 || input.tp || entryPrice + dirMultiplier * risk * 5.0;

    // Calculate DCA prices
    const dcaDropPct = config.dca.triggerDropPercent || 3;
    const dcaStepPct = config.dca.stepDropPercent || 3;
    const dcaLevel1 = isLong ? entryPrice * (1 - dcaDropPct / 100) : entryPrice * (1 + dcaDropPct / 100);
    const dcaLevel2 = isLong ? entryPrice * (1 - (dcaDropPct + dcaStepPct) / 100) : entryPrice * (1 + (dcaDropPct + dcaStepPct) / 100);
    const dcaLevel3 = isLong ? entryPrice * (1 - (dcaDropPct + dcaStepPct * 2) / 100) : entryPrice * (1 + (dcaDropPct + dcaStepPct * 2) / 100);

    const timestamp = new Date().toISOString();
    const nonce = generateNonce();
    const size = input.customSize || config.defaultSize || '0.01';
    const leverage = input.customLeverage || config.defaultLeverage || 10;

    if (config.formatPreset === 'botx_tradingview') {
      // BOTX / TradingView / Bybit Standard Specification matching user schema
      payload = {
        exchange: config.exchange || 'bybit',
        symbol: pair.spot, // e.g. "BTC/USDT"
        action: action,
        size: String(size),
        stop_loss: formatPrice(slPrice),
        dca: {
          triggerDropPercent: config.dca.triggerDropPercent,
          amountMode: config.dca.amountMode,
          amount: config.dca.amount,
          maxSteps: config.dca.maxSteps,
        },
        breakeven: {
          moveAtProfitPercent: config.breakeven.moveAtProfitPercent,
        },
        partialTps: {
          levels: [
            {
              pricePercent: config.partialTps.tp1PricePercent ?? 2,
              closePercent: config.partialTps.tp1Percent ?? 30,
            },
            {
              pricePercent: config.partialTps.tp2PricePercent ?? 4,
              closePercent: config.partialTps.tp2Percent ?? 30,
            },
            {
              pricePercent: config.partialTps.tp3PricePercent ?? 8,
              closePercent: config.partialTps.tp3Percent ?? 40,
            },
          ],
        },
        timestamp: timestamp,
        nonce: nonce,
      };

      if (config.includeSecretInBody || config.authType === 'PASSPHRASE_BODY') {
        const keyName = config.secretKeyName || 'passphrase';
        payload[keyName] = (config.signingSecret || '').trim();
      }
    } else if (config.formatPreset === 'endellion_full') {
      // Full Comprehensive Endellion AI Signal Specification
      payload = {
        source: 'ENDELLION_AI_TRADING_ENGINE',
        exchange: config.exchange || 'bybit',
        symbol: pair.raw,
        symbolFutures: pair.futures,
        symbolSpot: pair.spot,
        action: action,
        event: eventType,
        direction: isLong ? 'LONG' : 'SHORT',
        telegramSync: true,
        entryStrategy: input.analysis?.entryStrategy || (input.limitEntry ? 'Limit (Pullback)' : 'Market (CMP)'),
        entry: {
          cmp: formatPrice(originalPrice),
          limitEntry: input.limitEntry ? formatPrice(input.limitEntry) : formatPrice(originalPrice),
          entryPrice: formatPrice(entryPrice),
          leverage: Number(leverage),
          size: String(size),
        },
        lifecycle: {
          isUpgrade: !!input.isUpgrade,
          oldConfidence: input.oldConfidence,
          closePercent: input.closePercent,
          pnlPercent: input.pnlPercent,
          reason: input.reason,
        },
        stopLoss: {
          price: formatPrice(slPrice),
          riskPercent: Number(((Math.abs(entryPrice - slPrice) / entryPrice) * 100).toFixed(2)),
          trailingStopMode: input.analysis?.trailingStopMode || 'ATR',
          trailingCallbackPercent: config.trailing.callbackPercent,
          breakEvenTriggerPrice: formatPrice(tp1),
        },
        takeProfits: {
          tp1: { price: formatPrice(tp1), closePercent: config.partialTps.tp1Percent, rewardRatio: 1.8 },
          tp2: { price: formatPrice(tp2), closePercent: config.partialTps.tp2Percent, rewardRatio: 3.0 },
          tp3: { price: formatPrice(tp3), closePercent: config.partialTps.tp3Percent, rewardRatio: 5.0 },
          allTakeProfitPrices: [formatPrice(tp1), formatPrice(tp2), formatPrice(tp3)],
        },
        dca: {
          enabled: config.dca.enabled,
          triggerDropPercent: config.dca.triggerDropPercent,
          stepDropPercent: config.dca.stepDropPercent,
          amountMode: config.dca.amountMode,
          amount: config.dca.amount,
          maxSteps: config.dca.maxSteps,
          firstDcaPrice: formatPrice(dcaLevel1),
          allDcaLevels: [formatPrice(dcaLevel1), formatPrice(dcaLevel2), formatPrice(dcaLevel3)],
        },
        analytics: {
          confidence: Number((input.confidence || input.analysis?.confidence || 50).toFixed(1)),
          tier: input.analysis?.tier || (input.confidence && input.confidence >= 90 ? 'ELITE' : 'STRONG'),
          timeframe: input.timeframe || '15m',
          session: input.session || 'Active Killzone',
          patterns: input.analysis?.patterns || [],
          supportingConfluences: input.analysis?.confluences?.supporting || [],
          opposingConfluences: input.analysis?.confluences?.opposing || [],
          layers: input.analysis?.layers || {},
        },
        timestamp: timestamp,
        nonce: nonce,
      };

      if (config.includeSecretInBody || config.authType === 'PASSPHRASE_BODY') {
        const keyName = config.secretKeyName || 'passphrase';
        payload[keyName] = (config.signingSecret || '').trim();
      }
    } else if (config.formatPreset === 'cornix') {
      // Cornix / Auto-Trading Bot Format
      payload = {
        symbol: pair.raw,
        exchange: config.exchange || 'bybit',
        direction: isLong ? 'LONG' : 'SHORT',
        event: eventType,
        action: action,
        ...(input.closePercent ? { close_percent: input.closePercent } : {}),
        entry_type: input.limitEntry ? 'limit' : 'market',
        entry_prices: input.limitEntry ? [formatPrice(input.limitEntry), formatPrice(originalPrice)] : [formatPrice(originalPrice)],
        take_profit_prices: [formatPrice(tp1), formatPrice(tp2), formatPrice(tp3)],
        stop_loss: formatPrice(slPrice),
        dca_prices: [formatPrice(dcaLevel1), formatPrice(dcaLevel2), formatPrice(dcaLevel3)],
        leverage: Number(leverage),
        trailing_stop: { enabled: config.trailing.enabled, percentage: config.trailing.callbackPercent },
        timestamp: timestamp,
        nonce: nonce,
      };
      if (config.includeSecretInBody || config.authType === 'PASSPHRASE_BODY') {
        payload.passphrase = (config.signingSecret || '').trim();
      }
    } else {
      // 3Commas / Custom
      payload = {
        action: action,
        message_type: 'bot',
        bot_id: 1,
        pair: `${config.exchange.toUpperCase()}_${pair.raw}`,
        event: eventType,
        ...(input.closePercent ? { percentage: input.closePercent } : {}),
        price: formatPrice(entryPrice),
        limit_price: input.limitEntry ? formatPrice(input.limitEntry) : undefined,
        sl: formatPrice(slPrice),
        tp: formatPrice(tp3),
        tp1: formatPrice(tp1),
        tp2: formatPrice(tp2),
        tp3: formatPrice(tp3),
        dca_price: formatPrice(dcaLevel1),
        leverage: Number(leverage),
        timestamp: timestamp,
        nonce: nonce,
      };
      if (config.includeSecretInBody || config.authType === 'PASSPHRASE_BODY') {
        payload.secret = (config.signingSecret || '').trim();
      }
    }
  }

  // Canonical stringify once for byte-accurate HMAC hashing
  const rawJsonString = JSON.stringify(payload);
  const timestamp = payload.timestamp || new Date().toISOString();
  const nonce = payload.nonce || generateNonce();

  // Compute Headers & Signatures
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Endellion-AI-Webhook-Engine/1.0',
    'x-timestamp': timestamp,
    'x-nonce': nonce,
  };

  const cleanSecret = (config.signingSecret || '').trim();

  if (config.authType === 'HMAC_SHA256' && cleanSecret) {
    const signature = crypto
      .createHmac('sha256', cleanSecret)
      .update(rawJsonString, 'utf8')
      .digest('hex');
    const base64Sig = crypto
      .createHmac('sha256', cleanSecret)
      .update(rawJsonString, 'utf8')
      .digest('base64');

    headers['X-Signature'] = signature;
    headers['x-signature'] = signature;
    headers['x-tradingview-signature'] = signature;
    headers['X-Webhook-Signature'] = signature;
    headers['x-webhook-signature'] = signature;
    headers['x-signature-sha256'] = signature;
    headers['X-Signature-SHA256'] = signature;
    headers['x-hub-signature-256'] = `sha256=${signature}`;
    headers['x-hub-signature'] = `sha256=${signature}`;
    headers['signature'] = signature;
    headers['x-auth-signature'] = signature;
    headers['x-signature-base64'] = base64Sig;
  } else if (config.authType === 'BEARER' && cleanSecret) {
    const token = cleanSecret.replace(/^Bearer\s+/i, '');
    headers['Authorization'] = `Bearer ${token}`;
    headers['authorization'] = `Bearer ${token}`;
    headers['x-token'] = token;
  } else if (config.authType === 'CUSTOM_HEADER' && config.customHeaderName && config.customHeaderValue) {
    headers[config.customHeaderName.trim()] = config.customHeaderValue.trim();
  }

  return { payload, rawJsonString, headers };
}

export async function dispatchWebhookSignal(
  input: SignalInput,
  customConfig?: Partial<WebhookConfig>
): Promise<{ success: boolean; statusCode: number | null; message: string; deliveryId: string }> {
  const activeConfig = { ...currentConfig, ...customConfig };
  const targetUrl = activeConfig.webhookUrl?.trim();

  if (!targetUrl) {
    return {
      success: false,
      statusCode: null,
      message: 'Webhook URL is not configured. Please paste your webhook link in settings.',
      deliveryId: '',
    };
  }

  const { payload, rawJsonString, headers } = buildSignalPayload(input, activeConfig);
  const deliveryId = `del_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const startTime = Date.now();

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: headers,
      body: rawJsonString,
    });

    const latencyMs = Date.now() - startTime;
    const responseText = await response.text();
    const success = response.status >= 200 && response.status < 300;

    const logEntry: WebhookDeliveryLog = {
      id: deliveryId,
      timestamp: new Date().toISOString(),
      symbol: input.symbol,
      action: input.direction,
      webhookUrl: targetUrl,
      statusCode: response.status,
      statusText: response.statusText || (success ? 'OK' : 'Error'),
      success: success,
      latencyMs: latencyMs,
      requestHeaders: headers,
      requestPayload: payload,
      responseBody: responseText.slice(0, 1000), // Cap response size
    };

    recordDelivery(logEntry);

    return {
      success,
      statusCode: response.status,
      message: success
        ? `Signal delivered successfully (${response.status} ${response.statusText || 'OK'}) in ${latencyMs}ms`
        : `Webhook target returned HTTP ${response.status}: ${responseText.slice(0, 200)}`,
      deliveryId,
    };
  } catch (err: any) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = err.message || 'Network connection failed';

    const logEntry: WebhookDeliveryLog = {
      id: deliveryId,
      timestamp: new Date().toISOString(),
      symbol: input.symbol,
      action: input.direction,
      webhookUrl: targetUrl,
      statusCode: null,
      statusText: 'FETCH_ERROR',
      success: false,
      latencyMs: latencyMs,
      requestHeaders: headers,
      requestPayload: payload,
      responseBody: '',
      error: errorMessage,
    };

    recordDelivery(logEntry);

    return {
      success: false,
      statusCode: null,
      message: `Failed to connect to Webhook URL: ${errorMessage}`,
      deliveryId,
    };
  }
}
