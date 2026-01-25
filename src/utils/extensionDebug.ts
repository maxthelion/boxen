/**
 * Debug utility for tracking extension overlap calculations
 */

export interface CornerDebugInfo {
  corner: string;
  meetsOnHorizontal: boolean;
  meetsOnVertical: boolean;
  perpFaceIdHorizontal: string | null;
  perpFaceIdVertical: string | null;
  hasPriorityHorizontal: boolean | null;
  hasPriorityVertical: boolean | null;
  goesFullWidth: boolean;
  finalX: number;
  finalY: number;
  usedMainCornersX: boolean;
  usedMainCornersY: boolean;
}

export interface PanelDebugInfo {
  faceId: string;
  extensions: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
  perpExtensions: {
    leftPanelTop: number;
    rightPanelTop: number;
    leftPanelBottom: number;
    rightPanelBottom: number;
    topPanelLeft: number;
    bottomPanelLeft: number;
    topPanelRight: number;
    bottomPanelRight: number;
  };
  corners: CornerDebugInfo[];
  mainCorners: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  };
  extCorners: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  };
}

export interface ExtensionDebugLog {
  timestamp: string;
  panels: PanelDebugInfo[];
}

// Global debug log storage
let currentDebugLog: ExtensionDebugLog | null = null;

export const startDebugLog = (): void => {
  currentDebugLog = {
    timestamp: new Date().toISOString(),
    panels: []
  };
};

export const addPanelDebug = (info: PanelDebugInfo): void => {
  if (currentDebugLog) {
    // Remove existing entry for this face if present
    currentDebugLog.panels = currentDebugLog.panels.filter(p => p.faceId !== info.faceId);
    currentDebugLog.panels.push(info);
  }
};

export const getDebugLog = (): ExtensionDebugLog | null => {
  return currentDebugLog;
};

export const formatDebugLog = (): string => {
  if (!currentDebugLog || currentDebugLog.panels.length === 0) {
    return 'No debug information available';
  }

  const lines: string[] = [];
  lines.push(`=== Extension Debug Log ===`);
  lines.push(`Timestamp: ${currentDebugLog.timestamp}`);
  lines.push('');

  for (const panel of currentDebugLog.panels) {
    // Only show panels with extensions
    const hasExtension = panel.extensions.top > 0 || panel.extensions.bottom > 0 ||
                         panel.extensions.left > 0 || panel.extensions.right > 0;
    if (!hasExtension) continue;

    lines.push(`--- Panel: ${panel.faceId.toUpperCase()} ---`);
    lines.push(`Extensions: top=${panel.extensions.top}, bottom=${panel.extensions.bottom}, left=${panel.extensions.left}, right=${panel.extensions.right}`);
    lines.push('');
    lines.push('Perpendicular panel extensions:');
    lines.push(`  Left panel top: ${panel.perpExtensions.leftPanelTop}, Right panel top: ${panel.perpExtensions.rightPanelTop}`);
    lines.push(`  Left panel bottom: ${panel.perpExtensions.leftPanelBottom}, Right panel bottom: ${panel.perpExtensions.rightPanelBottom}`);
    lines.push(`  Top panel left: ${panel.perpExtensions.topPanelLeft}, Bottom panel left: ${panel.perpExtensions.bottomPanelLeft}`);
    lines.push(`  Top panel right: ${panel.perpExtensions.topPanelRight}, Bottom panel right: ${panel.perpExtensions.bottomPanelRight}`);
    lines.push('');

    lines.push('Main corners (with joint insets):');
    lines.push(`  topLeft: (${panel.mainCorners.topLeft.x.toFixed(2)}, ${panel.mainCorners.topLeft.y.toFixed(2)})`);
    lines.push(`  topRight: (${panel.mainCorners.topRight.x.toFixed(2)}, ${panel.mainCorners.topRight.y.toFixed(2)})`);
    lines.push(`  bottomRight: (${panel.mainCorners.bottomRight.x.toFixed(2)}, ${panel.mainCorners.bottomRight.y.toFixed(2)})`);
    lines.push(`  bottomLeft: (${panel.mainCorners.bottomLeft.x.toFixed(2)}, ${panel.mainCorners.bottomLeft.y.toFixed(2)})`);
    lines.push('');

    lines.push('Extension corners (final positions):');
    lines.push(`  topLeft: (${panel.extCorners.topLeft.x.toFixed(2)}, ${panel.extCorners.topLeft.y.toFixed(2)})`);
    lines.push(`  topRight: (${panel.extCorners.topRight.x.toFixed(2)}, ${panel.extCorners.topRight.y.toFixed(2)})`);
    lines.push(`  bottomRight: (${panel.extCorners.bottomRight.x.toFixed(2)}, ${panel.extCorners.bottomRight.y.toFixed(2)})`);
    lines.push(`  bottomLeft: (${panel.extCorners.bottomLeft.x.toFixed(2)}, ${panel.extCorners.bottomLeft.y.toFixed(2)})`);
    lines.push('');

    lines.push('Corner meeting analysis:');
    for (const corner of panel.corners) {
      lines.push(`  ${corner.corner}:`);
      lines.push(`    meetsOnHorizontal: ${corner.meetsOnHorizontal} (perpFace: ${corner.perpFaceIdHorizontal}, hasPriority: ${corner.hasPriorityHorizontal})`);
      lines.push(`    meetsOnVertical: ${corner.meetsOnVertical} (perpFace: ${corner.perpFaceIdVertical}, hasPriority: ${corner.hasPriorityVertical})`);
      lines.push(`    goesFullWidth: ${corner.goesFullWidth}`);
      lines.push(`    final: (${corner.finalX.toFixed(2)}, ${corner.finalY.toFixed(2)})`);
      lines.push(`    usedMainCorners: X=${corner.usedMainCornersX}, Y=${corner.usedMainCornersY}`);
    }
    lines.push('');
  }

  return lines.join('\n');
};

export const hasDebugInfo = (): boolean => {
  if (!currentDebugLog) return false;
  return currentDebugLog.panels.some(p =>
    p.extensions.top > 0 || p.extensions.bottom > 0 ||
    p.extensions.left > 0 || p.extensions.right > 0
  );
};
