/**
 * RASP .eng and RockSim .rse motor adapter tests.
 *
 * The core contract: impulse metrics (totalImpulse, avgThrust, maxThrust,
 * burnTime) are DERIVED from the tabulated thrust curve — header/nameplate
 * numbers are ignored beyond the identifier — and the record is fail-closed
 * validated via validateMotorSpec.
 */
import { describe, it, expect } from 'vitest';
import { parseRaspEng, parseRseXml, exportToEng, InvalidRaspEngError, InvalidRseFileError } from './engParser';
import { CERTIFIED_MOTORS, normalizeMotorId, validateMotorSpec, getMotorImpulseTotal } from '../propulsion/motorDatabase';
import { deriveEditedMotor, insertPoint } from '../propulsion/curveEditing';

const SAMPLE_ENG = [
  '; Estes C6 certified thrust curve (RASP .eng layout)',
  'Estes C6 18 70 Estes 8.8 6.06 14.2 0.0125 0.0248',
  '0.00 0.0',
  '0.08 4.5',
  '0.18 14.2',
  '0.28 8.5',
  '0.50 4.8',
  '1.00 4.4',
  '1.50 4.2',
  '1.86 0.0',
  '',
].join('\n');

const SAMPLE_RSE = `<?xml version="1.0" encoding="UTF-8"?>
<rocket-engine-data>
  <motor-type>solid</motor-type>
  <manufacturer>Estes</manufacturer>
  <code>C6</code>
  <description>Estes C6-3</description>
  <diameter>18</diameter>
  <length>70</length>
  <init-weight>24.8</init-weight>
  <prop-weight>12.5</prop-weight>
  <burn-time>1.86</burn-time>
  <avg-thrust>6.06</avg-thrust>
  <peak-thrust>14.2</peak-thrust>
  <data>
    <data-point><time>0.00</time><thrust>0</thrust></data-point>
    <data-point><time>0.08</time><thrust>4.5</thrust></data-point>
    <data-point><time>0.18</time><thrust>14.2</thrust></data-point>
    <data-point><time>0.28</time><thrust>8.5</thrust></data-point>
    <data-point><time>0.50</time><thrust>4.8</thrust></data-point>
    <data-point><time>1.00</time><thrust>4.4</thrust></data-point>
    <data-point><time>1.50</time><thrust>4.2</thrust></data-point>
    <data-point><time>1.86</time><thrust>0</thrust></data-point>
  </data>
</rocket-engine-data>`;

