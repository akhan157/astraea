/**
 * Astraea Metric HUD
 * Live aerospace stability status banner displaying static margin, CG, CP, and airframe dimensions.
 */

import React from 'react';
import { useRocketStore } from '../store/rocketStore';
import { ShieldAlert, ShieldCheck, AlertTriangle } from 'lucide-react';

export const MetricHUD: React.FC = () => {
  const stability = useRocketStore((s) => s.stability);

  const margin = stability.staticMarginCalibers;
  const isOverStable = stability.isOverStable;
  const isMarginal = margin >= 0.5 && margin < 1.0;
  const isUnstable = margin < 0.5;

  let statusBadge = {
    text: 'OPTIMAL STABILITY',
    bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    icon: ShieldCheck,
  };

  if (isUnstable) {
    statusBadge = {
      text: 'AERODYNAMICALLY UNSTABLE',
      bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
      icon: ShieldAlert,
    };
  } else if (isMarginal) {
    statusBadge = {
      text: 'MARGINAL STABILITY',
      bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
      icon: AlertTriangle,
    };
  } else if (isOverStable) {
    statusBadge = {
      text: 'OVERSTABLE (WINDCOCK RISK)',
      bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      icon: AlertTriangle,
    };
  }

  const StatusIcon = statusBadge.icon;

  const lengthMm = (stability.totalLength * 1000).toFixed(0);
  const diamMm = (stability.maxDiameter * 1000).toFixed(1);
  const massGrams = stability.totalMass < 1 ? (stability.totalMass * 1000).toFixed(1) + ' g' : stability.totalMass.toFixed(2) + ' kg';
  const cgMm = (stability.cg * 1000).toFixed(0);
  const cpMm = (stability.cp * 1000).toFixed(0);
  const fineness = stability.maxDiameter > 0 ? (stability.totalLength / stability.maxDiameter).toFixed(1) : '—';

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 px-4 py-2 bg-zinc-900/90 backdrop-blur-md rounded-xl border border-zinc-800 shadow-2xl select-none">
      {/* Stability Margin Caliber Badge */}
      <div className="flex items-center gap-2 pr-3 border-r border-zinc-800">
        <div className={`px-2.5 py-1 rounded-lg border flex items-center gap-1.5 text-xs font-mono font-bold ${statusBadge.bg}`}>
          <StatusIcon className="w-3.5 h-3.5" />
          <span>{margin.toFixed(2)} cal</span>
          <span className="text-[10px] opacity-80 uppercase tracking-wider font-sans font-semibold">
            {statusBadge.text.split(' ')[0]}
          </span>
        </div>
      </div>

      {/* Physics Metric Stats */}
      <div className="flex items-center gap-4 text-xs font-mono">
        {/* CG */}
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> CG
          </span>
          <span className="font-semibold text-zinc-200">{cgMm} mm</span>
        </div>

        {/* CP */}
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> CP
          </span>
          <span className="font-semibold text-zinc-200">{cpMm} mm</span>
        </div>

        {/* Mass */}
        <div className="flex flex-col">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Mass</span>
          <span className="font-semibold text-zinc-200">{massGrams}</span>
        </div>

        {/* Length x Diameter */}
        <div className="flex flex-col hidden sm:flex">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Length × Dia</span>
          <span className="font-semibold text-zinc-200">
            {lengthMm} × {diamMm} mm
          </span>
        </div>

        {/* Fineness Ratio */}
        <div className="flex flex-col hidden md:flex">
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider">L / D</span>
          <span className="font-semibold text-zinc-200">{fineness}:1</span>
        </div>
      </div>
    </div>
  );
};
