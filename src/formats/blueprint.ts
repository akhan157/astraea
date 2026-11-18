/**
 * Astraea Vehicle Blueprint SVG Exporter
 *
 * Produces a standalone side-view CAD drawing of a RocketVehicle: nose cone,
 * body tubes, transitions, and fin sets as scaled 2-D shapes with dimension
 * labels (component lengths, diameters, and total length), in a dark CAD
 * style. The viewBox is derived from the assembled vehicle length and its
 * widest feature (including fin span), so nothing is clipped.
 *
 * Fins render from their axialOffset measured aft of the enclosing body
 * tube's front station; internal mass components and the folded parachute are
 * not outer-mold-line features and are not drawn.
 *
 * Assembly-order precondition: components are consumed nose-to-aft, and a
 * fin set MUST be assembled after at least one body tube — its root station
 * is axialOffset aft of the enclosing tube's front station, which is
 * undefined without a preceding tube. Export throws otherwise. Lengths,
 * diameters, chords, spans, and offsets must be finite and nonnegative.
 *
 * Theming (Q11): the palette lives in CSS custom properties on a theme
 * class (`bp-dark` screen CAD, `bp-light` print) declared in the embedded
 * style block, so a print variant needs no structural change to the drawing.
 * `theme` defaults to 'dark'; any value other than 'light'/'dark' is
 * rejected.
 *
 * Build notes (when `units` is given): every fin set is listed with its
 * count, root, tip, span, sweep and thickness, and its leading-edge position
 * from the nose tip and from its tube's front, in the user's units (mm or
 * in). CG and CP are marked on the axis only when the caller passes them
 * (from the stability breakdown); otherwise the drawing says why they are
 * absent instead of leaving the reader to wonder. An export time, when given,
 * is shown in local time with its zone.
 */

import { RocketVehicle, FinPoint } from '../core/types';
import { analyzeFreeformPlanform } from '../aero/finPlanform';
import { formatLocalTimestamp } from './localTime';

/** A station on the axis to mark, metres from the nose tip, with its caption. */
export interface BlueprintMark {
  xM: number;
  /** Extra words after the position, e.g. "with AeroTech K550W loaded". */
  detail?: string;
}

/** Print/screen blueprint presentation. 'dark' is the on-screen CAD look. */
export interface BlueprintExportOptions {
  theme?: 'light' | 'dark';
  /**
   * Label units. Absent keeps the legacy metre labels; 'metric' labels part
   * dimensions in millimetres, 'imperial' in inches, and adds the fin table.
   */
  units?: 'metric' | 'imperial';
  /**
   * CG and CP stations from the stability breakdown. Pass null for a mark
   * that is unavailable, with `unavailable` saying why; it is then omitted
   * and the reason printed.
   */
  marks?: { cg: BlueprintMark | null; cp: BlueprintMark | null; unavailable?: string };
  /** Shown in local time with its zone; omitted when absent (deterministic output). */
  exportedAt?: Date;
  /** IANA zone for `exportedAt` (tests); defaults to the viewer's own. */
  timeZone?: string;
}

/** A fin set's dimensions for the notes table, SI metres. */
interface FinNote {
  name: string;
  count: number;
  root: number;
  tip: number | null;
  span: number;
  sweep: number | null;
  thickness: number;
  leadingEdgeFromTip: number;
  fromTubeFront: number;
  tubeName: string;
  shape: string;
}

/** A blueprint stroke in SI units, resolved against the assembled axis. */
interface Segment {
  kind: 'nosecone' | 'bodytube' | 'transition' | 'trapezoidfinset' | 'ellipticalfinset' | 'freeformfinset';
  x0: number; // meters, fore station
  x1: number; // meters, aft station
  rFore: number; // meters, body half-height at the fore edge
  rAft: number; // meters, body half-height at the aft edge
  span?: number; // meters, fin height above the body (fins only)
  sweep?: number; // meters, axial offset of the fin tip leading edge (trapezoid only)
  tipChord?: number; // meters, tip chord length (trapezoid only)
  points?: FinPoint[]; // meters, fin outline from the root leading edge (freeform only)
}

