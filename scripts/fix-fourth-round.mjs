import fs from 'fs';

let spec = fs.readFileSync('docs/astraea-master-product-spec.md', 'utf-8');

// 1. Section 5.3: Fix ENU altitude axis from y to z
spec = spec.replace(
  /- \$t_\{\\text\{apogee\}\}\$: Vertical velocity zero-crossing \$v_\{N,y\}\(t\) = 0\$/,
  '- $t_{\\text{apogee}}$: Vertical velocity zero-crossing $v_{N,z}(t) = 0$'
);
spec = spec.replace(
  /- \$t_\{\\text\{main\}\}\$: Main deploy altitude \$r_\{N,y\}\(t\) - h_\{\\text\{main\}\} = 0\$/,
  '- $t_{\\text{main}}$: Main deploy altitude $r_{N,z}(t) - h_{\\text{main}} = 0$'
);
spec = spec.replace(
  /- \$t_\{\\text\{touchdown\}\}\$: Ground contact \$r_\{N,y\}\(t\) = 0\$/,
  '- $t_{\\text{touchdown}}$: Ground contact $r_{N,z}(t) = 0$'
);

// 2. Section 5.2: Add explicit variable-mass Euler term
spec = spec.replace(
  /\$\$\\dot\{\\boldsymbol\{\\omega\}\}_B = \\mathbf\{I\}_B\(t\)\^\{-1\} \\left\[ \\mathbf\{M\}_B - \\boldsymbol\{\\omega\}_B \\times \(\\mathbf\{I\}_B\(t\) \\boldsymbol\{\\omega\}_B\) \\right\]\$\$/,
  `$$\\dot{\\boldsymbol{\\omega}}_B = \\mathbf{I}_B(t)^{-1} \\left[ \\mathbf{M}_B - \\boldsymbol{\\omega}_B \\times (\\mathbf{I}_B(t) \\boldsymbol{\\omega}_B) - \\dot{\\mathbf{I}}_B(t) \\boldsymbol{\\omega}_B \\right]$$
+
+**Variable-Mass Control Volume Note:** The $\\dot{\\mathbf{I}}_B \\boldsymbol{\\omega}_B$ term captures angular momentum redistribution from propellant depletion under the assumption of axisymmetric discharge aligned with the longitudinal axis and negligible exhaust angular momentum flux relative to the body frame. For non-axisymmetric propellant geometries or thrust vector misalignment, an explicit exhaust angular momentum flux term $\\sum \\dot{m}_e (\\mathbf{r}_e \\times \\mathbf{v}_e)_B$ must be added.`
);

// 3. Section 7.2: Fix landing coordinate axes (x, z) -> (x_N, y_N)
spec = spec.replace(
  /For the resulting 2D landing coordinates \$\(x_i, z_i\)\$ \(East, North\)/,
  'For the resulting 2D landing coordinates $(x_{N,i}, y_{N,i})$ (East, North)'
);

// 4. Section 9.1: Scale-aware momentum tolerances + mass property identity
spec = spec.replace(
  /Where \$\\mathbf\{H\}_0\(t\) = \\sum_\{i=1\}\^2 \\left\[ \\mathbf\{R\}_\{NB\} \\mathbf\{I\}_i \\boldsymbol\{\\omega\}_i\^B \+ m_i \(\\mathbf\{r\}_i\^N - \\mathbf\{r\}_0\) \\times \\mathbf\{v\}_i\^N \\right\]\$\./,
  `Where $\\mathbf{H}_0(t) = \\sum_{i=1}^2 \\left[ \\mathbf{R}_{NB,i} \\mathbf{I}_i \\boldsymbol{\\omega}_i^B + m_i (\\mathbf{r}_i^N - \\mathbf{r}_0) \\times \\mathbf{v}_i^N \\right]$ with child-specific attitude rotations $\\mathbf{R}_{NB,i}$.

**Parent Mass-Property Identity:** Partitioning must satisfy $m_P = \\sum_i m_i$ and $\\sum_i m_i \\boldsymbol{\\rho}_i^B = \\mathbf{0}$ with parallel-axis inertia consistency. Tolerance policy uses mixed absolute/relative acceptance:
$$\\| \\Delta \\mathbf{P} \\| \\le \\epsilon_{P,\\text{abs}} + \\epsilon_{P,\\text{rel}} \\| \\mathbf{P}_{\\text{initial}} \\|, \\quad \\epsilon_{P,\\text{abs}} = 10^{-6}\\text{ N}\\cdot\\text{s}, \\ \\epsilon_{P,\\text{rel}} = 10^{-6}$$`
);

