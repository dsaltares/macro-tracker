import { readFileSync, writeFileSync } from 'node:fs';
import { sampleFixturePath } from '../lib/data/sources/fixture.ts';
import {
  offSampleCsv,
  offSamplePath,
  readOffExportHeader,
} from './off-sample.ts';

const csv = offSampleCsv(
  readFileSync(sampleFixturePath, 'utf8'),
  readOffExportHeader(),
);
writeFileSync(offSamplePath, csv);
console.log(
  `Wrote ${csv.trim().split('\n').length - 1} lines to ${offSamplePath}`,
);
