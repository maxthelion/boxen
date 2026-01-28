# Project Templates

Create a library of starting points (templates) that users can customize when creating new projects.

## Status: Pending

---

## Template Concept

Templates are similar to saved projects but with **configurable variables** that are prompted when the template is opened.

### Example Template Variables:
- Width, height, depth
- Number of horizontal drawers in an assembly
- Material thickness
- Whether to include feet

---

## Template Storage

Templates should be stored alongside saved projects, with a flag to distinguish them:

```typescript
interface ProjectTemplate extends ProjectState {
  isTemplate: true;
  templateName: string;
  templateDescription?: string;
  variables: TemplateVariable[];
}

interface TemplateVariable {
  id: string;
  name: string;           // Display name (e.g., "Width")
  type: 'number' | 'boolean' | 'select';
  defaultValue: number | boolean | string;

  // For numbers
  min?: number;
  max?: number;
  step?: number;
  unit?: string;          // e.g., "mm"

  // For select
  options?: { value: string; label: string }[];

  // What this variable controls
  binding: VariableBinding;
}

type VariableBinding =
  | { type: 'config'; path: 'width' | 'height' | 'depth' | 'materialThickness' | ... }
  | { type: 'subdivision'; voidId: string; property: 'count' }
  | { type: 'custom'; applyFn: string }  // For complex logic
```

---

## UI: Saving as Template

In the Project Browser or Save dialog:

1. **"Save as Template" option** alongside regular save
2. **Variable editor** appears when saving as template:
   - Lists available properties (dimensions, subdivisions, etc.)
   - User can toggle which ones become template variables
   - User sets display name and default value for each
   - Highlight/select mechanism to choose which properties to expose

---

## UI: Opening a Template

When user clicks "New from Template":

1. **Template browser** shows available templates (with thumbnails)
2. **Variable configuration dialog** appears after selection:
   - Shows all template variables with input fields
   - Live preview updates as values change (optional)
   - "Create" button generates the project with specified values

---

## Variable Application

When a template is instantiated:

```typescript
function applyTemplateVariables(
  template: ProjectTemplate,
  variableValues: Record<string, number | boolean | string>
): ProjectState {
  // Deep clone the template state
  const state = deepClone(template);

  // Apply each variable binding
  for (const variable of template.variables) {
    const value = variableValues[variable.id] ?? variable.defaultValue;
    applyVariableBinding(state, variable.binding, value);
  }

  return state;
}
```

---

## Built-in Templates

Ship with a few starter templates:

| Template | Description | Variables |
|----------|-------------|-----------|
| Basic Box | Simple 6-sided box | Width, Height, Depth |
| Drawer Unit | Box with horizontal drawers | W, H, D, Drawer Count |
| Divided Organizer | Box with grid subdivisions | W, H, D, Columns, Rows |
| Stackable Tray | Open-top tray with feet | W, H, D, Feet Height |

---

## Implementation Steps

1. **Extend project storage** to support templates
2. **Add template variable schema** to types
3. **Create TemplateVariableEditor component** for defining variables when saving
4. **Create TemplateConfigDialog component** for setting values when opening
5. **Add "New from Template" button** to header/project browser
6. **Implement variable application logic**
7. **Create built-in templates**

---

## Verification

1. **Save as Template:**
   - Create a box with subdivisions
   - Save → choose "Save as Template"
   - Select width/height/depth as variables
   - Template saved successfully

2. **Open Template:**
   - Click "New from Template"
   - Select saved template
   - Adjust variables in dialog
   - Preview updates (if implemented)
   - Create → new project with specified values

3. **Built-in Templates:**
   - "Drawer Unit" template available
   - Set drawer count to 4
   - Create → box with 4 horizontal subdivisions
