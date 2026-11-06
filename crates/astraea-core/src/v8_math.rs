//! V8 (node) double-precision math parity shims.
//!
//! The TypeScript oracles under `src/` run on V8, so *bit-for-bit* oracle
//! parity requires V8's own `Math` results — glibc and V8 disagree by one ULP
//! on a few percent of arguments, and that one ULP can move the integrated
//! trajectory. Every mirrored `Math.*` call site that can move the state — the
//! loads assembly, the wind vector, the rail and attitude initialization, and
//! the integrator's geodesic error norm — goes through these shims.
//! Presentation-only trigonometry (the Euler display
//! angles `sixDofSimulator.ts:296-320`) deliberately stays on `std`: the
//! oracle's own consumer treats those fields as nonauthoritative.
//!
//! Every function is a transcription of V8 13.6.233.17 (node v24.21.0)
//! `src/base/ieee754.cc` — the fdlibm-derived implementations the V8 build
//! uses when `V8_USE_LIBM_TRIG_FUNCTIONS` is unset. The port was compared
//! bit-for-bit against that node over 520,440 generated samples of
//! `Math.hypot`/`Math.atan2`/`Math.sin`/`Math.cos` (exponents 1e-300..1e300,
//! both pi/2 reduction paths, the Payne-Hanek path, and the
//! zero/infinity/NaN/subnormal specials) plus 205,014 `Math.acos` samples,
//! with zero mismatches; [`tests::matches_node_bit_for_bit`] keeps a
//! representative sample of those values pinned. The required fdlibm notice is
//! preserved:
//!
//! ```text
//! Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
//!
//! Developed at SunSoft, a Sun Microsystems, Inc. business.
//! Permission to use, copy, modify, and distribute this
//! software is freely granted, provided that this notice
//! is preserved.
//! ```
//!
//! Arithmetic is deliberately plain `+ - * /` (no `mul_add`, no reassociation):
//! the ported code must round exactly where V8 rounds.

/// V8's `Math.hypot` for two arguments. V8 scales by the largest magnitude and
/// accumulates the squared ratios; `f64::hypot` (glibc) differs by one ULP on
/// operand pairs such as the Estes Alpha fin mid-chord length.
pub fn js_hypot(a: f64, b: f64) -> f64 {
    if a.is_infinite() || b.is_infinite() {
        return f64::INFINITY;
    }
    if a.is_nan() || b.is_nan() {
        return f64::NAN;
    }
    let max = a.abs().max(b.abs());
    if max == 0.0 {
        return 0.0;
    }
    let ra = a / max;
    let rb = b / max;
    max * (ra * ra + rb * rb).sqrt()
}

// ---------------------------------------------------------------------------
// fdlibm word plumbing (V8 `EXTRACT_WORDS`, `GET_HIGH_WORD`, `GET_LOW_WORD`,
// `INSERT_WORDS`, `SET_HIGH_WORD`, `SET_LOW_WORD`)
// ---------------------------------------------------------------------------

#[inline]
fn high_word(x: f64) -> i32 {
    (x.to_bits() >> 32) as u32 as i32
}

#[inline]
fn low_word(x: f64) -> u32 {
    x.to_bits() as u32
}

#[inline]
fn insert_words(hi: i32, lo: u32) -> f64 {
    f64::from_bits(((hi as u32 as u64) << 32) | lo as u64)
}

/// `scalbn` with C semantics (exact exponent scaling, in steps at the
/// subnormal/overflow edges). V8 calls `std::scalbn` from the ported kernels.
fn scalbn(x: f64, n: i32) -> f64 {
    if !x.is_finite() || x == 0.0 {
        return x;
    }
    let mut y = x;
    let mut n = n;
    if n > 1023 {
        y *= f64::from_bits(0x7FE0_0000_0000_0000); // 2^1023
        n -= 1023;
        if n > 1023 {
            y *= f64::from_bits(0x7FE0_0000_0000_0000);
            n -= 1023;
            if n > 1023 {
                n = 1023;
            }
        }
    } else if n < -1022 {
        // 2^-1022 * 2^53 keeps the subnormal range free of double rounding.
        y *= f64::from_bits(0x0010_0000_0000_0000) * 9007199254740992.0;
        n += 1022 - 53;
        if n < -1022 {
            y *= f64::from_bits(0x0010_0000_0000_0000) * 9007199254740992.0;
            n += 1022 - 53;
            if n < -1022 {
                n = -1022;
            }
        }
    }
    y * f64::from_bits(((0x3FF + n as i64) as u64) << 52)
}

