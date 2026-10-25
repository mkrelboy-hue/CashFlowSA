// Exact money handling: integer cents only.

export class ValidationError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'ValidationError';
    this.field = field;
    this.status = 422;
  }
}

/** Parse a rand amount such as "1500", "1 500,50" or "R1,500.50" into integer cents. */
export function parseRandsToCents(input, field = 'amount') {
  if (typeof input === 'number') input = String(input);
  if (typeof input !== 'string') throw new ValidationError('Enter an amount.', field);
  let s = input.trim().replace(/^R\s*/i, '').replace(/\s/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');   // 1,500.50
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(',', '.');                // 1500,50
  const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new ValidationError('Enter a valid rand amount, for example 1500.00.', field);
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || 0);
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new ValidationError('Amount must be greater than zero.', field);
  return cents;
}

export function formatRand(cents) {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const rands = Math.floor(abs / 100);
  const c = abs % 100;
  const grouped = String(rands).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}R${grouped}${c ? '.' + String(c).padStart(2, '0') : ''}`;
}
