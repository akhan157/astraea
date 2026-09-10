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
 */

import { RocketVehicle } from '../core/types';

/** A blueprint stroke in SI units, resolved against the assembled axis. */
interface Segment {
  kind: 'nosecone' | 'bodytube' | 'transition' | 'trapezoidfinset' | 'ellipticalfinset';
  x0: number; // meters, fore station
  x1: number; // meters, aft station
  rFore: number; // meters, body half-height at the fore edge
  rAft: number; // meters, body half-height at the aft edge
  span?: number; // meters, fin height above the body (fins only)
  sweep?: number; // meters, axial offset of the fin tip leading edge (trapezoid only)
  tipChord?: number; // meters, tip chord length (trapezoid only)
}

const fmtLen = (m: number): string => `${m.toFixed(2)} m`;
const fmtDia = (m: number): string => `Ø${m.toFixed(3)} m`;

export function exportBlueprintSvg(vehicle: RocketVehicle): string {
  if (!vehicle || !Array.isArray(vehicle.components) || vehicle.components.length === 0) {
    throw new Error('blueprint export: vehicle needs at least one component');
  }

  const segments: Segment[] = [];
  let x = 0; // meters, aft station of the last axial component (nose tip = 0)
  let tubeFront = 0; // meters, front station of the current enclosing body tube
  let bodyD = 0; // meters, running body diameter for fin roots
  let maxBodyD = 0; // meters, widest airframe body diameter
  let maxHalf = 0; // meters, widest feature half-height incl. fin span
  let axialSeen = false;

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
        maxHalf = Math.max(maxHalf, r + c.span);
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
  const viewW = totalLength * scale + 2 * marginX;
  const viewH = 2 * cy;

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

    if (seg.kind === 'trapezoidfinset' || seg.kind === 'ellipticalfinset') {
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

  // Dimension grid every 0.1 m along the airframe body.
  const gridEls: string[] = [];
  for (let gx = 0.1; gx < totalLength; gx += 0.1) {
    gridEls.push(
      `<line class="bp-grid" x1="${n2(PX(gx))}" y1="0" x2="${n2(PX(gx))}" y2="${n2(viewH)}" />`,
    );
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n2(viewW)}" height="${n2(viewH)}" viewBox="${n2(-marginX)} ${n2(-cy)} ${n2(viewW)} ${n2(viewH)}">`,
    `<title>${esc(vehicle.name)} — Blueprint</title>`,
    `<desc>Side-view outer-mold-line blueprint of ${esc(vehicle.name)}. Total length ${fmtLen(totalLength)}, max diameter ${fmtDia(maxBodyD)}.</desc>`,
    `<style>`,
    `.bp-bg{fill:#0b1420}`,
    `.bp-grid{stroke:#141f2e;stroke-width:0.5}`,
    `.bp-shape{stroke:#58a6ff;stroke-width:1.6;fill:#0f2038}`,
    `.bp-fin{stroke:#58a6ff;stroke-width:1.4;fill:#0d2a4a}`,
    `.bp-label{fill:#c9d1d9;font:11px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`,
    `.bp-total{fill:#f78166;font:bold 13px ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}`,
    `</style>`,
    `<rect class="bp-bg" x="${n2(-marginX)}" y="${n2(-cy)}" width="${n2(viewW)}" height="${n2(viewH)}" />`,
    ...gridEls,
    ...shapeEls,
    ...labelEls,
    `<text x="${n2((totalLength * scale) / 2)}" y="${n2(cy + maxHalf * scale + 26)}" text-anchor="middle" class="bp-total">Total Length: ${fmtLen(totalLength)}</text>`,
    `</svg>`,
  ].join('\n');
}
