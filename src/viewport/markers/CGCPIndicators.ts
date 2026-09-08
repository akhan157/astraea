/**
 * 3D Center of Gravity (CG) and Center of Pressure (CP) Visual Markers
 * Classic aerospace indicators with encircling calibration rings and crosshairs.
 */

import * as THREE from 'three';

export interface MarkerGroup {
  group: THREE.Group;
  updatePosition: (axialY: number, radius: number) => void;
  setVisible: (visible: boolean) => void;
}

/**
 * Creates the classic aerospace Center of Gravity marker
 * Checkered black-and-yellow circular sphere and horizontal perimeter ring.
 */
export function createCGMarker(): MarkerGroup {
  const group = new THREE.Group();
  group.name = 'indicator-cg';

  // Perimeter ring
  const ringGeo = new THREE.TorusGeometry(1, 0.003, 16, 64);
  ringGeo.rotateX(Math.PI / 2); // horizontal in X-Z
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15, // Yellow
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 999;
  group.add(ring);

  // Center sphere with checkered appearance
  const sphereGeo = new THREE.SphereGeometry(0.012, 16, 16);
  const sphereMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.3,
    metalness: 0.1,
    depthTest: false,
  });
  const sphere = new THREE.Mesh(sphereGeo, sphereMat);
  sphere.renderOrder = 1000;
  group.add(sphere);

  // Crosshair lines
  const lineMat = new THREE.LineBasicMaterial({ color: 0x000000, depthTest: false });
  const points = [
    new THREE.Vector3(-0.02, 0, 0),
    new THREE.Vector3(0.02, 0, 0),
    new THREE.Vector3(0, 0, -0.02),
    new THREE.Vector3(0, 0, 0.02),
  ];
  const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
  const lines = new THREE.LineSegments(lineGeo, lineMat);
  lines.renderOrder = 1001;
  group.add(lines);

  function updatePosition(axialY: number, radius: number) {
    group.position.y = axialY;
    const ringScale = Math.max(0.01, radius * 1.12);
    ring.scale.set(ringScale, ringScale, ringScale);
  }

  function setVisible(visible: boolean) {
    group.visible = visible;
  }

  return { group, updatePosition, setVisible };
}

/**
 * Creates the classic aerospace Center of Pressure marker
 * Red bullseye with concentric circle, center dot, and crosshairs.
 */
export function createCPMarker(): MarkerGroup {
  const group = new THREE.Group();
  group.name = 'indicator-cp';

  // Perimeter ring
  const ringGeo = new THREE.TorusGeometry(1, 0.003, 16, 64);
  ringGeo.rotateX(Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xef4444, // Red
    transparent: true,
    opacity: 0.85,
    depthTest: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.renderOrder = 999;
  group.add(ring);

  // Center bullseye dot
  const dotGeo = new THREE.SphereGeometry(0.010, 16, 16);
  const dotMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.3,
    metalness: 0.2,
    depthTest: false,
  });
  const dot = new THREE.Mesh(dotGeo, dotMat);
  dot.renderOrder = 1000;
  group.add(dot);

  // Concentric target circle
  const targetGeo = new THREE.RingGeometry(0.016, 0.019, 32);
  targetGeo.rotateX(Math.PI / 2);
  const targetMat = new THREE.MeshBasicMaterial({
    color: 0xef4444,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const targetRing = new THREE.Mesh(targetGeo, targetMat);
  targetRing.renderOrder = 1000;
  group.add(targetRing);

  function updatePosition(axialY: number, radius: number) {
    group.position.y = axialY;
    const ringScale = Math.max(0.01, radius * 1.15);
    ring.scale.set(ringScale, ringScale, ringScale);
  }

  function setVisible(visible: boolean) {
    group.visible = visible;
  }

  return { group, updatePosition, setVisible };
}
