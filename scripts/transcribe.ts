import {transcribe} from '@remotion/install-whisper-cpp';
import {execSync} from 'child_process';
import {existsSync, writeFileSync, readdirSync} from 'fs';
import path from 'path';

const WHISPER_PATH = path.join(process.cwd(), '.whisper');

interface Caption {
  text: string;
  startMs: number;
  endMs: number;
  timestampMs: number;
  confidence: number;
}

// Improvement: merge split words that whisper incorrectly splits
const MERGE_PATTERNS: Array<{parts: string[]; merged: string}> = [
  {parts: ['LL', 'M'], merged: 'LLM'},
  {parts: ['ll', 'm'], merged: 'LLM'},
  {parts: ['Suk', 'ana'], merged: 'Sucana'},
  {parts: ['suk', 'ana'], merged: 'Sucana'},
  {parts: ['Suc', 'ana'], merged: 'Sucana'},
  {parts: ['G', 'PT'], merged: 'GPT'},
  {parts: ['Chat', 'G', 'PT'], merged: 'ChatGPT'},
  {parts: ['J', 'SON'], merged: 'JSON'},
  {parts: ['js', 'on'], merged: 'JSON'},
  {parts: ['A', 'PI'], merged: 'API'},
];

function mergeSplitWords(captions: Caption[]): Caption[] {
  const result: Caption[] = [];
  let i = 0;

  while (i < captions.length) {
    let merged = false;

    for (const pattern of MERGE_PATTERNS) {
      const parts = pattern.parts;
      if (i + parts.length > captions.length) continue;

      const match = parts.every((part, j) => {
        const capText = captions[i + j].text.trim();
        return capText.toLowerCase() === part.toLowerCase() || capText === part;
      });

      if (match) {
        // Merge into single caption
        const first = captions[i];
        const last = captions[i + parts.length - 1];
        result.push({
          text: ' ' + pattern.merged,
          startMs: first.startMs,
          endMs: last.endMs,
          timestampMs: first.timestampMs,
          confidence: first.confidence,
        });
        i += parts.length;
        merged = true;
        console.log(`  Merged: "${parts.join('" + "')}" → "${pattern.merged}"`);
        break;
      }
    }

    if (!merged) {
      result.push(captions[i]);
      i++;
    }
  }

  return result;
}

async function transcribeVideo(videoPath: string): Promise<Caption[]> {
  const baseName = path.basename(videoPath, path.extname(videoPath));
  const audioPath = path.join(process.cwd(), `${baseName}.wav`);
  const captionsPath = path.join(process.cwd(), 'public', `${baseName}.captions.json`);

  if (existsSync(captionsPath)) {
    console.log(`Already transcribed: ${baseName}. Loading existing captions.`);
    return JSON.parse(require('fs').readFileSync(captionsPath, 'utf-8'));
  }

  console.log(`Transcribing ${baseName}...`);

  // Extract audio (16kHz mono WAV required by whisper.cpp)
  execSync(`ffmpeg -y -i "${videoPath}" -vn -ar 16000 -ac 1 "${audioPath}"`, {stdio: 'inherit'});

  // Transcribe with GPU acceleration
  const {transcription} = await transcribe({
    inputPath: audioPath,
    whisperPath: WHISPER_PATH,
    whisperCppVersion: '1.5.5',
    model: 'base.en',
    tokenLevelTimestamps: true,
    printOutput: true,
  });

  // Convert to caption format
  let captions: Caption[] = transcription.map((item) => ({
    text: item.text,
    startMs: Math.round(item.offsets.from),
    endMs: Math.round(item.offsets.to),
    timestampMs: Math.round(item.offsets.from),
    confidence: 1,
  }));

  // Improvement: merge split words
  console.log('Post-processing: merging split words...');
  captions = mergeSplitWords(captions);

  writeFileSync(captionsPath, JSON.stringify(captions, null, 2));
  console.log(`Created ${baseName}.captions.json (${captions.length} words)`);

  // Cleanup audio file
  if (existsSync(audioPath)) {
    execSync(`rm -f "${audioPath}"`);
    console.log('Cleaned up temp audio file.');
  }

  return captions;
}

async function main() {
  // Find video files in public/
  const publicDir = path.join(process.cwd(), 'public');
  const videos = readdirSync(publicDir).filter((f) =>
    ['.mp4', '.mov', '.avi', '.mkv'].includes(path.extname(f).toLowerCase()),
  );

  if (videos.length === 0) {
    console.log('No video files found in public/ folder.');
    console.log('Copy your video to public/ first, then run this script again.');
    return;
  }

  for (const video of videos) {
    await transcribeVideo(path.join(publicDir, video));
  }

  console.log('All videos transcribed.');
}

main().catch(console.error);
