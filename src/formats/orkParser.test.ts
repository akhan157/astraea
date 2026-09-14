import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseOrkFile, exportToOrk, InvalidOrkFileError } from './orkParser';
import { RocketVehicle } from '../core/types';
import { aggregateVehicleMass } from '../core/mass';

describe('OpenRocket (.ork) Parser and Exporter', () => {
  const sampleOrkXml = `<?xml version="1.0" encoding="utf-8"?>
<openrocket version="1.0">
  <rocket>
    <name>Estes Alpha Replica</name>
    <designer>Astraea Test</designer>
    <subcomponents>
      <stage>
        <name>Sustainer</name>
        <subcomponents>
          <nosecone>
            <name>Ogive Nose</name>
            <shape>OGIVE</shape>
            <length>0.16</length>
            <aftradius>0.02</aftradius>
            <thickness>0.002</thickness>
          </nosecone>
          <bodytube>
            <name>Main Tube</name>
            <length>0.50</length>
            <radius>0.02</radius>
            <thickness>0.001</thickness>
            <subcomponents>
              <trapezoidfinset>
                <name>Tail Fins</name>
                <fincount>4</fincount>
                <rootchord>0.09</rootchord>
                <tipchord>0.04</tipchord>
                <height>0.06</height>
                <sweeplength>0.03</sweeplength>
                <thickness>0.003</thickness>
                <crosssection>AIRFOIL</crosssection>
              </trapezoidfinset>
              <parachute>
                <name>Recovery Chute</name>
                <diameter>0.40</diameter>
                <cd>0.8</cd>
                <overridemass>0.025</overridemass>
              </parachute>
            </subcomponents>
          </bodytube>
        </subcomponents>
      </stage>
    </subcomponents>
  </rocket>
</openrocket>`;

  it('unpacks ZIP archive and parses OpenRocket XML components', async () => {
    const zip = new JSZip();
    zip.file('rocket.ork', sampleOrkXml);
    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    const vehicle = await parseOrkFile(zipBuffer);

    expect(vehicle.name).toBe('Estes Alpha Replica');
    expect(vehicle.components.length).toBe(4); // Nose, tube, fins, parachute

    const nose = vehicle.components.find((c) => c.type === 'nosecone');
    expect(nose).toBeDefined();
    if (nose?.type === 'nosecone') {
      expect(nose.shape).toBe('ogive');
      expect(nose.length).toBeCloseTo(0.16, 3);
      expect(nose.baseDiameter).toBeCloseTo(0.04, 3);
    }

    const tube = vehicle.components.find((c) => c.type === 'bodytube');
    expect(tube).toBeDefined();
    if (tube?.type === 'bodytube') {
      expect(tube.length).toBeCloseTo(0.50, 3);
      expect(tube.outerDiameter).toBeCloseTo(0.04, 3);
      expect(tube.innerDiameter).toBeCloseTo(0.038, 3);
    }

    const fins = vehicle.components.find((c) => c.type === 'trapezoidfinset');
    expect(fins).toBeDefined();
    if (fins?.type === 'trapezoidfinset') {
      expect(fins.finCount).toBe(4);
      expect(fins.rootChord).toBeCloseTo(0.09, 3);
      expect(fins.tipChord).toBeCloseTo(0.04, 3);
      expect(fins.span).toBeCloseTo(0.06, 3);
      expect(fins.crossSection).toBe('airfoil');
    }
  });

  it('performs bidirectional round-trip export and re-import', async () => {
    const sourceVehicle: RocketVehicle = {
      id: 'roundtrip-vehicle',
      name: 'Roundtrip Test Rocket',
      version: '1.0',
      author: 'Test Engineer',
      components: [
        {
          id: 'nc1',
          name: 'Conical Nose',
          type: 'nosecone',
          shape: 'conical',
          length: 0.22,
          baseDiameter: 0.05,
          wallThickness: 0.002,
          isHollow: true,
          materialId: 'pla_3dprint',
        },
        {
          id: 'bt1',
          name: 'Booster Tube',
          type: 'bodytube',
          length: 0.65,
          outerDiameter: 0.05,
          innerDiameter: 0.047,
          materialId: 'fiberglass',
        },
        {
          id: 'tr1',
          name: 'Boat Tail',
          type: 'transition',
          length: 0.12,
          foreDiameter: 0.05,
          aftDiameter: 0.03,
          wallThickness: 0.002,
          isHollow: true,
          materialId: 'carbonfiber',
        },
        {
          id: 'fin1',
          name: 'Stabilizer Fins',
          type: 'trapezoidfinset',
          finCount: 3,
          rootChord: 0.12,
          tipChord: 0.04,
          span: 0.07,
          sweepLength: 0.05,
          thickness: 0.003,
          crossSection: 'rounded',
          axialOffset: 0.53,
          materialId: 'plywood',
        },
        {
          id: 'ch1',
          name: 'Main Chute',
          type: 'parachute',
          diameter: 0.6,
          cd: 0.9,
          mass: 0.03,
          axialOffset: 0.05,
          materialId: 'cardboard',
        },
        {
          id: 'mc1',
          name: 'Ballast',
          type: 'masscomponent',
          mass: 0.05,
          length: 0.03,
          axialOffset: 0.05,
          materialId: 'cardboard',
        },
      ],
    };

    // Export to .ork archive
    const orkBytes = await exportToOrk(sourceVehicle);
    expect(orkBytes.length).toBeGreaterThan(100);

    // Re-import and verify parity (F2: masses/aggregates must survive —
    // material identity used to be dropped, collapsing fiberglass to
    // cardboard, and transitions/chutes/ballast were silently omitted).
    const importedVehicle = await parseOrkFile(orkBytes);
    expect(importedVehicle.name).toBe(sourceVehicle.name);
    expect(importedVehicle.components.length).toBe(6);

    const reNose = importedVehicle.components[0];
    expect(reNose.type).toBe('nosecone');
    if (reNose.type === 'nosecone') {
      expect(reNose.shape).toBe('conical');
      expect(reNose.length).toBeCloseTo(0.22, 3);
      expect(reNose.baseDiameter).toBeCloseTo(0.05, 3);
      expect(reNose.materialId).toBe('pla_3dprint');
    }
    const reTube = importedVehicle.components.find((c) => c.type === 'bodytube');
    expect(reTube?.materialId).toBe('fiberglass');
    const reFins = importedVehicle.components.find((c) => c.type === 'trapezoidfinset');
    expect(reFins?.materialId).toBe('plywood');
    const reTransition = importedVehicle.components.find((c) => c.type === 'transition');
    expect(reTransition).toBeDefined();
    if (reTransition?.type === 'transition') {
      expect(reTransition.length).toBeCloseTo(0.12, 3);
      expect(reTransition.materialId).toBe('carbonfiber');
    }
    expect(importedVehicle.components.some((c) => c.type === 'parachute')).toBe(true);
    expect(importedVehicle.components.some((c) => c.type === 'masscomponent')).toBe(true);

    const before = aggregateVehicleMass(sourceVehicle);
    const after = aggregateVehicleMass(importedVehicle);
    expect(after.totalMass).toBeCloseTo(before.totalMass, 6);
    expect(after.totalLength).toBeCloseTo(before.totalLength, 6);
  });

  it('throws descriptive error on corrupted non-zip buffer', async () => {
    const garbageBytes = new TextEncoder().encode('This is not a zip file at all');
    await expect(parseOrkFile(garbageBytes)).rejects.toThrow(InvalidOrkFileError);
  });
});
