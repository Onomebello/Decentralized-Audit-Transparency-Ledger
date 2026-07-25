"use client";

export interface FilterChip {
  key: string;
  label: string;
}

export default function FilterChips({
  chips,
  onRemove,
  onClearAll,
}: {
  chips: FilterChip[];
  onRemove: (key: string) => void;
  onClearAll: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="filter-chips">
      {chips.map((chip) => (
        <span key={chip.key} className="filter-chip">
          {chip.label}
          <button
            className="filter-chip-remove"
            onClick={() => onRemove(chip.key)}
            title={`Remove ${chip.label}`}
          >
            ×
          </button>
        </span>
      ))}
      {chips.length > 1 && (
        <button
          className="filter-chip-remove"
          onClick={onClearAll}
          style={{ fontSize: 12, color: "var(--text-muted)" }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}
