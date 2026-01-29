# Project Templates

Create a library of starting points (templates) that users can customize when creating new projects.

## Status: Planning

---

## Core Concept: Templates as Parameterized Event Logs

Templates are stored as **sequences of engine actions** that can be replayed with different variable values. This aligns with the event-sourcing architecture and enables powerful parameterization.

### Key Variable Types

Templates expose two primary variable categories:

1. **Dimensions** - Width, height, depth of the assembly
2. **Subdivision Count** - Number of divisions along an axis (e.g., drawer count)

### Why Event Logs?

Storing templates as action sequences (rather than state snapshots) provides:

- **Natural parameterization**: Subdivision count becomes "how many times to replay ADD_SUBDIVISION"
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

  // The parameterized action sequence
  actionSequence: TemplateAction[];

  // Variables that can be customized
  variables: TemplateVariable[];

  // Initial assembly config (before actions are applied)
  initialAssembly: {
    width: VariableRef | number;
    height: VariableRef | number;
    depth: VariableRef | number;
    materialThickness: number;
    fingerWidth: number;
    fingerGap: number;
  };
}

// Reference to a variable value
interface VariableRef {
  $var: string;  // Variable ID
}

// A template action that may contain variable references
type TemplateAction = {
  type: EngineAction['type'];
  targetId: string;
  payload: Record<string, unknown | VariableRef>;

  // For repeated actions (e.g., multiple subdivisions)
  repeat?: {
    count: VariableRef | number;
    // How to compute position for each iteration
    positionFormula?: SubdivisionFormula;
  };
};
```

---

## Variable Definitions

```typescript
interface TemplateVariable {
  id: string;
  name: string;              // Display name (e.g., "Number of Drawers")
  type: 'dimension' | 'count';
  defaultValue: number;

  // Constraints
  min?: number;
  max?: number;
  step?: number;

  // For dimensions
  unit?: 'mm' | 'in';

  // For counts
  description?: string;      // e.g., "Horizontal divisions"
}

// Formula for computing subdivision positions from count
interface SubdivisionFormula {
  type: 'equal-spacing';     // Divide available space equally
  axis: 'x' | 'y' | 'z';
  // Spacing is computed as: availableSpace / (count + 1) for each position
}
```

---

## Example: Drawer Unit Template

A box with N horizontal drawers:

```typescript
const drawerUnitTemplate: ProjectTemplate = {
  id: 'drawer-unit',
  name: 'Drawer Unit',
  description: 'A box with configurable horizontal drawers',

  variables: [
    {
      id: 'width',
      name: 'Width',
      type: 'dimension',
      defaultValue: 200,
      min: 50,
      max: 500,
      unit: 'mm',
    },
    {
      id: 'height',
      name: 'Height',
      type: 'dimension',
      defaultValue: 300,
      min: 50,
      max: 600,
      unit: 'mm',
    },
    {
      id: 'depth',
      name: 'Depth',
      type: 'dimension',
      defaultValue: 150,
      min: 50,
      max: 400,
      unit: 'mm',
    },
    {
      id: 'drawerCount',
      name: 'Number of Drawers',
      type: 'count',
      defaultValue: 3,
      min: 1,
      max: 10,
      step: 1,
      description: 'Horizontal divisions for drawer compartments',
    },
  ],

  initialAssembly: {
    width: { $var: 'width' },
    height: { $var: 'height' },
    depth: { $var: 'depth' },
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
        positions: { $var: 'drawerCount' },  // Computed from count
      },
      repeat: {
        count: { $var: 'drawerCount' },
        positionFormula: {
          type: 'equal-spacing',
          axis: 'y',
        },
      },
    },
  ],
};
```

---

## Replay Algorithm

When a template is instantiated:

```typescript
function instantiateTemplate(
  template: ProjectTemplate,
  variableValues: Record<string, number>
): void {
  const engine = getEngine();

  // 1. Resolve initial dimensions
  const dimensions = {
    width: resolveValue(template.initialAssembly.width, variableValues),
    height: resolveValue(template.initialAssembly.height, variableValues),
    depth: resolveValue(template.initialAssembly.depth, variableValues),
  };

  // 2. Create assembly with resolved dimensions
  engine.createAssembly(
    dimensions.width,
    dimensions.height,
    dimensions.depth,
    {
      thickness: template.initialAssembly.materialThickness,
      fingerWidth: template.initialAssembly.fingerWidth,
      fingerGap: template.initialAssembly.fingerGap,
    }
  );

  // 3. Replay action sequence with variable substitution
  for (const templateAction of template.actionSequence) {
    const actions = expandTemplateAction(templateAction, variableValues, dimensions);

    for (const action of actions) {
      engine.dispatch(action);
    }
  }
}

function resolveValue(
  value: VariableRef | number,
  variables: Record<string, number>
): number {
  if (typeof value === 'number') return value;
  return variables[value.$var];
}

