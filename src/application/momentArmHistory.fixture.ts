/** Manufactured SOFTWARE-TEST data, not an evaluated/qualified flight trace.
 * Only tests/test engine stubs import this module. */
import type { MomentArmHistory } from './momentArmHistory';
export function momentArmHistoryFixture(burnoutTimeS = 1.86): MomentArmHistory {
  return {
    schemaId: 'astraea-flight-moment-arm-history/1.0.0', reportMomentArmHistory: true,
    modelId: 'flight-signed-normal-plus-wind-drag-v1', mechanicalModelId: 'legacy-primitive-mass-inertia/1.0.0',
    bodyFrame: 'right-handed-+Y-noseward; rates=pitch,roll,yaw',
    stationDatum: 'meters-aft-of-nose; moments-about-instantaneous-combined-CG',
    sampling: 'committed-macro-through-motor-burn-time-plus-initial',
    referenceAreaM2: (Math.PI/4)*(.1*.1), referenceDiameterM: .1, referenceLengthM: 1,
    burnoutTimeS, sampleCount: 2, timeRangeS: [0,burnoutTimeS/2], maxGapS: burnoutTimeS/2,
    lastSampleToBurnoutS: burnoutTimeS-burnoutTimeS/2, exactBurnoutSampleExists: false,
    points: [0,burnoutTimeS/2].map(timeS => ({ timeS, massKg: .1, cgFromNoseM: .3, mach: .123456789,
      incidenceDeg: 12.3456789, dynamicPressurePa: 123.456789, railBound: timeS === 0,
      recovery: false, powered: true, domain: 'valid', normalApplicability: 'active-airframe',
      aeroForceBodyN: {x:0,y:0,z:1}, staticMomentBodyNm: {x:-.2,y:.01,z:0},
      dampingMomentBodyNm: {x:.1,y:0,z:0}, totalMomentBodyNm: {x:-.1,y:.01,z:0},
      normal: { cPerRad:2,jMPerRad:1,cpFromNoseM:.5,armM:.5-.3,armCalibers:(.5-.3)/.1,
        armPercentLength:100*(.5-.3),cnaWeightedArmMPerRad:1-2*.3 },
    })),
  };
}
