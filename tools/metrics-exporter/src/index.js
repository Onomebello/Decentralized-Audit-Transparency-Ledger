/**
 * AuditLedger Prometheus Metrics Exporter
 *
 * Exposes contract metrics on :8000/metrics by polling the Soroban RPC.
 *
 * Environment variables:
 *   CONTRACT_ID   – Soroban contract address (required)
 *   RPC_URL       – Soroban RPC endpoint (default: https://soroban-testnet.stellar.org)
 *   NETWORK       – "testnet" | "mainnet" (default: testnet)
 *   SCRAPE_INTERVAL_MS – polling interval in ms (default: 15000)
 *   PORT          – HTTP port (default: 8000)
 */
"use strict";

const http = require("http");
const { SorobanRpc, Contract, Networks, xdr, nativeToScVal, scValToNative } = require("@stellar/stellar-sdk");
const client = require("prom-client");

const CONTRACT_ID = process.env.CONTRACT_ID || "";
const RPC_URL =
  process.env.RPC_URL || "https://soroban-testnet.stellar.org";
const NETWORK = process.env.NETWORK || "testnet";
const SCRAPE_INTERVAL_MS = parseInt(process.env.SCRAPE_INTERVAL_MS || "15000", 10);
const PORT = parseInt(process.env.PORT || "8000", 10);
const TOP_SUBMITTERS_N = parseInt(process.env.TOP_SUBMITTERS_N || "10", 10);

if (!CONTRACT_ID) {
  console.error("ERROR: CONTRACT_ID environment variable is required.");
  process.exit(1);
}

// ── Prometheus registry & default metrics ───────────────────────────────────

const registry = new client.Registry();
client.collectDefaultMetrics({ register: registry });

// ── Contract state metrics ──────────────────────────────────────────────────

const totalEvents = new client.Gauge({
  name: "audit_ledger_total_events",
  help: "Total number of events logged in the AuditLedger contract",
  registers: [registry],
});

const globalMaxLogs = new client.Gauge({
  name: "audit_ledger_global_max_logs",
  help: "Global maximum log cap configured on the contract",
  registers: [registry],
});

const storageUsagePct = new client.Gauge({
  name: "audit_ledger_storage_usage_percent",
  help: "Estimated storage usage as percentage of global_max_logs",
  registers: [registry],
});

const eventsByType = new client.Gauge({
  name: "audit_ledger_events_by_type",
  help: "Number of events per event type",
  labelNames: ["event_type"],
  registers: [registry],
});

const eventsBySubmitter = new client.Gauge({
  name: "audit_ledger_events_by_submitter",
  help: "Number of events per submitter (top-N, configurable via TOP_SUBMITTERS_N)",
  labelNames: ["submitter"],
  registers: [registry],
});

const avgGasCost = new client.Gauge({
  name: "audit_ledger_avg_gas_cost",
  help: "Average fee (stroops) per log_event invocation (sampled)",
  registers: [registry],
});

// ── Event logging metrics (#286) ───────────────────────────────────────────

const eventLoggingTotal = new client.Counter({
  name: "audit_ledger_event_logging_total",
  help: "Total number of log_event scraping observations",
  labelNames: ["status"],
  registers: [registry],
});

const eventLoggingRate = new client.Gauge({
  name: "audit_ledger_event_logging_rate",
  help: "Events logged per second since last scrape (estimated from timestamps)",
  registers: [registry],
});

const eventTypeCount = new client.Gauge({
  name: "audit_ledger_event_type_count",
  help: "Total events per event type (from contract event_count)",
  labelNames: ["event_type"],
  registers: [registry],
});

const categoryCount = new client.Gauge({
  name: "audit_ledger_category_count",
  help: "Total events per category (from contract event_count_by_category)",
  labelNames: ["category"],
  registers: [registry],
});

const recentEventTimestamp = new client.Gauge({
  name: "audit_ledger_recent_event_timestamp",
  help: "Unix timestamp of the most recent event",
  registers: [registry],
});

const eventSizeBytes = new client.Histogram({
  name: "audit_ledger_event_size_bytes",
  help: "Size of event metadata in bytes",
  buckets: [16, 64, 128, 256, 512, 1024, 2048, 4096],
  registers: [registry],
});

// ── Query metrics (#286) ───────────────────────────────────────────────────

