/**
 * Smart Trimming Script
 *
 * Uses transcript + FFmpeg silence detection to identify and remove
 * dead air, filler words, and false starts.
 *
 * Improvements applied:
 * - Filler detection regardless of surrounding pauses
 * - FFmpeg silence detection fallback for gaps whisper misses
 * - Graceful "nothing to trim" messaging
 *
 * Usage: npx ts-node scripts/smart-trim.ts public/source.mp4
 */

import {execSync} from 'child_process';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import path from 'path';

interface Caption {
  text: string;
  startMs: number;
  endMs: number;
}

interface Segment {
  startMs: number;
  endMs: number;
  reason?: string;
}

const FILLER_WORDS = new Set([
  'um', 'uh', 'uhm', 'umm', 'like', 'basically', 'actually',
  'literally', 'right', 'okay', 'ok', 'so',
]);

// Fillers that only count at phrase starts (not mid-sentence)
const PHRASE_START_FILLERS = new Set(['so', 'right', 'okay', 'ok', 'like']);

const DEAD_AIR_THRESHOLD_MS = 3000;
const MIN_SEGMENT_MS = 2000;
const PRESERVE_BUFFER_MS = 2000;

// Improvement: FFmpeg silence detection as fallback
function detectSilenceWithFFmpeg(videoPath: string): Segment[] {
  const silences: Segment[] = [];
  try {
    const result = execSync(
      `ffmpeg -i "${videoPath}" -af silencedetect=n=-30dB:d=3 -f null - 2>&1`,
    ).toString();

    const startRegex = /silence_start: ([\d.]+)/g;
    const endRegex = /silence_end: ([\d.]+)/g;

    const starts: number[] = [];
    const ends: number[] = [];
    let match;

    while ((match = startRegex.exec(result)) !== null) {
      starts.push(parseFloat(match[1]) * 1000);
    }
    while ((match = endRegex.exec(result)) !== null) {
      ends.push(parseFloat(match[1]) * 1000);
    }

    for (let i = 0; i < Math.min(starts.length, ends.length); i++) {
      silences.push({
        startMs: starts[i] + 500, // Keep 500ms natural pause
        endMs: ends[i] - 200,
        reason: `FFmpeg silence: ${((ends[i] - starts[i]) / 1000).toFixed(1)}s`,
      });
    }
  } catch {
    // FFmpeg silence detection can fail on some formats, not critical
  }
  return silences;
}

function findCutPoints(captions: Caption[], videoDurationMs: number, videoPath: string): Segment[] {
  const cuts: Segment[] = [];

  // 1. Find dead air from transcript gaps (silence > 3s)
  for (let i = 1; i < captions.length; i++) {
    const gap = captions[i].startMs - captions[i - 1].endMs;
    if (gap > DEAD_AIR_THRESHOLD_MS) {
      cuts.push({
        startMs: captions[i - 1].endMs + 500,
        endMs: captions[i].startMs - 200,
        reason: `Dead air: ${(gap / 1000).toFixed(1)}s gap`,
      });
    }
  }

  // 2. Improvement: FFmpeg silence detection as fallback
  const ffmpegSilences = detectSilenceWithFFmpeg(videoPath);
  for (const silence of ffmpegSilences) {
    // Only add if not already covered by transcript-based detection
    const alreadyCovered = cuts.some(
      (c) => Math.abs(c.startMs - silence.startMs) < 2000,
    );
    if (!alreadyCovered) {
      cuts.push(silence);
    }
  }

  // 3. Improvement: Find filler words (relaxed — no gap requirement for strong fillers)
  for (let i = 0; i < captions.length; i++) {
    const word = captions[i].text.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (!FILLER_WORDS.has(word)) continue;

    const gapBefore = i > 0 ? captions[i].startMs - captions[i - 1].endMs : 0;

    if (PHRASE_START_FILLERS.has(word)) {
      // These are only fillers at phrase starts (gap > 300ms before them)
      if (gapBefore > 300) {
        cuts.push({
          startMs: captions[i].startMs,
          endMs: captions[i].endMs,
          reason: `Filler (phrase start): "${captions[i].text.trim()}"`,
        });
      }
    } else {
      // Strong fillers (um, uh, basically, actually, literally) — always flag
      cuts.push({
        startMs: captions[i].startMs,
        endMs: captions[i].endMs,
        reason: `Filler: "${captions[i].text.trim()}"`,
      });
    }
  }

  // Filter: don't cut within buffer zones
  return cuts.filter(
    (c) => c.startMs > PRESERVE_BUFFER_MS && c.endMs < videoDurationMs - PRESERVE_BUFFER_MS,
  );
}

