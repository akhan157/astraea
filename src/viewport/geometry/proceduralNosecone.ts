/**
 * Procedural 3D Nosecone Geometry Generator
 * Constructs smooth analytical curves for Conical, Ogive, Parabolic, Von Kármán, and Elliptical profiles.
 */

import * as THREE from 'three';
import { NoseconeShape } from '../../core/types';

export function createNoseconeGeometry(
  shape: NoseconeShape,
  length: number,
  baseDiameter: number,
  segments: number = 48,
  slices: number = 32
): THREE.BufferGeometry {
  const baseRadius = baseDiameter / 2;
  const points: THREE.Vector2[] = [];

  // Tip at x = 0 (top), base at x = length (bottom)
  for (let i = 0; i <= slices; i++) {
    const t = i / slices; // 0 at tip, 1 at base
    const x = t * length; // distance from tip along axial direction
    let r = 0;

    switch (shape) {
      case 'conical': {
        r = baseRadius * t;
        break;
      }

      case 'ogive': {
        // Tangent Ogive: circle of radius rho centered at (L, R - rho)
        const rho = (baseRadius * baseRadius + length * length) / (2 * baseRadius);
        // r(x) = sqrt(rho^2 - (length - x)^2) + baseRadius - rho
        const dx = length - x;
        const radicand = Math.max(0, rho * rho - dx * dx);
        r = Math.sqrt(radicand) + baseRadius - rho;
        break;
      }

      case 'parabolic': {
        // Full parabola: r(x) = R * (2*(x/L) - (x/L)^2) or series
        r = baseRadius * (2 * t - t * t);
        break;
      }

      case 'vonkarman': {
        // Haack series with C = 0 (Von Kármán minimal drag nosecone)
        // theta = arccos(1 - 2*t)
        // r(x) = (R / sqrt(pi)) * sqrt(theta - sin(2*theta)/2)
        const theta = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * t)));
        const val = Math.max(0, theta - Math.sin(2 * theta) / 2);
        r = (baseRadius / Math.sqrt(Math.PI)) * Math.sqrt(val);
        break;
      }

      case 'elliptical':
      default: {
        // Quarter ellipse: (r/R)^2 + ((L-x)/L)^2 = 1 => r = R * sqrt(1 - (1-t)^2)
        const invT = 1 - t;
        r = baseRadius * Math.sqrt(Math.max(0, 1 - invT * invT));
        break;
      }
    }

    // In Three.js LatheGeometry, the profile is rotated around Y axis.
    // x coordinate in Vector2 is the radius r, y coordinate is the height.
    // We map tip at y = 0, base at y = -length
    points.push(new THREE.Vector2(Math.max(0, r), -x));
  }

  // Base cap point at center
  points.push(new THREE.Vector2(0, -length));

  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.computeVertexNormals();
  return geometry;
}
