# Astraea Normative Physical Contract
## Unified Frames, Rate Labels, Integrators, Datums & Structural Margin Definitions
**Document Version:** 1.0.0
**Status:** NORMATIVE — Supersedes all frame/convention statements in other documents where they conflict.
**Date:** 2026-09-08

---

## 1. Coordinate Frames (NORMATIVE)

### 1.1 Navigation Frame (N)
Right-handed **East-North-Up (ENU)** local tangent frame:
- $+X_N$: East
- $+Y_N$: North
- $+Z_N$: Up (altitude above local reference)

Handedness: $\hat{X} \times \hat{Y} = \hat{Z}$ (right-handed). This supersedes any earlier East-Up-North declaration.

**Viewport mapping (Three.js WebGL):** renderer maps $+Z_N$ (Up) to viewport $+Y$, $+X_N$ to viewport $-X$ (into/out of screen as configured), preserving orientation (no raw axis swap that breaks handedness; apply a proper reflection-free rotation).

### 1.2 Body Frame (B)
Right-handed body frame with origin at instantaneous Center of Mass:
- $+Y_B$: longitudinal, pointing toward the nosecone tip (forward)
- $+X_B$: lateral, coplanar with fin 1 (pitch axis)
- $+Z_B$: lateral, completing the right-handed triad (yaw axis)

### 1.3 Rate Labels (p, q, r)
In the conventional aerospace standard, rates are usually about $X$/$Y$/$Z$ of a forward-axial frame. Because Astraea's forward axis is $+Y_B$, the certified mapping is:
- **Roll rate $p$** — rotation about the longitudinal axis $+Y_B$ (spin)
- **Pitch rate $q$** — rotation about $+X_B$ (transverse lateral)
- **Yaw rate $r$** — rotation about $+Z_B$ (transverse lateral)

Angular velocity vector in body coordinates: $\boldsymbol{\omega}_B = [\Omega_{X_B}, \Omega_{Y_B}, \Omega_{Z_B}]^T$, with
$p = \Omega_{Y_B}$, $q = \Omega_{X_B}$, $r = \Omega_{Z_B}$.
Implementation MUST map these labels explicitly; no implicit remap is permitted.

## 2. Inertia & Mass Conventions (NORMATIVE)

- **Axial inertia $I_{\text{roll}} = I_{Y_B Y_B}$** (about longitudinal spin axis) — NEVER used in transverse pitch dynamics.
- **Transverse inertia $I_{\text{pitch}} = I_{X_B X_B}$** and $I_{\text{yaw}} = I_{Z_B Z_B}$.
- Launch-rail tip-off angular acceleration uses $I_{\text{pitch}}$ (transverse), never $I_{\text{roll}}$.
- Roll-pitch natural frequency uses $I_{\text{pitch}}$ (transverse).
- Parent mass-property identity at staging:
  $$m_P = \sum_i m_i, \qquad \sum_i m_i \boldsymbol{\rho}_i^B = \mathbf{0}, \qquad \mathbf{I}_P = \sum_i \left( \mathbf{I}_i + m_i \left[\|\boldsymbol{\rho}_i\|^2 \mathbf{1} - \boldsymbol{\rho}_i \boldsymbol{\rho}_i^T \right] \right)$$
  Parallel-axis terms MUST be applied per-axis.

## 3. Integrator Contract (NORMATIVE)

- **Default integrator:** adaptive Dormand-Prince RK 5(4) with continuous 4th-order dense output.
- Quaternion update MUST be additive with normalization (NEVER multiplicative blending of derivative increments):
  $$\mathbf{q}_{n+1} = \operatorname{normalize}\left[ \mathbf{q}_n + \frac{h}{6}\left(\mathbf{k}_{1q} + 2\mathbf{k}_{2q} + 2\mathbf{k}_{3q} + \mathbf{k}_{4q}\right) \right]$$
- Independent absolute tolerances: position $10^{-3}\,\mathrm m$, velocity $10^{-2}\,\mathrm{m/s}$, attitude $10^{-5}$ (token), angular rate $10^{-3}\,\mathrm{rad/s}$.
- Toulmin/event localization: root-finding with direction filter; apogee = vertical-velocity zero-crossing $v_{N,z}=0$; main deployment and touchdown = altitude/terrain crossings $r_{N,z}=h_{\text{event}}$.

## 4. Altitude Datums (NORMATIVE)

1. **WGS84 Ellipsoidal Height $h_{\text{ellips}}$** — raw GPS height.
2. **Orthometric MSL $H = h_{\text{ellips}} - N_{EGM96}(\phi,\lambda)$** — referenced to EGM96 geoid.
3. **Above-Pad $h_{\text{above pad}} = H - H_{\text{pad}}$**.
4. **Terrain-relative AGL $h_{\text{AGL}}(\mathbf{r}_N) = H - H_{\text{terrain}}(\phi,\lambda)$** — the ONLY quantity used for main-deployment and touchdown events. Implementation may assume flat-terrain $H_{\text{terrain}} \equiv H_{\text{pad}}$ ONLY if explicitly declared in the run manifest.

## 5. Structural Margin / Hardware Definitions (NORMATIVE)

The following are distinct quantities; they are NEVER interchangeable:
- **Proof Load $F_{\text{proof}}$**: load applied during proof testing.
- **Ultimate Strength $F_{\text{ult}}$**: certified minimum breaking strength of the harness component.
- **Margins**: the single adopted acceptance policy is:
  $$MS = \frac{F_{\text{ult}}}{F_{\text{shock}}} - 1 \ge 0.50 \quad (\equiv F_{\text{ult}} \ge 1.5\,F_{\text{shock}})$$
  No other safety-factor convention is valid in flight-readiness output.

## 6. Aerodynamic Coefficient Convention (NORMATIVE)

- Coefficients returned by the loads API are **wind-axis** drag $C_D$, lift $C_L$, side force $C_Y$ unless explicitly converted to body-axis axial/normal coefficients. Body-frame forces are computed by transforming the wind-base load vector into body axes using angle of attack $\alpha$ and sideslip $\beta$.
- $\alpha = \operatorname{atan2}(-v_{\text{air},B,Y}, \; |v_{\text{air},B,Z}|)$-style total-incidence handling MUST be replaced by the certified paired definitions:
  $$\alpha = \operatorname{atan2}\left(v_{\text{air},B,Z} , v_{\text{air},B,Y}\right), \qquad \beta = \operatorname{atan2}\left(v_{\text{air},B,X}, \sqrt{v_{\text{air},B,Y}^2+v_{\text{air},B,Z}^2}\right)$$

## 7. Validity & Failure Semantics (NORMATIVE)

- Out-of-domain calculations MUST never produce `PASS`. Status set exclusive `{PASS, FAIL, UNKNOWN, NOT_APPLICABLE}`.
- Static instability ($C_{N\alpha}(x_{cp}-x_{cg}) < 0$) has UNDEFINED $\omega_n$; reported as `UNSUPPORTED`, not a numeric frequency.
- A failed/unsupported ensemble member is NEVER silently discarded.

## 8. Specified Flight Simulation Bounds (NORMATIVE)

- Continuous validated envelope: $M \in [0, 4]$ (supersonic; the term "hypersonic" MUST NOT be used for this envelope), $\alpha_{\text{total}} \le 30^\circ$. Above or outside: `EXTRAPOLATED` / `UNSUPPORTED`.
- The aerodynamic, flutter, base-drag, and thermal models are screened empirical approximations with documented test limits; they do not constitute structural or safety certification.