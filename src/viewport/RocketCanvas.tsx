/**
 * Astraea 3D Interactive Rocket Viewport
 * Three.js WebGL rendering engine with procedural component mesh builders,
 * live CG/CP stability markers, CAD view modes, and interactive raycasting.
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useRocketStore } from '../store/rocketStore';
import { createNoseconeGeometry } from './geometry/proceduralNosecone';
import { createBodyTubeGeometry } from './geometry/proceduralBodyTube';
import { createTransitionGeometry } from './geometry/proceduralTransition';
import { createTrapezoidFinGeometry, createEllipticalFinGeometry } from './geometry/proceduralFins';
import { createCGMarker, createCPMarker, MarkerGroup } from './markers/CGCPIndicators';
import {
  RotateCcw,
  Eye,
  Crosshair,
  Compass,
  Grid,
  Maximize2,
  Box,
} from 'lucide-react';

export const RocketCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const rocketGroupRef = useRef<THREE.Group | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);
  const gridHelperRef = useRef<THREE.GridHelper | null>(null);
  const axesHelperRef = useRef<THREE.AxesHelper | null>(null);

  // Markers
  const cgMarkerRef = useRef<MarkerGroup | null>(null);
  const cpMarkerRef = useRef<MarkerGroup | null>(null);
  const marginLineRef = useRef<THREE.Line | null>(null);
  // Camera control state
  const isDraggingRef = useRef(false);
  const isPanningRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const cameraSphericalRef = useRef({ radius: 1.8, theta: Math.PI / 4, phi: Math.PI / 3 });
  const cameraTargetRef = useRef(new THREE.Vector3(0, 0, 0));

  // Store subscriptions
  const vehicle = useRocketStore((s) => s.vehicle);
  const stability = useRocketStore((s) => s.stability);
  const selectedComponentId = useRocketStore((s) => s.selectedComponentId);
  const selectComponent = useRocketStore((s) => s.selectComponent);
  const viewMode = useRocketStore((s) => s.viewMode);
  const setViewMode = useRocketStore((s) => s.setViewMode);
  const showCG = useRocketStore((s) => s.showCG);
  const showCP = useRocketStore((s) => s.showCP);
  const showAxes = useRocketStore((s) => s.showAxes);
  const showGrid = useRocketStore((s) => s.showGrid);
  const toggleCG = useRocketStore((s) => s.toggleCG);
  const toggleCP = useRocketStore((s) => s.toggleCP);
  const toggleAxes = useRocketStore((s) => s.toggleAxes);
  const toggleGrid = useRocketStore((s) => s.toggleGrid);
  const cameraResetTrigger = useRocketStore((s) => s.cameraResetTrigger);

  // Initialize Three.js Scene
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0c0d12);
    scene.fog = new THREE.FogExp2(0x0c0d12, 0.08);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight1.position.set(5, 10, 7);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.6); // Cyan rim light
    dirLight2.position.set(-5, 2, -5);
    scene.add(dirLight2);

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x18181b, 0.5);
    scene.add(hemiLight);

    // 5. Grid and Helpers
    const gridHelper = new THREE.GridHelper(4, 40, 0x3f3f46, 0x1f1f23);
    gridHelper.position.y = -1.2;
    scene.add(gridHelper);
    gridHelperRef.current = gridHelper;

    const axesHelper = new THREE.AxesHelper(0.3);
    axesHelper.position.set(-0.8, -1.1, 0.8);
    scene.add(axesHelper);
    axesHelperRef.current = axesHelper;

    // 6. Rocket & Markers Container Groups
    const rocketGroup = new THREE.Group();
    rocketGroup.name = 'rocket-assembly';
    scene.add(rocketGroup);
    rocketGroupRef.current = rocketGroup;

    const markersGroup = new THREE.Group();
    markersGroup.name = 'stability-markers';
    scene.add(markersGroup);
    markersGroupRef.current = markersGroup;

    // Create stability indicators
    const cgMarker = createCGMarker();
    const cpMarker = createCPMarker();
    markersGroup.add(cgMarker.group);
    markersGroup.add(cpMarker.group);
    cgMarkerRef.current = cgMarker;
    cpMarkerRef.current = cpMarker;

    // Margin connector line
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x38bdf8,
      dashSize: 0.015,
      gapSize: 0.01,
      depthTest: false,
    });
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const marginLine = new THREE.Line(lineGeo, lineMat);
    marginLine.renderOrder = 998;
    markersGroup.add(marginLine);
    marginLineRef.current = marginLine;

    // 7. Render Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Update camera position from spherical coordinates
      const s = cameraSphericalRef.current;
      camera.position.x = cameraTargetRef.current.x + s.radius * Math.sin(s.phi) * Math.sin(s.theta);
      camera.position.y = cameraTargetRef.current.y + s.radius * Math.cos(s.phi);
      camera.position.z = cameraTargetRef.current.z + s.radius * Math.sin(s.phi) * Math.cos(s.theta);
      camera.lookAt(cameraTargetRef.current);

      renderer.render(scene, camera);
    };
    animate();

    // 8. Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Update Camera Target and Distance when Vehicle Changes or Reset Triggered
  useEffect(() => {
    if (!cameraRef.current) return;
    const totalLen = Math.max(0.4, stability.totalLength);
    cameraTargetRef.current.set(0, 0, 0);

    // Position camera far enough to comfortably frame rocket
    cameraSphericalRef.current.radius = Math.max(0.8, totalLen * 1.6);
    cameraSphericalRef.current.theta = Math.PI / 4;
    cameraSphericalRef.current.phi = Math.PI / 2.8;

    if (gridHelperRef.current) {
      gridHelperRef.current.position.y = -totalLen / 2 - 0.05;
    }
  }, [cameraResetTrigger, stability.totalLength]);

  // Rebuild 3D Rocket Geometry when Vehicle or ViewMode Changes
  useEffect(() => {
    const rocketGroup = rocketGroupRef.current;
    if (!rocketGroup) return;

    // Clean up previous meshes
    while (rocketGroup.children.length > 0) {
      const child = rocketGroup.children[0] as THREE.Mesh;
      rocketGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }

    const totalLen = stability.totalLength;
    const yTop = totalLen / 2; // Tip of nosecone is at top of vehicle

    let currentAxialX = 0;
    let lastBodyTubeAxial = 0;
    let lastBodyDiameter = stability.maxDiameter;

    for (const comp of vehicle.components) {
      const isSelected = comp.id === selectedComponentId;
      const compColor = isSelected ? '#38bdf8' : comp.color || '#e4e4e7';

      // Material based on view mode
      let material: THREE.Material;
      if (viewMode === 'wireframe') {
        material = new THREE.MeshBasicMaterial({
          color: isSelected ? 0x38bdf8 : 0x06b6d4,
          wireframe: true,
        });
      } else if (viewMode === 'xray') {
        material = new THREE.MeshStandardMaterial({
          color: isSelected ? 0x38bdf8 : 0xa1a1aa,
          transparent: true,
          opacity: 0.35,
          roughness: 0.1,
          metalness: 0.2,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
      } else {
        // Solid shaded mode
        material = new THREE.MeshStandardMaterial({
          color: compColor,
          roughness: 0.35,
          metalness: isSelected ? 0.3 : 0.15,
          side: THREE.DoubleSide,
        });
      }

      switch (comp.type) {
        case 'nosecone': {
          const geo = createNoseconeGeometry(comp.shape, comp.length, comp.baseDiameter);
          const mesh = new THREE.Mesh(geo, material);
          mesh.position.y = yTop - currentAxialX;
          mesh.userData = { componentId: comp.id };
          rocketGroup.add(mesh);

          lastBodyDiameter = comp.baseDiameter;
          currentAxialX += comp.length;
          break;
        }

        case 'bodytube': {
          const geo = createBodyTubeGeometry(comp.length, comp.outerDiameter, comp.innerDiameter);
          const mesh = new THREE.Mesh(geo, material);
          // Cylinder in Three.js is centered at its origin
          mesh.position.y = yTop - currentAxialX - comp.length / 2;
          mesh.userData = { componentId: comp.id };
          rocketGroup.add(mesh);

          lastBodyTubeAxial = currentAxialX;
          lastBodyDiameter = comp.outerDiameter;
          currentAxialX += comp.length;
          break;
        }

        case 'transition': {
          const geo = createTransitionGeometry(comp.length, comp.foreDiameter, comp.aftDiameter);
          const mesh = new THREE.Mesh(geo, material);
          mesh.position.y = yTop - currentAxialX - comp.length / 2;
          mesh.userData = { componentId: comp.id };
          rocketGroup.add(mesh);

          lastBodyDiameter = comp.aftDiameter;
          currentAxialX += comp.length;
          break;
        }

        case 'trapezoidfinset': {
          const finGeo = createTrapezoidFinGeometry(comp);
          const finY = yTop - (lastBodyTubeAxial + (comp.axialOffset || 0));
          const rBody = lastBodyDiameter / 2;
          const finGroup = new THREE.Group();
          finGroup.position.y = finY;

          for (let i = 0; i < comp.finCount; i++) {
            const angle = i * ((2 * Math.PI) / comp.finCount);
            const finMesh = new THREE.Mesh(finGeo, material);
            // Translate radially outward by body tube radius
            finMesh.position.x = rBody;
            finMesh.userData = { componentId: comp.id };

            const finPivot = new THREE.Group();
            finPivot.rotation.y = angle;
            finPivot.add(finMesh);
            finGroup.add(finPivot);
          }

          rocketGroup.add(finGroup);
          break;
        }

        case 'ellipticalfinset': {
          const finGeo = createEllipticalFinGeometry(comp);
          const finY = yTop - (lastBodyTubeAxial + (comp.axialOffset || 0));
          const rBody = lastBodyDiameter / 2;
          const finGroup = new THREE.Group();
          finGroup.position.y = finY;

          for (let i = 0; i < comp.finCount; i++) {
            const angle = i * ((2 * Math.PI) / comp.finCount);
            const finMesh = new THREE.Mesh(finGeo, material);
            finMesh.position.x = rBody;
            finMesh.userData = { componentId: comp.id };

            const finPivot = new THREE.Group();
            finPivot.rotation.y = angle;
            finPivot.add(finMesh);
            finGroup.add(finPivot);
          }

          rocketGroup.add(finGroup);
          break;
        }
      }
    }
  }, [vehicle, viewMode, selectedComponentId, stability.totalLength, stability.maxDiameter]);

  // Update CG and CP Visual Marker Positions
  useEffect(() => {
    if (!cgMarkerRef.current || !cpMarkerRef.current) return;
    const totalLen = stability.totalLength;
    const yTop = totalLen / 2;
    const refRadius = stability.referenceDiameter ? stability.referenceDiameter / 2 : stability.maxDiameter / 2;

    const yCG = yTop - stability.cg;
    const yCP = yTop - stability.cp;

    cgMarkerRef.current.updatePosition(yCG, refRadius);
    cgMarkerRef.current.setVisible(showCG);

    cpMarkerRef.current.updatePosition(yCP, refRadius);
    cpMarkerRef.current.setVisible(showCP);

    // Update connector line
    if (marginLineRef.current) {
      marginLineRef.current.visible = showCG && showCP;
      const points = [new THREE.Vector3(0, yCG, 0), new THREE.Vector3(0, yCP, 0)];
      marginLineRef.current.geometry.setFromPoints(points);
      (marginLineRef.current.material as THREE.LineDashedMaterial).color.setHex(
        stability.isStable ? 0x38bdf8 : 0xf43f5e
      );
    }

    if (gridHelperRef.current) gridHelperRef.current.visible = showGrid;
    if (axesHelperRef.current) axesHelperRef.current.visible = showAxes;
  }, [stability, showCG, showCP, showGrid, showAxes]);

  // Mouse / Pointer Interaction (Orbit & Pan & Raycasting)
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      isDraggingRef.current = true;
    } else if (e.button === 2) {
      isPanningRef.current = true;
    }
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };

    if (isDraggingRef.current) {
      // Orbit camera
      cameraSphericalRef.current.theta -= deltaX * 0.008;
      cameraSphericalRef.current.phi = Math.max(
        0.05,
        Math.min(Math.PI - 0.05, cameraSphericalRef.current.phi - deltaY * 0.008)
      );
    } else if (isPanningRef.current) {
      // Pan camera along Y axis
      cameraTargetRef.current.y += deltaY * 0.003;
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
    isPanningRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1 + Math.sign(e.deltaY) * 0.08;
    cameraSphericalRef.current.radius = Math.max(0.1, cameraSphericalRef.current.radius * zoomFactor);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!containerRef.current || !cameraRef.current || !sceneRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, cameraRef.current);

    if (rocketGroupRef.current) {
      const intersects = raycaster.intersectObjects(rocketGroupRef.current.children, true);
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object;
        while (obj && !obj.userData.componentId && obj.parent) {
          obj = obj.parent;
        }
        if (obj?.userData.componentId) {
          selectComponent(obj.userData.componentId);
        }
      }
    }
  };

  // View presets
  const setViewPreset = (theta: number, phi: number) => {
    cameraSphericalRef.current.theta = theta;
    cameraSphericalRef.current.phi = phi;
    cameraTargetRef.current.set(0, 0, 0);
  };

  return (
    <div className="relative w-full h-full select-none overflow-hidden bg-zinc-950">
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Floating Viewport Quick Controls */}
      <div className="absolute top-4 left-4 flex items-center gap-1.5 p-1 bg-zinc-900/80 backdrop-blur-md rounded-lg border border-zinc-800 shadow-xl text-xs text-zinc-300">
        <button
          onClick={() => setViewMode('solid')}
          className={`px-2.5 py-1.5 rounded font-medium transition flex items-center gap-1.5 ${
            viewMode === 'solid' ? 'bg-cyan-500 text-zinc-950 shadow-sm' : 'hover:bg-zinc-800 text-zinc-300'
          }`}
          title="Solid Shaded CAD View"
        >
          <Box className="w-3.5 h-3.5" />
          Solid
        </button>
        <button
          onClick={() => setViewMode('wireframe')}
          className={`px-2.5 py-1.5 rounded font-medium transition flex items-center gap-1.5 ${
            viewMode === 'wireframe' ? 'bg-cyan-500 text-zinc-950 shadow-sm' : 'hover:bg-zinc-800 text-zinc-300'
          }`}
          title="Wireframe Mesh View"
        >
          <Eye className="w-3.5 h-3.5" />
          Wireframe
        </button>
        <button
          onClick={() => setViewMode('xray')}
          className={`px-2.5 py-1.5 rounded font-medium transition flex items-center gap-1.5 ${
            viewMode === 'xray' ? 'bg-cyan-500 text-zinc-950 shadow-sm' : 'hover:bg-zinc-800 text-zinc-300'
          }`}
          title="X-Ray Internal View"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          X-Ray
        </button>

        <div className="w-px h-4 bg-zinc-700 mx-1" />

        {/* Visibility Toggles */}
        <button
          onClick={toggleCG}
          className={`px-2 py-1.5 rounded transition flex items-center gap-1 ${
            showCG ? 'text-amber-400 bg-amber-400/10' : 'text-zinc-500 hover:bg-zinc-800'
          }`}
          title="Toggle Center of Gravity (CG) Indicator"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          CG
        </button>
        <button
          onClick={toggleCP}
          className={`px-2 py-1.5 rounded transition flex items-center gap-1 ${
            showCP ? 'text-red-400 bg-red-400/10' : 'text-zinc-500 hover:bg-zinc-800'
          }`}
          title="Toggle Center of Pressure (CP) Indicator"
        >
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          CP
        </button>
        <button
          onClick={toggleGrid}
          className={`p-1.5 rounded transition ${
            showGrid ? 'text-cyan-400 bg-cyan-400/10' : 'text-zinc-500 hover:bg-zinc-800'
          }`}
          title="Toggle Ground Grid"
        >
          <Grid className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={toggleAxes}
          className={`p-1.5 rounded transition ${
            showAxes ? 'text-cyan-400 bg-cyan-400/10' : 'text-zinc-500 hover:bg-zinc-800'
          }`}
          title="Toggle Coordinate Axes"
        >
          <Crosshair className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Orientation Compass / Camera Presets */}
      <div className="absolute top-4 right-4 flex items-center gap-1 p-1 bg-zinc-900/80 backdrop-blur-md rounded-lg border border-zinc-800 shadow-xl text-xs text-zinc-300">
        <button
          onClick={() => setViewPreset(0, Math.PI / 2)}
          className="px-2 py-1 rounded hover:bg-zinc-800 font-mono"
          title="Side View"
        >
          Side
        </button>
        <button
          onClick={() => setViewPreset(Math.PI / 2, Math.PI / 2)}
          className="px-2 py-1 rounded hover:bg-zinc-800 font-mono"
          title="Front View"
        >
          Front
        </button>
        <button
          onClick={() => setViewPreset(0, 0.05)}
          className="px-2 py-1 rounded hover:bg-zinc-800 font-mono"
          title="Top View"
        >
          Top
        </button>
        <button
          onClick={() => setViewPreset(Math.PI / 4, Math.PI / 3)}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
          title="Perspective View"
        >
          <Compass className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => useRocketStore.getState().resetCamera()}
          className="p-1 rounded hover:bg-zinc-800 text-zinc-400"
          title="Reset Camera Framing"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Viewport Overlay Controls Hint */}
      <div className="absolute bottom-4 left-4 pointer-events-none text-[11px] text-zinc-500 font-mono bg-zinc-950/70 px-2.5 py-1 rounded border border-zinc-800/60 backdrop-blur-sm">
        Left Drag: Orbit · Right Drag: Pan · Scroll: Zoom · Click Part to Inspect
      </div>
    </div>
  );
};