/// V8 `acos` (fdlibm `e_acos.c`): the asin series on |x| <= 0.5, and the
/// sqrt((1-|x|)/2) half-angle reductions outside it.
pub fn js_acos(x: f64) -> f64 {
    const ONE: f64 = 1.00000000000000000000e+00;
    const PI: f64 = 3.14159265358979311600e+00;
    const PIO2_HI: f64 = 1.57079632679489655800e+00;
    const PIO2_LO: f64 = 6.12323399573676603587e-17;
    const PS0: f64 = 1.66666666666666657415e-01;
    const PS1: f64 = -3.25565818622400915405e-01;
    const PS2: f64 = 2.01212532134862925881e-01;
    const PS3: f64 = -4.00555345006794114027e-02;
    const PS4: f64 = 7.91534994289814532176e-04;
    const PS5: f64 = 3.47933107596021167570e-05;
    const QS1: f64 = -2.40339491173441421878e+00;
    const QS2: f64 = 2.02094576023350569471e+00;
    const QS3: f64 = -6.88283971605453293030e-01;
    const QS4: f64 = 7.70381505559019352791e-02;

    let hx = high_word(x);
    let ix = hx & 0x7FFF_FFFF;
    if ix >= 0x3FF0_0000 {
        // |x| >= 1
        let lx = low_word(x);
        if ((ix - 0x3FF0_0000) | lx as i32) == 0 {
            // |x| == 1
            return if hx > 0 { 0.0 } else { PI + 2.0 * PIO2_LO };
        }
        return f64::NAN; // acos(|x| > 1) is NaN
    }
    if ix < 0x3FE0_0000 {
        // |x| < 0.5
        if ix <= 0x3C60_0000 {
            return PIO2_HI + PIO2_LO; // |x| < 2^-57
        }
        let z = x * x;
        let p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
        let q = ONE + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
        let r = p / q;
        PIO2_HI - (x - (PIO2_LO - x * r))
    } else if hx < 0 {
        // x < -0.5
        let z = (ONE + x) * 0.5;
        let p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
        let q = ONE + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
        let s = z.sqrt();
        let r = p / q;
        let w = r * s - PIO2_LO;
        PI - 2.0 * (s + w)
    } else {
        // x > 0.5
        let z = (ONE - x) * 0.5;
        let s = z.sqrt();
        let df = insert_words(high_word(s), 0);
        let c = (z - df * df) / (s + df);
        let p = z * (PS0 + z * (PS1 + z * (PS2 + z * (PS3 + z * (PS4 + z * PS5)))));
        let q = ONE + z * (QS1 + z * (QS2 + z * (QS3 + z * QS4)));
        let r = p / q;
        let w = r * s + c;
        2.0 * (df + w)
    }
}

/// V8 `atan` (fdlibm `s_atan.c`): each call starts with the plain series and
/// reduces 0.4375 <= |x| into one of four intervals.
pub fn js_atan(x: f64) -> f64 {
    const ATAN_HI: [f64; 4] = [
        4.63647609000806093515e-01, // atan(0.5)hi
        7.85398163397448278999e-01, // atan(1.0)hi
        9.82793723247329054082e-01, // atan(1.5)hi
        1.57079632679489655800e+00, // atan(inf)hi
    ];
    const ATAN_LO: [f64; 4] = [
        2.26987774529616870924e-17, // atan(0.5)lo
        3.06161699786838301793e-17, // atan(1.0)lo
        1.39033110312309984516e-17, // atan(1.5)lo
        6.12323399573676603587e-17, // atan(inf)lo
    ];
    const AT: [f64; 11] = [
        3.33333333333329318027e-01,
        -1.99999999998764832476e-01,
        1.42857142725034663711e-01,
        -1.11111104054623557880e-01,
        9.09088713343650656196e-02,
        -7.69187620504482999495e-02,
        6.66107313738753120669e-02,
        -5.83357013379057348645e-02,
        4.97687799461593236017e-02,
        -3.65315727442169155270e-02,
        1.62858201153657823623e-02,
    ];
    const ONE: f64 = 1.0;
    const HUGE: f64 = 1.0e300;

    let hx = high_word(x);
    let ix = hx & 0x7FFF_FFFF;
    let mut x = x;
    let id: i32;
    if ix >= 0x4410_0000 {
        // |x| >= 2^66
        if ix > 0x7FF0_0000 || (ix == 0x7FF0_0000 && low_word(x) != 0) {
            return x + x; // NaN
        }
        return if hx > 0 {
            ATAN_HI[3] + ATAN_LO[3]
        } else {
            -ATAN_HI[3] - ATAN_LO[3]
        };
    } else if ix < 0x3FDC_0000 {
        // |x| < 0.4375
        if ix < 0x3E40_0000 && HUGE + x > ONE {
            return x; // raise inexact
        }
        id = -1;
    } else {
        x = x.abs();
        if ix < 0x3FF3_0000 {
            if ix < 0x3FE6_0000 {
                // 7/16 <= |x| < 11/16
                id = 0;
                x = (2.0 * x - ONE) / (2.0 + x);
            } else {
                // 11/16 <= |x| < 19/16
                id = 1;
                x = (x - ONE) / (x + ONE);
            }
        } else if ix < 0x4003_8000 {
            // |x| < 2.4375
            id = 2;
            x = (x - 1.5) / (ONE + 1.5 * x);
        } else {
            // 2.4375 <= |x| < 2^66
            id = 3;
            x = -1.0 / x;
        }
    }
    let z = x * x;
    let w = z * z;
    let s1 = z * (AT[0] + w * (AT[2] + w * (AT[4] + w * (AT[6] + w * (AT[8] + w * AT[10])))));
    let s2 = w * (AT[1] + w * (AT[3] + w * (AT[5] + w * (AT[7] + w * AT[9]))));
    if id < 0 {
        x - x * (s1 + s2)
    } else {
        let z = ATAN_HI[id as usize] - ((x * (s1 + s2) - ATAN_LO[id as usize]) - x);
        if hx < 0 {
            -z
        } else {
            z
        }
    }
}

