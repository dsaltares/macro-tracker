import { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';

const endOfCentralDirectorySignature = 0x06054b50;
const centralDirectoryEntrySignature = 0x02014b50;
const localFileHeaderSignature = 0x04034b50;
const endOfCentralDirectoryLength = 22;
const maxCommentLength = 0xffff;
const centralDirectoryEntryLength = 46;
const localFileHeaderLength = 30;
const zip64Marker = 0xffffffff;

const stored = 0;
const deflated = 8;

export type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
};

const endOfCentralDirectory = (zip: Buffer) => {
  const earliest = Math.max(
    0,
    zip.length - endOfCentralDirectoryLength - maxCommentLength,
  );
  for (
    let at = zip.length - endOfCentralDirectoryLength;
    at >= earliest;
    at -= 1
  ) {
    if (zip.readUInt32LE(at) === endOfCentralDirectorySignature) {
      return at;
    }
  }
  throw new Error('Not a zip archive: no end of central directory');
};

export const zipEntries = (zip: Buffer): ZipEntry[] => {
  const end = endOfCentralDirectory(zip);
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  if (at === zip64Marker) {
    throw new Error('Zip64 archives are not supported');
  }
  const entries: ZipEntry[] = [];
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(at) !== centralDirectoryEntrySignature) {
      throw new Error(`Corrupt zip archive: no entry at byte ${at}`);
    }
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const nameStart = at + centralDirectoryEntryLength;
    entries.push({
      name: zip.toString('utf8', nameStart, nameStart + nameLength),
      method: zip.readUInt16LE(at + 10),
      compressedSize: zip.readUInt32LE(at + 20),
      localHeaderOffset: zip.readUInt32LE(at + 42),
    });
    at = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
};

export const findZipEntry = (entries: readonly ZipEntry[], file: string) =>
  entries.find(({ name }) => name === file || name.endsWith(`/${file}`));

export const readZipEntry = (zip: Buffer, entry: ZipEntry): Readable => {
  const at = entry.localHeaderOffset;
  if (zip.readUInt32LE(at) !== localFileHeaderSignature) {
    throw new Error(`Corrupt zip archive: no local header for ${entry.name}`);
  }
  const dataStart =
    at +
    localFileHeaderLength +
    zip.readUInt16LE(at + 26) +
    zip.readUInt16LE(at + 28);
  const data = Readable.from([
    zip.subarray(dataStart, dataStart + entry.compressedSize),
  ]);
  if (entry.method === stored) {
    return data;
  }
  if (entry.method === deflated) {
    return data.compose(createInflateRaw());
  }
  throw new Error(
    `${entry.name} uses compression method ${entry.method}; only stored and deflated are supported`,
  );
};
