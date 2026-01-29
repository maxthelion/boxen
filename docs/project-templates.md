# Project Templates

Create a library of starting points (templates) that users can customize when creating new projects.

## Status: Planning

---

## Core Concept: Templates as Parameterized Event Logs

Templates are stored as **sequences of engine actions** that can be replayed with different variable values. This aligns with the event-sourcing architecture and enables powerful parameterization.

### Variables are Derived from the Event Log

A template's configurable variables are **discovered from its action sequence**, not predefined:

1. **Dimensions** (always present) - Width, height, depth of the assembly
2. **Subdivision Counts** (only if subdivisions exist) - For each axis that has `ADD_SUBDIVISION` actions in the log, a count variable is exposed

This means:
- A **Basic Box** template has only dimension variables (no subdivision actions in log)
- A **Drawer Unit** template has dimensions + Y-axis subdivision count (has Y subdivisions in log)
- A **Grid Organizer** has dimensions + X count + Z count (has both X and Z subdivisions)

### Why Event Logs?

Storing templates as action sequences (rather than state snapshots) provides:

- **Natural parameterization**: Subdivision count = number of `ADD_SUBDIVISION` actions to generate
- **Automatic variable discovery**: Analyze the log to find what's parameterizable
- **Alignment with undo/redo**: Same action format used by history system
- **Composability**: Templates can be combined or extended
- **Transparency**: Users can see exactly what the template does

---

## Template Structure

```typescript
interface ProjectTemplate {
  id: string;
  name: string;
  description?: string;
  thumbnail?: string;

  // The action sequence - THIS is the source of truth
  // Variables are derived by analyzing this sequence
  actionSequence: TemplateAction[];

  // Initial assembly dimensions (always parameterizable)
  initialAssembly: {
    width: number;   // Default value, becomes 'width' variable
    height: number;  // Default value, becomes 'height' variable
    depth: number;   // Default value, becomes 'depth' variable
    materialThickness: number;
    fingerWidth: number;
    fingerGap: number;
  };
}

// A template action - may be parameterized based on context
type TemplateAction = {
  type: EngineAction['type'];
  targetId: string;
  payload: Record<string, unknown>;

  // For subdivision actions: marks this as generating a count variable
  // The axis determines the variable name (e.g., 'yCount' for Y-axis subdivisions)
  subdivisionConfig?: {
    axis: 'x' | 'y' | 'z';
    defaultCount: number;        // How many compartments (dividers + 1)
    variableName?: string;       // Override default name (e.g., "Drawer Count" instead of "Y Divisions")
    positionFormula: 'equal-spacing';  // How to compute positions
  };
};

// Variables are computed at runtime from the template
interface DerivedVariables {
  // Always present
  dimensions: {
    width: { default: number; min: number; max: number };
    height: { default: number; min: number; max: number };
    depth: { default: number; min: number; max: number };
  };

  // Only present if actionSequence contains subdivision actions
  subdivisions?: {
    [axis: string]: {
      variableName: string;
      default: number;
      min: number;
      max: number;
    };
  };
}

function deriveVariables(template: ProjectTemplate): DerivedVariables {
  const variables: DerivedVariables = {
    dimensions: {
      width: { default: template.initialAssembly.width, min: 50, max: 500 },
      height: { default: template.initialAssembly.height, min: 50, max: 500 },
      depth: { default: template.initialAssembly.depth, min: 50, max: 500 },
    },
  };

  // Scan action sequence for subdivision configs
  for (const action of template.actionSequence) {
    if (action.subdivisionConfig) {
      const { axis, defaultCount, variableName } = action.subdivisionConfig;

      if (!variables.subdivisions) {
        variables.subdivisions = {};
      }

      variables.subdivisions[axis] = {
        variableName: variableName || `${axisName(axis)} Divisions`,
        default: defaultCount,
        min: 1,
        max: 10,
      };
    }
  }

  return variables;
}
```

---