const queryTotal = new client.Counter({
  name: "audit_ledger_query_total",
  help: "Total number of contract read queries performed",
  labelNames: ["method", "status"],
  registers: [registry],
});

const queryDurationMs = new client.Histogram({
  name: "audit_ledger_query_duration_ms",
  help: "Duration of contract read queries in milliseconds",
  labelNames: ["method"],
  buckets: [50, 100, 200, 500, 1000, 2000, 5000],
  registers: [registry],
});

const activeConnections = new client.Gauge({
  name: "audit_ledger_active_rpc_connections",
  help: "Number of active RPC connections (tracked per scrape cycle)",
  registers: [registry],
});

// ── Governance metrics (#286) ──────────────────────────────────────────────

const governanceProposals = new client.Gauge({
  name: "audit_ledger_governance_proposals_total",
  help: "Total number of governance proposals on-chain",
  registers: [registry],
});

const governanceOwners = new client.Gauge({
  name: "audit_ledger_governance_owners",
  help: "Number of contract owners",
  registers: [registry],
});

const governanceRequiredSigs = new client.Gauge({
  name: "audit_ledger_governance_required_signatures",
  help: "Required signatures for multisig operations",
  registers: [registry],
});

const governancePaused = new client.Gauge({
  name: "audit_ledger_governance_paused",
  help: "Whether the contract is paused (1) or active (0)",
  registers: [registry],
});

const governanceTTL = new client.Gauge({
  name: "audit_ledger_governance_event_ttl",
  help: "Event TTL in ledgers",
  registers: [registry],
});

const governanceEmissionMode = new client.Gauge({
  name: "audit_ledger_governance_emission_mode",
  help: "Event emission mode (0=none, 1=normal, 2=low_cost)",
  registers: [registry],
});

const governanceBlockedSubmitters = new client.Gauge({
  name: "audit_ledger_governance_blocked_submitters",
  help: "Number of blocked submitters",
  registers: [registry],
});

const governanceAllowlistEnabled = new client.Gauge({
  name: "audit_ledger_governance_allowlist_enabled",
  help: "Whether allowlist mode is enabled (1) or disabled (0)",
  registers: [registry],
});

const governanceWebhooks = new client.Gauge({
  name: "audit_ledger_governance_webhooks",
  help: "Number of registered webhooks",
  registers: [registry],
});

// ── Error metrics (#286) ───────────────────────────────────────────────────

const errorCount = new client.Counter({
  name: "audit_ledger_error_total",
  help: "Total number of errors observed by the exporter",
  labelNames: ["category", "method"],
  registers: [registry],
});

const scrapeErrorGauge = new client.Gauge({
  name: "audit_ledger_scrape_error",
  help: "1 if the exporter has been failing consecutively, 0 otherwise",
  labelNames: ["contract_id"],
  registers: [registry],
});

const rpcErrors = new client.Counter({
  name: "audit_ledger_rpc_errors_total",
  help: "Total number of RPC simulation/query errors",
  labelNames: ["error_type"],
  registers: [registry],
});

const lastScrapeTimestamp = new client.Gauge({
  name: "audit_ledger_last_scrape_timestamp",
  help: "Unix timestamp of the last successful scrape",
  registers: [registry],
});

const scrapeDurationMs = new client.Histogram({
  name: "audit_ledger_scrape_duration_ms",
  help: "Duration of the full scrape cycle in milliseconds",
  buckets: [500, 1000, 2000, 5000, 10000, 30000],
  registers: [registry],
});

// ── Soroban RPC helpers ─────────────────────────────────────────────────────

const networkPassphrase =
  NETWORK === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;

const server = new SorobanRpc.Server(RPC_URL, { allowHttp: RPC_URL.startsWith("http://") });

/**
 * Call a read-only contract function and return the raw ScVal result.
 * Tracks query metrics automatically.
 */