/// V8 `atan2` (fdlibm `e_atan2.c`): sign folding to `atan(|y/x|)` plus the
/// quadrant fixups. `k > 60` keeps full quadrant accuracy for huge ratios.
pub fn js_atan2(y: f64, x: f64) -> f64 {
    const TINY: f64 = 1.0e-300;
    const ZERO: f64 = 0.0;
    const PI_O_4: f64 = 7.8539816339744827900E-01;
    const PI_O_2: f64 = 1.5707963267948965580E+00;
    const PI: f64 = 3.1415926535897931160E+00;
    const PI_LO: f64 = 1.2246467991473531772E-16;

    let hx = high_word(x);
    let lx = low_word(x);
    let ix = hx & 0x7FFF_FFFF;
    let hy = high_word(y);
    let ly = low_word(y);
    let iy = hy & 0x7FFF_FFFF;
    let x_nan = (ix | (((lx | lx.wrapping_neg()) as i32) >> 31) as u32 as i32) > 0x7FF0_0000;
    let y_nan = (iy | (((ly | ly.wrapping_neg()) as i32) >> 31) as u32 as i32) > 0x7FF0_0000;
    if x_nan || y_nan {
        return x + y; // x or y is NaN
    }
    if (hx.wrapping_sub(0x3FF0_0000) as u32 | lx) == 0 {
        return js_atan(y); // x = 1.0
    }
    let mut m = ((hy >> 31) & 1) | ((hx >> 30) & 2); // 2*sign(x) + sign(y)

    if (iy | ly as i32) == 0 {
        return match m {
            0 | 1 => y,               // atan(+-0, +anything) = +-0
            2 => PI + TINY,           // atan(+0, -anything) = pi
            _ => -PI - TINY,          // atan(-0, -anything) = -pi
        };
    }
    if (ix | lx as i32) == 0 {
        return if hy < 0 { -PI_O_2 - TINY } else { PI_O_2 + TINY };
    }
    if ix == 0x7FF0_0000 {
        if iy == 0x7FF0_0000 {
            return match m {
                0 => PI_O_4 + TINY,       // atan(+INF, +INF)
                1 => -PI_O_4 - TINY,      // atan(-INF, +INF)
                2 => 3.0 * PI_O_4 + TINY, // atan(+INF, -INF)
                _ => -3.0 * PI_O_4 - TINY,
            };
        }
        return match m {
            0 => ZERO,
            1 => -ZERO,
            2 => PI + TINY,
            _ => -PI - TINY,
        };
    }
    if iy == 0x7FF0_0000 {
        return if hy < 0 { -PI_O_2 - TINY } else { PI_O_2 + TINY };
    }

    let k = (iy - ix) >> 20;
    let z = if k > 60 {
        // |y/x| > 2^60
        m &= 1;
        PI_O_2 + 0.5 * PI_LO
    } else if hx < 0 && k < -60 {
        0.0 // 0 > |y|/x > -2^-60
    } else {
        js_atan((y / x).abs())
    };
    match m {
        0 => z,
        1 => -z,
        2 => PI - (z - PI_LO),
        _ => (z - PI_LO) - PI,
    }
}

