/**
 * Procedural 3D Transition Geometry Generator
 * Conical frustum transition (shoulder expansion or boattail contraction).
 */

import * as THREE from 'three';

export function createTransitionGeometry(
  length: number,
  foreDiameter: number,
  aftDiameter: number,
  radialSegments: number = 48
): THREE.BufferGeometry {
  const foreRadius = foreDiameter / 2;
  const aftRadius = aftDiameter / 2;

  // CylinderGeometry(radiusTop, radiusBottom, height, radialSegments, heightSegments, openEnded)
  // Top is fore (+Y), bottom is aft (-Y)
  const geometry = new THREE.CylinderGeometry(
    foreRadius,
    aftRadius,
    length,
    radialSegments,
    1,
    false
  );

  geometry.computeVertexNormals();
  return geometry;
}
