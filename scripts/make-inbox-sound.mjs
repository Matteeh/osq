#!/usr/bin/env node
/**
 * Generate the inbox chime the package ships as `sounds/inbox.wav`.
 *
 * The sound is a short two-tone chime: an 880 Hz tone followed by a 1320 Hz
 * tone, each faded in and out so it does not click. Every sample is computed
 * here, so the sound is original and the output is byte-for-byte stable.
 *
 * Usage: node scripts/make-inbox-sound.mjs [out]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 8000;
const TONES = [
  { frequency: 880, seconds: 0.1 },
  { frequency: 1320, seconds: 0.1 },
];
const FADE_SECONDS = 0.005;

const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));

/** Every 16-bit sample of the chime, in order, at `SAMPLE_RATE`. */
function buildSamples() {
  const samples = [];
  const fadeSamples = Math.max(1, Math.round(FADE_SECONDS * SAMPLE_RATE));

  for (const { frequency, seconds } of TONES) {
    const count = Math.max(1, Math.round(seconds * SAMPLE_RATE));
    for (let index = 0; index < count; index += 1) {
      const fade = Math.min(1, index / fadeSamples, (count - 1 - index) / fadeSamples);
      const angle = (2 * Math.PI * frequency * index) / SAMPLE_RATE;
      samples.push(Math.round(Math.sin(angle) * fade * 32767));
    }
  }

  return samples;
}

/** Wrap mono 16-bit PCM samples in a minimal RIFF/WAVE container. */
function buildWav(samples) {
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataSize, 40);

  samples.forEach((sample, index) => {
    buffer.writeInt16LE(sample, 44 + index * 2);
  });

  return buffer;
}

const out = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(repoRoot, 'sounds', 'inbox.wav');

mkdirSync(path.dirname(out), { recursive: true });
writeFileSync(out, buildWav(buildSamples()));