function buildKeepList(cuts: Segment[], videoDurationMs: number): Segment[] {
  if (cuts.length === 0) return [{startMs: 0, endMs: videoDurationMs}];

  const sorted = [...cuts].sort((a, b) => a.startMs - b.startMs);

  const merged: Segment[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].startMs <= last.endMs + MIN_SEGMENT_MS) {
      last.endMs = Math.max(last.endMs, sorted[i].endMs);
    } else {
      merged.push(sorted[i]);
    }
  }

  const keeps: Segment[] = [];
  let cursor = 0;

  for (const cut of merged) {
    if (cut.startMs - cursor >= MIN_SEGMENT_MS) {
      keeps.push({startMs: cursor, endMs: cut.startMs});
    }
    cursor = cut.endMs;
  }

  if (videoDurationMs - cursor >= MIN_SEGMENT_MS) {
    keeps.push({startMs: cursor, endMs: videoDurationMs});
  }

  return keeps;
}

function trimWithFFmpeg(videoPath: string, keeps: Segment[], outputPath: string): void {
  const tmpDir = path.join(process.cwd(), '.tmp-trim');
  execSync(`mkdir -p "${tmpDir}"`);

  console.log(`Extracting ${keeps.length} segments...`);

  const segFiles: string[] = [];
  for (let i = 0; i < keeps.length; i++) {
    const seg = keeps[i];
    const segFile = path.join(tmpDir, `seg${i.toString().padStart(3, '0')}.mp4`);
    const startSec = seg.startMs / 1000;
    const durationSec = (seg.endMs - seg.startMs) / 1000;

    execSync(
      `ffmpeg -y -ss ${startSec} -i "${videoPath}" -t ${durationSec} -c copy "${segFile}" 2>/dev/null`,
    );
    segFiles.push(segFile);
  }

  const listFile = path.join(tmpDir, 'concat.txt');
  const listContent = segFiles.map((f) => `file '${f}'`).join('\n');
  writeFileSync(listFile, listContent);

  console.log('Stitching segments...');
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outputPath}" 2>/dev/null`,
  );

  execSync(`rm -rf "${tmpDir}"`);
}

async function main() {
  const videoPath = process.argv[2];
  if (!videoPath || !existsSync(videoPath)) {
    console.log('Usage: npx ts-node scripts/smart-trim.ts <video-path>');
    console.log('Example: npx ts-node scripts/smart-trim.ts public/source.mp4');
    process.exit(1);
  }

  const baseName = path.basename(videoPath, path.extname(videoPath));
  const captionsPath = path.join(process.cwd(), 'public', `${baseName}.captions.json`);

  if (!existsSync(captionsPath)) {
    console.log('No transcript found. Run "npm run transcribe" first.');
    process.exit(1);
  }

  const captions: Caption[] = JSON.parse(readFileSync(captionsPath, 'utf-8'));
  console.log(`Loaded ${captions.length} caption words.`);

  const durationStr = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
  ).toString().trim();
  const durationMs = parseFloat(durationStr) * 1000;
  console.log(`Video duration: ${(durationMs / 1000).toFixed(1)}s`);

  // Improvement: pass videoPath for FFmpeg silence detection
  const cuts = findCutPoints(captions, durationMs, videoPath);

  if (cuts.length === 0) {
    // Improvement: graceful "nothing to trim" message
    console.log('\nVideo is clean — no dead air or fillers detected.');
    console.log('Skipping trim. Moving to scene analysis.');
    return;
  }

  console.log(`\nFound ${cuts.length} things to cut:`);
  let totalCutMs = 0;
  for (const cut of cuts) {
    const cutDuration = cut.endMs - cut.startMs;
    totalCutMs += cutDuration;
    console.log(`  ${(cut.startMs / 1000).toFixed(1)}s - ${(cut.endMs / 1000).toFixed(1)}s: ${cut.reason}`);
  }
  console.log(`Total to remove: ${(totalCutMs / 1000).toFixed(1)}s`);

  const keeps = buildKeepList(cuts, durationMs);
  console.log(`\nKeeping ${keeps.length} segments.`);

  const outputPath = path.join(path.dirname(videoPath), `${baseName}-trimmed.mp4`);
  trimWithFFmpeg(videoPath, keeps, outputPath);

  const newDurationStr = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`,
  ).toString().trim();
  const newDurationMs = parseFloat(newDurationStr) * 1000;

  console.log(`\nDone.`);
  console.log(`Original: ${(durationMs / 1000 / 60).toFixed(1)} min`);
  console.log(`Trimmed:  ${(newDurationMs / 1000 / 60).toFixed(1)} min`);
  console.log(`Removed:  ${((durationMs - newDurationMs) / 1000).toFixed(1)}s`);
  console.log(`Output:   ${outputPath}`);
}

main().catch(console.error);
