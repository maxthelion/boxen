import React, { useState, useEffect, useRef } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}

/**
 * A number input that:
 * - Allows free-form text editing (can delete and retype)
 * - Updates the store live when the value is valid
 * - Only shows valid values in the preview
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  step,
  className,
}) => {
  const [localValue, setLocalValue] = useState(String(value));
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update local value when external value changes (but not while focused)
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(String(value));
    }
  }, [value, isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    // Select all text on focus for easy replacement
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleBlur = () => {
    setIsFocused(false);
    // On blur, sync local value with the current store value
    setLocalValue(String(value));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    setLocalValue(inputValue);

    // Try to parse and validate
    const parsed = parseFloat(inputValue);

    // Only update store if it's a valid number within bounds
    if (!isNaN(parsed)) {
      let validValue = parsed;
      if (min !== undefined && parsed < min) validValue = min;
      if (max !== undefined && parsed > max) validValue = max;

      // Only call onChange if the clamped value is what the user typed
      // (or if they typed something out of bounds, use the clamped value)
      if (parsed === validValue || parsed < (min ?? -Infinity) || parsed > (max ?? Infinity)) {
        onChange(validValue);
      }
    }
    // If invalid (empty, partial like "1.", etc), just keep local state - don't update store
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    }
    if (e.key === 'Escape') {
      setLocalValue(String(value));
      inputRef.current?.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      type="number"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      min={min}
      max={max}
      step={step}
      className={className}
    />
  );
};