/// V8 `__kernel_sin` (fdlibm `k_sin.c`) on [-pi/4, pi/4] with tail `y`.
fn kernel_sin(x: f64, y: f64, iy: i32) -> f64 {
    const HALF: f64 = 5.00000000000000000000e-01;
    const S1: f64 = -1.66666666666666324348e-01;
    const S2: f64 = 8.33333333332248946124e-03;
    const S3: f64 = -1.98412698298579493134e-04;
    const S4: f64 = 2.75573137070700676789e-06;
    const S5: f64 = -2.50507602534068634195e-08;
    const S6: f64 = 1.58969099521155010221e-10;

    let ix = high_word(x) & 0x7FFF_FFFF;
    if ix < 0x3E40_0000 && (x as i32) == 0 {
        return x; // |x| < 2^-27, raise inexact
    }
    let z = x * x;
    let v = z * x;
    let r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
    if iy == 0 {
        x + v * (S1 + z * r)
    } else {
        x - ((z * (HALF * y - v * r) - y) - v * S1)
    }
}

/// V8 `__kernel_cos` (fdlibm `k_cos.c`) on [-pi/4, pi/4] with tail `y`.
fn kernel_cos(x: f64, y: f64) -> f64 {
    const ONE: f64 = 1.00000000000000000000e+00;
    const C1: f64 = 4.16666666666666019037e-02;
    const C2: f64 = -1.38888888888741095749e-03;
    const C3: f64 = 2.48015872894767294178e-05;
    const C4: f64 = -2.75573143513906633035e-07;
    const C5: f64 = 2.08757232129817482790e-09;
    const C6: f64 = -1.13596475577881948265e-11;

    let ix = high_word(x) & 0x7FFF_FFFF;
    if ix < 0x3E40_0000 && (x as i32) == 0 {
        return ONE; // x < 2^-27, raise inexact
    }
    let z = x * x;
    let r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
    if ix < 0x3FD3_3333 {
        // |x| < 0.3
        ONE - (0.5 * z - (z * r - x * y))
    } else {
        let qx = if ix > 0x3FE9_0000 {
            0.28125 // x > 0.78125
        } else {
            insert_words(ix - 0x0020_0000, 0) // x/4
        };
        let iz = 0.5 * z - qx;
        let a = ONE - qx;
        a - (iz - (z * r - x * y))
    }
}

/// 2/pi to 24-bit chunks (V8 `two_over_pi`), used by the Payne-Hanek path.
const TWO_OVER_PI: [i32; 66] = [
    0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C, 0x439041, 0xFE5163,
    0xABDEBB, 0xC561B7, 0x246E3A, 0x424DD2, 0xE00649, 0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129,
    0xA73EE8, 0x8235F5, 0x2EBB44, 0x84E99C, 0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C,
    0x845F8B, 0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D, 0x367ECF,
    0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5, 0xF17B3D, 0x0739F7, 0x8A5292,
    0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330, 0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3,
    0x91615E, 0xE61B08, 0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA,
    0x73A8C9, 0x60E27B, 0xC08C6B,
];

/// High-word probe of `n*pi/2` for the first 32 multiples (V8 `npio2_hw`).
const NPIO2_HW: [i32; 32] = [
    0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C, 0x4025FDBB, 0x402921FB,
    0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C, 0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB,
    0x403AB41B, 0x403C463A, 0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
    0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB, 0x404858EB, 0x404921FB,
];

