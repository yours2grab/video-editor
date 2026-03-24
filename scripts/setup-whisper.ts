import {installWhisperCpp, downloadWhisperModel} from '@remotion/install-whisper-cpp';
import path from 'path';

async function setup() {
  const whisperPath = path.join(process.cwd(), '.whisper');

  console.log('Installing whisper.cpp (with Metal GPU support)...');
  await installWhisperCpp({
    to: whisperPath,
    version: '1.5.5',
  });

  console.log('Downloading base.en model...');
  await downloadWhisperModel({
    model: 'base.en',
    folder: whisperPath,
  });

  console.log('Whisper.cpp setup complete.');
  console.log('Run "npm run transcribe" to transcribe a video.');
}

setup().catch(console.error);
