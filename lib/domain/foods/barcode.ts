const eanLengths = new Set([8, 13]);
const upcALength = 12;
const allDigits = /^\d+$/;

const checkDigitOf = (payload: string) => {
  const weighted = [...payload]
    .reverse()
    .reduce(
      (total, digit, index) =>
        total + Number(digit) * (index % 2 === 0 ? 3 : 1),
      0,
    );
  return (10 - (weighted % 10)) % 10;
};

export const isValidBarcode = (code: string) =>
  allDigits.test(code) &&
  eanLengths.has(code.length) &&
  checkDigitOf(code.slice(0, -1)) === Number(code.at(-1));

export const normaliseBarcode = (code: string): string | null => {
  const digits = code.trim();
  const ean = digits.length === upcALength ? `0${digits}` : digits;
  return isValidBarcode(ean) ? ean : null;
};
