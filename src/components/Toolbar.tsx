import React, { useRef } from 'react';

interface ToolbarProps {
  filterText: string;
  preserveLog: boolean;
  onFilterChange: (text: string) => void;
  onPreserveLogChange: (checked: boolean) => void;
  onClear: () => void;
  onOpenSettings: () => void;
}

export function Toolbar({
  filterText,
  preserveLog,
  onFilterChange,
  onPreserveLogChange,
  onClear,
  onOpenSettings,
}: ToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '5px 8px',
        backgroundColor: 'var(--color-toolbar)',
        borderBottom: '1px solid var(--color-border)',
        flexShrink: 0,
        flexWrap: 'nowrap',
      }}
    >
      {/* Clear button */}
      <button
        onClick={onClear}
        title="Clear requests"
        style={{
          background: 'none',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
          borderRadius: '3px',
          padding: '3px 8px',
          fontSize: '11px',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)';
        }}
      >
        Clear
      </button>

      {/* Filter input */}
      <div style={{ position: 'relative', flex: 1 }}>
        <input
          ref={inputRef}
          type="text"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter requests…"
          style={{
            width: '100%',
            background: 'var(--color-bg)',
            color: 'var(--color-text)',
            border: '1px solid var(--color-border)',
            borderRadius: '3px',
            padding: '3px 24px 3px 8px',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        {filterText && (
          <button
            onClick={() => { onFilterChange(''); inputRef.current?.focus(); }}
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              padding: 0,
              fontSize: '14px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Preserve log */}
      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          color: 'var(--color-text-muted)',
          fontSize: '11px',
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        <input
          type="checkbox"
          checked={preserveLog}
          onChange={(e) => onPreserveLogChange(e.target.checked)}
          style={{ cursor: 'pointer' }}
        />
        Preserve log
      </label>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        title="Settings"
        style={{
          background: 'none',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-muted)',
          borderRadius: '3px',
          padding: '3px 7px',
          fontSize: '13px',
          cursor: 'pointer',
          flexShrink: 0,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-muted)';
        }}
      >
        ⚙
      </button>
    </div>
  );
}