async function callContract(method, args = []) {
  const start = Date.now();
  try {
    const contract = new Contract(CONTRACT_ID);
    const op = contract.call(method, ...args);
    const tx = new (require("@stellar/stellar-sdk").TransactionBuilder)(
      new (require("@stellar/stellar-sdk").Account)(
        "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN",
        "0"
      ),
      {
        fee: "100",
        networkPassphrase,
      }
    )
      .addOperation(op)
      .setTimeout(30)
      .build();

    const sim = await server.simulateTransaction(tx);
    const duration = Date.now() - start;
    queryDurationMs.observe({ method }, duration);

    if (SorobanRpc.Api.isSimulationError(sim)) {
      queryTotal.inc({ method, status: "error" });
      rpcErrors.inc({ error_type: "simulation" });
      throw new Error(`Simulation error: ${sim.error}`);
    }

    queryTotal.inc({ method, status: "ok" });
    return sim.result?.retval;
  } catch (err) {
    const duration = Date.now() - start;
    queryDurationMs.observe({ method }, duration);
    if (!err.message?.startsWith("Simulation error:")) {
      queryTotal.inc({ method, status: "error" });
      rpcErrors.inc({ error_type: "exception" });
    }
    throw err;
  }
}

function scValToU32(val) {
  return val.u32();
}

// ── Retry state ────────────────────────────────────────────────────────────

let consecutiveFailures = 0;
const MAX_FAILURES_BEFORE_ERROR_GAUGE = 10;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 60000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Scrape loop ─────────────────────────────────────────────────────────────

let lastTotal = 0;
let lastTotalTimestamp = 0;