/// V8 `__ieee754_rem_pio2` (fdlibm `e_rem_pio2.c`): reduce `x` to
/// `y[0] + y[1]` in [-pi/4, pi/4] and return the quadrant.
fn rem_pio2(x: f64, y: &mut [f64; 3]) -> i32 {
    const ZERO: f64 = 0.0;
    const HALF: f64 = 5.00000000000000000000e-01;
    const TWO24: f64 = 1.67772160000000000000e+07;
    const INVPIO2: f64 = 6.36619772367581382433e-01;
    const PIO2_1: f64 = 1.57079632673412561417e+00;
    const PIO2_1T: f64 = 6.07710050650619224932e-11;
    const PIO2_2: f64 = 6.07710050630396597660e-11;
    const PIO2_2T: f64 = 2.02226624879595063154e-21;
    const PIO2_3: f64 = 2.02226624871116645580e-21;
    const PIO2_3T: f64 = 8.47842766036889956997e-32;

    let hx = high_word(x);
    let ix = hx & 0x7FFF_FFFF;
    if ix <= 0x3FE9_21FB {
        // |x| <= pi/4: no reduction
        y[0] = x;
        y[1] = 0.0;
        return 0;
    }
    if ix < 0x4002_D97C {
        // |x| < 3pi/4: special case with n = +-1
        if hx > 0 {
            let mut z = x - PIO2_1;
            if ix != 0x3FF9_21FB {
                // 33+53 bit pi is good enough
                y[0] = z - PIO2_1T;
                y[1] = (z - y[0]) - PIO2_1T;
            } else {
                // near pi/2, use 33+33+53 bit pi
                z -= PIO2_2;
                y[0] = z - PIO2_2T;
                y[1] = (z - y[0]) - PIO2_2T;
            }
            return 1;
        }
        let mut z = x + PIO2_1;
        if ix != 0x3FF9_21FB {
            y[0] = z + PIO2_1T;
            y[1] = (z - y[0]) + PIO2_1T;
        } else {
            z += PIO2_2;
            y[0] = z + PIO2_2T;
            y[1] = (z - y[0]) + PIO2_2T;
        }
        return -1;
    }
    if ix <= 0x4139_21FB {
        // |x| <= 2^19*(pi/2), medium size
        let mut t = x.abs();
        let n = (t * INVPIO2 + HALF) as i32;
        let fnn = n as f64;
        let mut r = t - fnn * PIO2_1;
        let mut w = fnn * PIO2_1T; // 1st round good to 85 bit
        if n < 32 && ix != NPIO2_HW[(n - 1) as usize] {
            y[0] = r - w; // quick check no cancellation
        } else {
            let j = ix >> 20;
            y[0] = r - w;
            let high = high_word(y[0]);
            let mut i = j - ((high >> 20) & 0x7FF);
            if i > 16 {
                // 2nd iteration needed, good to 118
                t = r;
                w = fnn * PIO2_2;
                r = t - w;
                w = fnn * PIO2_2T - ((t - r) - w);
                y[0] = r - w;
                let high = high_word(y[0]);
                i = j - ((high >> 20) & 0x7FF);
                if i > 49 {
                    // 3rd iteration needed, 151 bits accuracy
                    t = r;
                    w = fnn * PIO2_3;
                    r = t - w;
                    w = fnn * PIO2_3T - ((t - r) - w);
                    y[0] = r - w;
                }
            }
        }
        y[1] = (r - y[0]) - w;
        if hx < 0 {
            y[0] = -y[0];
            y[1] = -y[1];
            return -n;
        }
        return n;
    }
    // all other (large) arguments
    if ix >= 0x7FF0_0000 {
        // x is inf or NaN
        y[0] = x - x;
        y[1] = x - x;
        return 0;
    }
    // set z = scalbn(|x|, ilogb(x) - 23)
    let low = low_word(x);
    let e0 = (ix >> 20) - 1046; // e0 = ilogb(z) - 23
    let mut z = insert_words(ix.wrapping_sub(((e0 as u32) << 20) as i32), low);
    let mut tx = [ZERO; 3];
    for i in 0..2 {
        tx[i] = (z as i32) as f64;
        z = (z - tx[i]) * TWO24;
    }
    tx[2] = z;
    let mut nx = 3;
    while tx[(nx - 1) as usize] == ZERO {
        nx -= 1; // skip zero term
    }
    let n = kernel_rem_pio2(&tx, y, e0, nx, 2, &TWO_OVER_PI);
    if hx < 0 {
        y[0] = -y[0];
        y[1] = -y[1];
        return -n;
    }
    n
}

