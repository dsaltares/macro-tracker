import { readFile } from 'node:fs/promises';
import readXlsxFile, { type Row } from 'read-excel-file/node';
import writeXlsxFile, { type Cell } from 'write-excel-file/node';
import { cofidSheets } from '../lib/data/sources/cofid/mapping.ts';
import { cofidWorkbookUrl } from '../lib/data/sources/cofid/workbook.ts';

const samplePath = 'test/fixtures/cofid/sample.xlsx';
const headerRows = 3;

const sampleCodes = new Set([
  '11-1146',
  '12-491',
  '13-145',
  '13-669',
  '13-880',
  '14-319',
  '14-870',
  '16-386',
  '17-506',
  '18-323',
]);

const workbookBytes = async (location: string) => {
  if (!/^https?:/.test(location)) {
    return readFile(location);
  }
  const response = await fetch(location);
  if (!response.ok) {
    throw new Error(`${location} answered ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
};

const plainCell = (cell: Row[number]): Cell =>
  typeof cell === 'string' || typeof cell === 'number' ? cell : null;

const run = async () => {
  const [location = cofidWorkbookUrl] = process.argv.slice(2);
  const sheets = await readXlsxFile(await workbookBytes(location));
  const trimmed = cofidSheets.map((name) => {
    const data = sheets.find(({ sheet }) => sheet === name)?.data;
    if (!data) {
      throw new Error(`${location} has no sheet ${name}`);
    }
    return {
      sheet: name,
      data: [
        ...data.slice(0, headerRows),
        ...data
          .slice(headerRows)
          .filter((row) => sampleCodes.has(String(row[0]).trim())),
      ].map((row) => row.map(plainCell)),
    };
  });
  await writeXlsxFile(trimmed).toFile(samplePath);
  console.log(
    `Wrote ${(trimmed[0]?.data.length ?? headerRows) - headerRows} foods to ${samplePath}`,
  );
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