## Example: Drawer Unit Template

A box with N horizontal drawers. The `subdivisionConfig` on the Y-axis action creates a "Drawer Count" variable:

```typescript
const drawerUnitTemplate: ProjectTemplate = {
  id: 'drawer-unit',
  name: 'Drawer Unit',
  description: 'A box with configurable horizontal drawers',

  // Dimensions become variables automatically
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
    // This action has no subdivisionConfig, so no variable is created
    {
      type: 'SET_FACE_SOLID',
      targetId: '$assembly',
      payload: { faceId: 'front', solid: false },
    },

    // Create horizontal subdivisions for drawers
    // The subdivisionConfig creates a 'Drawer Count' variable
    {
      type: 'ADD_SUBDIVISIONS',
      targetId: '$assembly',
      payload: {
        voidId: '$rootVoid',
        axis: 'y',
        // positions will be computed at instantiation time
      },
      subdivisionConfig: {
        axis: 'y',
        defaultCount: 3,
        variableName: 'Drawer Count',  // Custom name instead of "Y Divisions"
        positionFormula: 'equal-spacing',
      },
    },
  ],
};

// When this template is loaded, deriveVariables() returns:
// {
//   dimensions: { width: 200, height: 300, depth: 150 },
//   subdivisions: {
//     y: { variableName: 'Drawer Count', default: 3, min: 1, max: 10 }
//   }
// }
```

## Example: Basic Box Template (No Subdivisions)

A simple box with no internal divisions - only dimension variables:

```typescript
const basicBoxTemplate: ProjectTemplate = {
  id: 'basic-box',
  name: 'Basic Box',
  description: 'A simple six-sided box',

  initialAssembly: {
    width: 100,
    height: 100,
    depth: 100,
    materialThickness: 3,
    fingerWidth: 10,
    fingerGap: 1.5,
  },

  // No subdivision actions = no subdivision variables
  actionSequence: [],
};

// deriveVariables() returns only dimensions:
// {
//   dimensions: { width: 100, height: 100, depth: 100 },
//   // No subdivisions key at all
// }
```

## Example: Grid Organizer (Two Subdivision Axes)

A box with both X and Z subdivisions, creating two count variables:

```typescript
const gridOrganizerTemplate: ProjectTemplate = {
  id: 'grid-organizer',
  name: 'Grid Organizer',
  description: 'Open-top box with grid compartments',

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
      payload: { voidId: '$rootVoid', axis: 'x' },
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
      payload: { voidId: '$rootVoid', axis: 'z' },
      subdivisionConfig: {
        axis: 'z',
        defaultCount: 3,
        variableName: 'Rows',
        positionFormula: 'equal-spacing',
      },
    },
  ],
};

// deriveVariables() returns:
// {
//   dimensions: { width: 200, height: 60, depth: 200 },
//   subdivisions: {
//     x: { variableName: 'Columns', default: 3, min: 1, max: 10 },
//     z: { variableName: 'Rows', default: 3, min: 1, max: 10 }
//   }
// }
```

---

## Replay Algorithm

When a template is instantiated with user-provided variable values:

