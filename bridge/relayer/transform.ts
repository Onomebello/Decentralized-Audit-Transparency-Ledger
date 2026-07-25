/**
 * Bridge Event Transformer (#259)
 *
 * Provides cross-chain format conversion, field mapping, validation,
 * and transformation rules for bridging Stellar audit events to EVM.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StellarEvent {
  index: number;
  timestamp: number;
  event_type: string;
  submitter: string;
  metadata: string;
  event_hash: string;
  ledger_seq: number;
  tx_hash: string;
}

export interface EvmEvent {
  index: number;
  timestamp: number;
  eventType: string;
  category: string;
  submitter: string;
  metadata: string;
  eventHash: string;
  ledgerSeq: number;
  txHash: string;
  chainId: string;
  sourceChain: string;
  blockNumber: number;
  logIndex: number;
}

export interface TransformationRule {
  sourceField: string;
  targetField: string;
  transformer?: (value: unknown) => unknown;
  validator?: (value: unknown) => boolean;
  required?: boolean;
  defaultValue?: unknown;
}

export interface TransformationResult {
  success: boolean;
  data: EvmEvent | null;
  errors: string[];
  warnings: string[];
}

export interface FieldMapping {
  [stellarField: string]: string;
}

export interface TransformationConfig {
  chainId: string;
  sourceChain: string;
  fieldMappings: FieldMapping;
  rules: TransformationRule[];
  strictValidation: boolean;
}

// ── Default Configuration ─────────────────────────────────────────────────────

const DEFAULT_FIELD_MAPPINGS: FieldMapping = {
  index: "index",
  timestamp: "timestamp",
  event_type: "eventType",
  submitter: "submitter",
  metadata: "metadata",
  event_hash: "eventHash",
  ledger_seq: "ledgerSeq",
  tx_hash: "txHash",
};

const DEFAULT_VALIDATORS: Record<string, (value: unknown) => boolean> = {
  index: (v) => typeof v === "number" && v >= 0,
  timestamp: (v) => typeof v === "number" && v > 0,
  event_type: (v) => typeof v === "string" && v.length > 0 && v.length <= 64,
  submitter: (v) => typeof v === "string" && v.length > 0,
  metadata: (v) => typeof v === "string",
  event_hash: (v) => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v),
  ledger_seq: (v) => typeof v === "number" && v > 0,
  tx_hash: (v) => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v.replace(/^0x/, "")),
};

const DEFAULT_TRANSFORMERS: Record<string, (value: unknown) => unknown> = {
  event_type: (v) => String(v).toLowerCase().replace(/[^a-z0-9_]/g, "_"),
  submitter: (v) => {
    const s = String(v);
    return s.startsWith("0x") ? s : "0x" + s;
  },
  event_hash: (v) => {
    const s = String(v);
    return s.startsWith("0x") ? s : "0x" + s;
  },
  tx_hash: (v) => {
    const s = String(v);
    return s.startsWith("0x") ? s : "0x" + s;
  },
};

// ── Transformer Class ─────────────────────────────────────────────────────────

export class EventTransformer {
  private config: TransformationConfig;
  private rules: TransformationRule[];

  constructor(config?: Partial<TransformationConfig>) {
    this.config = {
      chainId: config?.chainId ?? "stellar-testnet",
      sourceChain: config?.sourceChain ?? "stellar",
      fieldMappings: config?.fieldMappings ?? DEFAULT_FIELD_MAPPINGS,
      rules: config?.rules ?? [],
      strictValidation: config?.strictValidation ?? false,
    };

    this.rules = [
      ...this.buildDefaultRules(),
      ...this.config.rules,
    ];
  }

  private buildDefaultRules(): TransformationRule[] {
    return Object.entries(this.config.fieldMappings).map(([sourceField, targetField]) => ({
      sourceField,
      targetField,
      transformer: DEFAULT_TRANSFORMERS[sourceField],
      validator: DEFAULT_VALIDATORS[sourceField],
      required: ["index", "timestamp", "event_type", "submitter", "event_hash"].includes(sourceField),
      defaultValue: undefined,
    }));
  }

  validateEvent(event: StellarEvent): string[] {
    const errors: string[] = [];

    for (const rule of this.rules) {
      const value = (event as Record<string, unknown>)[rule.sourceField];

      if (rule.required && (value === undefined || value === null)) {
        errors.push(`Missing required field: ${rule.sourceField}`);
        continue;
      }

      if (value !== undefined && value !== null && rule.validator && !rule.validator(value)) {
        errors.push(`Invalid value for field ${rule.sourceField}: ${JSON.stringify(value)}`);
      }
    }

    return errors;
  }

  transformField(value: unknown, rule: TransformationRule): unknown {
    if (value === undefined || value === null) {
      return rule.defaultValue ?? value;
    }

    if (rule.transformer) {
      try {
        return rule.transformer(value);
      } catch {
        return value;
      }
    }

    return value;
  }

  transformEvent(event: StellarEvent): TransformationResult {
    const errors = this.validateEvent(event);
    const warnings: string[] = [];

    if (errors.length > 0 && this.config.strictValidation) {
      return { success: false, data: null, errors, warnings };
    }

    if (errors.length > 0) {
      warnings.push(...errors.map((e) => `Validation warning: ${e}`));
    }

    try {
      const transformed: Record<string, unknown> = {};

      for (const rule of this.rules) {
        const sourceValue = (event as Record<string, unknown>)[rule.sourceField];
        transformed[rule.targetField] = this.transformField(sourceValue, rule);
      }

      transformed.chainId = this.config.chainId;
      transformed.sourceChain = this.config.sourceChain;
      transformed.blockNumber = (event as Record<string, unknown>).ledger_seq ?? 0;
      transformed.logIndex = (event as Record<string, unknown>).index ?? 0;

      const evmEvent: EvmEvent = {
        index: transformed.index as number,
        timestamp: transformed.timestamp as number,
        eventType: transformed.eventType as string,
        category: (transformed.category as string) ?? "general",
        submitter: transformed.submitter as string,
        metadata: transformed.metadata as string,
        eventHash: transformed.eventHash as string,
        ledgerSeq: transformed.ledgerSeq as number,
        txHash: transformed.txHash as string,
        chainId: transformed.chainId as string,
        sourceChain: transformed.sourceChain as string,
        blockNumber: transformed.blockNumber as number,
        logIndex: transformed.logIndex as number,
      };

      return { success: true, data: evmEvent, errors: [], warnings };
    } catch (err) {
      return {
        success: false,
        data: null,
        errors: [`Transformation failed: ${err instanceof Error ? err.message : String(err)}`],
        warnings,
      };
    }
  }

  transformBatch(events: StellarEvent[]): TransformationResult[] {
    return events.map((event) => this.transformEvent(event));
  }

  addRule(rule: TransformationRule): void {
    this.rules.push(rule);
  }

  removeRule(sourceField: string): void {
    this.rules = this.rules.filter((r) => r.sourceField !== sourceField);
  }

  getConfig(): TransformationConfig {
    return { ...this.config };
  }
}

// ── Utility functions ─────────────────────────────────────────────────────────

export function createTransformer(chainId: string, sourceChain: string): EventTransformer {
  return new EventTransformer({ chainId, sourceChain });
}

export function transformForEvm(event: StellarEvent, chainId?: string): TransformationResult {
  const transformer = createTransformer(chainId ?? "evm-mainnet", "stellar");
  return transformer.transformEvent(event);
}

export function validateStellarEvent(event: Partial<StellarEvent>): string[] {
  const errors: string[] = [];
  if (event.index === undefined) errors.push("Missing required field: index");
  if (event.timestamp === undefined) errors.push("Missing required field: timestamp");
  if (!event.event_type) errors.push("Missing required field: event_type");
  if (!event.submitter) errors.push("Missing required field: submitter");
  if (!event.event_hash) errors.push("Missing required field: event_hash");
  return errors;
}
