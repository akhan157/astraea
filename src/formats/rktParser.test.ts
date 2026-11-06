import { describe, it, expect } from 'vitest';
import { parseRktString, InvalidRktFileError } from './rktParser';

describe('RockSim (.rkt) XML File Parser', () => {
  const sampleRktXml = `<?xml version="1.0" encoding="utf-8"?>
<RockSimDocument>
  <FileVersion>4</FileVersion>
  <DesignInformation>
    <RocketDesign>
      <Name>Apogee Aspire Sounding Rocket</Name>
      <Designer>Tim Van Milligan</Designer>
      <Stage3Parts>
        <NoseCone>
          <PartName>Ogive Nose Cone</PartName>
          <ShapeCode>1</ShapeCode>
          <Len>180.0</Len>
          <AftDia>29.0</AftDia>
          <WallThickness>1.5</WallThickness>
        </NoseCone>
        <BodyTube>
          <PartName>29mm Fuselage</PartName>
          <Len>600.0</Len>
          <OD>29.0</OD>
          <ID>27.0</ID>
          <AttachedParts>
            <FinSet>
              <PartName>Trapezoidal Delta Fins</PartName>
              <FinCount>3</FinCount>
              <RootChord>100.0</RootChord>
              <TipChord>30.0</TipChord>
              <SemiSpan>65.0</SemiSpan>
              <SweepDistance>45.0</SweepDistance>
              <Thickness>2.5</Thickness>
            </FinSet>
            <Parachute>
              <PartName>18in Nylon Chute</PartName>
              <Dia>450.0</Dia>
              <Cd>0.8</Cd>
              <Weight>28.0</Weight>
            </Parachute>
          </AttachedParts>
        </BodyTube>
      </Stage3Parts>
    </RocketDesign>
  </DesignInformation>
</RockSimDocument>`;

  it('parses RockSim XML and converts mm and grams to SI units', () => {
    const vehicle = parseRktString(sampleRktXml);

    expect(vehicle.name).toBe('Apogee Aspire Sounding Rocket');
    expect(vehicle.author).toBe('Tim Van Milligan');
    expect(vehicle.components.length).toBe(4);

    const nose = vehicle.components[0];
    expect(nose.type).toBe('nosecone');
    if (nose.type === 'nosecone') {
      expect(nose.length).toBeCloseTo(0.18, 3); // 180mm -> 0.18m
      expect(nose.baseDiameter).toBeCloseTo(0.029, 3); // 29mm -> 0.029m
      expect(nose.shape).toBe('ogive');
    }

    const tube = vehicle.components[1];
    expect(tube.type).toBe('bodytube');
    if (tube.type === 'bodytube') {
      expect(tube.length).toBeCloseTo(0.60, 3); // 600mm -> 0.60m
      expect(tube.outerDiameter).toBeCloseTo(0.029, 3);
      expect(tube.innerDiameter).toBeCloseTo(0.027, 3);
    }

    const fins = vehicle.components[2];
    expect(fins.type).toBe('trapezoidfinset');
    if (fins.type === 'trapezoidfinset') {
      expect(fins.finCount).toBe(3);
      expect(fins.rootChord).toBeCloseTo(0.10, 3); // 100mm -> 0.10m
      expect(fins.span).toBeCloseTo(0.065, 3);     // 65mm -> 0.065m
      expect(fins.thickness).toBeCloseTo(0.0025, 4); // 2.5mm -> 0.0025m
    }

    const chute = vehicle.components[3];
    expect(chute.type).toBe('parachute');
    if (chute.type === 'parachute') {
      expect(chute.diameter).toBeCloseTo(0.45, 3); // 450mm -> 0.45m
      expect(chute.mass).toBeCloseTo(0.028, 3);    // 28g -> 0.028kg
    }
  });

  it('throws descriptive error on malformed XML or empty parts', () => {
    expect(() => parseRktString('<InvalidXml')).toThrow(InvalidRktFileError);
    expect(() => parseRktString('<RockSimDocument></RockSimDocument>')).toThrow(InvalidRktFileError);
  });
});

// Vendor units are intentionally not inferred for unsupported override fields.
const minimalRkt = (scope: 'rocket' | 'component', fields: string): string => `
<RockSimDocument><DesignInformation><RocketDesign><Name>Override fixture</Name>
${scope === 'rocket' ? fields : ''}
<Stage3Parts><BodyTube><PartName>Measured tube</PartName><Len>400</Len><OD>40</OD><ID>38</ID>
${scope === 'component' ? fields : ''}
</BodyTube></Stage3Parts></RocketDesign></DesignInformation></RockSimDocument>`;

for (const scope of ['rocket', 'component'] as const) {
  for (const fields of [
    '<UseKnownMass>1</UseKnownMass><KnownMass>1234</KnownMass>',
    '<UseKnownCG>true</UseKnownCG><KnownCG>111</KnownCG>',
    '<KnownMass>0</KnownMass>',
    '<KnownCG>0</KnownCG>',
    '<UseKnownMass>unknown</UseKnownMass><KnownMass>1234</KnownMass>',
    '<UseKnownMass/><KnownMass>1234</KnownMass>',
    '<UseKnownMass>0</UseKnownMass><KnownCG>111</KnownCG>',
  ]) {
    it(`refuses active or ambiguous mass/CG metadata at ${scope}: ${fields}`, () => {
      expect(() => parseRktString(minimalRkt(scope, fields))).toThrow(InvalidRktFileError);
      expect(() => parseRktString(minimalRkt(scope, fields))).toThrow(/Unsupported mass\/CG override/);
    });
  }
  for (const flag of ['0', 'false']) {
    it(`accepts explicitly disabled override metadata at ${scope} with ${flag}`, () => {
      const plain = parseRktString(minimalRkt(scope, ''));
      const disabled = parseRktString(minimalRkt(scope,
        `<UseKnownMass>${flag}</UseKnownMass><KnownMass>1234</KnownMass><UseKnownCG>${flag}</UseKnownCG><KnownCG>111</KnownCG>`));
      expect(disabled.components.map(({ id: _id, ...part }) => part)).toEqual(plain.components.map(({ id: _id, ...part }) => part));
    });
  }
}

for (const scope of ['RocketDesign', 'BodyTube']) {
  for (const attribute of ['KnownMass', 'KnownCG', 'UseKnownMass', 'UseKnownCG']) {
    it(`refuses unsupported ${attribute} attributes on ${scope} instead of discarding them`, () => {
      const xml = minimalRkt('component', '').replace(`<${scope}>`, `<${scope} ${attribute}="1">`);
      expect(() => parseRktString(xml)).toThrow(/Unsupported mass\/CG override attributes/);
    });
  }
}
