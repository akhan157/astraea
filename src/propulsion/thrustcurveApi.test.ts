/**
 * ThrustCurve.org API client tests (C4, engine only).
 *
 * Contracts under test: search response mapping to validated MotorSummary
 * records (finite/positive, absent fields dropped, never fabricated),
 * fail-closed on HTTP errors with Retry-After surfaced, TTL cache behaviour,
 * and the search -> download -> parse round trip into parseRaspEng/
 * parseRseXml. Fetch is fully mocked — no network in tests.
 */
import { describe, it, expect, vi } from 'vitest';
import { searchMotors, downloadMotorSimfile, ThrustCurveApiError } from './thrustcurveApi';
import { parseRaspEng, parseRseXml } from '../formats/engParser';

const SAMPLE_ENG = [
  '; Estes C6 certified thrust curve (RASP .eng layout)',
  'Estes C6 18 70 Estes 8.8 6.06 14.2 0.0125 0.0248',
  '0.00 0.0',
  '0.08 4.5',
  '0.18 14.2',
  '0.28 8.5',
  '0.50 4.8',
  '1.00 4.4',
  '1.50 4.2',
  '1.86 0.0',
  '',
].join('\n');

const SAMPLE_RSE = `<?xml version="1.0" encoding="UTF-8"?>
<rocket-engine-data>
  <motor-type>solid</motor-type>
  <manufacturer>Estes</manufacturer>
  <code>C6</code>
  <description>Estes C6-3</description>
  <diameter>18</diameter>
  <length>70</length>
  <init-weight>24.8</init-weight>
  <prop-weight>12.5</prop-weight>
  <burn-time>1.86</burn-time>
  <avg-thrust>6.06</avg-thrust>
  <peak-thrust>14.2</peak-thrust>
  <data>
    <data-point><time>0.00</time><thrust>0</thrust></data-point>
    <data-point><time>0.08</time><thrust>4.5</thrust></data-point>
    <data-point><time>0.18</time><thrust>14.2</thrust></data-point>
    <data-point><time>0.28</time><thrust>8.5</thrust></data-point>
    <data-point><time>0.50</time><thrust>4.8</thrust></data-point>
    <data-point><time>1.00</time><thrust>4.4</thrust></data-point>
    <data-point><time>1.50</time><thrust>4.2</thrust></data-point>
    <data-point><time>1.86</time><thrust>0</thrust></data-point>
  </data>
</rocket-engine-data>`;

const b64 = (text: string) => btoa(String.fromCharCode(...new TextEncoder().encode(text)));

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

/** Mock fetch consuming one canned Response per call, recording RequestInit. */
function fetchMock(...responses: Response[]) {
  const calls: RequestInit[] = [];
  const fn = vi.fn(async (_url: string, init?: RequestInit) => {
    calls.push(init ?? {});
    const next = responses.shift();
    if (!next) throw new Error('unexpected fetch call');
    return next;
  });
  return { fn, calls };
}

const C6_RESULT = {
  motorId: '5872d0980002310000000015',
  manufacturer: 'Estes Industries',
  manufacturerAbbrev: 'Estes',
  designation: 'C6',
  commonName: 'C6',
  impulseClass: 'C',
  diameter: 18,
  length: 70,
  avgThrustN: 4.7,
  maxThrustN: 14.1,
  totImpulseNs: 8.8,
  burnTimeS: 1.9,
  dataFiles: 3,
};

async function caught<T>(p: Promise<T>): Promise<unknown> {
  try {
    await p;
    return undefined;
  } catch (err) {
    return err;
  }
}

