/**
 * Tagged debug system
 *
 * Usage:
 *   debug('subdivision', 'Starting subdivision...');
 *   debug('preview', `Preview created for void ${voidId}`);
 *
 * Control active tags:
 *   enableDebugTag('subdivision');
 *   disableDebugTag('subdivision');
 *   setDebugTags(['subdivision', 'preview']);
 *   getDebugTags(); // returns current active tags
 *
 * Only messages with active tags are sent to the clipboard debugger.
 */

let debugContent: string = '';
const activeTags = new Set<string>();

// Internal: append a line to debug content
const appendLine = (line: string): void => {
  if (debugContent) {
    debugContent += '\n' + line;
  } else {
    debugContent = line;
  }
};

/**
 * Log a debug message with a tag. Only outputs if the tag is active.
 */
export const debug = (tag: string, content: string): void => {
  if (!activeTags.has(tag)) return;

  const timestamp = new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
  appendLine(`[${timestamp}] [${tag}] ${content}`);
};

/**
 * Enable a debug tag
 */
export const enableDebugTag = (tag: string): void => {
  activeTags.add(tag);
};

/**
 * Disable a debug tag
 */
export const disableDebugTag = (tag: string): void => {
  activeTags.delete(tag);
};

/**
 * Set all active debug tags (replaces existing)
 */
export const setDebugTags = (tags: string[]): void => {
  activeTags.clear();
  tags.forEach(tag => activeTags.add(tag));
};

/**
 * Get currently active debug tags
 */
export const getDebugTags = (): string[] => {
  return Array.from(activeTags);
};

/**
 * Check if a tag is active
 */
export const isDebugTagActive = (tag: string): boolean => {
  return activeTags.has(tag);
};

/**
 * Replace all debug content (no filtering)
 */
export const setDebug = (content: string): void => {
  debugContent = content;
};

/**
 * Append untagged debug content (always outputs, no filtering)
 */
export const appendDebug = (content: string): void => {
  appendLine(content);
};

export const getDebug = (): string => debugContent;

export const hasDebug = (): boolean => debugContent.length > 0;

export const clearDebug = (): void => {
  debugContent = '';
};
