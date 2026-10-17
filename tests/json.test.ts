import { expect, it, vi } from 'vitest';
import { parseJson } from '../src/core/json';

it.each([
  '-0',
  '1.0',
  '1e3',
  '9007199254740993',
  '-9007199254740993',
  '9007199254740992',
  '0.10000000000000000001',
  '1.00000000000000000001',
  '1e400',
  '1e-400',
  '9.007199254740993e15',
])('preserves the original numeric text for %s', (token) => {
  const parsed = parseJson(`{"value":${token}}`);
  expect(JSON.stringify(parsed)).toBe(`{"value":${token}}`);
});

it('preserves JSON numeric types without treating user objects as raw numbers', () => {
  const source =
    '{"number":9007199254740993,"string":"9007199254740993","decimal":0.10000000000000000001,"object":{"rawJSON":"9007199254740993"}}';
  expect(JSON.stringify(parseJson(source))).toBe(source);
});

it('requires native lossless JSON support instead of silently rounding numbers', () => {
  vi.stubGlobal('JSON', { ...JSON, rawJSON: undefined });
  try {
    expect(() => parseJson('{"value":9007199254740993}')).toThrow('升级浏览器');
  } finally {
    vi.unstubAllGlobals();
  }
});

it('rejects an implementation without reviver source text access', () => {
  const nativeParse = JSON.parse;
  const mock = vi.spyOn(JSON, 'parse').mockImplementation((source, reviver) => {
    return nativeParse(source, (key, value) =>
      reviver ? reviver(key, value) : value,
    );
  });
  try {
    expect(() => parseJson('{"value":9007199254740993}')).toThrow('数值源文本');
  } finally {
    mock.mockRestore();
  }
});

it('keeps safe integers, booleans, null, strings and nested structures', () => {
  const source = String.raw`{"offset":0,"count":50,"negative":-12,"safe":9007199254740991,"array":[true,false,null,"9007199254740993",{"text":"quote: \" 1.23 \\ end","id":9007199254740993}]}`;
  expect(parseJson(source)).toEqual({
    offset: 0,
    count: 50,
    negative: -12,
    safe: 9007199254740991,
    array: [
      true,
      false,
      null,
      '9007199254740993',
      {
        text: 'quote: " 1.23 \\ end',
        id: JSON.rawJSON('9007199254740993'),
      },
    ],
  });
});

it.each([
  '{9007199254740993:1}',
  '{"value":09007199254740993}',
  '{"value":+9007199254740993}',
  '{"value":1.}',
  '{"value":NaN}',
  '{"value":Infinity}',
  '{"value":9007199254740993,}',
])('never repairs invalid JSON: %s', (source) => {
  expect(() => parseJson(source)).toThrow(SyntaxError);
});
