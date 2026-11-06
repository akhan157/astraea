import type { DevelopmentCase } from './benchmark';

// Roles fixed before viewing these flights' performance samples. Emerald
// Streak and all Vulcanite variants remain reserved and are not admitted here.
const commonLimitations = [
  'published vehicle design, not a configuration verified for this individual flight',
  'unresolved internal hardware is a positive point-load reconstruction preserving declared dry mass and CG; dry inertia remains cylindrical',
  'unweighed material-derived component masses may be uniformly redistributed to satisfy the aggregate; the reported modeledMassScale is not an individual weighing or a flight-derived calibration',
  'actual weather, rail geometry, motor overhang and ignition-to-recorder clock offset are not established',
  'the first recorded barometric pressure is only a pad-pressure proxy, not a verified prelaunch baseline',
  'no source-qualified measured burnout; integrated Raven velocity is diagnostic, not independent burnout evidence',
];
const ravenReference = 'Raven FIP [Altitude (Baro-Ft-AGL)] channel; Featherweight Raven user manual (2014-05-20), Viewing the data';
const ravenClock = 'Unshifted Raven flight-record clock, declared seconds; Featherweight Raven manual describes elapsed time from liftoff detection, which may lag first motion; no apogee alignment';
const motorMirror = 'https://raw.githubusercontent.com/openrocket/motor-database/d1b195968a127238c84cbca59f23dd6f39b99f44/data/thrustcurve.org';