describe('RASP .eng parser', () => {
  it('parses header geometry/mass and derives impulse metrics from the curve', () => {
    const m = parseRaspEng(SAMPLE_ENG);
    expect(m.designation).toBe('Estes C6');
    expect(m.id).toBe('estes_c6');
    expect(m.diameter).toBeCloseTo(0.018, 6);
    expect(m.length).toBeCloseTo(0.070, 6);
    expect(m.propellantMass).toBeCloseTo(0.0125, 6);
    expect(m.totalMass).toBeCloseTo(0.0248, 6);
    expect(m.dryMass).toBeCloseTo(0.0123, 6);
    expect(m.burnTime).toBeCloseTo(1.86, 3);
    expect(m.maxThrust).toBeCloseTo(14.2, 3);

    expect(m.thrustCurve.length).toBe(8);
    expect(m.thrustCurve[0].time).toBe(0);
    expect(m.thrustCurve[0].thrust).toBe(0);
    expect(m.thrustCurve[7].time).toBeCloseTo(1.86, 3);

    // Trapezoidal integral of the sample curve lands within 5% of the 8.8 N*s
    // nameplate, and every metric traces back to the curve.
    const impulse = getMotorImpulseTotal(m);
    expect(impulse).toBeGreaterThan(8.8 * 0.95);
    expect(impulse).toBeLessThan(8.8 * 1.05);
    expect(m.totalImpulse).toBe(impulse);
    expect(m.avgThrust).toBeCloseTo(impulse / m.burnTime, 9);
    expect(m.impulseClass).toBe('C');
    expect(() => validateMotorSpec(m)).not.toThrow();
  });

  it('ignores the nameplate impulse/avg/peak header columns entirely', () => {
    // Header claims an absurd 9999 N*s impulse — the curve must win.
    const text = ['Bogus Motor 18 70 Vendor 9999 9999 9999 0.0125 0.0248', '0 0', '1 5', '2 0'].join('\n');
    const m = parseRaspEng(text);
    // Trapezoid: 0.5*5*1 + 0.5*5*1 = 5 N*s.
    expect(m.totalImpulse).toBeCloseTo(5, 9);
    expect(m.maxThrust).toBe(5);
    expect(m.burnTime).toBe(2);
    expect(m.avgThrust).toBeCloseTo(2.5, 9);
  });

  it('tolerates comments, blank lines, and multiple time/thrust pairs per line', () => {
    const text = [
      '# comment one',
      '; comment two',
      '',
      '   ',
      'Estes C6 18 70 Estes 8.8 6.06 14.2 0.0125 0.0248',
      '0 0 0.08 4.5 0.18 14.2',
      '0.28 8.5',
      '1.86 0',
    ].join('\n');
    const m = parseRaspEng(text);
    expect(m.thrustCurve.length).toBe(5);
    expect(m.burnTime).toBeCloseTo(1.86, 6);
  });

  it('throws on missing or comment-only input', () => {
    expect(() => parseRaspEng('')).toThrow(InvalidRaspEngError);
    expect(() => parseRaspEng('\n; only comments\n# here\n')).toThrow(InvalidRaspEngError);
  });

  it('throws on malformed headers', () => {
    // Fewer than 4 numbers (diameter, length, propellant, total).
    expect(() => parseRaspEng('Just a name\n0 0\n1 1\n2 0')).toThrow(InvalidRaspEngError);
    // Non-positive propellant mass.
    expect(() => parseRaspEng('Motor 18 70 V 8.8 6 14 -0.5 0.1\n0 0\n1 1\n2 0')).toThrow(InvalidRaspEngError);
    // Propellant exceeding total mass.
    expect(() => parseRaspEng('Motor 18 70 V 8.8 6 14 2.0 0.1\n0 0\n1 1\n2 0')).toThrow(InvalidRaspEngError);
  });

  it('throws on malformed thrust curves', () => {
    const hdr = 'Motor 18 70 V 8.8 6 14 0.0125 0.0248\n';
    // No data lines after the header.
    expect(() => parseRaspEng(hdr)).toThrow(InvalidRaspEngError);
    // Single point.
    expect(() => parseRaspEng(hdr + '0 0')).toThrow(InvalidRaspEngError);
    // Non-numeric data line.
    expect(() => parseRaspEng(hdr + '0 0\nabc def\n1 0')).toThrow(InvalidRaspEngError);
    // Decreasing time.
    expect(() => parseRaspEng(hdr + '0 0\n1 1\n0.5 0.5\n2 0')).toThrow(InvalidRaspEngError);
    // Negative thrust.
    expect(() => parseRaspEng(hdr + '0 0\n1 -1\n2 0')).toThrow(InvalidRaspEngError);
    // Curve not starting at t=0.
    expect(() => parseRaspEng(hdr + '0.5 1\n1 0')).toThrow(InvalidRaspEngError);
    // Nonzero endpoint thrust.
    expect(() => parseRaspEng(hdr + '0 0\n1 1\n2 0.5')).toThrow(InvalidRaspEngError);
    // Degenerate zero-impulse curve is rejected by the fail-closed validator.
    expect(() => parseRaspEng(hdr + '0 0\n2 0')).toThrow(/curve fails motor validation/);
  });
});

describe('RockSim .rse parser', () => {
  it('parses RockSim XML into the same MotorSpec contract', () => {
    const m = parseRseXml(SAMPLE_RSE);
    expect(m.designation).toBe('Estes C6');
    expect(m.manufacturer).toBe('Estes');
    expect(m.diameter).toBeCloseTo(0.018, 6);
    expect(m.length).toBeCloseTo(0.070, 6);
    expect(m.propellantMass).toBeCloseTo(0.0125, 6);
    expect(m.totalMass).toBeCloseTo(0.0248, 6);
    expect(m.dryMass).toBeCloseTo(0.0123, 6);
    expect(m.burnTime).toBeCloseTo(1.86, 3);
    expect(m.maxThrust).toBeCloseTo(14.2, 3);
    expect(m.thrustCurve.length).toBe(8);

    const impulse = getMotorImpulseTotal(m);
    expect(impulse).toBeGreaterThan(8.8 * 0.95);
    expect(impulse).toBeLessThan(8.8 * 1.05);
    expect(m.totalImpulse).toBe(impulse);
    expect(() => validateMotorSpec(m)).not.toThrow();
  });

  it('derives burnTime/impulse from the curve, ignoring nameplate fields', () => {
    // Nameplate burn-time claims 9.99 s — the curve says 1.86 s.
    const text = SAMPLE_RSE.replace('<burn-time>1.86</burn-time>', '<burn-time>9.99</burn-time>');
    const m = parseRseXml(text);
    expect(m.burnTime).toBeCloseTo(1.86, 3);
    expect(m.totalImpulse).toBe(getMotorImpulseTotal(m));
  });

  it('throws on empty input and curve-less motors', () => {
    expect(() => parseRseXml('')).toThrow(InvalidRseFileError);
    const noData = SAMPLE_RSE.replace(/<data>[\s\S]*<\/data>/, '');
    expect(() => parseRseXml(noData)).toThrow(InvalidRseFileError);
    // Missing geometry.
    const noGeometry = SAMPLE_RSE.replace('<diameter>18</diameter>', '');
    expect(() => parseRseXml(noGeometry)).toThrow(InvalidRseFileError);
  });

  it('throws InvalidRseFileError on malformed XML', () => {
    expect(() => parseRseXml('<rocket-engine-data><diameter>18</diameter>')).toThrow(InvalidRseFileError);
  });
});