function expandTemplateAction(
  templateAction: TemplateAction,
  variables: Record<string, number>,
  dimensions: { width: number; height: number; depth: number }
): EngineAction[] {
  // Handle repeated actions (subdivisions)
  if (templateAction.repeat) {
    const count = resolveValue(templateAction.repeat.count, variables);
    return generateSubdivisionActions(templateAction, count, dimensions);
  }

  // Single action - resolve any variable references in payload
  return [resolveActionPayload(templateAction, variables)];
}

function generateSubdivisionActions(
  templateAction: TemplateAction,
  count: number,
  dimensions: { width: number; height: number; depth: number }
): EngineAction[] {
  const formula = templateAction.repeat!.positionFormula!;
  const axis = formula.axis;

  // Get dimension along subdivision axis
  const axisDimension = axis === 'x' ? dimensions.width
                      : axis === 'y' ? dimensions.height
                      : dimensions.depth;

  // Material thickness reduces interior space
  const mt = 3; // TODO: get from template
  const interiorSize = axisDimension - (2 * mt);

  // Calculate evenly-spaced positions
  // For N drawers, we need N-1 dividers
  const dividerCount = count - 1;
  if (dividerCount <= 0) return [];

  const spacing = interiorSize / count;
  const positions: number[] = [];

  for (let i = 1; i <= dividerCount; i++) {
    // Position relative to interior start
    positions.push(mt + (spacing * i));
  }

  // Return single ADD_SUBDIVISIONS action with all positions
  return [{
    type: 'ADD_SUBDIVISIONS',
    targetId: templateAction.targetId.replace('$assembly', 'main-assembly'),
    payload: {
      voidId: 'root',
      axis: axis,
      positions: positions,
    },
  }];
}
```

---

## UI Flow

### Creating from Template

1. User clicks **"New from Template"** in header
2. **Template Browser** shows available templates with thumbnails
3. User selects a template
4. **Variable Configuration Dialog** appears:
   - Dimension inputs (width, height, depth)
   - Count inputs (e.g., "Number of Drawers")
   - Live preview updates as values change (optional)
5. User clicks **"Create"**
6. Template is instantiated with specified values

### Variable Configuration UI

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
│  │ Number of Drawers    [  3  ] [+-]   │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  [Preview]                    [Create]      │
└─────────────────────────────────────────────┘
```

---

## Built-in Templates

| Template | Variables | Actions |
|----------|-----------|---------|
| **Basic Box** | W, H, D | None (just dimensions) |
| **Drawer Unit** | W, H, D, Drawer Count | Remove front, Y subdivisions |
| **Vertical Organizer** | W, H, D, Slot Count | Remove top, X subdivisions |
| **Grid Organizer** | W, H, D, Columns, Rows | X and Z subdivisions |
| **Pigeonhole** | W, H, D, Cols, Rows | Remove front, X and Y subdivisions |

---

## Saving Custom Templates

Users can save their current project as a template:

1. Design a box with desired structure
2. Click **"Save as Template"**
3. **Template Editor** analyzes the action history:
   - Identifies dimension-related actions
   - Identifies subdivision patterns
   - Suggests which values to parameterize
4. User confirms/adjusts variable bindings
5. Template is saved with parameterized action sequence

### Inferring Variables from History

```typescript
function inferTemplateFromHistory(
  history: Command[]
): { suggestedVariables: TemplateVariable[], actionSequence: TemplateAction[] } {
  const variables: TemplateVariable[] = [];
  const actions: TemplateAction[] = [];

  // Always suggest dimension variables
  variables.push(
    { id: 'width', name: 'Width', type: 'dimension', defaultValue: currentWidth },
    { id: 'height', name: 'Height', type: 'dimension', defaultValue: currentHeight },
    { id: 'depth', name: 'Depth', type: 'dimension', defaultValue: currentDepth },
  );

  // Find subdivision patterns
  const subdivisions = history.filter(c =>
    c.actions.some(a => a.type === 'ADD_SUBDIVISION' || a.type === 'ADD_SUBDIVISIONS')
  );

  // Group by axis to detect counts
  const byAxis = groupBy(subdivisions, getSubdivisionAxis);

  for (const [axis, subs] of Object.entries(byAxis)) {
    if (subs.length > 0) {
      const count = subs.length + 1; // N dividers = N+1 compartments
      variables.push({
        id: `${axis}Divisions`,
        name: `${axisName(axis)} Divisions`,
        type: 'count',
        defaultValue: count,
      });
    }
  }

  return { suggestedVariables: variables, actionSequence: actions };
}
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

1. **Drawer Unit Template:**
   - Select template, set drawer count to 4
   - Create → box with 4 horizontal compartments (3 dividers)
   - Verify divider positions are evenly spaced

2. **Dimension Variables:**
   - Create from template with W=200, H=300, D=100
   - Resulting box has correct dimensions
   - Subdivisions scale proportionally

3. **Save as Template:**
   - Create box with 3 vertical divisions
   - Save as template → "Slot Count" variable suggested
   - Create new from template with count=5
   - Resulting box has 5 slots
