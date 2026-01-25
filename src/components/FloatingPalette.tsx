import React, { useRef, useState, useEffect, useCallback } from 'react';

export interface FloatingPaletteProps {
  /** Screen position for the palette */
  position: { x: number; y: number };
  /** Optional title shown in the header */
  title?: string;
  /** Content to render inside the palette */
  children: React.ReactNode;
  /** Called when the palette should close */
  onClose: () => void;
  /** Called when position changes (from dragging) */
  onPositionChange?: (position: { x: number; y: number }) => void;
  /** Minimum width of the palette */
  minWidth?: number;
  /** Whether the palette is visible */
  visible?: boolean;
}

export const FloatingPalette: React.FC<FloatingPaletteProps> = ({
  position,
  title,
  children,
  onClose,
  onPositionChange,
  minWidth = 180,
  visible = true,
}) => {
  const paletteRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [localPosition, setLocalPosition] = useState(position);

  // Update local position when prop changes (but not while dragging)
  useEffect(() => {
    if (!isDragging) {
      setLocalPosition(position);
    }
  }, [position, isDragging]);

  // Handle clicking outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay adding listener to avoid immediate close from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  // Handle Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Dragging handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only drag from the header
    if ((e.target as HTMLElement).closest('.floating-palette-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - localPosition.x,
        y: e.clientY - localPosition.y,
      });
      e.preventDefault();
    }
  }, [localPosition]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (isDragging) {
      const newPosition = {
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      };
      setLocalPosition(newPosition);
    }
  }, [isDragging, dragOffset]);

  const handleDragEnd = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onPositionChange?.(localPosition);
    }
  }, [isDragging, localPosition, onPositionChange]);

  // Add/remove document listeners for dragging
  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', handleDragEnd);
      return () => {
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [isDragging, handleDragMove, handleDragEnd]);

  // Keep palette within viewport bounds
  useEffect(() => {
    if (paletteRef.current && !isDragging) {
      const rect = paletteRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = localPosition.x;
      let adjustedY = localPosition.y;

      // Keep within horizontal bounds
      if (adjustedX + rect.width > viewportWidth - 10) {
        adjustedX = viewportWidth - rect.width - 10;
      }
      if (adjustedX < 10) {
        adjustedX = 10;
      }

      // Keep within vertical bounds
      if (adjustedY + rect.height > viewportHeight - 10) {
        adjustedY = viewportHeight - rect.height - 10;
      }
      if (adjustedY < 10) {
        adjustedY = 10;
      }

      if (adjustedX !== localPosition.x || adjustedY !== localPosition.y) {
        setLocalPosition({ x: adjustedX, y: adjustedY });
      }
    }
  }, [localPosition, isDragging]);

  if (!visible) {
    return null;
  }

  return (
    <div
      ref={paletteRef}
      className={`floating-palette ${isDragging ? 'dragging' : ''}`}
      style={{
        left: localPosition.x,
        top: localPosition.y,
        minWidth,
      }}
      onMouseDown={handleDragStart}
    >
      <div className="floating-palette-header">
        {title && <span className="floating-palette-title">{title}</span>}
        <button
          className="floating-palette-close"
          onClick={onClose}
          title="Close (Esc)"
        >
          ×
        </button>
      </div>
      <div className="floating-palette-content">
        {children}
      </div>
    </div>
  );
};

// Preset content components for common palette types

interface SliderInputProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export const PaletteSliderInput: React.FC<SliderInputProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}) => {
  return (
    <div className="palette-slider-input">
      <label className="palette-label">{label}</label>
      <div className="palette-slider-row">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="palette-slider"
        />
        <div className="palette-number-input">
          <input
            type="number"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value) || min)}
            className="palette-input"
          />
          {unit && <span className="palette-unit">{unit}</span>}
        </div>
      </div>
    </div>
  );
};

interface ToggleOption {
  value: string;
  label: string;
}

interface ToggleGroupProps {
  label?: string;
  options: ToggleOption[];
  value: string;
  onChange: (value: string) => void;
}

export const PaletteToggleGroup: React.FC<ToggleGroupProps> = ({
  label,
  options,
  value,
  onChange,
}) => {
  return (
    <div className="palette-toggle-group">
      {label && <label className="palette-label">{label}</label>}
      <div className="palette-toggle-buttons">
        {options.map((option) => (
          <button
            key={option.value}
            className={`palette-toggle-btn ${value === option.value ? 'active' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
};

interface ButtonRowProps {
  children: React.ReactNode;
}

export const PaletteButtonRow: React.FC<ButtonRowProps> = ({ children }) => {
  return <div className="palette-button-row">{children}</div>;
};

interface ButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export const PaletteButton: React.FC<ButtonProps> = ({
  onClick,
  children,
  variant = 'secondary',
  disabled = false,
}) => {
  return (
    <button
      className={`palette-btn palette-btn-${variant}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};
