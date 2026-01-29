/**
 * Built-in Project Templates
 *
 * Pre-defined templates for common box designs.
 */

import { ProjectTemplate } from './types';

/**
 * Basic Box - A simple six-sided box with no internal divisions
 */
const basicBox: ProjectTemplate = {
  id: 'basic-box',
  name: 'Basic Box',
  description: 'A simple six-sided box with finger joints',
  category: 'general',
  initialAssembly: {
    width: 100,
    height: 100,
    depth: 100,
    materialThickness: 3,
    fingerWidth: 10,
    fingerGap: 1.5,
  },
  actionSequence: [],
};

/**
 * Drawer Unit - A box with horizontal drawers
 */
const drawerUnit: ProjectTemplate = {
  id: 'drawer-unit',
  name: 'Drawer Unit',
  description: 'A box with configurable horizontal drawer compartments',
  category: 'storage',
  initialAssembly: {
    width: 200,
    height: 300,
    depth: 150,
    materialThickness: 3,
    fingerWidth: 10,
    fingerGap: 1.5,
  },
  actionSequence: [
    // Remove front face (drawer openings)
    {
      type: 'SET_FACE_SOLID',
      targetId: '$assembly',
      payload: { faceId: 'front', solid: false },
    },
    // Create horizontal subdivisions for drawers
    {
      type: 'ADD_SUBDIVISIONS',
      targetId: '$assembly',
      payload: {
        voidId: '$rootVoid',
        axis: 'y',
      },
      subdivisionConfig: {
        axis: 'y',
        defaultCount: 3,
        variableName: 'Drawer Count',
        positionFormula: 'equal-spacing',
      },
    },
  ],
};

/**
 * Vertical Organizer - A box with vertical slots (like a file organizer)
 */
const verticalOrganizer: ProjectTemplate = {
  id: 'vertical-organizer',
  name: 'Vertical Organizer',
  description: 'A box with vertical slots for files, books, or similar items',
  category: 'organization',
  initialAssembly: {
    width: 300,
    height: 200,
    depth: 200,
    materialThickness: 3,
    fingerWidth: 10,
    fingerGap: 1.5,
  },
  actionSequence: [
    // Remove top face for easy access
    {
      type: 'SET_FACE_SOLID',
      targetId: '$assembly',
      payload: { faceId: 'top', solid: false },
    },
    // Create vertical subdivisions
    {
      type: 'ADD_SUBDIVISIONS',
      targetId: '$assembly',
      payload: {
        voidId: '$rootVoid',
        axis: 'x',
      },
      subdivisionConfig: {
        axis: 'x',
        defaultCount: 5,
        variableName: 'Slot Count',
        positionFormula: 'equal-spacing',
      },
    },
  ],
};

/**
 * Grid Organizer - Open-top box with a grid of compartments (X and Z axes)
 */
const gridOrganizer: ProjectTemplate = {
  id: 'grid-organizer',
  name: 'Grid Organizer',
  description: 'Open-top box with a grid of compartments for small items',
  category: 'organization',
  initialAssembly: {
    width: 200,
    height: 60,
    depth: 200,
    materialThickness: 3,
    fingerWidth: 10,
    fingerGap: 1.5,
  },
  actionSequence: [
    // Remove top face
    {
      type: 'SET_FACE_SOLID',
      targetId: '$assembly',
      payload: { faceId: 'top', solid: false },
    },
    // X-axis subdivisions (columns)
    {
      type: 'ADD_SUBDIVISIONS',
      targetId: '$assembly',
      payload: {
        voidId: '$rootVoid',
        axis: 'x',
      },
      subdivisionConfig: {
        axis: 'x',
        defaultCount: 3,
        variableName: 'Columns',
        positionFormula: 'equal-spacing',
      },
    },
    // Z-axis subdivisions (rows)
    {
      type: 'ADD_SUBDIVISIONS',
      targetId: '$assembly',
      payload: {
        voidId: '$rootVoid',
        axis: 'z',
      },
      subdivisionConfig: {
        axis: 'z',
        defaultCount: 3,
        variableName: 'Rows',
        positionFormula: 'equal-spacing',
      },
    },
  ],
};

/**
 * Pigeonhole - A box with a grid of compartments (X and Y axes, like mail slots)
 */
const pigeonhole: ProjectTemplate = {
  id: 'pigeonhole',
  name: 'Pigeonhole',
  description: 'A grid of compartments like mail slots or a cubby shelf',
  category: 'storage',
  initialAssembly: {
    width: 300,
    height: 300,
    depth: 200,
    materialThickness: 3,
    fingerWidth: 10,
    fingerGap: 1.5,
  },
  actionSequence: [
    // Remove front face for access
    {
      type: 'SET_FACE_SOLID',
      targetId: '$assembly',
      payload: { faceId: 'front', solid: false },
    },
    // X-axis subdivisions (columns)
    {
      type: 'ADD_SUBDIVISIONS',
      targetId: '$assembly',
      payload: {
        voidId: '$rootVoid',
        axis: 'x',
      },
      subdivisionConfig: {
        axis: 'x',
        defaultCount: 3,
        variableName: 'Columns',
        positionFormula: 'equal-spacing',
      },
    },
    // Y-axis subdivisions (rows)
    {
      type: 'ADD_SUBDIVISIONS',
      targetId: '$assembly',
      payload: {
        voidId: '$rootVoid',
        axis: 'y',
      },
      subdivisionConfig: {
        axis: 'y',
        defaultCount: 3,
        variableName: 'Rows',
        positionFormula: 'equal-spacing',
      },
    },
  ],
};

/**
 * All built-in templates
 */
export const builtinTemplates: ProjectTemplate[] = [
  basicBox,
  drawerUnit,
  verticalOrganizer,
  gridOrganizer,
  pigeonhole,
];

/**
 * Get a template by ID
 */
export function getTemplateById(id: string): ProjectTemplate | undefined {
  return builtinTemplates.find((t) => t.id === id);
}

/**
 * Get all available templates
 */
export function getAllTemplates(): ProjectTemplate[] {
  return [...builtinTemplates];
}
