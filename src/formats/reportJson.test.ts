import { expect, it } from 'vitest';
import { stringifyReportJson } from './reportJson';
it('retains raw binary64 values including nested negative zeros and subnormals',()=>{
  const original={points:[{x:-0,y:0,z:Number.MIN_VALUE,v:0.12345678901234566}],n:1e300};
  const text=stringifyReportJson(original),parsed=JSON.parse(text);
  expect(parsed).toEqual(original);expect(Object.is(parsed.points[0].x,-0)).toBe(true);
  expect(Object.is(parsed.points[0].y,0)).toBe(true);expect(text).toContain('-0.0');
});
it('never corrupts marker-like values, keys or escaped string fragments',()=>{
  const marker='__astraea_negative_zero__';
  const original={[marker]:marker,n:-0,escaped:`prefix"${marker}`,next:marker+'_',nested:[`"${marker}"`,marker+'__']};
  expect(JSON.parse(stringifyReportJson(original))).toEqual(original);
  // An escaped opening quote followed by the real closing quote can contain
  // the quoted marker as a substring without being an equal string token.
  const fragment={n:-0,escaped:`prefix"${marker}`};
  expect(JSON.parse(stringifyReportJson(fragment))).toEqual(fragment);
});
it('keeps standard JSON formatting/omission/null semantics for other data',()=>{
  const original={name:'quoted " text',a:[null,undefined,NaN,Infinity],missing:undefined,zero:0,values:[1.0000000000000002,false]};
  expect(stringifyReportJson(original)).toBe(JSON.stringify(original,null,2));
  expect(stringifyReportJson(original,0)).toBe(JSON.stringify(original));
});
it('preserves root -0 and rejects unencodable/cyclic input rather than guessing',()=>{
  expect(Object.is(JSON.parse(stringifyReportJson(-0)),-0)).toBe(true);
  expect(()=>stringifyReportJson(undefined)).toThrow();expect(()=>stringifyReportJson(1n)).toThrow();
  const cyclic:any={};cyclic.self=cyclic;expect(()=>stringifyReportJson(cyclic)).toThrow();
});
