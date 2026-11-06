/**
 * Controlled browser-workflow fixture, never measured flight evidence.
 * Exact vertical constant-density quadratic-drag coast: dv/dt = -g - k*v^2.
 * Time is a declared fixture clock; powered/recovery phases are outside the
 * recorded coast. The application's ISA fit is deliberately a different model.
 */
export function syntheticCalibrationCoast() {
  const g = 9.80665;
  const k = 0.002748;
  const v0 = 75;
  const t0 = 2.2;
  const h0 = 118;
  const theta0 = Math.atan(v0 * Math.sqrt(k / g));
  const omega = Math.sqrt(g * k);
  const rows = ['time_s,altitude_m,velocity_m_s'];
  for (let i = 0; i <= 580; i++) {
    const theta = theta0 - omega * i * 0.01;
    const time = t0 + i * 0.01;
    const altitude = h0 + Math.log(Math.cos(theta) / Math.cos(theta0)) / k;
    const velocity = Math.sqrt(g / k) * Math.tan(theta);
    rows.push(`${time.toFixed(3)},${altitude.toFixed(9)},${velocity.toFixed(9)}`);
  }
  return {
    bytes: Buffer.from(`${rows.join('\n')}\n`),
    fileName: 'synthetic-vertical-coast-workflow.csv',
    burnoutS: 1.8,
    recoveryS: 9,
    evidenceSource: 'Synthetic analytic coast fixture; vertical calm constant-mass motion; powered phase ends at 1.8 s and recovery starts at 9 s on fixture clock. Browser workflow coverage only, no measured flight or accuracy validation.',
  };
}
