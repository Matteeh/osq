import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scriptPath = path.join(repoRoot, 'scripts', 'make-inbox-sound.mjs');
const shippedPath = path.join(repoRoot, 'sounds', 'inbox.wav');

const MAX_BYTES = 4096;

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'osq-inbox-sound-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

/** Run the generator with `node`, into `out` when given, and read the result. */
async function generate(out: string): Promise<Buffer> {
  await execFileAsync(process.execPath, [scriptPath, out]);
  return fs.readFile(out);
}

interface WavHeader {
  readonly riff: string;
  readonly wave: string;
  readonly audioFormat: number;
  readonly channels: number;
  readonly sampleRate: number;
  readonly bitsPerSample: number;
  readonly dataSize: number;
}

function parseWav(buffer: Buffer): WavHeader {
  assert.ok(buffer.length >= 44, 'WAV must hold a 44-byte header');
  return {
    riff: buffer.toString('ascii', 0, 4),
    wave: buffer.toString('ascii', 8, 12),
    audioFormat: buffer.readUInt16LE(20),
    channels: buffer.readUInt16LE(22),
    sampleRate: buffer.readUInt32LE(24),
    bitsPerSample: buffer.readUInt16LE(34),
    dataSize: buffer.readUInt32LE(40),
  };
}

describe('inbox sound file', () => {
  it('regenerated file matches the shipped sounds/inbox.wav', async () => {
    const out = path.join(tmpDir, 'regenerated.wav');
    const regenerated = await generate(out);
    const shipped = await fs.readFile(shippedPath);

    assert.deepEqual(regenerated, shipped);
  });

  it('writes the same bytes every time', async () => {
    const first = await generate(path.join(tmpDir, 'first.wav'));
    const second = await generate(path.join(tmpDir, 'second.wav'));

    assert.deepEqual(first, second);
  });

  it('writes a small mono 16-bit PCM WAV', async () => {
    const buffer = await fs.readFile(shippedPath);
    const header = parseWav(buffer);

    assert.equal(header.riff, 'RIFF');
    assert.equal(header.wave, 'WAVE');
    assert.equal(header.audioFormat, 1, 'WAV must declare PCM audio');
    assert.equal(header.channels, 1, 'WAV must be mono');
    assert.equal(header.bitsPerSample, 16, 'WAV must be 16 bits per sample');
    assert.ok(buffer.length <= MAX_BYTES, `WAV must be at most ${MAX_BYTES} bytes`);
    assert.equal(header.dataSize, buffer.length - 44, 'data chunk must fill the file');
  });

  it('computes audible samples rather than silence', async () => {
    const buffer = await fs.readFile(shippedPath);
    const header = parseWav(buffer);
    let nonZero = 0;
    for (let offset = 44; offset + 1 < buffer.length; offset += 2) {
      if (buffer.readInt16LE(offset) !== 0) nonZero += 1;
    }

    assert.ok(header.dataSize > 0, 'WAV must hold samples');
    assert.ok(nonZero > 0, 'WAV must not be silent');
  });

  it('writes to sounds/inbox.wav when no argument is given', async () => {
    const original = await fs.readFile(shippedPath);
    try {
      await fs.writeFile(shippedPath, Buffer.from('sentinel: not the shipped chime'));
      await execFileAsync(process.execPath, [scriptPath], { cwd: tmpDir });
      const shipped = await fs.readFile(shippedPath);
      const regenerated = await generate(path.join(tmpDir, 'check.wav'));

      assert.deepEqual(shipped, regenerated);
    } finally {
      await fs.writeFile(shippedPath, original);
    }
  });

  it('ships sounds/ in the published package', async () => {
    const manifest = JSON.parse(await fs.readFile(path.join(repoRoot, 'package.json'), 'utf8')) as {
      files?: string[];
    };

    assert.ok(manifest.files?.includes('sounds'), 'files must include sounds');
  });
});
