import { serializeProject, deserializeProject, ProjectState } from './urlState';

export interface SavedProject {
  id: string;
  name: string;
  thumbnail: string;  // Base64 data URL
  data: string;       // Same format as URL encoded state
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = 'boxen-projects';

// Generate a unique ID
const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

// Get all saved projects
export const getSavedProjects = (): SavedProject[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch (e) {
    console.error('Failed to load projects from localStorage:', e);
    return [];
  }
};

// Save a project
export const saveProject = (
  name: string,
  state: ProjectState,
  thumbnail: string,
  existingId?: string
): SavedProject => {
  const projects = getSavedProjects();
  const now = Date.now();

  // Serialize using same format as URL
  const data = serializeProject(state);

  if (existingId) {
    // Update existing project
    const index = projects.findIndex(p => p.id === existingId);
    if (index !== -1) {
      projects[index] = {
        ...projects[index],
        name,
        thumbnail,
        data,
        updatedAt: now,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
      return projects[index];
    }
  }

  // Create new project
  const project: SavedProject = {
    id: generateId(),
    name,
    thumbnail,
    data,
    createdAt: now,
    updatedAt: now,
  };

  projects.unshift(project);  // Add to beginning
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));

  return project;
};

// Load a project
export const loadProject = (id: string): ProjectState | null => {
  const projects = getSavedProjects();
  const project = projects.find(p => p.id === id);

  if (!project) return null;

  return deserializeProject(project.data);
};

// Delete a project
export const deleteProject = (id: string): boolean => {
  const projects = getSavedProjects();
  const filtered = projects.filter(p => p.id !== id);

  if (filtered.length === projects.length) return false;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
};

// Rename a project
export const renameProject = (id: string, newName: string): boolean => {
  const projects = getSavedProjects();
  const index = projects.findIndex(p => p.id === id);

  if (index === -1) return false;

  projects[index] = {
    ...projects[index],
    name: newName,
    updatedAt: Date.now(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
  return true;
};

// Get project by ID
export const getProject = (id: string): SavedProject | null => {
  const projects = getSavedProjects();
  return projects.find(p => p.id === id) || null;
};

// Capture thumbnail from canvas
// Target thumbnail dimensions match the CSS (.project-thumbnail is ~290px wide, 120px tall)
const THUMBNAIL_WIDTH = 580;  // 2x for retina
const THUMBNAIL_HEIGHT = 240; // 2x for retina
const THUMBNAIL_ASPECT = THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;

export const captureThumbnail = (canvas: HTMLCanvasElement): string => {
  const tempCanvas = document.createElement('canvas');
  const ctx = tempCanvas.getContext('2d');

  if (!ctx) return '';

  // Set output size (high res for crisp display)
  tempCanvas.width = THUMBNAIL_WIDTH;
  tempCanvas.height = THUMBNAIL_HEIGHT;

  // Calculate crop area from source canvas to match thumbnail aspect ratio
  const sourceAspect = canvas.width / canvas.height;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = canvas.width;
  let sourceHeight = canvas.height;

  if (sourceAspect > THUMBNAIL_ASPECT) {
    // Canvas is wider than thumbnail - crop sides
    sourceWidth = canvas.height * THUMBNAIL_ASPECT;
    sourceX = (canvas.width - sourceWidth) / 2;
  } else {
    // Canvas is taller than thumbnail - crop top/bottom
    sourceHeight = canvas.width / THUMBNAIL_ASPECT;
    sourceY = (canvas.height - sourceHeight) / 2;
  }

  // Enable high quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw cropped and scaled image
  ctx.drawImage(
    canvas,
    sourceX, sourceY, sourceWidth, sourceHeight,  // Source crop
    0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT        // Destination
  );

  // Return as PNG for crisp quality
  return tempCanvas.toDataURL('image/png');
};
