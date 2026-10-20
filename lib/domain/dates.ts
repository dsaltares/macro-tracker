const twoDigits = (value: number) => String(value).padStart(2, '0');

export const localDateOf = (instant: Date) =>
  `${instant.getFullYear()}-${twoDigits(instant.getMonth() + 1)}-${twoDigits(instant.getDate())}`;