export const DOFPRO_DEVELOPMENT_CASES: readonly DevelopmentCase[] = [
  {
    id: 'top-shot-e12-2017-12-14', title: 'Estes Top Shot E12-6, 14 Dec 2017 #1', role: 'development',
    path: 'dofpro/TopShot_14DEC2017_E12-6_1.csv', format: 'raven-fip',
    sourceUrl: 'https://dofprobucket2.s3.us-east-2.amazonaws.com/Top_Shot/TopShot_14DEC2017_E12-6_1.csv',
    expectedSourceSha256: '88fa453139709224d2252f2e4bf1c9c15196a3a1c44f76b9a0b8839b65de3b12',
    timeUnit: 's', altitudeUnit: 'ft', timeUnitBasis: 'declared', altitudeUnitBasis: 'header',
    altitudeReference: 'AGL', altitudeReferenceSource: ravenReference, launchTimeS: 0, launchReferenceSource: ravenClock,
    altitudeChannel: '[Altitude (Baro-Ft-AGL)]', velocityChannel: '[Velocity (Accel-Ft/Sec)]', velocityUnit: 'ft/s', pressureChannel: 'Baro (Atm)',
    velocityChannelDescription: 'Raven accelerometer-integrated velocity; sensor diagnostic only',
    modelId: 'dofpro-top-shot-aggregate-v1', motorId: 'e12',
    modelSource: { path: 'dofpro/Estes_Top_Shot_Avionics.ork', url: 'https://dofprobucket2.s3.us-east-2.amazonaws.com/SimModels/Estes_Top_Shot_Avionics.ork', sha256: '73dc1ea9479b3464e3920e905cfc6e2ff9e10ed01fb681ae823fb8144e4d14f8' },
    motorSource: { path: 'motors/Estes_E12_5f4294d20002e900000007ad.rasp', url: `${motorMirror}/Estes%20Industries/E12_5f4294d20002e900000007ad.rasp`, sha256: '63f972703ce557f58584cd411b2349f55c3bd949ac44cb9422d472c31a226c30' },
    configuration: 'Source-informed outer mould and freeform outline; ORK dry aggregate 0.1955 kg at 0.635 m; standard material proxies and unresolved internal point load',
    knownInputs: ['DOFPro Top Shot page directly associates the ORK and E12-6 flight log', 'page and ORK agree on 195.5 g dry mass', 'explicit Raven barometric feet-AGL and pressure-atmospheres channel labels', 'Estes E12 NAR/cert RASP simfile 5f4294d20002e900000007ad via pinned OpenRocket mirror; https://www.thrustcurve.org/motors/5f4294d200023100000003e3/'],
    assumedInputs: ['primary CG is the ORK 25 in, not the page 26 in; selected before outcomes', 'automatic fore-tube radius reconstructed from equal 20.828 mm neighbors, not cached manual 25 mm', 'standard ABS/cardboard proxies for source polystyrene/paper', 'ISA pressure-altitude atmosphere derived from first logged pressure; not a measured geographic elevation', 'zero wind, 1.83 m rail, 88 degree elevation, default recovery model'],
    limitations: [...commonLimitations, 'source internal rocket name is Albee Vector Vehicles Model 01D; association is from the page link, not that template name', 'page-versus-model CG differs by 25.4 mm', 'molded-fin details and actual motor seating are not fully represented'],
  },
  {
    id: 'adventurer-j510w-2021-04-17', title: 'Madcow Adventurer J510W, 17 Apr 2021 #1', role: 'development',
    path: 'dofpro/20210417_Adventurer_J510W_1_Raven.csv', format: 'raven-fip',
    sourceUrl: 'https://dofprobucket2.s3.us-east-2.amazonaws.com/Adventurer/20210417_Adventurer_J510W_1_Raven.csv',
    expectedSourceSha256: '3b04634b092fdde87b2a67f8394a4b869f3fa6938f5f5394f292d7c92529c0c0',
    timeUnit: 's', altitudeUnit: 'ft', timeUnitBasis: 'declared', altitudeUnitBasis: 'header',
    altitudeReference: 'AGL', altitudeReferenceSource: ravenReference, launchTimeS: 0, launchReferenceSource: ravenClock,
    altitudeChannel: '[Altitude (Baro-Ft-AGL)]', velocityChannel: '[Velocity (Accel-Ft/Sec)]', velocityUnit: 'ft/s', pressureChannel: 'Baro (Atm)',
    velocityChannelDescription: 'Raven accelerometer-integrated velocity; sensor diagnostic only',
    modelId: 'dofpro-adventurer-aggregate-v1', motorId: 'j510',
    modelSource: { path: 'dofpro/ClassAdventurer.ork', url: 'https://dofprobucket2.s3.us-east-2.amazonaws.com/SimModels/ClassAdventurer.ork', sha256: '6308a287f48d2b3483c65a239f49747d86f6ac72ded8903f36a70ca7eb5e4d1d' },
    motorSource: { path: 'motors/AeroTech_J510W_5f4294d20002e900000006d2.rasp', url: `${motorMirror}/AeroTech/J510_5f4294d20002e900000006d2.rasp`, sha256: '8534e030098e3285239f8f75e7b750477ceff730b768981505e2ec3c47073f5e' },
    configuration: 'ClassAdventurer outer mould/freeform outline; 2.04 kg dry at 0.92075 m; source ogive tail explicitly approximated by supported conical transition',
    knownInputs: ['DOFPro Adventurer page directly associates this model and J510W Raven flight log', 'page and ORK agree on 2.04 kg dry mass and 36.25 in CG', 'explicit Raven barometric feet-AGL and pressure-atmospheres channel labels', 'AeroTech J510W manufacturer RASP simfile 5f4294d20002e900000006d2 via pinned OpenRocket mirror; https://www.thrustcurve.org/motors/5f4294d2000231000000030a/'],
    assumedInputs: ['generic published ClassAdventurer design with flight-log J510W, not its stored default I140 motor', 'standard G10 fin proxy; encoded source density 0.502255 kg/m3 is implausible and not treated as a weighing', 'conical approximation to the source ogive tail; source outer-component mass/CG overrides retained', 'ISA pressure-altitude atmosphere derived from first logged pressure; not a measured geographic elevation', 'zero wind, 1.83 m rail, 88 degree elevation, default recovery model'],
    limitations: [...commonLimitations, 'conditional approximate-geometry reconstruction, not exact-geometry validation', 'fin material-density source anomaly and as-flown revisions unresolved'],
  },
];
