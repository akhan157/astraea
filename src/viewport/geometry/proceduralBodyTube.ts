/**
 * Procedural 3D Body Tube Geometry Generator
 * Cylindrical airframe section with outer diameter and wall thickness.
 */

import * as THREE from 'three';

export function createBodyTubeGeometry(
  length: number,
  outerDiameter: number,
  innerDiameter: number,
  radialSegments: number = 48
): THREE.BufferGeometry {
  const outerRadius = outerDiameter / 2;
  const innerRadius = innerDiameter > 0 ? innerDiameter / 2 : outerRadius * 0.96;

  // Lathe profile for hollow cylindrical tube
  // Top outer -> Top inner -> Bottom inner -> Bottom outer -> Top outer
  const halfLen = length / 2;
  const points: THREE.Vector2[] = [
    new THREE.Vector2(outerRadius, halfLen),
    new THREE.Vector2(innerRadius, halfLen),
    new THREE.Vector2(innerRadius, -halfLen),
    new THREE.Vector2(outerRadius, -halfLen),
    new THREE.Vector2(outerRadius, halfLen),
  ];

  const geometry = new THREE.LatheGeometry(points, radialSegments);
  geometry.computeVertexNormals();
  return geometry;
}
