// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MomentArmHistoryPanel } from './MomentArmHistoryPanel';
import { momentArmHistoryFixture } from '../../application/momentArmHistory.fixture';

afterEach(cleanup);
it('labels recorded sampled model output without asserting stability/qualification',()=>{
  render(<MomentArmHistoryPanel history={momentArmHistoryFixture()} engineIdentity={{kind:'production-rust-wasm',sha256:'b'.repeat(64)}} inputKey="recorded-input" />);
  expect(screen.getByText('Sampled flight-model normal moment arm')).toBeTruthy();
  expect(screen.getByText(/No dynamic-stability, continuous-minimum or competition assessment/)).toBeTruthy();
  expect(screen.getByText(/No exact burnout sample. The nearest sample is not relabeled as burnout./)).toBeTruthy();
  expect(screen.getByText(/2 raw committed-macro samples/)).toBeTruthy();
  expect(screen.getByRole('img',{name:'Recorded CG and normal CP stations (meters)'})).toBeTruthy();
  expect(screen.getByRole('img',{name:'Recorded normal moment arm (calibers)'})).toBeTruthy();
  expect(screen.getByText(/Recorded engine:/).textContent).toContain('b'.repeat(64));
  expect(screen.getByText(/C-weighted arm = J − C·CG \(m\/rad\)/)).toBeTruthy();
  expect(screen.getByText(/Physical accuracy for collegiate stability decisions remains unestablished./)).toBeTruthy();
});
it('never promotes an exact burn-time sample to an independently observed burnout',()=>{
  const h=momentArmHistoryFixture();h.exactBurnoutSampleExists=true;h.points[1]={...h.points[1],timeS:h.burnoutTimeS,powered:false};
  render(<MomentArmHistoryPanel history={h}/>);
  expect(screen.getByText(/An exact timestamp sample exists; this is not an independently observed burnout./)).toBeTruthy();
  expect(screen.getByText(/before declared burnout/)).toBeTruthy();
  expect(screen.queryByText(/observed burnout:/)).toBeNull();
});
it('selects an actual retained point rather than evaluating an interior state',()=>{
  const history=momentArmHistoryFixture(); const {container}=render(<MomentArmHistoryPanel history={history} />);
  fireEvent.change(screen.getByLabelText('Recorded history point'),{target:{value:'1'}});
  expect(container.querySelector('[data-history-selected-time]')?.getAttribute('data-history-selected-time')).toBe(String(history.points[1].timeS));
  expect(screen.getByText('0.12345679')).toBeTruthy();
  expect(screen.getByText('12.345679°')).toBeTruthy();
  expect(history.points[1].mach).toBe(.123456789);
});
it('keeps live-canopy normal quantities N/A and does not plot a zero substitute',()=>{
  const h=momentArmHistoryFixture();h.points.forEach(p=>{p.recovery=true;p.normal=null;p.normalApplicability='not-applicable-live-canopy';});
  render(<MomentArmHistoryPanel history={h}/>);
  expect(screen.getAllByText('N/A — live canopy')).toHaveLength(5);
  expect(screen.getByText('Normal arm N/A — live canopy; no airframe values to plot.')).toBeTruthy();
  expect(screen.queryByRole('img',{name:'Recorded normal moment arm (calibers)'})).toBeNull();
  expect(screen.getByText('0.30000000 m')).toBeTruthy();
});
it('retains historical/stale attribution and explicit unknown engine rather than querying a current one',()=>{
  const {rerender}=render(<MomentArmHistoryPanel history={momentArmHistoryFixture()} stale />);
  expect(screen.getByRole('status').textContent).toContain('Stale result — inputs changed');
  rerender(<MomentArmHistoryPanel history={momentArmHistoryFixture()} historical />);
  expect(screen.getByText('Historical record — not a fresh simulation.')).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.getByText(/Recorded engine:/).textContent).toMatch(/unknown/i);
});
it('old absence is unavailable without a fabricated array or implicit rerun',()=>{
  render(<MomentArmHistoryPanel historical />);
  expect(screen.getByText(/History unavailable — not recorded for this run/)).toBeTruthy();
  expect(screen.queryByLabelText('Recorded history point')).toBeNull();
});
