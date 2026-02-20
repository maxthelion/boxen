import { describe, it, expect } from 'vitest';
import { validateRecipe, executeRecipe, RecipeError } from './recipe';
import type { AssemblyRecipe } from './recipe';

describe('validateRecipe', () => {
  it('validates a basic box recipe', () => {
    const recipe = validateRecipe({
      type: 'basicBox',
      width: 150,
      height: 100,
      depth: 80,
    });
    expect(recipe.type).toBe('basicBox');
    expect(recipe.width).toBe(150);
  });

  it('validates an enclosed box recipe', () => {
    const recipe = validateRecipe({
      type: 'enclosedBox',
      width: 200,
      height: 150,
      depth: 100,
    });
    expect(recipe.type).toBe('enclosedBox');
  });

  it('rejects non-object input', () => {
    expect(() => validateRecipe('string')).toThrow(RecipeError);
    expect(() => validateRecipe(null)).toThrow(RecipeError);
    expect(() => validateRecipe([])).toThrow(RecipeError);
  });

  it('rejects unknown top-level fields', () => {
    expect(() =>
      validateRecipe({
        type: 'basicBox',
        width: 100,
        height: 100,
        depth: 100,
        unknownField: true,
      })
    ).toThrow('Unknown recipe field: "unknownField"');
  });

  it('rejects invalid type', () => {
    expect(() =>
      validateRecipe({ type: 'fooBox', width: 100, height: 100, depth: 100 })
    ).toThrow('type must be "basicBox" or "enclosedBox"');
  });

  it('rejects over-limit dimensions', () => {
    expect(() =>
      validateRecipe({ type: 'basicBox', width: 3000, height: 100, depth: 100 })
    ).toThrow('Width 3000mm exceeds the maximum of 2000mm.');
  });

  it('rejects non-numeric dimensions', () => {
    expect(() =>
      validateRecipe({ type: 'basicBox', width: 'big', height: 100, depth: 100 })
    ).toThrow('width must be a finite number');
  });

  it('rejects invalid face names in openFaces', () => {
    expect(() =>
      validateRecipe({
        type: 'basicBox',
        width: 100,
        height: 100,
        depth: 100,
        openFaces: ['top', 'invalid'],
      })
    ).toThrow('Invalid face in openFaces');
  });

  it('rejects grid over limit', () => {
    expect(() =>
      validateRecipe({
        type: 'basicBox',
        width: 100,
        height: 100,
        depth: 100,
        subdivisions: [{ type: 'grid', void: 'root', columns: 25, rows: 1 }],
      })
    ).toThrow('maximum 20 columns');
  });

  it('rejects too many total subdivisions', () => {
    // 20 columns + 20 rows = 19 + 19 = 38, which is under 50
    // Use multiple subdivisions to exceed the limit
    const subs: { type: string; void: string; axis: string; count: number }[] = [];
    for (let i = 0; i < 10; i++) {
      subs.push({ type: 'subdivideEvenly', void: 'root', axis: 'x', count: 8 });
    }
    expect(() =>
      validateRecipe({
        type: 'basicBox',
        width: 100,
        height: 100,
        depth: 100,
        subdivisions: subs,
      })
    ).toThrow('Too many subdivisions');
  });

  it('rejects extensions over limit', () => {
    expect(() =>
      validateRecipe({
        type: 'basicBox',
        width: 100,
        height: 100,
        depth: 100,
        panels: [{ face: 'front', extensions: { top: 300 } }],
      })
    ).toThrow('maximum 200mm');
  });

  it('validates a recipe with all optional fields', () => {
    const recipe = validateRecipe({
      type: 'basicBox',
      width: 200,
      height: 100,
      depth: 150,
      openFaces: ['top'],
      material: { thickness: 6, fingerWidth: 12, fingerGap: 1.5 },
      feet: { height: 15, width: 20, inset: 5 },
      lid: { face: 'negative', tabDirection: 'tabs-in' },
      axis: 'y',
      subdivisions: [{ type: 'grid', void: 'root', columns: 3, rows: 2 }],
      panels: [
        {
          face: 'front',
          extensions: { top: 10 },
          cutouts: [{ shape: 'circle', cx: 50, cy: 40, radius: 8 }],
          fillets: [{ corners: ['bottom:left', 'bottom:right'], radius: 5 }],
        },
      ],
    });
    expect(recipe.subdivisions).toHaveLength(1);
    expect(recipe.panels).toHaveLength(1);
  });
});

