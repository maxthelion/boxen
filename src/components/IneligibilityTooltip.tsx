/**
 * IneligibilityTooltip - Displays why an item can't be operated on
 *
 * Positioned in the top-right of the 3D viewport, this tooltip shows
 * warning messages when hovering over ineligible panels, edges, or corners.
 */

import React from 'react';

interface IneligibilityTooltipProps {
  message: string | null;
  visible: boolean;
}

export const IneligibilityTooltip: React.FC<IneligibilityTooltipProps> = ({
  message,
  visible,
}) => {
  if (!visible || !message) {
    return null;
  }

  return (
    <div className="ineligibility-tooltip">
      <span className="ineligibility-tooltip-icon">⚠</span>
      <span className="ineligibility-tooltip-text">{message}</span>
    </div>
  );
};
