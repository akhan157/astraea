import { describe, expect, it } from 'vitest';
import { computeFlightLoads, prepareNormalContributions, prepareVehicle, NORMAL_SLOPE_SUPPORT_FLOOR } from './loads';
import { PRESET_ESTES_ALPHA } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { simulate6DofFlight } from '../sim/sixDofSimulator';

const motor = CERTIFIED_MOTORS.estes_c6;
const base = prepareVehicle(PRESET_ESTES_ALPHA, motor);
const cfg = { vehicle:PRESET_ESTES_ALPHA, motor, launchAltitudeASL:0, windSpeedSurface:0, windAzimuthDeg:0, finCantRad:0 };
const state = (pitch = true, sign = 1) => ({r:{x:0,y:0,z:0},v:{x:pitch?0:sign*10,y:100,z:pitch?sign*10:0},q:{w:1,x:0,y:0,z:0},w:{x:0,y:0,z:0}});
const flags = {drogueDeployed:false,mainDeployed:false};
const normal = (b:number,jb:number,f:number,jf:number) => ({...base,cnaBody:b,bodyFirstMoment:jb,cnaFins:f,finFirstMoment:jf,bodyAbsCna:Math.abs(b),finAbsCna:Math.abs(f)});

describe('signed normal-force/moment transport', () => {
  it('preserves signed contributions and a zero-force group couple', () => {
    expect(prepareNormalContributions([{type:'nosecone',cna:2,cp:1},{type:'transition',cna:-2,cp:2}]))
      .toEqual({cnaBody:0,cnaFins:0,bodyFirstMoment:-2,finFirstMoment:0,bodyAbsCna:4,finAbsCna:0});
    for (const [b,jb,c,j] of [[0,-2,4,10],[-2,-3,2,9]]) {
      const pv = normal(b,jb,4,12);
      const l = computeFlightLoads(3,state(),flags,cfg,pv);
      expect(l.kinematics.cna).toBe(c);
      expect(l.kinematics.cp).toBe(j/c);
      const shifted = {...pv,bodyFirstMoment:jb-.7*b,finFirstMoment:12-.7*4};
      const r = computeFlightLoads(3,state(),flags,cfg,shifted);
      expect(r.kinematics.cp).toBeCloseTo(j/c-.7,12);
    }
  });
  it('requires finite CP for each nonzero contribution', () => {
    for (const cp of [undefined,NaN,Infinity]) expect(()=>prepareNormalContributions([{type:'transition',cna:-2,cp}])).toThrow(/finite CP/);
    expect(()=>prepareNormalContributions([{type:'transition',cna:NaN,cp:1}])).toThrow(/normal slope/);
    expect(()=>prepareNormalContributions([{type:'transition',cna:0}])).not.toThrow();
  });
  it('rejects unsupported total before arm use while retaining exact floor boundary', () => {
    const floor = NORMAL_SLOPE_SUPPORT_FLOOR;
    expect(()=>computeFlightLoads(3,state(),flags,cfg,normal(floor,floor,0,0))).not.toThrow();
    for (const c of [floor*(1-Number.EPSILON),0,-1]) expect(()=>computeFlightLoads(3,state(),flags,cfg,normal(c,1,0,0))).toThrow(/unsupported total/);
    const ill = {...normal(0,-2,1,3),bodyAbsCna:2**46-1};
    expect(()=>computeFlightLoads(3,state(),flags,cfg,ill)).toThrow(/unsupported total/);
    expect(()=>computeFlightLoads(3,state(),flags,cfg,{...ill,bodyAbsCna:2**45-1})).not.toThrow();
    expect(()=>computeFlightLoads(3,state(),flags,cfg,normal(1,Infinity,0,0))).toThrow(/nonfinite/);
    expect(()=>computeFlightLoads(3,state(),flags,cfg,normal(floor,Number.MAX_VALUE,0,0))).toThrow(/derived CP/);
  });
  it('uses signed pitch/yaw restoring moments against full transverse force', () => {
    for (const pitch of [false,true]) for (const sign of [-1,1]) {
      const l = computeFlightLoads(3,state(pitch,sign),flags,cfg,normal(-2,-.2,12,5));
      const alpha = Math.atan(.1), normalN = l.kinematics.qInf*base.refArea*10*Math.sin(alpha);
      const force = -sign*(normalN+l.kinematics.dragAxial*Math.sin(alpha));
      expect(pitch?l.forceN.z+l.mass*9.80665:l.forceN.x).toBeCloseTo(force,10);
      expect(pitch?l.momentB.x:l.momentB.z).toBeCloseTo((l.kinematics.cp-l.combinedCg)*force*(pitch?-1:1),10);
    }
  });
  it('states classified-domain continuation separately from undefined-CP errors', () => {
    const flight = simulate6DofFlight(PRESET_ESTES_ALPHA,motor,{windSpeedSurface:0});
    expect(flight.runManifest.unsupportedHandling).toContain('classified out-of-domain loads continue');
    expect(flight.runManifest.unsupportedHandling).toContain('undefined normal-force CP');
    expect(flight.runManifest.unsupportedHandling).toContain('fails the command before arm use');
  });
});
