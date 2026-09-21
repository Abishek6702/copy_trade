import { BrokerAdapter } from "./BrokerAdapter.js";
import EventEmitter from "events";
import { normalizeOrderEvent, normalizeTradeEvent } from "./xtsUtils.js";

// Placeholder import for the official Symphony XTS Interactive SDK.
// The actual package name may differ; replace with the correct one when available.
let XTSInteractive;
try {
  XTSInteractive = require("@symbology/xts-interactive");
} catch (e) {
  // Fallback mock for development/testing when the SDK is not installed.
  console.warn("XTS Interactive SDK not installed; using mock client for compilation.");
  XTSInteractive = class MockXTSClient extends EventEmitter {
    constructor(config) {
      super();
      this.config = config;
      this.connected = false;
    }
    async login() {
      // Simulate async login
      return Promise.resolve();
    }
    async connectWebSocket() {
      this.connected = true;
      setTimeout(() => this.emit("connect"), 10);
    }
    async disconnect() {
      this.connected = false;
      this.emit("disconnect");
    }
    // Simulate order placement (only used when detection‑only is false)
    async placeOrder(order) {
      return Promise.resolve({ orderId: `XTSSIM_${Date.now()}`, status: "ACCEPTED" });
    }
  };
}

export class XTSAdapter extends BrokerAdapter {
  constructor() {
    super();
    this.listeners = [];
    this.connectionState = "disconnected"; // disconnected | connecting | connected
    this.emitter = new EventEmitter();
    this.reconnectDelay = parseInt(process.env.XTS_RECONNECT_INITIAL_DELAY_MS || "1000", 10);
    this.maxReconnectDelay = parseInt(process.env.XTS_RECONNECT_MAX_DELAY_MS || "30000", 10);
    this.currentDelay = this.reconnectDelay;
    this._setupClient();
  }

  _setupClient() {
    const apiKey = process.env.XTS_API_KEY;
    const apiSecret = process.env.XTS_API_SECRET;
    const baseUrl = process.env.XTS_API_BASE_URL;
    if (!apiKey || !apiSecret) {
      throw new Error("XTS_API_KEY and XTS_API_SECRET must be set in the environment.");
    }
    if (!baseUrl) {
      throw new Error("XTS_API_BASE_URL must be set in the environment.");
    }
    this.client = new XTSInteractive({ apiKey, apiSecret, baseUrl });
    this._attachHandlers();
  }

  _attachHandlers() {
    this.client.on("connect", () => {
      this.connectionState = "connected";
      this.currentDelay = this.reconnectDelay; // reset backoff
      console.log("[XTS] Connected");
      console.log("[XTS] Joined"); // Assuming "joined" follows connect in the real SDK
    });

    this.client.on("joined", () => {
      console.log("[XTS] Joined");
    });

    this.client.on("order", (raw) => {
      this._handleRawEvent("ORDER", raw);
    });

    this.client.on("trade", (raw) => {
      this._handleRawEvent("TRADE", raw);
    });

    this.client.on("error", (err) => {
      console.error("[XTS] Error", err);
    });

    this.client.on("disconnect", () => {
      console.warn("[XTS] Disconnected");
      this.connectionState = "disconnected";
      this._scheduleReconnect();
    });
  }

  async _scheduleReconnect() {
    if (this.connectionState === "connected" || this.connectionState === "connecting") {
      return; // already trying
    }
    console.log(`[XTS] Reconnecting in ${this.currentDelay} ms`);
    await new Promise((res) => setTimeout(res, this.currentDelay));
    this.currentDelay = Math.min(this.currentDelay * 2, this.maxReconnectDelay);
    try {
      await this.connect();
    } catch (e) {
      console.error("[XTS] Reconnect failed", e);
      this._scheduleReconnect(); // recursive retry
    }
  }

  async connect() {
    if (this.connectionState === "connected") return;
    this.connectionState = "connecting";
    console.log("[XTS] Connecting...");
    await this.client.login();
    await this.client.connectWebSocket();
    // The SDK should emit "connect" and "joined" events which we handle above.
  }

  async disconnect() {
    if (this.connectionState !== "connected") return;
    await this.client.disconnect();
    this.connectionState = "disconnected";
  }

  onMasterOrder(callback) {
    this.listeners.push(callback);
  }

  async placeOrder(clientAccount, order) {
    if (process.env.XTS_DETECTION_ONLY === "true") {
      console.warn("XTS detection-only mode enabled. Real order placement disabled.");
      return Promise.reject(new Error("XTS detection-only mode enabled. Real order placement disabled."));
    }
    // Forward to underlying SDK – the exact method name depends on the SDK.
    // Here we assume a generic placeOrder method.
    return this.client.placeOrder(order);
  }

  async getOrderStatus(orderId) {
    // SDK method placeholder – adjust when real SDK is integrated.
    if (typeof this.client.getOrderStatus === "function") {
      return this.client.getOrderStatus(orderId);
    }
    return { status: "UNKNOWN" };
  }

  _handleRawEvent(eventType, raw) {
    const socketReceivedTimestamp = process.hrtime.bigint();
    if (process.env.LOG_RAW_XTS_EVENTS === "true") {
      console.debug(`[XTS RAW ${eventType}]`, JSON.stringify(raw, null, 2));
    }
    let normalized;
    if (eventType === "ORDER") {
      normalized = normalizeOrderEvent(raw);
    } else if (eventType === "TRADE") {
      normalized = normalizeTradeEvent(raw);
    }
    if (!normalized) {
      console.warn(`[XTS] ${eventType} event missing required fields – ignored.`);
      return;
    }
    const detectorReceivedAt = process.hrtime.bigint();
    // Attach timestamps for later metrics if needed
    normalized.brokerEventTimestamp = raw.timestamp || null;
    normalized.socketReceivedTimestamp = socketReceivedTimestamp;
    normalized.normalizedTimestamp = detectorReceivedAt;
    normalized.eventType = eventType;
    // Emit to registered listeners
    for (const cb of this.listeners) {
      cb(normalized);
    }
  }
}

export default XTSAdapter;