```typescript
interface InstantiationValues {
  // Dimensions (always present)
  width: number;
  height: number;
  depth: number;

  // Subdivision counts (only for axes that have subdivisionConfig)
  subdivisionCounts?: Record<'x' | 'y' | 'z', number>;
}

function instantiateTemplate(
  template: ProjectTemplate,
  values: InstantiationValues
): void {
  const engine = getEngine();
  const mt = template.initialAssembly.materialThickness;

  // 1. Create assembly with user-specified dimensions
  engine.createAssembly(
    values.width,
    values.height,
    values.depth,
    {
      thickness: mt,
      fingerWidth: template.initialAssembly.fingerWidth,
      fingerGap: template.initialAssembly.fingerGap,
    }
  );

  // 2. Replay each action in the sequence
  for (const templateAction of template.actionSequence) {
    if (templateAction.subdivisionConfig) {
      // This is a parameterized subdivision action
      const { axis, positionFormula } = templateAction.subdivisionConfig;
      const count = values.subdivisionCounts?.[axis] ?? templateAction.subdivisionConfig.defaultCount;

      const action = generateSubdivisionAction(
        templateAction,
        count,
        { width: values.width, height: values.height, depth: values.depth },
        mt
      );

      if (action) {
        engine.dispatch(action);
      }
    } else {
      // Regular action - dispatch as-is (with target ID resolution)
      engine.dispatch(resolveTargetIds(templateAction));
    }
  }
}

function generateSubdivisionAction(
  templateAction: TemplateAction,
  compartmentCount: number,
  dimensions: { width: number; height: number; depth: number },
  materialThickness: number
): EngineAction | null {
  const { axis } = templateAction.subdivisionConfig!;

  // Get dimension along subdivision axis
  const axisDimension = axis === 'x' ? dimensions.width
                      : axis === 'y' ? dimensions.height
                      : dimensions.depth;

  // Interior size after material thickness
  const interiorSize = axisDimension - (2 * materialThickness);

  // For N compartments, we need N-1 dividers
  const dividerCount = compartmentCount - 1;
  if (dividerCount <= 0) return null;

  // Calculate evenly-spaced positions
  const spacing = interiorSize / compartmentCount;
  const positions: number[] = [];

  for (let i = 1; i <= dividerCount; i++) {
    positions.push(materialThickness + (spacing * i));
  }

  return {
    type: 'ADD_SUBDIVISIONS',
    targetId: 'main-assembly',
    payload: {
      voidId: 'root',
      axis: axis,
      positions: positions,
    },
  };
}

function resolveTargetIds(action: TemplateAction): EngineAction {
  return {
    ...action,
    targetId: action.targetId.replace('$assembly', 'main-assembly'),
    payload: {
      ...action.payload,
      voidId: action.payload.voidId === '$rootVoid' ? 'root' : action.payload.voidId,
    },
  } as EngineAction;
}
```

---

## UI Flow

### Creating from Template

1. User clicks **"New from Template"** in header
2. **Template Browser** shows available templates with thumbnails
3. User selects a template
4. **Variable Configuration Dialog** appears:
   - Dimension inputs (always shown)
   - Subdivision count inputs (only shown if template has subdivision actions)
   - Live preview updates as values change (optional)
5. User clicks **"Create"**
6. Template is instantiated with specified values

### Variable Configuration UI

The dialog dynamically shows inputs based on `deriveVariables()`:

**Drawer Unit** (has Y-axis subdivision):
```
┌─────────────────────────────────────────────┐
│  Drawer Unit                                │
│  ─────────────────────────────────────────  │
│                                             │
│  Dimensions                                 │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │ Width      200  │  │ Height     300  │   │
│  └─────────────────┘  └─────────────────┘   │
│  ┌─────────────────┐                        │
│  │ Depth      150  │                        │
│  └─────────────────┘                        │
│                                             │
│  Structure                                  │
│  ┌─────────────────────────────────────┐    │
│  │ Drawer Count         [  3  ] [+-]   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Preview]                    [Create]      │
└─────────────────────────────────────────────┘
```

**Basic Box** (no subdivisions - no Structure section):
```
┌─────────────────────────────────────────────┐
│  Basic Box                                  │
│  ─────────────────────────────────────────  │
│                                             │
│  Dimensions                                 │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │ Width      100  │  │ Height     100  │   │
│  └─────────────────┘  └─────────────────┘   │
│  ┌─────────────────┐                        │
│  │ Depth      100  │                        │
│  └─────────────────┘                        │
│                                             │
│  [Preview]                    [Create]      │
└─────────────────────────────────────────────┘
```