/// V8 `__kernel_rem_pio2` (fdlibm `k_rem_pio2.c`): Payne-Hanek reduction for
/// arguments past the 2^19*(pi/2) medium path.
fn kernel_rem_pio2(x: &[f64; 3], y: &mut [f64; 3], e0: i32, nx: i32, prec: i32, ipio2: &[i32]) -> i32 {
    const INIT_JK: [i32; 4] = [2, 3, 4, 6];
    const PIO2: [f64; 8] = [
        1.57079625129699707031e+00,
        7.54978941586159635335e-08,
        5.39030252995776476554e-15,
        3.28200341580791294123e-22,
        1.27065575308067607349e-29,
        1.22933308981111328932e-36,
        2.73370053816464559624e-44,
        2.16741683877804819444e-51,
    ];
    const ZERO: f64 = 0.0;
    const ONE: f64 = 1.0;
    const TWO24: f64 = 1.67772160000000000000e+07;
    const TWON24: f64 = 5.96046447753906250000e-08;

    let mut iq = [0i32; 20];
    let mut f = [0.0f64; 20];
    let mut fq = [0.0f64; 20];
    let mut q = [0.0f64; 20];

    let jk = INIT_JK[prec as usize];
    let jp = jk;
    let jx = nx - 1;
    let mut jv = (e0 - 3) / 24;
    if jv < 0 {
        jv = 0;
    }
    let mut q0 = e0 - 24 * (jv + 1);

    // set up f[0] to f[jx+jk] where f[jx+jk] = ipio2[jv+jk]
    let mut j = jv - jx;
    let m = jx + jk;
    for i in 0..=m {
        f[i as usize] = if j < 0 { ZERO } else { ipio2[j as usize] as f64 };
        j += 1;
    }
    // compute q[0], q[1], ... q[jk]
    for i in 0..=jk {
        let mut fw = 0.0;
        for jj in 0..=jx {
            fw += x[jj as usize] * f[(jx + i - jj) as usize];
        }
        q[i as usize] = fw;
    }

    let mut jz = jk;
    let n: i32 = loop {
        // distill q[] into iq[] reversingly
        let mut z;
        {
            z = q[jz as usize];
            let mut i = 0;
            let mut jj = jz;
            while jj > 0 {
                let fw = ((TWON24 * z) as i32) as f64;
                iq[i as usize] = (z - TWO24 * fw) as i32;
                z = q[(jj - 1) as usize] + fw;
                i += 1;
                jj -= 1;
            }
        }

        // compute n
        z = scalbn(z, q0); // actual value of z
        z -= 8.0 * (z * 0.125).floor(); // trim off integer >= 8
        let mut n = z as i32;
        z -= n as f64;
        let mut ih = 0;
        if q0 > 0 {
            // need iq[jz-1] to determine n
            let i = iq[(jz - 1) as usize] >> (24 - q0);
            n += i;
            iq[(jz - 1) as usize] -= i << (24 - q0);
            ih = iq[(jz - 1) as usize] >> (23 - q0);
        } else if q0 == 0 {
            ih = iq[(jz - 1) as usize] >> 23;
        } else if z >= 0.5 {
            ih = 2;
        }

        let mut carry = 0;
        if ih > 0 {
            // q > 0.5
            n += 1;
            for i in 0..jz {
                let jj = iq[i as usize];
                if carry == 0 {
                    if jj != 0 {
                        carry = 1;
                        iq[i as usize] = 0x1000000 - jj;
                    }
                } else {
                    iq[i as usize] = 0xFFFFFF - jj;
                }
            }
            if q0 > 0 {
                // rare case: chance is 1 in 12
                match q0 {
                    1 => iq[(jz - 1) as usize] &= 0x7FFFFF,
                    2 => iq[(jz - 1) as usize] &= 0x3FFFFF,
                    _ => {}
                }
            }
            if ih == 2 {
                z = ONE - z;
                if carry != 0 {
                    z -= scalbn(ONE, q0);
                }
            }
        }

        // check if recomputation is needed
        if z == ZERO {
            let mut jj = 0;
            let mut i = jz - 1;
            while i >= jk {
                jj |= iq[i as usize];
                i -= 1;
            }
            if jj == 0 {
                let mut k = 1;
                while jk >= k && iq[(jk - k) as usize] == 0 {
                    k += 1; // k = no. of terms needed
                }
                for i in (jz + 1)..=(jz + k) {
                    // add q[jz+1] to q[jz+k]
                    f[(jx + i) as usize] = ipio2[(jv + i) as usize] as f64;
                    let mut fw = 0.0;
                    for jj in 0..=jx {
                        fw += x[jj as usize] * f[(jx + i - jj) as usize];
                    }
                    q[i as usize] = fw;
                }
                jz += k;
                continue;
            }
        }

        // chop off zero terms
        if z == 0.0 {
            jz -= 1;
            q0 -= 24;
            while iq[jz as usize] == 0 {
                jz -= 1;
                q0 -= 24;
            }
        } else {
            // break z into 24-bit chunks if necessary
            z = scalbn(z, -q0);
            if z >= TWO24 {
                let fw = ((TWON24 * z) as i32) as f64;
                iq[jz as usize] = (z - TWO24 * fw) as i32;
                jz += 1;
                q0 += 24;
                iq[jz as usize] = fw as i32;
            } else {
                iq[jz as usize] = z as i32;
            }
        }

        // convert integer "bit" chunk to floating-point value
        let mut fw = scalbn(ONE, q0);
        let mut i = jz;
        while i >= 0 {
            q[i as usize] = fw * iq[i as usize] as f64;
            fw *= TWON24;
            i -= 1;
        }

        // compute PIo2[0,...,jp] * q[jz,...,0]
        let mut i = jz;
        while i >= 0 {
            let mut fw = 0.0;
            let mut k = 0;
            while k <= jp && k <= jz - i {
                fw += PIO2[k as usize] * q[(i + k) as usize];
                k += 1;
            }
            fq[(jz - i) as usize] = fw;
            i -= 1;
        }

        // compress fq[] into y[]
        match prec {
            0 => {
                let mut fw = 0.0;
                let mut i = jz;
                while i >= 0 {
                    fw += fq[i as usize];
                    i -= 1;
                }
                y[0] = if ih == 0 { fw } else { -fw };
            }
            1 | 2 => {
                let mut fw = 0.0;
                let mut i = jz;
                while i >= 0 {
                    fw += fq[i as usize];
                    i -= 1;
                }
                y[0] = if ih == 0 { fw } else { -fw };
                let mut fw = fq[0] - fw;
                let mut i = 1;
                while i <= jz {
                    fw += fq[i as usize];
                    i += 1;
                }
                y[1] = if ih == 0 { fw } else { -fw };
            }
            _ => {
                // prec == 3, "painful"
                let mut i = jz;
                while i > 0 {
                    let fw = fq[(i - 1) as usize] + fq[i as usize];
                    fq[i as usize] += fq[(i - 1) as usize] - fw;
                    fq[(i - 1) as usize] = fw;
                    i -= 1;
                }
                let mut i = jz;
                while i > 1 {
                    let fw = fq[(i - 1) as usize] + fq[i as usize];
                    fq[i as usize] += fq[(i - 1) as usize] - fw;
                    fq[(i - 1) as usize] = fw;
                    i -= 1;
                }
                let mut fw = 0.0;
                let mut i = jz;
                while i >= 2 {
                    fw += fq[i as usize];
                    i -= 1;
                }
                if ih == 0 {
                    y[0] = fq[0];
                    y[1] = fq[1];
                    y[2] = fw;
                } else {
                    y[0] = -fq[0];
                    y[1] = -fq[1];
                    y[2] = -fw;
                }
            }
        }
        break n & 7;
    };
    n
}

