import { describe, expect, it } from 'vitest';
import { type XmlRecord, xmlRecords } from './xml.ts';

const bytesOf = (text: string) => new TextEncoder().encode(text);

async function* chunked(bytes: Uint8Array, size: number) {
  for (let at = 0; at < bytes.byteLength; at += size) {
    yield bytes.subarray(at, at + size);
  }
}

const readAll = async (text: string, tag: string, size = 64) => {
  const records: XmlRecord[] = [];
  for await (const record of xmlRecords(chunked(bytesOf(text), size), tag)) {
    records.push(record);
  }
  return records;
};

const table = `﻿<?xml version="1.0" encoding="utf-8" ?>\r
<TABLE>\r
   <ALIM>\r
      <alim_code> 12061 </alim_code>\r
      <alim_nom_fr> Fromage type feta, au lait de brebis 100% </alim_nom_fr>\r
      <alim_nom_eng> Feta or Feta-type cheese, 100% from ewe&apos;s milk </alim_nom_eng>\r
      <alim_nom_sci missing=" " />\r
   </ALIM>\r
   <ALIM>\r
      <alim_code> 20503 </alim_code>\r
      <alim_nom_fr> Haricot rouge, bouilli/cuit à l&apos;eau </alim_nom_fr>\r
      <teneur> &lt; 0,01 </teneur>\r
   </ALIM>\r
</TABLE>\r
`;

describe('xmlRecords', () => {
  it('reads each record as its trimmed child elements', async () => {
    expect(await readAll(table, 'ALIM')).toEqual([
      {
        alim_code: '12061',
        alim_nom_fr: 'Fromage type feta, au lait de brebis 100%',
        alim_nom_eng: "Feta or Feta-type cheese, 100% from ewe's milk",
      },
      {
        alim_code: '20503',
        alim_nom_fr: "Haricot rouge, bouilli/cuit à l'eau",
        teneur: '< 0,01',
      },
    ]);
  });

  it('reads the same records however the bytes are split', async () => {
    const whole = await readAll(table, 'ALIM', Number.POSITIVE_INFINITY);

    for (const size of [1, 2, 3, 7]) {
      expect(await readAll(table, 'ALIM', size)).toEqual(whole);
    }
  });

  it('leaves out a child marked missing', async () => {
    const [feta] = await readAll(table, 'ALIM');

    expect(feta).not.toHaveProperty('alim_nom_sci');
  });

  it('decodes every predefined entity', async () => {
    expect(
      await readAll(
        '<ROW><text>&lt;&gt;&amp;&apos;&quot; &amp;lt;</text></ROW>',
        'ROW',
      ),
    ).toEqual([{ text: `<>&'" &lt;` }]);
  });

  it('reads only the records of the tag it is given', async () => {
    expect(await readAll(table, 'COMPO')).toEqual([]);
  });
});
