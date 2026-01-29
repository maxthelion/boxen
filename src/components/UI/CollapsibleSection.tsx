import React, { useState, useEffect } from 'react';

interface CollapsibleSectionProps {
  /** Section title shown in header */
  title: string;
  /** Content to show when expanded */
  children: React.ReactNode;
  /** Whether section is expanded by default */
  defaultExpanded?: boolean;
  /** Optional key for persisting state to sessionStorage */
  storageKey?: string;
  /** Additional CSS class */
  className?: string;
}

export const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({
  title,
  children,
  defaultExpanded = true,
  storageKey,
  className = '',
}) => {
  // Initialize from sessionStorage if key provided, otherwise use defaultExpanded
  const [isExpanded, setIsExpanded] = useState(() => {
    if (storageKey) {
      const stored = sessionStorage.getItem(`collapsible-${storageKey}`);
      if (stored !== null) {
        return stored === 'true';
      }
    }
    return defaultExpanded;
  });

  // Persist to sessionStorage when changed
  useEffect(() => {
    if (storageKey) {
      sessionStorage.setItem(`collapsible-${storageKey}`, String(isExpanded));
    }
  }, [storageKey, isExpanded]);

  const toggle = () => setIsExpanded(!isExpanded);

  return (
    <div className={`collapsible-section ${isExpanded ? 'expanded' : 'collapsed'} ${className}`}>
      <button
        className="collapsible-header"
        onClick={toggle}
        aria-expanded={isExpanded}
      >
        <span className="collapsible-indicator">{isExpanded ? '▼' : '▶'}</span>
        <span className="collapsible-title">{title}</span>
      </button>
      {isExpanded && (
        <div className="collapsible-content">
          {children}
        </div>
      )}
    </div>
  );
};