async function scrape() {
  const scrapeStart = Date.now();

  try {
    // ── Event logging metrics ────────────────────────────────────────────
    const totalVal = await callContract("total_events");
    const total = scValToU32(totalVal);
    totalEvents.set(total);
    eventLoggingTotal.inc({ status: "success" });

    // Calculate event rate from previous scrape
    if (lastTotalTimestamp > 0 && lastTotal > 0 && total > lastTotal) {
      const elapsedSec = (Date.now() - lastTotalTimestamp) / 1000;
      const rate = (total - lastTotal) / elapsedSec;
      eventLoggingRate.set(rate);
    }
    lastTotal = total;
    lastTotalTimestamp = Date.now();

    // global_max_logs
    try {
      const maxVal = await callContract("get_global_max_logs");
      const max = scValToU32(maxVal);
      globalMaxLogs.set(max);
      storageUsagePct.set(max > 0 ? (total / max) * 100 : 0);
    } catch {
      // Contract doesn't expose this endpoint; skip
    }

    // events_by_type from configured types
    const knownTypes = (process.env.EVENT_TYPES || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    for (const type of knownTypes) {
      try {
        const countVal = await callContract("event_count", [
          xdr.ScVal.scvSymbol(type),
        ]);
        const count = scValToU32(countVal);
        eventsByType.set({ event_type: type }, count);
        eventTypeCount.set({ event_type: type }, count);
      } catch {
        // type not yet logged; ignore
      }
    }

    // categories
    const knownCategories = (process.env.CATEGORIES || "financial,system,governance,security,compliance")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);

    for (const cat of knownCategories) {
      try {
        const countVal = await callContract("event_count_by_category", [
          xdr.ScVal.scvSymbol(cat),
        ]);
        categoryCount.set({ category: cat }, scValToU32(countVal));
      } catch {
        // category not available; skip
      }
    }

    // Most recent event timestamp
    if (total > 0) {
      try {
        const recentVal = await callContract("get_event_by_order", [
          nativeToScVal(total - 1, { type: "u32" }),
        ]);
        if (recentVal && recentVal.switch().name === "scvMap") {
          const map = recentVal.map();
          const tsEntry = map && map.find(
            (e) => e.key().switch().name === "scvSymbol" && e.key().sym() === "timestamp"
          );
          if (tsEntry) {
            const ts = Number(scValToNative(tsEntry.val()));
            recentEventTimestamp.set(ts);
          }
          // Estimate metadata size
          const metaEntry = map && map.find(
            (e) => e.key().switch().name === "scvSymbol" && e.key().sym() === "metadata"
          );
          if (metaEntry) {
            const metaBytes = metaEntry.val().bytes().length;
            eventSizeBytes.observe(metaBytes);
          }
        }
      } catch {
        // ignore
      }
    }

    // Per-submitter counts via get_statistics
    try {
      const statsVal = await callContract("get_statistics");
      if (statsVal && statsVal.switch().name === "scvMap") {
        const statsMap = statsVal.map();
        const topSubmittersEntry = statsMap && statsMap.find(
          (e) => e.key().switch().name === "scvSymbol" && e.key().sym() === "top_submitters"
        );
        if (topSubmittersEntry) {
          const submitterVec = topSubmittersEntry.val().vec() || [];
          eventsBySubmitter.reset();
          const topN = submitterVec.slice(0, TOP_SUBMITTERS_N);
          for (const entry of topN) {
            if (entry.switch().name === "scvVec") {
              const pair = entry.vec();
              if (pair && pair.length === 2) {
                const addr = pair[0].address ? pair[0].address().toString() : String(pair[0]);
                const count = pair[1].u32 ? pair[1].u32() : 0;
                eventsBySubmitter.set({ submitter: addr }, count);
              }
            }
          }
        }
      }
    } catch {
      // get_statistics not available; skip submitter metrics
    }

    // ── Governance metrics ───────────────────────────────────────────────
    try {
      const ownersVal = await callContract("get_owners");
      if (ownersVal && ownersVal.switch().name === "scvVec") {
        governanceOwners.set((ownersVal.vec() || []).length);
      }
    } catch {
      // not available
    }

    try {
      const reqSigsVal = await callContract("get_required_signatures");
      governanceRequiredSigs.set(scValToU32(reqSigsVal));
    } catch {
      // not available
    }

    try {
      const pausedVal = await callContract("is_paused");
      const pausedNative = scValToNative(pausedVal);
      governancePaused.set(pausedNative ? 1 : 0);
    } catch {
      // not available
    }

    try {
      const ttlVal = await callContract("get_event_ttl");
      governanceTTL.set(scValToU32(ttlVal));
    } catch {
      // not available
    }

    try {
      const emissionVal = await callContract("get_event_emission_mode");
      governanceEmissionMode.set(Number(scValToNative(emissionVal)));
    } catch {
      // not available
    }

    try {
      const allowlistVal = await callContract("is_allowlist_enabled");
      const allowlistNative = scValToNative(allowlistVal);
      governanceAllowlistEnabled.set(allowlistNative ? 1 : 0);
    } catch {
      // not available
    }

    try {
      const webhooksVal = await callContract("get_webhooks", [
        xdr.ScVal.scvSymbol(""),
      ]);
      if (webhooksVal && webhooksVal.switch().name === "scvVec") {
        governanceWebhooks.set((webhooksVal.vec() || []).length);
      }
    } catch {
      // not available
    }

    // ── Success bookkeeping ──────────────────────────────────────────────
    consecutiveFailures = 0;
    scrapeErrorGauge.set({ contract_id: CONTRACT_ID }, 0);
    lastScrapeTimestamp.set(Date.now());

    const scrapeDuration = Date.now() - scrapeStart;
    scrapeDurationMs.observe(scrapeDuration);

  } catch (err) {
    console.error("Scrape error:", err.message);
    errorCount.inc({ category: "scrape", method: "full_cycle" });

    consecutiveFailures += 1;
    if (consecutiveFailures >= MAX_FAILURES_BEFORE_ERROR_GAUGE) {
      scrapeErrorGauge.set({ contract_id: CONTRACT_ID }, 1);
      console.error(`${consecutiveFailures} consecutive failures; audit_ledger_scrape_error set to 1`);
    }

    const backoffMs = Math.min(
      BACKOFF_BASE_MS * Math.pow(2, consecutiveFailures - 1),
      BACKOFF_MAX_MS
    );
    console.error(`Retrying in ${backoffMs}ms…`);
    await sleep(backoffMs);
    return scrape();
  }
}

// ── HTTP server ─────────────────────────────────────────────────────────────

const httpServer = http.createServer(async (req, res) => {
  if (req.url === "/metrics" && req.method === "GET") {
    try {
      res.setHeader("Content-Type", registry.contentType);
      res.end(await registry.metrics());
    } catch (err) {
      res.writeHead(500);
      res.end(err.message);
    }
  } else if (req.url === "/health" && req.method === "GET") {
    res.writeHead(200);
    res.end("ok");
  } else {
    res.writeHead(404);
    res.end("not found");
  }
});

httpServer.listen(PORT, () => {
  console.log(`Metrics exporter listening on :${PORT}/metrics`);
  console.log(`Contract: ${CONTRACT_ID}`);
  console.log(`RPC:      ${RPC_URL}`);
});

scrape();
setInterval(scrape, SCRAPE_INTERVAL_MS);

module.exports = { scrape, BACKOFF_BASE_MS, BACKOFF_MAX_MS, MAX_FAILURES_BEFORE_ERROR_GAUGE };
