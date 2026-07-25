"use client";
import { useState, useEffect, useCallback } from "react";

export interface FilterState {
  event_type: string;
  submitter: string;
  dateFrom: string;
  dateTo: string;
  metadata: string;
}

const STORAGE_KEY = "audit-ledger-filters";

export const FILTER_PRESETS: { label: string; filters: Partial<FilterState> }[] = [
  { label: "Last 24h", filters: { dateFrom: new Date(Date.now() - 86400000).toISOString().slice(0, 10) } },
  { label: "Last 7 days", filters: { dateFrom: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) } },
  { label: "Payments only", filters: { event_type: "payment" } },
  { label: "Governance", filters: { event_type: "governance" } },
  { label: "Audits", filters: { event_type: "audit" } },
];

function loadPersistedFilters(): Partial<FilterState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistFilters(filters: Partial<FilterState>) {
  if (typeof window === "undefined") return;
  try {
    const nonEmpty: Partial<FilterState> = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v) (nonEmpty as Record<string, string>)[k] = v;
    }
    if (Object.keys(nonEmpty).length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nonEmpty));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

export function useFilterPersistence(initial?: Partial<FilterState>) {
  const [filters, setFilters] = useState<FilterState>(() => ({
    event_type: initial?.event_type ?? "",
    submitter: initial?.submitter ?? "",
    dateFrom: initial?.dateFrom ?? "",
    dateTo: initial?.dateTo ?? "",
    metadata: initial?.metadata ?? "",
    ...loadPersistedFilters(),
  }));

  useEffect(() => {
    persistFilters(filters);
  }, [filters]);

  const updateFilter = useCallback((key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({ event_type: "", submitter: "", dateFrom: "", dateTo: "", metadata: "" });
  }, []);

  const applyPreset = useCallback((preset: Partial<FilterState>) => {
    setFilters((prev) => ({
      ...prev,
      ...preset,
      // Only override fields present in preset, keep others
      event_type: preset.event_type ?? prev.event_type,
      submitter: preset.submitter ?? prev.submitter,
      dateFrom: preset.dateFrom ?? prev.dateFrom,
      dateTo: preset.dateTo ?? prev.dateTo,
      metadata: preset.metadata ?? prev.metadata,
    }));
  }, []);

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return { filters, updateFilter, clearFilters, applyPreset, hasActiveFilters };
}
