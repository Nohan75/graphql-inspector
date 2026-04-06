import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Toolbar } from './Toolbar';
import { RequestList } from './RequestList';
import { DetailPanel } from './DetailPanel';
import { SettingsModal } from './Settings';
import { useRequests } from '../hooks/useRequests';
import { useSettings } from '../hooks/useSettings';
import type { GQLRequest } from '../types';

const MIN_SIDEBAR_WIDTH = 180;
const MAX_SIDEBAR_WIDTH = 600;
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
    const newWidth = Math.max(
      MIN_SIDEBAR_WIDTH,
      Math.min(MAX_SIDEBAR_WIDTH, dragStartWidth.current + delta)
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--color-bg)',
        color: 'var(--color-text)',
      }}
    >
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
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Sidebar */}
        <div
          style={{
            width: sidebarWidth,
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--color-sidebar)',
            borderRight: '1px solid var(--color-border)',
            overflow: 'hidden',
          }}
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
          style={{
            width: '4px',
            cursor: 'col-resize',
            backgroundColor: 'var(--color-border)',
            flexShrink: 0,
            transition: 'background-color 0.1s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              'var(--color-accent)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.backgroundColor =
              'var(--color-border)';
          }}
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