**Grid Organizer** (two subdivision axes):
```
┌─────────────────────────────────────────────┐
│  Grid Organizer                             │
│  ─────────────────────────────────────────  │
│                                             │
│  Dimensions                                 │
│  ┌─────────────────┐  ┌─────────────────┐   │
│  │ Width      200  │  │ Height      60  │   │
│  └─────────────────┘  └─────────────────┘   │
│  ┌─────────────────┐                        │
│  │ Depth      200  │                        │
│  └─────────────────┘                        │
│                                             │
│  Structure                                  │
│  ┌─────────────────────────────────────┐    │
│  │ Columns              [  3  ] [+-]   │    │
│  │ Rows                 [  3  ] [+-]   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Preview]                    [Create]      │
└─────────────────────────────────────────────┘
```

---

## Template Instantiation as an Operation

Template configuration follows the **operation pattern** with preview, apply, and cancel:

### State Machine

```
IDLE
  │
  │ User selects template
  ▼
TEMPLATE_CONFIG (operation active)
  │
  ├── Variable changes → Update preview (engine.startPreview / dispatch / render)
  │
  ├── Apply → Commit preview, close dialog
  │
  └── Cancel → Discard preview, close dialog
```

### Preview on Variable Change

When any variable changes (dimension or subdivision count):

```typescript
function onVariableChange(template: ProjectTemplate, newValues: InstantiationValues) {
  const engine = getEngine();

  // Start fresh preview each time
  engine.discardPreview();
  engine.startPreview();

  // Replay template with new values into preview scene
  instantiateTemplateIntoPreview(template, newValues);

  // Trigger React re-render via useEnginePanels() hook
  notifyEngineStateChanged();
}

function onApply() {
  engine.commitPreview();
  closeDialog();
}

function onCancel() {
  engine.discardPreview();
  closeDialog();
}
```

This gives users real-time feedback as they adjust drawer counts, dimensions, etc.

---

## Built-in Templates

| Template | Subdivision Actions | Derived Variables |
|----------|---------------------|-------------------|
| **Basic Box** | None | W, H, D only |
| **Drawer Unit** | 1× Y-axis | W, H, D, Drawer Count |
| **Vertical Organizer** | 1× X-axis | W, H, D, Slot Count |
| **Grid Organizer** | 1× X-axis, 1× Z-axis | W, H, D, Columns, Rows |
| **Pigeonhole** | 1× X-axis, 1× Y-axis | W, H, D, Columns, Rows |

---

## Saving Custom Templates

Users can save their current project as a template:

1. Design a box with desired structure
2. Click **"Save as Template"**
3. **Template Editor** analyzes the action history:
   - Dimensions become variables (using current values as defaults)
   - Each subdivision action becomes a count variable (using current count as default)
4. User can rename variables (e.g., "Y Divisions" → "Drawer Count")
5. Template is saved with parameterized action sequence

### Inferring Template from History

Each `ADD_SUBDIVISION` or `ADD_SUBDIVISIONS` action in the history becomes a parameterizable count:

```typescript
function createTemplateFromHistory(
  history: Command[],
  currentAssembly: AssemblySnapshot
): ProjectTemplate {
  const actionSequence: TemplateAction[] = [];

  for (const command of history) {
    for (const action of command.actions) {
      if (action.type === 'ADD_SUBDIVISION') {
        // Single subdivision → count variable with default 2 (1 divider = 2 compartments)
        actionSequence.push({
          type: 'ADD_SUBDIVISIONS',
          targetId: action.targetId,
          payload: { voidId: action.payload.voidId, axis: action.payload.axis },
          subdivisionConfig: {
            axis: action.payload.axis,
            defaultCount: 2,
            positionFormula: 'equal-spacing',
          },
        });
      } else if (action.type === 'ADD_SUBDIVISIONS') {
        // Multiple subdivisions → count = positions.length + 1
        const count = action.payload.positions.length + 1;
        actionSequence.push({
          type: 'ADD_SUBDIVISIONS',
          targetId: action.targetId,
          payload: { voidId: action.payload.voidId, axis: action.payload.axis },
          subdivisionConfig: {
            axis: action.payload.axis,
            defaultCount: count,
            positionFormula: 'equal-spacing',
          },
        });
      } else {
        // Non-subdivision actions are stored as-is
        actionSequence.push({
          type: action.type,
          targetId: action.targetId,
          payload: action.payload,
        });
      }
    }
  }

  return {
    id: generateId(),
    name: 'Custom Template',
    initialAssembly: {
      width: currentAssembly.props.width,
      height: currentAssembly.props.height,
      depth: currentAssembly.props.depth,
      materialThickness: currentAssembly.props.material.thickness,
      fingerWidth: currentAssembly.props.material.fingerWidth,
      fingerGap: currentAssembly.props.material.fingerGap,
    },
    actionSequence,
  };
}
```

