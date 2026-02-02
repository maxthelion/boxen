/**
 * Floating Palette - Reusable UI components for operation palettes
 *
 * IMPORTANT: Before modifying this file, read .claude/rules/operations.md
 * which describes the pattern for creating operation palettes.
 *
 * All operation palettes should use these shared components:
 * - FloatingPalette: Draggable container
 * - PaletteSliderInput, PaletteNumberInput: Input controls
 * - PaletteButton, PaletteButtonRow: Action buttons
 * - PaletteSection, PaletteCheckbox, PaletteSelect: Other controls
 */

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { NumberInput } from './UI/NumberInput';

export interface FloatingPaletteProps {
  /** Screen position for the palette */
  position: { x: number; y: number };
  /** Optional title shown in the header */
  title?: string;
  /** Content to render inside the palette */
  children: React.ReactNode;
  /** Called when the palette should close (Cancel/Escape) */
  onClose: () => void;
  /** Called when the user confirms (Enter key) - if not provided, Enter does nothing */
  onApply?: () => void;
  /** Called when position changes (from dragging) */
  onPositionChange?: (position: { x: number; y: number }) => void;
  /** Minimum width of the palette */
  minWidth?: number;
  /** Maximum width of the palette */
  maxWidth?: number;
  /** Whether the palette is visible */
  visible?: boolean;
  /** Optional container ref to constrain palette within (defaults to window) */
  containerRef?: React.RefObject<HTMLElement>;
  /** Whether to close on click outside (defaults to true) */
  closeOnClickOutside?: boolean;
}

export const FloatingPalette: React.FC<FloatingPaletteProps> = ({
  position,
  title,
  children,
  onClose,
  onApply,
  onPositionChange,
  minWidth = 180,
  maxWidth,
  visible = true,
  containerRef,
  closeOnClickOutside = true,
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
    if (!closeOnClickOutside) return;

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
  }, [onClose, closeOnClickOutside]);

  // Handle keyboard shortcuts: Escape to cancel, Enter to apply
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'Enter' && onApply) {
        // Don't trigger apply if user is typing in a text input (except number inputs)
        const target = e.target as HTMLElement;
        const isTextInput = target.tagName === 'INPUT' &&
          (target as HTMLInputElement).type !== 'number';
        const isTextArea = target.tagName === 'TEXTAREA';

        if (!isTextInput && !isTextArea) {
          e.preventDefault();
          onApply();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onApply]);

  // Dragging handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // Only drag from the header
    if ((e.target as HTMLElement).closest('.floating-palette-header')) {
      setIsDragging(true);

      // Get container offset for proper positioning
      let containerLeft = 0;
      let containerTop = 0;
      if (containerRef?.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        containerLeft = containerRect.left;
        containerTop = containerRect.top;
      }

      setDragOffset({
        x: e.clientX - containerLeft - localPosition.x,
        y: e.clientY - containerTop - localPosition.y,
      });
      e.preventDefault();
    }
  }, [localPosition, containerRef]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (isDragging && paletteRef.current) {
      const rect = paletteRef.current.getBoundingClientRect();

      // Get container bounds or use window
      let containerLeft = 0;
      let containerTop = 0;
      let containerWidth = window.innerWidth;
      let containerHeight = window.innerHeight;
      if (containerRef?.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        containerLeft = containerRect.left;
        containerTop = containerRect.top;
        containerWidth = containerRect.width;
        containerHeight = containerRect.height;
      }

      const padding = 10;

      // Calculate new position relative to container
      let newX = e.clientX - containerLeft - dragOffset.x;
      let newY = e.clientY - containerTop - dragOffset.y;

      // Constrain to container bounds
      newX = Math.max(padding, Math.min(containerWidth - rect.width - padding, newX));
      newY = Math.max(padding, Math.min(containerHeight - rect.height - padding, newY));

      setLocalPosition({ x: newX, y: newY });
    }
  }, [isDragging, dragOffset, containerRef]);

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

  // Keep palette within container bounds (or viewport if no container)
  useEffect(() => {
    if (paletteRef.current && !isDragging) {
      const rect = paletteRef.current.getBoundingClientRect();

      // Get container bounds or use window
      let containerBounds = { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
      if (containerRef?.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        containerBounds = {
          left: containerRect.left,
          top: containerRect.top,
          right: containerRect.right,
          bottom: containerRect.bottom,
        };
      }

      let adjustedX = localPosition.x;
      let adjustedY = localPosition.y;

      const padding = 10;

      // Keep within horizontal bounds (relative to container)
      if (adjustedX + rect.width > containerBounds.right - containerBounds.left - padding) {
        adjustedX = containerBounds.right - containerBounds.left - rect.width - padding;
      }
      if (adjustedX < padding) {
        adjustedX = padding;
      }

      // Keep within vertical bounds (relative to container)
      if (adjustedY + rect.height > containerBounds.bottom - containerBounds.top - padding) {
        adjustedY = containerBounds.bottom - containerBounds.top - rect.height - padding;
      }
      if (adjustedY < padding) {
        adjustedY = padding;
      }

      if (adjustedX !== localPosition.x || adjustedY !== localPosition.y) {
        setLocalPosition({ x: adjustedX, y: adjustedY });
      }
    }
  }, [localPosition, isDragging, containerRef]);

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
        maxWidth,
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
  disabled?: boolean;  // Per-option disabled state
}

interface ToggleGroupProps {
  label?: string;
  options: ToggleOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;  // Disables entire group
}

export const PaletteToggleGroup: React.FC<ToggleGroupProps> = ({
  label,
  options,
  value,
  onChange,
  disabled = false,
}) => {
  return (
    <div className={`palette-toggle-group ${disabled ? 'disabled' : ''}`}>
      {label && <label className="palette-label">{label}</label>}
      <div className="palette-toggle-buttons">
        {options.map((option) => {
          const isDisabled = disabled || option.disabled;
          return (
            <button
              key={option.value}
              className={`palette-toggle-btn ${value === option.value ? 'active' : ''} ${isDisabled ? 'option-disabled' : ''}`}
              onClick={() => !isDisabled && onChange(option.value)}
              disabled={isDisabled}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface CheckboxProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export const PaletteCheckbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
}) => {
  return (
    <label className={`palette-checkbox ${disabled ? 'disabled' : ''}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <span className="palette-checkbox-label">{label}</span>
    </label>
  );
};

interface CheckboxGroupProps {
  label?: string;
  children: React.ReactNode;
}

export const PaletteCheckboxGroup: React.FC<CheckboxGroupProps> = ({ label, children }) => {
  return (
    <div className="palette-checkbox-group">
      {label && <label className="palette-label">{label}</label>}
      <div className="palette-checkboxes">{children}</div>
    </div>
  );
};

interface PaletteNumberInputProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}

export const PaletteNumberInput: React.FC<PaletteNumberInputProps> = ({
  label,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
}) => {
  return (
    <div className="palette-number-row">
      <label className="palette-label">{label}</label>
      <NumberInput
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        unit={unit}
      />
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
