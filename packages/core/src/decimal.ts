/**
 * Exact fixed-point string decimal helpers (ROUND_DOWN quantization, zero float precision errors).
 */

export function parseScaled(value: string | number, scale: number): bigint {
  const str = String(value).trim();
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }
  const negative = str.startsWith('-');
  const unsigned = negative ? str.slice(1) : str;
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const padded = (fracPart + '0'.repeat(scale)).slice(0, scale);
  const combined = BigInt(intPart + padded);
  return negative ? -combined : combined;
}

export function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const raw = abs.toString().padStart(scale + 1, '0');
  const intPart = raw.slice(0, raw.length - scale);
  const fracPart = scale > 0 ? raw.slice(raw.length - scale).replace(/0+$/, '') : '';
  const sign = negative && abs > 0n ? '-' : '';
  return fracPart.length > 0 ? `${sign}${intPart}.${fracPart}` : `${sign}${intPart}`;
}

export function quantizeDown(value: string | number, precision: number): string {
  const scaled = parseScaled(value, precision);
  return formatScaled(scaled, precision);
}

export function decimalMul(a: string | number, b: string | number, outPrecision = 8): string {
  const scale = 12;
  const x = parseScaled(a, scale);
  const y = parseScaled(b, scale);
  const prod = (x * y) / (10n ** BigInt(scale));
  const adjusted = outPrecision <= scale
    ? prod / (10n ** BigInt(scale - outPrecision))
    : prod * (10n ** BigInt(outPrecision - scale));
  return formatScaled(adjusted, outPrecision);
}

export function decimalDiv(a: string | number, b: string | number, outPrecision = 8): string {
  const numScale = 12;
  const x = parseScaled(a, numScale);
  const y = parseScaled(b, numScale);
  if (y === 0n) throw new Error('Division by zero in decimal math');
  const quotient = (x * (10n ** BigInt(outPrecision))) / y;
  return formatScaled(quotient, outPrecision);
}

export function decimalCmp(a: string | number, b: string | number): number {
  const scale = 12;
  const x = parseScaled(a, scale);
  const y = parseScaled(b, scale);
  if (x < y) return -1;
  if (x > y) return 1;
  return 0;
}

export function decimalAdd(a: string | number, b: string | number, precision = 8): string {
  const x = parseScaled(a, precision);
  const y = parseScaled(b, precision);
  return formatScaled(x + y, precision);
}

export function decimalSub(a: string | number, b: string | number, precision = 8): string {
  const x = parseScaled(a, precision);
  const y = parseScaled(b, precision);
  return formatScaled(x - y, precision);
}
