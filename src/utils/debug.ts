/**
 * Simple global debug system
 * Any debug utility can write to this, and a single button copies it
 */

let debugContent: string = '';

export const setDebug = (content: string): void => {
  debugContent = content;
};

export const appendDebug = (content: string): void => {
  if (debugContent) {
    debugContent += '\n\n' + content;
  } else {
    debugContent = content;
  }
};

export const getDebug = (): string => debugContent;

export const hasDebug = (): boolean => debugContent.length > 0;

export const clearDebug = (): void => {
  debugContent = '';
};