// 5. Section 9.2: Add drawing-axis reconciliation note
spec = spec.replace(
  /Launch rail departure is modeled as a sliding kinematic constraint using forward button \(\$x_\{\\text\{fwd\}\}\$\) and aft button \(\$x_\{\\text\{aft\}\}\$\):/,
  `Launch rail departure is modeled as a sliding kinematic constraint. **Drawing-Axis Reconciliation:** Longitudinal positions $x_{\\text{fwd}}, x_{\\text{aft}}, x_{cg}, x_{cp}$ are axial distances measured from the nosecone tip along the body longitudinal $+Y_B$ axis (standard rocketry drawing convention). Transverse offset $y_{\\text{button}}$ is the lateral rail button displacement from the longitudinal axis:`
);

// 6. Section 9.3: Fix denominator floor units and unstable case
spec = spec.replace(
  /\$\$\\text\{RAM\}\(t\) = \\frac\{\\left\| \|p\(t\)\| - \\omega_n\(t\) \\right\|\}\{\\max\(0.1, \\omega_n\(t\)\)\}\$\$/,
  `$$\\text{RAM}(t) = \\frac{\\left| |p(t)| - \\omega_n(t) \\right|}{\\max(0.1\\text{ rad/s}, \\omega_n(t))}$$
+
+**Unstable Configuration Handling:** If the restoring stiffness $C_{N\\alpha} \\bar{q} S_{\\text{ref}} (x_{cp} - x_{cg}) < 0$ (statically unstable), $\\omega_n$ is undefined. Astraea emits \`UNSUPPORTED\` status rather than computing a non-physical frequency.`
);

// 7. Section 9.4: Unambiguous structural acceptance policy (reconcile SF=1.5 vs 2.0)
spec = spec.replace(
  /Evaluates structural margin of safety against rated harness proof load \$F_\{\\text\{proof\}\}\$:.*?\$\$\\text\{MS\}\_\{\\text\{harness\}\} = \\frac\{F_\{\\text\{proof\}\}\}\{SF \\cdot F_\{\\text\{shock\}\}\} - 1\\quad \(SF = 1.50 \\text\{ required for flight safety\}\)\$\$/s,
  `Evaluates structural margin of safety against rated harness ultimate strength $F_{\\text{ult}}$:
   $$\\text{MS}_{\\text{harness}} = \\frac{F_{\\text{ult}}}{F_{\\text{shock}}} - 1 \\quad (\\text{Minimum Acceptable: } \\text{MS} \\ge 0.50, \\text{ i.e., } F_{\\text{ult}} \\ge 1.5 F_{\\text{shock}})$$
   **Single Unambiguous Structural Policy:** Astraea uses one safety standard everywhere: Minimum Margin of Safety $\\text{MS} \\ge 0.50$ (i.e. ultimate strength $\\ge 1.5 \\times$ peak predicted load). This supersedes any other safety factor notation in this document.`
);

// 8. Section 11.2: Independent backup timer
spec = spec.replace(
  /- \*\*Backup Apogee Trigger:\*\* \$t_\{\\text\{backup\}\} = t_\{\\text\{primary\}\} \+ 1.5\\text\{s\}\$ OR barometric pressure confirms altitude drop \$\\ge 50\\text\{m\}\$ below apogee\./,
  '- **Backup Apogee Trigger (Independent of Primary):** $t_{\\text{backup}} = t_{\\text{burnout}} + 3.0\\text{s}$ OR barometric altitude drop $\\ge 50\\text{m}$ below detected apogee. Independence requirement: backup timer runs on a dedicated hardware clock channel independent of the primary altimeter detection path.'
);

// 9. Section 11.2: Formalize FAULT_LOCKED
spec = spec.replace(
  /- \*\*Ejection Sizing Formula:\*\*/,
  `- **FAULT_LOCKED Entry:** Entered when (a) barometric sensor disagreement >= 100m between dual channels, (b) continuity test failure on any ematch channel, or (c) battery voltage < 3.3V. FAULT_LOCKED requires manual ground reset; no autonomous recovery.
- **Ejection Sizing Formula:**`
);

fs.writeFileSync('docs/astraea-master-product-spec.md', spec, 'utf-8');
console.log('Successfully applied fourth-round audit corrections!');