describe('RASP .eng export round-trip (exportToEng)', () => {
  it('emits the exact dialect parseRaspEng accepts and recovers every certified motor', () => {
    for (const motor of Object.values(CERTIFIED_MOTORS)) {
      const m = parseRaspEng(exportToEng(motor));
      expect(m.designation).toBe(motor.designation);
      expect(m.diameter).toBeCloseTo(motor.diameter, 9);
      expect(m.length).toBeCloseTo(motor.length, 9);
      expect(m.propellantMass).toBeCloseTo(motor.propellantMass, 9);
      expect(m.totalMass).toBeCloseTo(motor.totalMass, 9);
      expect(m.dryMass).toBeCloseTo(motor.dryMass, 9);
      expect(m.burnTime).toBeCloseTo(motor.burnTime, 9);
      expect(m.maxThrust).toBeCloseTo(motor.maxThrust, 9);
      // The certified nameplate totalImpulse is display data; the round-trip
      // contract is on the curve-derived integral both sides implement.
      expect(m.totalImpulse).toBeCloseTo(getMotorImpulseTotal(motor), 9);
      expect(m.avgThrust).toBeCloseTo(getMotorImpulseTotal(motor) / motor.burnTime, 9);
      expect(m.impulseClass).toBe(motor.impulseClass);
      expect(m.thrustCurve.length).toBe(motor.thrustCurve.length);
      for (let i = 0; i < motor.thrustCurve.length; i++) {
        expect(m.thrustCurve[i].time).toBeCloseTo(motor.thrustCurve[i].time, 12);
        expect(m.thrustCurve[i].thrust).toBeCloseTo(motor.thrustCurve[i].thrust, 12);
      }
      // The importer regenerates the id from the emitted designation.
      expect(m.id).toBe(normalizeMotorId(motor.designation));
      expect(() => validateMotorSpec(m)).not.toThrow();
    }
  });

  it('writes a header whose initials/geometry/mass columns survive re-import', () => {
    const motor = CERTIFIED_MOTORS.estes_c6;
    const text = exportToEng(motor);
    const firstLine = text.split('\n')[0];
    // Designation prefix intact, then diameter/length in mm, then the rest.
    expect(firstLine).toMatch(/^Estes C6 \d+(\.\d+)? \d+(\.\d+)? /);
    const m = parseRaspEng(text);
    expect(m.diameter).toBeCloseTo(0.018, 9);
    expect(m.length).toBeCloseTo(0.070, 9);
    expect(m.propellantMass).toBeCloseTo(0.0125, 9);
    expect(m.totalMass).toBeCloseTo(0.0248, 9);
  });

  it('sanitizes bare-number designation tokens instead of shifting the columns', () => {
    const motor = { ...CERTIFIED_MOTORS.estes_c6, id: 'kaboom_special', designation: '8 Kaboom 500 Special' };
    const m = parseRaspEng(exportToEng(motor));
    expect(m.designation).toBe('Kaboom Special');
    expect(m.diameter).toBeCloseTo(0.018, 9);
    expect(m.totalImpulse).toBeCloseTo(getMotorImpulseTotal(motor), 9);
  });

  it('round-trips a curve-edited, derived motor through the file layer', () => {
    const base = CERTIFIED_MOTORS.cesaroni_i205;
    const edited = insertPoint(base.thrustCurve, 0.32, 220);
    const motor = deriveEditedMotor(base, edited, 0.2, 0.36);
    const m = parseRaspEng(exportToEng(motor));
    expect(m.designation).toBe(motor.designation);
    expect(m.burnTime).toBeCloseTo(motor.burnTime, 9);
    expect(m.totalImpulse).toBeCloseTo(motor.totalImpulse, 9);
    expect(m.avgThrust).toBeCloseTo(motor.avgThrust, 9);
    expect(m.maxThrust).toBeCloseTo(motor.maxThrust, 9);
    expect(m.propellantMass).toBeCloseTo(0.2, 9);
    expect(m.totalMass).toBeCloseTo(0.36, 9);
    expect(() => validateMotorSpec(m)).not.toThrow();
  });

  it('refuses to export an invalid record instead of emitting what the parser rejects', () => {
    const bad = {
      ...CERTIFIED_MOTORS.estes_c6,
      burnTime: 2,
      thrustCurve: [
        { time: 0, thrust: 0 },
        { time: 1, thrust: 5 },
        { time: 2, thrust: 1 },
      ],
    };
    expect(() => exportToEng(bad)).toThrow(/endpoints must be zero/);
  });
});