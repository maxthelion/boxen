/**
 * Debug utility for tracking push/pull preview operations
 */

export interface PushPullDebugEntry {
  action: string;
  timestamp: string;
  faceId?: string;
  offset?: number;
  mode?: string;
  previewState?: {
    hasPreview: boolean;
    type?: string;
    configDimensions?: { width: number; height: number; depth: number };
    faceOffsets?: Record<string, number>;
  };
  mainState?: {
    configDimensions: { width: number; height: number; depth: number };
  };
  panelPosition?: {
    mainPanel?: [number, number, number];
    previewPanel?: [number, number, number];
  };
  arrowPosition?: [number, number, number];
  scaledDimensions?: {
    main: { w: number; h: number; d: number };
    preview: { w: number; h: number; d: number };
  };
  extra?: Record<string, unknown>;
}

export interface PushPullDebugLog {
  startTime: string;
  entries: PushPullDebugEntry[];
}

// Global debug log storage
let currentDebugLog: PushPullDebugLog | null = null;

export const startPushPullDebug = (): void => {
  currentDebugLog = {
    startTime: new Date().toISOString(),
    entries: []
  };
};

export const logPushPull = (entry: Omit<PushPullDebugEntry, 'timestamp'>): void => {
  if (!currentDebugLog) {
    startPushPullDebug();
  }
  currentDebugLog!.entries.push({
    ...entry,
    timestamp: new Date().toISOString()
  });
  // Keep only last 50 entries to avoid memory issues
  if (currentDebugLog!.entries.length > 50) {
    currentDebugLog!.entries = currentDebugLog!.entries.slice(-50);
  }
};

export const getPushPullDebugLog = (): PushPullDebugLog | null => {
  return currentDebugLog;
};

export const formatPushPullDebug = (): string => {
  if (!currentDebugLog || currentDebugLog.entries.length === 0) {
    return 'No push/pull debug information available';
  }

  const lines: string[] = [];
  lines.push(`=== Push/Pull Debug Log ===`);
  lines.push(`Started: ${currentDebugLog.startTime}`);
  lines.push(`Entries: ${currentDebugLog.entries.length}`);
  lines.push('');

  for (const entry of currentDebugLog.entries) {
    const time = entry.timestamp.split('T')[1]?.slice(0, 12) || entry.timestamp;
    lines.push(`[${time}] ${entry.action}`);

    if (entry.faceId) {
      lines.push(`  faceId: ${entry.faceId}`);
    }
    if (entry.offset !== undefined) {
      lines.push(`  offset: ${entry.offset}`);
    }
    if (entry.mode) {
      lines.push(`  mode: ${entry.mode}`);
    }

    if (entry.previewState) {
      lines.push(`  previewState:`);
      lines.push(`    hasPreview: ${entry.previewState.hasPreview}`);
      if (entry.previewState.type) {
        lines.push(`    type: ${entry.previewState.type}`);
      }
      if (entry.previewState.configDimensions) {
        const d = entry.previewState.configDimensions;
        lines.push(`    configDims: ${d.width} x ${d.height} x ${d.depth}`);
      }
      if (entry.previewState.faceOffsets) {
        const offsets = Object.entries(entry.previewState.faceOffsets)
          .filter(([_, v]) => v !== 0)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        if (offsets) {
          lines.push(`    faceOffsets: ${offsets}`);
        }
      }
    }

    if (entry.mainState) {
      const d = entry.mainState.configDimensions;
      lines.push(`  mainState: ${d.width} x ${d.height} x ${d.depth}`);
    }

    if (entry.panelPosition) {
      if (entry.panelPosition.mainPanel) {
        lines.push(`  mainPanelPos: [${entry.panelPosition.mainPanel.map(n => n.toFixed(2)).join(', ')}]`);
      }
      if (entry.panelPosition.previewPanel) {
        lines.push(`  previewPanelPos: [${entry.panelPosition.previewPanel.map(n => n.toFixed(2)).join(', ')}]`);
      }
    }

    if (entry.arrowPosition) {
      lines.push(`  arrowPos: [${entry.arrowPosition.map(n => n.toFixed(2)).join(', ')}]`);
    }

    if (entry.scaledDimensions) {
      const m = entry.scaledDimensions.main;
      const p = entry.scaledDimensions.preview;
      lines.push(`  scaledDims main: ${m.w.toFixed(2)} x ${m.h.toFixed(2)} x ${m.d.toFixed(2)}`);
      lines.push(`  scaledDims preview: ${p.w.toFixed(2)} x ${p.h.toFixed(2)} x ${p.d.toFixed(2)}`);
    }

    if (entry.extra) {
      for (const [key, value] of Object.entries(entry.extra)) {
        lines.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    }

    lines.push('');
  }

  return lines.join('\n');
};

export const hasPushPullDebugInfo = (): boolean => {
  return currentDebugLog !== null && currentDebugLog.entries.length > 0;
};

export const clearPushPullDebug = (): void => {
  currentDebugLog = null;
};
