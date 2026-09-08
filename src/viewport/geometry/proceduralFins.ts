/**
 * Procedural 3D Fin Set Geometry Generator
 * Extruded aerodynamic profile arranged radially around the airframe.
 */

import * as THREE from 'three';
import { TrapezoidFinSetComponent, EllipticalFinSetComponent } from '../../core/types';

export function createTrapezoidFinGeometry(comp: TrapezoidFinSetComponent): THREE.BufferGeometry {
  const cr = comp.rootChord;
  const ct = comp.tipChord;
  const s = comp.span;
  const m = comp.sweepLength;
  const thickness = Math.max(0.001, comp.thickness);

  // 2D shape in X-Y plane where:
  // X is radial distance (0 at body surface, s at fin tip)
  // Y is axial position (0 at root leading edge, negative pointing aft)
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);                 // Root Leading Edge
  shape.lineTo(s, -m);                // Tip Leading Edge
  shape.lineTo(s, -(m + ct));         // Tip Trailing Edge
  shape.lineTo(0, -cr);               // Root Trailing Edge
  shape.closePath();

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: comp.crossSection === 'airfoil' || comp.crossSection === 'rounded' ? 3 : 1,
    steps: 1,
    bevelSize: Math.min(thickness * 0.25, 0.0005),
    bevelThickness: Math.min(thickness * 0.25, 0.0005),
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Center thickness along Z axis
  geometry.translate(0, 0, -thickness / 2);
  geometry.computeVertexNormals();

  return geometry;
}

export function createEllipticalFinGeometry(comp: EllipticalFinSetComponent): THREE.BufferGeometry {
  const cr = comp.rootChord;
  const s = comp.span;
  const thickness = Math.max(0.001, comp.thickness);

  const shape = new THREE.Shape();
  const segments = 24;
  shape.moveTo(0, 0);

  // Quarter-ellipse curve
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * (Math.PI / 2);
    const x = s * Math.sin(theta);
    const y = -cr * (1 - Math.cos(theta));
    shape.lineTo(x, y);
  }

  shape.lineTo(0, -cr);
  shape.closePath();

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: thickness,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: Math.min(thickness * 0.25, 0.0005),
    bevelThickness: Math.min(thickness * 0.25, 0.0005),
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.translate(0, 0, -thickness / 2);
  geometry.computeVertexNormals();

  return geometry;
}
