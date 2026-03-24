# Sucana Video Editor

A Claude Code skill that turns raw video recordings into polished content with motion graphics. Built on Remotion + FFmpeg + whisper.cpp.

## What It Does

Drop a video file (Loom recording, screen share, talking head, demo). Claude Code:

1. **Transcribes** it locally with whisper.cpp (GPU accelerated)
2. **Trims** dead air, filler words, and false starts
3. **Analyzes** scenes and identifies key moments for motion graphics
4. **Builds** custom motion graphics in Remotion (React components)
5. **Previews** in your browser at localhost:3000 — scrub the timeline, see everything
6. **Iterates** — you say what to change, Claude edits the code, browser hot-reloads
7. **Renders** final YouTube-ready MP4

Everything runs locally. No cloud. No API keys. No cost per video.

## Motion Graphics

Motion graphics are code-generated per project by Claude Code. No fixed templates. You describe what you want (or Claude suggests based on the transcript), and it writes custom Remotion components.

MGs follow the **10 Principles of Motion Design**: timing, eases, mass, anticipation, arcs, squash & stretch, follow through, exaggeration, secondary animation, and appeal.

Types of MGs:
- **Full screen takeover** — dark background + animated shapes (chapter breaks)
- **Overlay on video** — shapes moving around/above the speaker
- **Behind speaker** — swirls/glows that peek around the speaker's silhouette
- **Split screen** — graphic on one side, video on the other

## Requirements

- **Node.js** (v18+)
- **FFmpeg** — `brew install ffmpeg`
- **Claude Code** — with the `remotion-best-practices` skill installed

## Setup

```bash
git clone https://github.com/yours2grab/sucana-video-editor.git
cd sucana-video-editor
npm install
```

First-time only — install whisper.cpp for transcription:
```bash
npm run setup-whisper
```

Install the Remotion best-practices skill (gives Claude deep Remotion knowledge):
```bash
npx skills add remotion-dev/skills@remotion-best-practices
```

## Usage

### With Claude Code (recommended)

Say `/video-editor` or "edit this video" in Claude Code. It reads the SKILL.md and runs the full pipeline.

### Manual

```bash
# Copy your video to public/
cp ~/Desktop/my-video.mp4 public/source.mp4

# Transcribe
npm run transcribe

# Smart trim (removes dead air and filler words)
npx ts-node scripts/smart-trim.ts public/source.mp4

# Scene analysis (suggests motion graphic placements)
npx ts-node scripts/analyze-scenes.ts public/source.mp4

# Preview in browser
npm run dev

# Render final video
npx remotion render FinalVideo out/final.mp4 --codec h264 --crf 18
```

## Project Structure

```
sucana-video-editor/
├── public/                    # Drop your video here as source.mp4
├── src/
│   ├── Root.tsx               # Composition definitions (Claude updates per project)
│   ├── config/
│   │   ├── brand.ts           # Brand color types
│   │   └── BrandContext.tsx   # React context for brand colors
│   └── compositions/
│       └── FinalVideo.tsx     # Main composition (Claude writes MGs here)
├── scripts/
│   ├── setup-whisper.ts       # One-time whisper.cpp install
│   ├── transcribe.ts          # Transcription with word merge
│   ├── smart-trim.ts          # Dead air and filler removal
│   └── analyze-scenes.ts      # Scene analysis + MG suggestions
├── brand.json                 # Your brand colors (edit this)
├── package.json
├── remotion.config.ts
└── tsconfig.json
```

## Brand Colors

Edit `brand.json` to set your colors:

```json
{
  "primary": "#6C5CE7",
  "secondary": "#A29BFE",
  "text": "#FFFFFF",
  "fontFamily": "Inter, Helvetica Neue, Arial, sans-serif"
}
```

All motion graphics pull colors from this file via the `useBrand()` hook.

## Video Limits

| Video length | Works? |
|-------------|--------|
| Under 30 min | Smooth, no issues |
| 30-60 min | Works, render takes a while |
| 1-2 hours | Works, split into sections recommended |
| 2+ hours | Split first, process chunks, stitch at the end |

## Scripts

### Transcribe (`scripts/transcribe.ts`)
- Uses whisper.cpp with Metal GPU acceleration on Mac
- `base.en` model (fast + good quality)
- Word-level timestamps for precise MG placement
- Auto-merges split words (LLM, JSON, API, Sucana, GPT, ChatGPT)

### Smart Trim (`scripts/smart-trim.ts`)
- Detects dead air (>3s silence gaps)
- Catches filler words ("um", "uh", "basically", "you know", "right", "so", "actually", "I mean")
- FFmpeg stitches good segments with 0.3s crossfade
- Never cuts segments shorter than 2 seconds
- Preserves natural pauses (1-2s)

### Scene Analysis (`scripts/analyze-scenes.ts`)
- ffprobe scene change detection
- Transcript-based topic shift detection
- Auto-detects screen share content (falls back to transcript analysis)
- Outputs `mg-suggestions.json` with timestamps and types

## Built With

- [Remotion](https://remotion.dev) — React-based video framework
- [FFmpeg](https://ffmpeg.org) — Video processing
- [whisper.cpp](https://github.com/ggerganov/whisper.cpp) — Local speech-to-text with GPU acceleration