/// V8 `sin` (fdlibm `s_sin.c`).
pub fn js_sin(x: f64) -> f64 {
    let mut y = [0.0f64; 3];
    let ix = high_word(x) & 0x7FFF_FFFF;
    if ix <= 0x3FE9_21FB {
        // |x| ~<= pi/4
        return kernel_sin(x, 0.0, 0);
    }
    if ix >= 0x7FF0_0000 {
        // sin(Inf or NaN) is NaN
        return x - x;
    }
    let n = rem_pio2(x, &mut y);
    match n & 3 {
        0 => kernel_sin(y[0], y[1], 1),
        1 => kernel_cos(y[0], y[1]),
        2 => -kernel_sin(y[0], y[1], 1),
        _ => -kernel_cos(y[0], y[1]),
    }
}

/// V8 `cos` (fdlibm `s_cos.c`).
pub fn js_cos(x: f64) -> f64 {
    let mut y = [0.0f64; 3];
    let ix = high_word(x) & 0x7FFF_FFFF;
    if ix <= 0x3FE9_21FB {
        return kernel_cos(x, 0.0);
    }
    if ix >= 0x7FF0_0000 {
        return x - x;
    }
    let n = rem_pio2(x, &mut y);
    match n & 3 {
        0 => kernel_cos(y[0], y[1]),
        1 => -kernel_sin(y[0], y[1], 1),
        2 => -kernel_cos(y[0], y[1]),
        _ => kernel_sin(y[0], y[1], 1),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A one-ULP `Math.hypot` divergence: V8's scaled algorithm rounds this
    /// operand pair up where glibc's `f64::hypot` rounds it down, so any
    /// mirrored call site must go through the shim rather than `std`.
    #[test]
    fn hypot_matches_v8_on_the_alpha_fin_mid_chord() {
        let num = js_hypot(0.6692913385826769, 2.0078740157480315);
        assert_eq!(num.to_bits(), 0x4000EE8FB68204AD);
        // glibc's hypot is one ULP lower on this operand pair.
        assert_ne!(num.to_bits(), (0.6692913385826769f64).hypot(2.0078740157480315).to_bits());
        assert_eq!(js_hypot(0.0, 0.0), 0.0);
        assert_eq!(js_hypot(3.0, 4.0), 5.0);
        assert!(js_hypot(f64::INFINITY, f64::NAN).is_infinite());
        assert!(js_hypot(f64::NAN, 1.0).is_nan());
    }

    /// Bit-for-bit agreement with node v24.21.0 (`Math.sin`, `Math.cos`,
    /// `Math.atan2`, `Math.hypot`) over the whole exponent range, both pi/2
    /// reduction paths, the Payne-Hanek path, and the special values. Each
    /// expected value is the `to_bits()` of the node result.
    #[test]
    fn matches_node_bit_for_bit() {
assert_eq!(js_sin(-3.3340791457004324e-36).to_bits(), 0xB891BA1D06000000);
        assert_eq!(js_sin(3.2955866095893066e-27).to_bits(), 0x3A7051A700000000);
        assert_eq!(js_sin(1.61906136309925e-60).to_bits(), 0x3384D05880000000);
        assert_eq!(js_sin(-11635.671875).to_bits(), 0x3FE6ABB489C4BDAA);
        assert_eq!(js_sin(9.550934874568928e+32).to_bits(), 0xBFEFA560D93E1058);
        assert_eq!(js_sin(-5.537695470971806e+69).to_bits(), 0x3FE3BD9A8EF6C42F);
        assert_eq!(js_sin(-7.160289592060196e-85).to_bits(), 0xAE764190C0000000);
        assert_eq!(js_sin(-5.84819429609241e-89).to_bits(), 0xAD9DC84F00000000);
        assert_eq!(js_cos(-3.3340791457004324e-36).to_bits(), 0x3FF0000000000000);
        assert_eq!(js_cos(1.0611838892947705e-82).to_bits(), 0x3FF0000000000000);
        assert_eq!(js_cos(-0.7853000164031982).to_bits(), 0x3FE6A12FEFBA32F7);
        assert_eq!(js_cos(-3.460344251432806e+57).to_bits(), 0x3FD988D457307C69);
        assert_eq!(js_cos(-4.443742256350843e+62).to_bits(), 0xBFEF2BB083B937E5);
        assert_eq!(js_cos(-0.043157827109098434).to_bits(), 0x3FEFF85F3A3F3EA4);
        assert_eq!(js_atan2(0.3910258412361145, -2.266079036417068e-06).to_bits(), 0x3FF9220167E85B42);
        assert_eq!(js_atan2(-5.526040695258416e-06, 69314117632.0).to_bits(), 0xBC96FAA338FD7941);
        assert_eq!(js_atan2(141387745024.0, 6.117339178310745e-16).to_bits(), 0x3FF921FB54442D18);
        assert_eq!(js_atan2(-0.05739133059978485, -405197616578560.0).to_bits(), 0xC00921FB54442D18);
        assert_eq!(js_atan2(1151914816.0, 1.7514446426503127e-07).to_bits(), 0x3FF921FB54442D18);
        assert_eq!(js_atan2(2655605784576.0, -3368006516211712.0).to_bits(), 0x4009205DF04B36CB);
        assert_eq!(js_atan2(-1209.319580078125, -6.3234686584201505e-12).to_bits(), 0xBFF921FB54442D30);
        assert_eq!(js_atan2(-3718331.0, 13381285183488.0).to_bits(), 0xBE92A5DD45655E3E);
        assert_eq!(js_hypot(-2.543466662199826e+72, 2.9320701276297176e+68).to_bits(), 0x4EF70866C29150A4);
        assert_eq!(js_hypot(-1.278888743698866e+34, -1.245380390870929e-21).to_bits(), 0x4703B453A0000000);
        assert_eq!(js_hypot(-1.6299045336501412e+53, 1.066246335837786e-42).to_bits(), 0x4AFB3A2980000000);
        assert_eq!(js_hypot(2.3535368236452412e-49, -1.65659637564727e-14).to_bits(), 0x3D12A6D060000000);
        assert_eq!(js_hypot(-8.050307630849176e-52, -5569.703125).to_bits(), 0x40B5C1B400000000);
        assert_eq!(js_hypot(-1.850627822713707e+33, -1.0472471031378737e-19).to_bits(), 0x46D6CF8D40000000);
        assert_eq!(js_atan2(0.0, 0.0).to_bits(), 0x0000000000000000);
        assert_eq!(js_atan2(0.0, -0.0).to_bits(), 0x400921FB54442D18);
        assert_eq!(js_atan2(0.0, f64::INFINITY).to_bits(), 0x0000000000000000);
        assert_eq!(js_atan2(0.0, f64::NEG_INFINITY).to_bits(), 0x400921FB54442D18);
        // `acos` covers the rail-rotation init; one sample per branch.
        assert_eq!(js_acos(0.48824137449264526).to_bits(), 0x3FF0F8B8852C5648);
        assert_eq!(js_acos(0.801578998565674).to_bits(), 0x3FE481F6E9FB5649);
        assert_eq!(js_acos(-0.6923556327819825).to_bits(), 0x4002AF322FE10228);
        assert_eq!(js_acos(1.0).to_bits(), 0x0000000000000000);
        assert_eq!(js_acos(-1.0).to_bits(), 0x400921FB54442D18);
        assert!(js_acos(1.5).is_nan());
        // Aircraft-scale arguments inside the flight's incidence range.
        assert_eq!(js_atan2(-2.8216569423675537, -5.184162965225472e+16).to_bits(), 0xC00921FB54442D18);
        assert_eq!(js_atan2(6.131824493408203, -1.3339094679552e+16).to_bits(), 0x400921FB54442D17);
        assert_eq!(js_atan2(-0.7853000164031982, -1.7445140088057087e-07).to_bits(), 0xBFF921FB8FE5F212);
        assert_eq!(js_sin(-1.2041094303131104).to_bits(), 0xBFEDDF65F49C02E8);
        assert_eq!(js_sin(1.0170245468616486).to_bits(), 0x3FEB37AE58566FCA);
        assert_eq!(js_sin(-1.3634358644485474).to_bits(), 0xBFEF5082464F6E1D);
    }
}