describe('executeRecipe', () => {
  it('produces correct dimensions for a basic box', () => {
    const recipe: AssemblyRecipe = {
      type: 'basicBox',
      width: 150,
      height: 100,
      depth: 80,
    };
    const { engine } = executeRecipe(recipe);
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children[0];
    expect(assembly).toBeDefined();
    expect(assembly.props.width).toBe(150);
    expect(assembly.props.height).toBe(100);
    expect(assembly.props.depth).toBe(80);
  });

  it('produces correct dimensions for an enclosed box', () => {
    const recipe: AssemblyRecipe = {
      type: 'enclosedBox',
      width: 200,
      height: 150,
      depth: 100,
    };
    const { engine } = executeRecipe(recipe);
    const panels = engine.generatePanelsFromNodes().panels;
    // Enclosed box should have all 6 face panels
    const faceIds = new Set(panels.map((p) => p.source.faceId));
    expect(faceIds.size).toBe(6);
  });

  it('applies open faces', () => {
    const recipe: AssemblyRecipe = {
      type: 'enclosedBox',
      width: 100,
      height: 100,
      depth: 100,
      openFaces: ['top', 'front'],
    };
    const { engine } = executeRecipe(recipe);
    const panels = engine.generatePanelsFromNodes().panels;
    const faceIds = new Set(panels.map((p) => p.source.faceId));
    expect(faceIds.has('top')).toBe(false);
    expect(faceIds.has('front')).toBe(false);
    expect(faceIds.has('bottom')).toBe(true);
    expect(faceIds.has('back')).toBe(true);
  });

  it('produces correct compartment count for a grid', () => {
    const recipe: AssemblyRecipe = {
      type: 'basicBox',
      width: 200,
      height: 50,
      depth: 150,
      subdivisions: [{ type: 'grid', void: 'root', columns: 3, rows: 2 }],
    };
    const { engine } = executeRecipe(recipe);
    const panels = engine.generatePanelsFromNodes().panels;
    // Grid 3x2 creates dividers. Count divider panels:
    // 2 X-dividers + 1 Z-divider = 3 divider panels (in a grid)
    const dividerPanels = panels.filter((p) => p.source.type === 'divider');
    // 3 columns -> 2 X-dividers, 2 rows -> 1 Z-divider
    expect(dividerPanels.length).toBe(3);
  });

  it('applies material config', () => {
    const recipe: AssemblyRecipe = {
      type: 'basicBox',
      width: 300,
      height: 300,
      depth: 300,
      material: { thickness: 6, fingerWidth: 15, fingerGap: 2 },
    };
    const { engine } = executeRecipe(recipe);
    const snapshot = engine.getSnapshot();
    const assembly = snapshot.children[0];
    expect(assembly.props.material.thickness).toBe(6);
    expect(assembly.props.material.fingerWidth).toBe(15);
    expect(assembly.props.material.fingerGap).toBe(2);
  });

  it('applies extensions to panels', () => {
    const recipe: AssemblyRecipe = {
      type: 'basicBox',
      width: 100,
      height: 80,
      depth: 60,
      panels: [{ face: 'front', extensions: { top: 15 } }],
    };
    const { engine } = executeRecipe(recipe);
    const panels = engine.generatePanelsFromNodes().panels;
    const front = panels.find((p) => p.source.faceId === 'front');
    expect(front).toBeDefined();
    // Front panel top edge is open (basicBox has top removed) so extension should apply
    expect(front!.edgeExtensions?.top).toBe(15);
  });

  it('applies cutouts to panels', () => {
    const recipe: AssemblyRecipe = {
      type: 'basicBox',
      width: 100,
      height: 80,
      depth: 60,
      panels: [
        {
          face: 'front',
          cutouts: [{ shape: 'circle', cx: 50, cy: 40, radius: 8 }],
        },
      ],
    };
    const { engine } = executeRecipe(recipe);
    const panels = engine.generatePanelsFromNodes().panels;
    const front = panels.find((p) => p.source.faceId === 'front');
    expect(front).toBeDefined();
    // Should have at least one more hole than before (finger joint slots + cutout)
    expect(front!.holes.length).toBeGreaterThan(0);
  });

  it('applies subdivideEvenly', () => {
    const recipe: AssemblyRecipe = {
      type: 'basicBox',
      width: 200,
      height: 80,
      depth: 100,
      subdivisions: [{ type: 'subdivideEvenly', void: 'root', axis: 'x', count: 3 }],
    };
    const { engine } = executeRecipe(recipe);
    const panels = engine.generatePanelsFromNodes().panels;
    const dividerPanels = panels.filter((p) => p.source.type === 'divider');
    // 3 compartments = 2 dividers
    expect(dividerPanels.length).toBe(2);
  });

  it('throws user-friendly error for over-limit values', () => {
    expect(() =>
      executeRecipe(
        validateRecipe({
          type: 'basicBox',
          width: 100,
          height: 100,
          depth: 100,
          subdivisions: [{ type: 'grid', void: 'root', columns: 25, rows: 1 }],
        })
      )
    ).toThrow('maximum 20 columns');
  });
});
