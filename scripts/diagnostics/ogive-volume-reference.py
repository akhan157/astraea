"""Independent high-precision circle-profile volume references for A1b tests.

Requires optional mpmath (present in the engineering workspace); no runtime
dependency is added to Astraea. This computes geometry, not flight predictions.
"""
import json
import mpmath as mp

mp.mp.dps = 80
rows = []
for length, radius in [(2.0, 1.0), (0.2, 0.03)]:
    # mpf(float) preserves the exact binary inputs used by the Rust fixtures.
    l, r = mp.mpf(length), mp.mpf(radius)
    rho = (l*l+r*r)/(2*r)
    h = r-rho
    exact = mp.pi*((h*h+rho*rho)*l-l**3/3
                  + h*(l*mp.sqrt(rho*rho-l*l)+rho*rho*mp.asin(l/rho)))
    direct = mp.quad(lambda x: mp.pi*(mp.sqrt(rho*rho-(l-x)**2)+h)**2, [0, l])
    assert abs(exact-direct) < mp.mpf('1e-70')
    rows.append({'lengthBinary64Hex': length.hex(), 'radiusBinary64Hex': radius.hex(),
                 'volumeM3_75Digits': mp.nstr(exact, 75),
                 'roundedBinary64VolumeM3': float(exact),
                 'antiderivativeVsDirectQuadratureM3': mp.nstr(abs(exact-direct), 10)})
print(json.dumps({'precisionDecimalDigits': mp.mp.dps, 'mpmathVersion': mp.__version__,
                  'scope': 'geometric reference only, not empirical aerodynamic validation',
                  'rows': rows}, indent=2))