### Example: Saving a 3-Drawer Design

User creates a box with 3 horizontal drawers (2 Y-axis dividers), then saves as template:

```typescript
// History contains:
// - SET_FACE_SOLID { faceId: 'front', solid: false }
// - ADD_SUBDIVISIONS { axis: 'y', positions: [100, 200] }  // 2 dividers

// Generated template:
{
  initialAssembly: { width: 200, height: 300, depth: 150, ... },
  actionSequence: [
    { type: 'SET_FACE_SOLID', payload: { faceId: 'front', solid: false } },
    {
      type: 'ADD_SUBDIVISIONS',
      payload: { voidId: '$rootVoid', axis: 'y' },
      subdivisionConfig: {
        axis: 'y',
        defaultCount: 3,  // 2 dividers = 3 compartments
        positionFormula: 'equal-spacing',
      },
    },
  ],
}

// Derived variables: width, height, depth, + "Y Divisions" (default: 3)
// User renames "Y Divisions" to "Drawer Count" before saving
```

---

## Implementation Steps

1. **Define template schema** - Types for templates, variables, actions
2. **Create template storage** - localStorage alongside projects
3. **Implement replay algorithm** - Variable substitution and action expansion
4. **Build variable UI** - Configuration dialog with inputs
5. **Create built-in templates** - Drawer unit, organizer, etc.
6. **Add template browser** - Selection UI with thumbnails
7. **Implement "Save as Template"** - History analysis and parameterization

---

## Relationship to Event Sourcing

This template system builds on the event-sourcing architecture:

| Event Sourcing | Templates |
|----------------|-----------|
| Commands record user actions | Templates store parameterized actions |
| Undo replays from snapshot | Instantiation replays with variables |
| History enables time-travel | Templates enable "what-if" variations |

Future possibilities:
- **Template versioning**: Store template evolution as action diffs
- **Template composition**: Combine templates (e.g., drawer unit + feet)
- **Collaborative templates**: Share parameterized designs

---

## Verification

1. **Preview Updates on Variable Change:**
   - Select Drawer Unit template
   - Change drawer count from 3 to 5
   - Preview immediately shows 5 compartments (4 dividers)
   - Change height from 300 to 400
   - Preview updates with new height, dividers reposition proportionally

2. **Apply/Cancel Flow:**
   - Select template, adjust variables
   - Click Cancel → no changes, returns to empty/previous state
   - Select template again, adjust, click Apply → template instantiated

3. **Basic Box (No Subdivision Variables):**
   - Select Basic Box template
   - Only dimension inputs shown (no "Structure" section)
   - Adjust dimensions, preview updates
   - Apply → simple box with specified dimensions

4. **Grid Organizer (Multiple Subdivision Variables):**
   - Select Grid Organizer
   - "Columns" and "Rows" inputs both shown
   - Set Columns=4, Rows=3
   - Preview shows 4×3 grid (12 compartments)

5. **Save as Template:**
   - Create box with 3 horizontal drawers
   - Save as Template
   - "Y Divisions" variable suggested with default=3
   - Rename to "Drawer Count", save
   - New from template → shows "Drawer Count" input
