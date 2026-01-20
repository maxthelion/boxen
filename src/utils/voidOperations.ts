import { Void, Bounds } from '../types';

export interface Cell {
  id: string;
  bounds: Bounds;
}

export const getVoidCells = (boxVoid: Void): Cell[] => {
  const { bounds, subdivisions } = boxVoid;

  const xDivisions = subdivisions
    .filter((s) => s.axis === 'x')
    .map((s) => s.position)
    .sort((a, b) => a - b);
  const yDivisions = subdivisions
    .filter((s) => s.axis === 'y')
    .map((s) => s.position)
    .sort((a, b) => a - b);
  const zDivisions = subdivisions
    .filter((s) => s.axis === 'z')
    .map((s) => s.position)
    .sort((a, b) => a - b);

  const xRanges = getIntervals(xDivisions);
  const yRanges = getIntervals(yDivisions);
  const zRanges = getIntervals(zDivisions);

  const cells: Cell[] = [];

  for (let xi = 0; xi < xRanges.length; xi++) {
    for (let yi = 0; yi < yRanges.length; yi++) {
      for (let zi = 0; zi < zRanges.length; zi++) {
        const [x0, x1] = xRanges[xi];
        const [y0, y1] = yRanges[yi];
        const [z0, z1] = zRanges[zi];

        cells.push({
          id: `${boxVoid.id}-${xi}-${yi}-${zi}`,
          bounds: {
            x: bounds.x + x0 * bounds.w,
            y: bounds.y + y0 * bounds.h,
            z: bounds.z + z0 * bounds.d,
            w: (x1 - x0) * bounds.w,
            h: (y1 - y0) * bounds.h,
            d: (z1 - z0) * bounds.d,
          },
        });
      }
    }
  }

  return cells;
};

const getIntervals = (divisions: number[]): [number, number][] => {
  const points = [0, ...divisions, 1];
  const intervals: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    intervals.push([points[i], points[i + 1]]);
  }
  return intervals;
};

export const getSubdivisionPlanes = (
  boxVoid: Void,
  boxConfig: { width: number; height: number; depth: number }
): { axis: 'x' | 'y' | 'z'; position: number; id: string }[] => {
  return boxVoid.subdivisions.map((sub) => {
    let position: number;
    switch (sub.axis) {
      case 'x':
        position = boxVoid.bounds.x + sub.position * boxVoid.bounds.w;
        break;
      case 'y':
        position = boxVoid.bounds.y + sub.position * boxVoid.bounds.h;
        break;
      case 'z':
        position = boxVoid.bounds.z + sub.position * boxVoid.bounds.d;
        break;
    }
    return { axis: sub.axis, position, id: sub.id };
  });
};