describe('searchMotors', () => {
  it('maps a search response to validated MotorSummary records', async () => {
    const { fn, calls } = fetchMock(jsonResponse({ results: [C6_RESULT] }));
    const summaries = await searchMotors({ designation: 'C6' }, fn, { baseUrl: 'https://search.test' });

    expect(summaries).toEqual([
      {
        id: '5872d0980002310000000015',
        designation: 'C6',
        manufacturer: 'Estes Industries',
        totalImpulseNs: 8.8,
        avgThrustN: 4.7,
        burnTimeS: 1.9,
        diameterMm: 18,
        lengthMm: 70,
      },
    ]);
    const firstCall = calls[0];
    if (!firstCall) throw new Error('expected a search request');
    expect(JSON.parse(String(firstCall.body))).toEqual({ designation: 'C6' });
  });

  it('falls back to manufacturerAbbrev when the full name is absent', async () => {
    const { manufacturer: _manufacturer, ...rest } = C6_RESULT;
    const { fn } = fetchMock(jsonResponse({ results: [{ ...rest, length: 70 }] }));
    const [summary] = await searchMotors({ manufacturer: 'Estes' }, fn, { baseUrl: 'https://search.test1' });
    if (!summary) throw new Error('expected exactly one summary');
    expect(summary.manufacturer).toBe('Estes');
  });

  it('drops records with non-finite, non-positive, or missing metrics', async () => {
    const { fn } = fetchMock(
      jsonResponse({
        results: [
          C6_RESULT,
          { ...C6_RESULT, motorId: 'neg', avgThrustN: -4.7 },
          { ...C6_RESULT, motorId: 'zero', burnTimeS: 0 },
          { ...C6_RESULT, motorId: 'str', diameter: '18' },
          { ...C6_RESULT, motorId: 'no-length', length: undefined },
          { ...C6_RESULT, motorId: 'no-name', designation: undefined },
          'not-an-object',
        ],
      }),
    );
    const summaries = await searchMotors({ designation: 'C6' }, fn, { baseUrl: 'https://search.test2' });
    expect(summaries.map((s) => s.id)).toEqual(['5872d0980002310000000015']);
  });

  it('throws on structurally invalid payloads', async () => {
    const bad = [
      jsonResponse({ results: 'nope' }),
      jsonResponse([1, 2, 3]),
      jsonResponse({ error: 'Invalid commonName value "X6".' }),
    ];
    for (const response of bad) {
      const { fn } = fetchMock(response);
      const err = await caught(searchMotors({ designation: 'C6' }, fn, { baseUrl: 'https://bad.test' }));
      expect(err).toBeInstanceOf(ThrustCurveApiError);
    }
  });

  it('rejects an empty query without calling the network', async () => {
    const { fn } = fetchMock();
    const err = await caught(searchMotors({}, fn, { baseUrl: 'https://noop.test' }));
    expect(err).toBeInstanceOf(ThrustCurveApiError);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('searchMotors error handling', () => {
  it('surfaces HTTP status and Retry-After on rate limits', async () => {
    const { fn } = fetchMock(new Response('rate limited', { status: 429, headers: { 'retry-after': '120' } }));
    const err = await caught(searchMotors({ designation: 'C6' }, fn, { baseUrl: 'https://err.test' }));
    expect(err).toBeInstanceOf(ThrustCurveApiError);
    expect((err as ThrustCurveApiError).status).toBe(429);
    expect((err as ThrustCurveApiError).retryAfterSeconds).toBe(120);
  });

  it('throws fail-closed on 5xx and on transport failures', async () => {
    const server = fetchMock(new Response('boom', { status: 503 }));
    const err = await caught(searchMotors({ designation: 'C6' }, server.fn, { baseUrl: 'https://err.test1' }));
    expect(err).toBeInstanceOf(ThrustCurveApiError);
    expect((err as ThrustCurveApiError).status).toBe(503);
    expect((err as ThrustCurveApiError).retryAfterSeconds).toBeUndefined();

    const network = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const netErr = await caught(searchMotors({ designation: 'C6' }, network, { baseUrl: 'https://err.test2' }));
    expect(netErr).toBeInstanceOf(ThrustCurveApiError);
    expect((netErr as ThrustCurveApiError).status).toBe(0);
    expect((netErr as Error).message).toContain('ECONNRESET');
  });
});

describe('searchMotors cache', () => {
  it('serves identical queries from cache within TTL and refetches after expiry', async () => {
    vi.useFakeTimers();
    try {
      const baseUrl = 'https://cache.test';
      const { fn } = fetchMock(
        jsonResponse({ results: [C6_RESULT] }),
        jsonResponse({ results: [C6_RESULT] }),
      );
      const options = { baseUrl, cacheTtlMs: 1000 };
      const query = { designation: 'C6' };

      const first = await searchMotors(query, fn, options);
      await searchMotors(query, fn, options);
      expect(first.length).toBe(1);
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(999);
      await searchMotors(query, fn, options);
      expect(fn).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2);
      await searchMotors(query, fn, options);
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not share cache entries between different queries', async () => {
    const baseUrl = 'https://cache.test1';
    const { fn } = fetchMock(
      jsonResponse({ results: [C6_RESULT] }),
      jsonResponse({ results: [C6_RESULT] }),
    );
    await searchMotors({ designation: 'C6' }, fn, { baseUrl });
    await searchMotors({ designation: 'C6', maxResults: 10 }, fn, { baseUrl });
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('downloadMotorSimfile', () => {
  it('downloads a certified RASP .eng that parseRaspEng consumes (round trip)', async () => {
    const motorId = '5872d0980002310000000015';
    const { fn, calls } = fetchMock(
      jsonResponse({
        results: [{ motorId, simfileId: 'sim1', format: 'RASP', source: 'cert', data: b64(SAMPLE_ENG) }],
      }),
    );
    const text = await downloadMotorSimfile(motorId, fn, { baseUrl: 'https://dl.test' });
    expect(text).toBe(SAMPLE_ENG);

    expect(calls[0].method).toBe('POST');
    expect(JSON.parse(String(calls[0].body))).toEqual({ motorIds: [motorId], format: 'RASP', data: 'file' });

    const spec = parseRaspEng(text);
    expect(spec.designation).toBe('Estes C6');
    expect(spec.diameter).toBeCloseTo(0.018, 6);
    expect(spec.burnTime).toBeCloseTo(1.86, 3);
  });

  it('falls back to RockSim .rse when no RASP file exists', async () => {
    const motorId = 'rocket-rs';
    const { fn, calls } = fetchMock(
      jsonResponse({ results: [] }),
      jsonResponse({ results: [{ motorId, simfileId: 'sim2', format: 'RockSim', source: 'mfr', data: b64(SAMPLE_RSE) }] }),
    );
    const text = await downloadMotorSimfile(motorId, fn, { baseUrl: 'https://dl.test1' });
    expect(fn).toHaveBeenCalledTimes(2);
    const rockSimCall = calls[1];
    if (!rockSimCall) throw new Error('expected a RockSim download request');
    expect(JSON.parse(String(rockSimCall.body))).toEqual({ motorIds: [motorId], format: 'RockSim', data: 'file' });

    const spec = parseRseXml(text);
    expect(spec.designation).toBe('Estes C6');
    expect(spec.manufacturer).toBe('Estes');
    expect(spec.diameter).toBeCloseTo(0.018, 6);
  });

  it('prefers certified simfiles over user uploads', async () => {
    const motorId = 'm1';
    const certified = '; certified file\nEstes C6 18 70 Estes 8.8 6.06 14.2 0.0125 0.0248\n0 0\n1 0\n';
    const { fn } = fetchMock(
      jsonResponse({
        results: [
          { motorId, simfileId: 'u', format: 'RASP', source: 'user', data: b64('; user junk\n') },
          { motorId, simfileId: 'c', format: 'RASP', source: 'cert', data: b64(certified) },
        ],
      }),
    );
    const text = await downloadMotorSimfile(motorId, fn, { baseUrl: 'https://dl.test2' });
    expect(text).toBe(certified);
  });

  it('fails closed when no simfile exists for the motor', async () => {
    const { fn } = fetchMock(jsonResponse({ results: [] }), jsonResponse({ results: [] }));
    const err = await caught(downloadMotorSimfile('ghost', fn, { baseUrl: 'https://dl.test3' }));
    expect(err).toBeInstanceOf(ThrustCurveApiError);
    expect(fn).toHaveBeenCalledTimes(2); // RASP then RockSim, both empty
  });

  it('fails closed on undecodable simfile data and on HTTP errors', async () => {
    const motorId = 'bad';
    const { fn } = fetchMock(
      jsonResponse({ results: [{ motorId, simfileId: 's', format: 'RASP', source: 'cert', data: '!!!not-base64!!!' }] }),
    );
    const err = await caught(downloadMotorSimfile(motorId, fn, { baseUrl: 'https://dl.test4' }));
    expect(err).toBeInstanceOf(ThrustCurveApiError);

    const httpOnly = fetchMock(new Response('gone', { status: 404, headers: { 'retry-after': '30' } }));
    const httpErr = await caught(downloadMotorSimfile('x', httpOnly.fn, { baseUrl: 'https://dl.test5' }));
    expect(httpErr).toBeInstanceOf(ThrustCurveApiError);
    expect((httpErr as ThrustCurveApiError).status).toBe(404);
    expect((httpErr as ThrustCurveApiError).retryAfterSeconds).toBe(30);
  });
});