/** Part-dimension label in the requested units; legacy metres when none was asked for. */
function lengthFormatter(units: BlueprintExportOptions['units']): { len: (m: number) => string; dia: (m: number) => string; fine: (m: number) => string } {
  if (units === 'imperial') {
    const inch = (m: number, d: number) => `${(m / 0.0254).toFixed(d)} in`;
    return { len: (m) => inch(m, 2), dia: (m) => `Ø${inch(m, 2)}`, fine: (m) => inch(m, 3) };
  }
  if (units === 'metric') {
    const mm = (m: number, d: number) => `${(m * 1000).toFixed(d)} mm`;
    return { len: (m) => mm(m, 0), dia: (m) => `Ø${mm(m, 1)}`, fine: (m) => mm(m, 1) };
  }
  return { len: (m) => `${m.toFixed(2)} m`, dia: (m) => `Ø${m.toFixed(3)} m`, fine: (m) => `${(m * 1000).toFixed(1)} mm` };
}

export function exportBlueprintSvg(vehicle: RocketVehicle, options: BlueprintExportOptions = {}): string {
  const theme = options.theme ?? 'dark';
  if (theme !== 'light' && theme !== 'dark') {
    throw new RangeError(`blueprint export: theme must be "light" or "dark" (got ${JSON.stringify(theme)})`);
  }
  if (options.units !== undefined && options.units !== 'metric' && options.units !== 'imperial') {
    throw new RangeError(`blueprint export: units must be "metric" or "imperial" (got ${JSON.stringify(options.units)})`);
  }
  const { len: fmtLen, dia: fmtDia, fine: fmtFine } = lengthFormatter(options.units);

  if (!vehicle || !Array.isArray(vehicle.components) || vehicle.components.length === 0) {
    throw new Error('blueprint export: vehicle needs at least one component');
  }

  // Precondition: fin sets must be assembled after at least one body tube —
  // the fin root is placed axialOffset aft of the enclosing BODY TUBE's front
  // station, so a tube must precede the fin set or the placement is undefined.
  const checkNonNegative = (dim: number, what: string) => {
    if (!Number.isFinite(dim) || dim < 0) {
      throw new RangeError(`blueprint export: ${what} must be a finite nonnegative number (got ${dim})`);
    }
  };
  let bodyTubeSeen = false;
  let axialSeen = false;
  for (const c of vehicle.components) {
    switch (c.type) {
      case 'nosecone':
        checkNonNegative(c.length, `component '${c.name}' length`);
        checkNonNegative(c.baseDiameter, `component '${c.name}' base diameter`);
        axialSeen = true;
        break;
      case 'bodytube':
        checkNonNegative(c.length, `component '${c.name}' length`);
        checkNonNegative(c.outerDiameter, `component '${c.name}' outer diameter`);
        bodyTubeSeen = true;
        axialSeen = true;
        break;
      case 'transition':
        checkNonNegative(c.length, `component '${c.name}' length`);
        checkNonNegative(c.foreDiameter, `component '${c.name}' fore diameter`);
        checkNonNegative(c.aftDiameter, `component '${c.name}' aft diameter`);
        axialSeen = true;
        break;
      case 'trapezoidfinset':
        if (!bodyTubeSeen) {
          throw new Error(
            'blueprint export: fin sets must be assembled after at least one body tube ' +
            `(got '${c.name}' with no preceding body tube); the fin root needs an enclosing tube station`
          );
        }
        checkNonNegative(c.rootChord, `component '${c.name}' root chord`);
        checkNonNegative(c.span, `component '${c.name}' span`);
        checkNonNegative(c.sweepLength, `component '${c.name}' sweep length`);
        checkNonNegative(c.tipChord, `component '${c.name}' tip chord`);
        checkNonNegative(c.axialOffset, `component '${c.name}' axial offset`);
        break;
      case 'ellipticalfinset':
        if (!bodyTubeSeen) {
          throw new Error(
            'blueprint export: fin sets must be assembled after at least one body tube ' +
            `(got '${c.name}' with no preceding body tube); the fin root needs an enclosing tube station`
          );
        }
        checkNonNegative(c.rootChord, `component '${c.name}' root chord`);
        checkNonNegative(c.span, `component '${c.name}' span`);
        checkNonNegative(c.axialOffset, `component '${c.name}' axial offset`);
        break;
      case 'freeformfinset':
        if (!bodyTubeSeen) {
          throw new Error(
            'blueprint export: fin sets must be assembled after at least one body tube ' +
            `(got '${c.name}' with no preceding body tube); the fin root needs an enclosing tube station`
          );
        }
        analyzeFreeformPlanform(c.points); // refuses an invalid outline instead of drawing it
        checkNonNegative(c.axialOffset, `component '${c.name}' axial offset`);
        break;
      case 'masscomponent':
      case 'parachute':
        // Internal or recovery hardware: not part of the outer mold line.
        break;
    }
  }

  const segments: Segment[] = [];
  const finNotes: FinNote[] = [];
  let tubeName = '';
  let x = 0; // meters, aft station of the last axial component (nose tip = 0)
  let tubeFront = 0; // meters, front station of the current enclosing body tube
  let bodyD = 0; // meters, running body diameter for fin roots
  let maxBodyD = 0; // meters, widest airframe body diameter
  let maxHalf = 0; // meters, widest feature half-height incl. fin span
  axialSeen = false;

  for (const c of vehicle.components) {
    switch (c.type) {
      case 'nosecone': {
        const r = c.baseDiameter / 2;
        segments.push({ kind: 'nosecone', x0: x, x1: x + c.length, rFore: r, rAft: r });
        x += c.length;
        bodyD = c.baseDiameter;
        maxBodyD = Math.max(maxBodyD, c.baseDiameter);
        maxHalf = Math.max(maxHalf, r);
        axialSeen = true;
        break;
      }
      case 'bodytube': {
        const r = c.outerDiameter / 2;
        tubeFront = x;
        tubeName = c.name;
        segments.push({ kind: 'bodytube', x0: x, x1: x + c.length, rFore: r, rAft: r });
        x += c.length;
        bodyD = c.outerDiameter;
        maxBodyD = Math.max(maxBodyD, c.outerDiameter);
        maxHalf = Math.max(maxHalf, r);
        axialSeen = true;
        break;
      }
      case 'transition': {
        const foreR = c.foreDiameter / 2;
        const aftR = c.aftDiameter / 2;
        segments.push({ kind: 'transition', x0: x, x1: x + c.length, rFore: foreR, rAft: aftR });
        x += c.length;
        bodyD = c.aftDiameter;
        maxBodyD = Math.max(maxBodyD, c.foreDiameter, c.aftDiameter);
        maxHalf = Math.max(maxHalf, foreR, aftR);
        axialSeen = true;
        break;
      }
      case 'trapezoidfinset': {
        const r = bodyD > 0 ? bodyD / 2 : maxBodyD / 2;
        const fx = tubeFront + c.axialOffset;
        segments.push({
          kind: 'trapezoidfinset',
          x0: fx,
          x1: fx + c.rootChord,
          rFore: r,
          rAft: r,
          span: c.span,
          sweep: c.sweepLength,
          tipChord: c.tipChord,
        });
        finNotes.push({ name: c.name, count: c.finCount, root: c.rootChord, tip: c.tipChord, span: c.span, sweep: c.sweepLength,
          thickness: c.thickness, leadingEdgeFromTip: fx, fromTubeFront: c.axialOffset, tubeName, shape: 'trapezoidal' });
        maxHalf = Math.max(maxHalf, r + c.span);
        break;
      }
      case 'ellipticalfinset': {
        const r = bodyD > 0 ? bodyD / 2 : maxBodyD / 2;
        const fx = tubeFront + c.axialOffset;
        segments.push({
          kind: 'ellipticalfinset',
          x0: fx,
          x1: fx + c.rootChord,
          rFore: r,
          rAft: r,
          span: c.span,
        });
        finNotes.push({ name: c.name, count: c.finCount, root: c.rootChord, tip: null, span: c.span, sweep: null,
          thickness: c.thickness, leadingEdgeFromTip: fx, fromTubeFront: c.axialOffset, tubeName, shape: 'elliptical' });
        maxHalf = Math.max(maxHalf, r + c.span);
        break;
      }
      case 'freeformfinset': {
        const r = bodyD > 0 ? bodyD / 2 : maxBodyD / 2;
        const fx = tubeFront + c.axialOffset;
        const planform = analyzeFreeformPlanform(c.points);
        segments.push({
          kind: 'freeformfinset',
          x0: fx,
          x1: fx + planform.rootChord,
          rFore: r,
          rAft: r,
          span: planform.span,
          points: c.points,
        });
        finNotes.push({ name: c.name, count: c.finCount, root: planform.rootChord, tip: null, span: planform.span, sweep: null,
          thickness: c.thickness, leadingEdgeFromTip: fx, fromTubeFront: c.axialOffset, tubeName, shape: 'freeform' });
        maxHalf = Math.max(maxHalf, r + planform.span);
        break;
      }
      case 'masscomponent':
      case 'parachute':
        // Internal or recovery hardware: not part of the outer mold line.
        break;
    }
  }

  if (!axialSeen || x <= 0) {
    throw new Error('blueprint export: vehicle has no axial body components along the axis');
  }

  const totalLength = x;
  const scale = 900 / totalLength; // px per meter: longest vehicle fits the 900 px budget
  const marginX = 20; // px
  const marginY = 40; // px of vertical clearance for the label bands
  const cy = maxHalf * scale + marginY; // centerline y (px)

  const PX = (m: number): number => m * scale;
  const n2 = (n: number): string => n.toFixed(2);
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const shapeEls: string[] = [];
  const labelEls: string[] = [];

  for (const seg of segments) {
    const x0 = PX(seg.x0);
    const x1 = PX(seg.x1);
    const midX = (x0 + x1) / 2;
    const rTop = Math.max(seg.rFore, seg.rAft);
    const topEdge = cy - PX(rTop);
    const botEdge = cy + PX(rTop);

    switch (seg.kind) {
      case 'nosecone': {
        // Ogive-style dome from the tip (x0, cy) to the base at x1.
        const cxq = x0 + PX(seg.x1 - seg.x0) * 0.5;
        shapeEls.push(
          `<path class="bp-shape" d="M ${n2(x0)},${n2(cy)} C ${n2(cxq)},${n2(topEdge)} ${n2(cxq + PX(seg.x1 - seg.x0) * 0.2)},${n2(topEdge)} ${n2(x1)},${n2(topEdge)} L ${n2(x1)},${n2(botEdge)} C ${n2(cxq + PX(seg.x1 - seg.x0) * 0.2)},${n2(botEdge)} ${n2(cxq)},${n2(botEdge)} ${n2(x0)},${n2(cy)} Z" />`,
        );
        break;
      }
      case 'bodytube':
        shapeEls.push(
          `<rect class="bp-shape" x="${n2(x0)}" y="${n2(topEdge)}" width="${n2(PX(seg.x1 - seg.x0))}" height="${n2(PX(2 * seg.rAft))}" />`,
        );
        break;
      case 'transition': {
        const foreTop = cy - PX(seg.rFore);
        const foreBot = cy + PX(seg.rFore);
        const aftTop = cy - PX(seg.rAft);
        const aftBot = cy + PX(seg.rAft);
        shapeEls.push(
          `<polygon class="bp-shape" points="${n2(x0)},${n2(foreTop)} ${n2(x1)},${n2(aftTop)} ${n2(x1)},${n2(aftBot)} ${n2(x0)},${n2(foreBot)}" />`,
        );
        break;
      }
      case 'trapezoidfinset': {
        const span = seg.span ?? 0;
        const sweep = seg.sweep ?? 0;
        const tipChord = seg.tipChord ?? 0;
        const tipY = cy - PX(seg.rAft + span);
        shapeEls.push(
          `<polygon class="bp-fin" points="${n2(x0)},${n2(topEdge)} ${n2(x1)},${n2(topEdge)} ${n2(x0 + PX(sweep + tipChord))},${n2(tipY)} ${n2(x0 + PX(sweep))},${n2(tipY)}" />`,
        );
        break;
      }
      case 'freeformfinset': {
        const pts = (seg.points ?? [])
          .map((q) => `${n2(x0 + PX(q.x))},${n2(cy - PX(seg.rAft + q.y))}`)
          .join(' ');
        shapeEls.push(`<polygon class="bp-fin" points="${pts}" />`);
        break;
      }
      case 'ellipticalfinset': {
        const span = seg.span ?? 0;
        const cxp = (x0 + x1) / 2;
        const apex = cy - PX(seg.rAft + 2 * span);
        shapeEls.push(
          `<path class="bp-fin" d="M ${n2(x0)},${n2(topEdge)} L ${n2(x1)},${n2(topEdge)} Q ${n2(cxp)},${n2(apex)} ${n2(x0)},${n2(topEdge)} Z" />`,
        );
        break;
      }
    }

    if (seg.kind === 'trapezoidfinset' || seg.kind === 'ellipticalfinset' || seg.kind === 'freeformfinset') {
      const span = seg.span ?? 0;
      labelEls.push(
        `<text x="${n2(midX)}" y="${n2(cy - PX(seg.rAft + span) - 8)}" text-anchor="middle" class="bp-label">Span ${fmtLen(span)}</text>`,
      );
    } else {
      labelEls.push(
        `<text x="${n2(midX)}" y="${n2(topEdge - 8)}" text-anchor="middle" class="bp-label">${fmtLen(seg.x1 - seg.x0)}</text>`,
      );
      if (seg.kind !== 'nosecone') {
        labelEls.push(
          `<text x="${n2(midX)}" y="${n2(botEdge + 16)}" text-anchor="middle" class="bp-label">${fmtDia(2 * rTop)}</text>`,
        );
      }
    }
  }

  // CG/CP on the axis, labelled below the airframe so they never collide
  // with the length labels above it.
  const markEls: string[] = [];
  const marks = options.marks;
  const markLabels: Array<{ x: number; y: number; text: string }> = [];
  const markExtents: number[] = [];
  const placeMark = (mark: BlueprintMark | null, kind: 'cg' | 'cp', row: number) => {
    if (mark === null || !Number.isFinite(mark.xM)) return;
    const mx = PX(mark.xM);
    const r = 6;
    if (kind === 'cg') {
      // The usual CG symbol: a circle with two opposite quadrants filled
      // (each quadrant a short polygon, so the drawing stays M/L-only).
      const quadrant = (from: number) => {
        const pts = [`${n2(mx)},${n2(cy)}`];
        for (let k = 0; k <= 6; k++) {
          const a = from + (k / 6) * (Math.PI / 2);
          pts.push(`${n2(mx + r * Math.cos(a))},${n2(cy - r * Math.sin(a))}`);
        }
        return `<polygon points="${pts.join(' ')}" />`;
      };
      markEls.push(`<g class="bp-cg"><circle cx="${n2(mx)}" cy="${n2(cy)}" r="${r}" />${quadrant(0)}${quadrant(Math.PI)}</g>`);
    } else {
      markEls.push(`<g class="bp-cp"><circle cx="${n2(mx)}" cy="${n2(cy)}" r="${r}" /><circle cx="${n2(mx)}" cy="${n2(cy)}" r="1.8" /></g>`);
    }
    const y = cy + PX(maxHalf) + 44 + row * 14;
    markEls.push(`<line class="bp-leader" x1="${n2(mx)}" y1="${n2(cy + r)}" x2="${n2(mx)}" y2="${n2(y - 11)}" />`);
    const text = `${kind.toUpperCase()} ${fmtFine(mark.xM)} from the tip${mark.detail ? ` · ${mark.detail}` : ''}`;
    markLabels.push({ x: mx, y, text });
    markExtents.push(mx - r, mx + r);
    markEls.push(`<text x="${n2(mx)}" y="${n2(y)}" text-anchor="middle" class="bp-mark-label">${esc(text)}</text>`);
  };
  if (marks) {
    placeMark(marks.cg, 'cg', 0);
    placeMark(marks.cp, 'cp', 1);
  }

  // Build notes under the drawing: fin dimensions, the marks' status, the export time.
  const notes: string[] = [];
  if (options.units !== undefined) {
    for (const f of finNotes) {
      const dims = [
        `root ${fmtFine(f.root)}`,
        f.tip === null ? null : `tip ${fmtFine(f.tip)}`,
        `span ${fmtFine(f.span)}`,
        f.sweep === null ? null : `sweep ${fmtFine(f.sweep)}`,
        `thickness ${fmtFine(f.thickness)}`,
      ].filter(Boolean).join(', ');
      // Two lines per fin set (size, then position), so the notes stay about the drawing's width.
      notes.push(`${f.name}: ${f.count} ${f.shape} fin${f.count === 1 ? '' : 's'}; ${dims}.`);
      notes.push(`  Root leading edge ${fmtFine(f.leadingEdgeFromTip)} from the tip (${fmtFine(f.fromTubeFront)} behind the front of “${f.tubeName}”).`);
    }
  }
  if (marks !== undefined) {
    const missing = [marks.cg === null ? 'CG' : null, marks.cp === null ? 'CP' : null].filter(Boolean).join(' and ');
    if (missing) notes.push(`${missing} not marked: ${marks.unavailable ?? 'not available for this design'}.`);
  }
  if (options.exportedAt !== undefined) {
    notes.push(`Exported ${formatLocalTimestamp(options.exportedAt, { timeZone: options.timeZone })} from Astraea.`);
  }
  const notesTop = cy + PX(maxHalf) + 44 + (markLabels.length > 0 ? markLabels.length * 14 + 10 : 0);
  // A note starting with two spaces continues the one above, indented (SVG collapses the spaces themselves).
  const noteX = (line: string): number => (line.startsWith('  ') ? 16 : 0);
  const noteEls = notes.map((line, i) => `<text x="${noteX(line)}" y="${n2(notesTop + i * 15)}" class="bp-note">${esc(line.trim())}</text>`);

  // Bound the actual drawing, including text and fin tips beyond the axial
  // body. Bézier control points are conservative bounds for the curves.
  let left = 0, right = PX(totalLength), top = cy - PX(maxHalf), bottom = cy + PX(maxHalf);
  const include = (x: number, y: number) => {
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  };
  const includeText = (x: number, y: number, text: string, total = false) => {
    const halfWidth = text.length * (total ? 9 : 8) / 2;
    include(x - halfWidth, y - (total ? 15 : 13));
    include(x + halfWidth, y + 4);
  };
  for (const seg of segments) {
    const x0 = PX(seg.x0), x1 = PX(seg.x1), mid = (x0 + x1) / 2;
    const r = Math.max(seg.rFore, seg.rAft);
    include(x0, cy - PX(r)); include(x1, cy + PX(r));
    if (seg.kind === 'trapezoidfinset' || seg.kind === 'ellipticalfinset' || seg.kind === 'freeformfinset') {
      const span = seg.span ?? 0;
      const tipY = cy - PX(seg.rAft + span);
      if (seg.kind === 'trapezoidfinset') {
        include(x0 + PX((seg.sweep ?? 0) + (seg.tipChord ?? 0)), tipY);
        include(x0 + PX(seg.sweep ?? 0), tipY);
      } else if (seg.kind === 'ellipticalfinset') {
        include(mid, cy - PX(seg.rAft + 2 * span));
      } else {
        for (const p of seg.points ?? []) include(x0 + PX(p.x), cy - PX(seg.rAft + p.y));
      }
      includeText(mid, tipY - 8, `Span ${fmtLen(span)}`);
    } else {
      includeText(mid, cy - PX(r) - 8, fmtLen(seg.x1 - seg.x0));
      if (seg.kind !== 'nosecone') includeText(mid, cy + PX(r) + 16, fmtDia(2 * r));
    }
  }
  includeText(PX(totalLength) / 2, cy + PX(maxHalf) + 26, `Total Length: ${fmtLen(totalLength)}`, true);
  for (const label of markLabels) includeText(label.x, label.y, label.text);
  // A mark is on the axis; its symbol reaches 6 px either side of it.
  for (const mx of markExtents) { include(mx, cy - 6); include(mx, cy + 6); }
  notes.forEach((line, i) => {
    // Left-anchored note lines, with the same conservative 8 px per
    // character the centred labels use.
    include(noteX(line), notesTop + i * 15 - 13);
    include(noteX(line) + line.trim().length * 8, notesTop + i * 15 + 4);
  });
  // Round outward so serialization cannot shave off a boundary.
  const viewX = Math.floor((left - marginX) * 100) / 100;
  const viewY = Math.floor((top - marginX) * 100) / 100;
  const viewRight = Math.ceil((right + marginX) * 100) / 100;
  const viewBottom = Math.ceil((bottom + marginX) * 100) / 100;
  const viewW = viewRight - viewX, viewH = viewBottom - viewY;

  // Dimension grid every 0.1 m along the airframe body.
  const gridEls: string[] = [];
  for (let gx = 0.1; gx < totalLength; gx += 0.1) {
    gridEls.push(
      `<line class="bp-grid" x1="${n2(PX(gx))}" y1="${n2(viewY)}" x2="${n2(PX(gx))}" y2="${n2(viewBottom)}" />`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" class="bp-${theme}" width="${n2(viewW)}" height="${n2(viewH)}" viewBox="${n2(viewX)} ${n2(viewY)} ${n2(viewW)} ${n2(viewH)}">`,
    `<title>${esc(vehicle.name)} — Blueprint</title>`,
    `<desc>Side-view outer-mold-line blueprint of ${esc(vehicle.name)}. Total length ${fmtLen(totalLength)}, max diameter ${fmtDia(maxBodyD)}.</desc>`,
    `<style>`,
    `.bp-dark{--bp-bg:#0b1420;--bp-grid:#141f2e;--bp-shape:#58a6ff;--bp-shape-fill:#0f2038;--bp-fin:#58a6ff;--bp-fin-fill:#0d2a4a;--bp-label:#c9d1d9;--bp-total:#f78166}`,
    `.bp-light{--bp-bg:#ffffff;--bp-grid:#d9dfe8;--bp-shape:#1f5fd0;--bp-shape-fill:#eaf2fc;--bp-fin:#1f5fd0;--bp-fin-fill:#dbe8f9;--bp-label:#26313c;--bp-total:#b45309}`,
    `.bp-bg{fill:var(--bp-bg)}`,
    `.bp-grid{stroke:var(--bp-grid);stroke-width:0.5}`,
    `.bp-shape{stroke:var(--bp-shape);stroke-width:1.6;fill:var(--bp-shape-fill)}`,
    `.bp-fin{stroke:var(--bp-fin);stroke-width:1.4;fill:var(--bp-fin-fill)}`,
    `.bp-label{fill:var(--bp-label);font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`,
    `.bp-total{fill:var(--bp-total);font:bold 13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`,
    `.bp-note{fill:var(--bp-label);font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`,
    `.bp-cg circle,.bp-cp circle{fill:var(--bp-bg);stroke:var(--bp-total);stroke-width:1.4}`,
    `.bp-cg polygon,.bp-cp circle+circle{fill:var(--bp-total);stroke:none}`,
    `.bp-leader{stroke:var(--bp-total);stroke-width:0.8;stroke-dasharray:2 2}`,
    `.bp-mark-label{fill:var(--bp-total);font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`,
    `</style>`,
    `<rect class="bp-bg" x="${n2(viewX)}" y="${n2(viewY)}" width="${n2(viewW)}" height="${n2(viewH)}" />`,
    ...gridEls,
    ...shapeEls,
    ...labelEls,
    `<text x="${n2((totalLength * scale) / 2)}" y="${n2(cy + maxHalf * scale + 26)}" text-anchor="middle" class="bp-total">Total Length: ${fmtLen(totalLength)}</text>`,
    ...markEls,
    ...noteEls,
    `</svg>`,
  ].join('\n');
}
