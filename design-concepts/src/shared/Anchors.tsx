import { useFrame, useThree } from '@react-three/fiber';
import { useRef, type RefObject } from 'react';
import * as THREE from 'three';

export interface Anchor { local: [number, number, number]; el: RefObject<HTMLElement | null> }

/**
 * Projects points in `parent`'s local space to screen and moves DOM labels that
 * live outside the canvas. Replaces drei <Html>, which drops sibling overlays
 * under React 19.
 */
export function Projector({ parent, anchors }: { parent: RefObject<THREE.Object3D | null>; anchors: Anchor[] }) {
  const { camera, size } = useThree();
  const v = useRef(new THREE.Vector3());
  useFrame(() => {
    const g = parent.current; if (!g) return;
    g.updateWorldMatrix(true, false);
    for (const a of anchors) {
      const el = a.el.current; if (!el) continue;
      v.current.set(...a.local);
      g.localToWorld(v.current);
      v.current.project(camera);
      const x = (v.current.x * 0.5 + 0.5) * size.width, y = (-v.current.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.visibility = v.current.z < 1 ? 'visible' : 'hidden';
    }
  });
  return null;
}
