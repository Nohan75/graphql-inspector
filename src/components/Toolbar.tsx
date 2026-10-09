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
    <div className="flex items-center gap-2 px-2 py-[5px] bg-toolbar border-b border-border shrink-0 flex-nowrap">

      {/* Clear button */}
      <button
        onClick={onClear}
        title="Clear requests"
        className="bg-transparent border border-border text-text-muted rounded-[3px] px-2 py-[3px] text-[11px] cursor-pointer whitespace-nowrap shrink-0 hover:text-text"
      >
        Clear
      </button>

      {/* Filter input */}
      <div className="relative flex-1">
        <input
          ref={inputRef}
          type="text"
          value={filterText}
          onChange={(e) => onFilterChange(e.target.value)}
          placeholder="Filter requests…"
          className="w-full bg-bg text-text border border-border rounded-[3px] pl-2 pr-6 py-[3px] text-xs outline-none"
        />
        {filterText && (
          <button
            onClick={() => { onFilterChange(''); inputRef.current?.focus(); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-transparent border-none text-text-muted cursor-pointer p-0 text-sm leading-none"
          >
            ×
          </button>
        )}
      </div>

      {/* Preserve log */}
      <label className="flex items-center gap-1 text-text-muted text-[11px] cursor-pointer select-none whitespace-nowrap shrink-0">
        <input
          type="checkbox"
          checked={preserveLog}
          onChange={(e) => onPreserveLogChange(e.target.checked)}
          className="cursor-pointer"
        />
        Preserve log
      </label>

      {/* Settings */}
      <button
        onClick={onOpenSettings}
        title="Settings"
        className="bg-transparent border border-border text-text-muted rounded-[3px] py-[3px] px-[7px] text-[13px] cursor-pointer shrink-0 leading-none hover:text-text"
      >
        ⚙
      </button>
    </div>
  );
}
