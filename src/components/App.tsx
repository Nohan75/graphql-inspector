import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Toolbar } from './Toolbar';
import { RequestList } from './RequestList';
import { DetailPanel } from './DetailPanel';
import { SettingsModal } from './Settings';
import { useRequests } from '../hooks/useRequests';
import { useSettings } from '../hooks/useSettings';
import type { GQLRequest } from '../types';

const MIN_SIDEBAR_WIDTH = 180;
const MIN_DETAIL_WIDTH = 150;  // detail panel never goes below this
const HANDLE_WIDTH = 4;
const DEFAULT_SIDEBAR_WIDTH = 280;

export function App() {
  const [filterText, setFilterText] = useState('');
  const [preserveLog, setPreserveLog] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [showSettings, setShowSettings] = useState(false);

  const { requests, clearRequests } = useRequests(preserveLog);
  const { settings, saveSettings } = useSettings();

  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(DEFAULT_SIDEBAR_WIDTH);
  const mainAreaRef = useRef<HTMLDivElement>(null);

  // Auto-select first request if nothing is selected
  useEffect(() => {
    if (selectedId === null && requests.length > 0) {
      setSelectedId(requests[0].id);
    }
  }, [requests, selectedId]);

  // Clear selection if selected request was removed
  useEffect(() => {
    if (selectedId !== null && !requests.find((r) => r.id === selectedId)) {
      setSelectedId(requests.length > 0 ? requests[requests.length - 1].id : null);
    }
  }, [requests, selectedId]);

  const handleClear = useCallback(() => {
    clearRequests();
    setSelectedId(null);
  }, [clearRequests]);

  // Resize drag handlers
  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartX.current = e.clientX;
    dragStartWidth.current = sidebarWidth;

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientX - dragStartX.current;
    const containerWidth = mainAreaRef.current?.offsetWidth ?? 9999;
    const maxSidebarWidth = containerWidth - MIN_DETAIL_WIDTH - HANDLE_WIDTH;
    const newWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(maxSidebarWidth, dragStartWidth.current + delta)
    );
    setSidebarWidth(newWidth);
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const selectedRequest: GQLRequest | null =
    selectedId !== null
      ? requests.find((r) => r.id === selectedId) ?? null
      : null;

  return (
    <div className="flex flex-col h-full bg-bg text-text">
      {/* Toolbar */}
      <Toolbar
        filterText={filterText}
        preserveLog={preserveLog}
        onFilterChange={setFilterText}
        onPreserveLogChange={setPreserveLog}
        onClear={handleClear}
        onOpenSettings={() => setShowSettings(true)}
      />

      {/* Main area: sidebar + resizer + detail */}
      <div ref={mainAreaRef} className="flex-1 flex overflow-hidden">
        {/* Sidebar — width is dynamic (drag resizable), kept as inline style */}
        <div
          style={{ width: sidebarWidth }}
          className="shrink-0 flex flex-col bg-sidebar border-r border-border overflow-hidden"
        >
          <RequestList
            requests={requests}
            selectedId={selectedId}
            filterText={filterText}
            sandboxUrl={settings.sandboxUrl}
            onSelect={setSelectedId}
          />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeMouseDown}
          className="w-1 cursor-col-resize bg-border shrink-0 transition-colors duration-100 hover:bg-accent"
        />

        {/* Detail panel */}
        <DetailPanel request={selectedRequest} />
      </div>

      {/* Settings modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={saveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
