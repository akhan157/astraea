// Writes scripts/fixtures/freeform-fins-synthetic.ork: a small synthetic
// OpenRocket file whose fin set has an invented freeform outline and a
// bottom-referenced seat. All dimensions and geometry are synthetic. Run:
// node scripts/make-freeform-ork-fixture.mjs
import { writeFile } from 'node:fs/promises';
import JSZip from 'jszip';

const xml = `<?xml version='1.0' encoding='utf-8'?>
<openrocket version="1.8" creator="Astraea synthetic fixture">
  <rocket>
    <name>Freeform Fin Fixture</name>
    <subcomponents>
      <stage>
        <name>Stage</name>
        <subcomponents>
          <nosecone>
            <name>Nose cone</name>
            <material type="bulk" density="1049.21">Polystyrene PS</material>
            <length>0.2413</length>
            <thickness>0.003175</thickness>
            <shape>ogive</shape>
            <aftradius>0.02921</aftradius>
          </nosecone>
          <bodytube>
            <name>Upper tube</name>
            <material type="bulk" density="1121.29">Paper</material>
            <length>0.254</length>
            <thickness>0.001524</thickness>
            <radius>0.0292</radius>
            <subcomponents>
              <masscomponent>
                <name>Avionics</name>
                <axialoffset method="top">0.05</axialoffset>
                <mass>0.06</mass>
                <length>0.08</length>
              </masscomponent>
              <parachute>
                <name>Chute</name>
                <axialoffset method="top">0.15</axialoffset>
                <diameter>0.457</diameter>
                <cd>0.8</cd>
                <overridemass>0.03</overridemass>
              </parachute>
            </subcomponents>
          </bodytube>
          <bodytube>
            <name>Lower tube</name>
            <material type="bulk" density="1121.29">Paper</material>
            <length>0.8636</length>
            <thickness>0.001524</thickness>
            <radius>0.0292</radius>
            <subcomponents>
              <freeformfinset>
                <name>Fin set</name>
                <instancecount>3</instancecount>
                <fincount>3</fincount>
                <radiusoffset method="surface">0.0</radiusoffset>
                <angleoffset method="relative">0.0</angleoffset>
                <rotation>0.0</rotation>
                <axialoffset method="bottom">-0.0127</axialoffset>
                <position type="bottom">-0.0127</position>
                <finish>polished</finish>
                <material type="bulk" density="128.148">Balsa</material>
                <thickness>0.003175</thickness>
                <crosssection>square</crosssection>
                <cant>0.0</cant>
                <filletradius>0.0</filletradius>
                <finpoints>
                  <point x="0.0" y="0.0"/>
                  <point x="0.055" y="0.082"/>
                  <point x="0.09" y="0.061"/>
                  <point x="0.12" y="0.0"/>
                </finpoints>
              </freeformfinset>
            </subcomponents>
          </bodytube>
        </subcomponents>
      </stage>
    </subcomponents>
  </rocket>
</openrocket>
`;

const zip = new JSZip();
zip.file('rocket.ork', xml, { date: new Date('2026-01-01T00:00:00Z') });
await writeFile(new URL('./fixtures/freeform-fins-synthetic.ork', import.meta.url), await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
console.log('wrote scripts/fixtures/freeform-fins-synthetic.ork');
