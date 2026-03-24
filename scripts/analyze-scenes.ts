/**
 * Scene Analysis Script
 *
 * Analyzes a video + its transcript to suggest motion graphics placements.
 *
 * Improvements applied:
 * - Transcript-based topic detection weighted higher than ffprobe for screen shares
 * - Comparative phrases and action verbs detected for callout suggestions
 * - Better end-of-video spacing (CTA and outro don't overlap)
 * - Smarter callout suggestions from quotable moments
 *
 * Usage: npx ts-node scripts/analyze-scenes.ts public/source.mp4
 */

import {execSync} from 'child_process';
import {existsSync, readFileSync, writeFileSync} from 'fs';
import path from 'path';

interface Caption {
  text: string;
  startMs: number;
  endMs: number;
}

interface MGSuggestion {
  timestamp: number;
  duration: number;
  type: 'intro' | 'lower_third' | 'section_title' | 'callout' | 'cta' | 'outro';
  rationale: string;
  content: Record<string, string> | null;
}

function getVideoDuration(videoPath: string): number {
  const result = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
  ).toString().trim();
  return parseFloat(result);
}

function detectSceneChanges(videoPath: string, threshold = 0.3): number[] {
  try {
    const result = execSync(
      `ffprobe -f lavfi -i "movie=${videoPath},select=gt(scene\\,${threshold})" -show_entries frame=pkt_pts_time -of csv=p=0 2>/dev/null`,
    ).toString().trim();

    if (!result) return [];
    return result.split('\n').map((t) => parseFloat(t)).filter((t) => !isNaN(t));
  } catch {
    return [];
  }
}

// Improvement: expanded key statement detection with comparatives and action verbs
function findKeyStatements(captions: Caption[]): Array<{timestamp: number; text: string}> {
  const stats: Array<{timestamp: number; text: string}> = [];
  const patterns = [
    /\d+%/,                    // percentages
    /\d+x/,                    // multipliers
    /\$\d+/,                   // dollar amounts
    /the most/i,               // superlatives
    /the biggest/i,
    /the best/i,
    /number one/i,
    /way more/i,               // Improvement: comparative phrases
    /way closer/i,
    /way better/i,
    /much more/i,
    /much better/i,
    /more precise/i,
    /more accurate/i,
    /switch from .+ to/i,      // Improvement: action transitions
    /instead of/i,
    /compared to/i,
    /the difference is/i,
    /what it does/i,
    /clearly state/i,
    /specify .+ exactly/i,
    /that means/i,             // Explanation moments
    /it means that/i,
    /so you get/i,
  ];

  // Build sentences from word-level captions
  let sentence = '';
  let sentenceStart = 0;
  for (const cap of captions) {
    if (!sentence) sentenceStart = cap.startMs;
    sentence += cap.text;
    if (cap.text.match(/[.!?]/) || sentence.length > 120) {
      for (const pattern of patterns) {
        if (sentence.match(pattern)) {
          stats.push({timestamp: sentenceStart / 1000, text: sentence.trim()});
          break;
        }
      }
      sentence = '';
    }
  }
  return stats;
}

function detectTopicShifts(captions: Caption[], windowMs = 30000): number[] {
  const stopwords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has',
    'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'and', 'but', 'or',
    'so', 'if', 'that', 'this', 'it', 'its', 'i', 'you', 'he', 'she', 'we',
    'they', 'my', 'your', 'not', 'no', 'just', 'also', 'very', 'really',
  ]);

  const windows: Map<number, Map<string, number>> = new Map();

  for (const cap of captions) {
    const windowIdx = Math.floor(cap.startMs / windowMs);
    if (!windows.has(windowIdx)) windows.set(windowIdx, new Map());
    const wordMap = windows.get(windowIdx)!;

    const words = cap.text.trim().toLowerCase().split(/\s+/);
    for (const w of words) {
      const clean = w.replace(/[^a-z]/g, '');
      if (clean.length > 3 && !stopwords.has(clean)) {
        wordMap.set(clean, (wordMap.get(clean) || 0) + 1);
      }
    }
  }

  const shifts: number[] = [];
  const windowKeys = [...windows.keys()].sort((a, b) => a - b);

  for (let i = 1; i < windowKeys.length; i++) {
    const prev = windows.get(windowKeys[i - 1])!;
    const curr = windows.get(windowKeys[i])!;

    const prevKeys = new Set(prev.keys());
    const currKeys = new Set(curr.keys());
    const overlap = [...prevKeys].filter((k) => currKeys.has(k)).length;
    const total = new Set([...prevKeys, ...currKeys]).size;

    if (total > 0 && overlap / total < 0.3) {
      shifts.push((windowKeys[i] * windowMs) / 1000);
    }
  }

  return shifts;
}

function generateSuggestions(
  duration: number,
  sceneChanges: number[],
  topicShifts: number[],
  keyStatements: Array<{timestamp: number; text: string}>,
): MGSuggestion[] {
  const suggestions: MGSuggestion[] = [];

  // 1. Always: Intro
  suggestions.push({
    timestamp: 0,
    duration: 4,
    type: 'intro',
    rationale: 'Video start — animated intro',
    content: null,
  });

  // 2. First lower third at 5s
  suggestions.push({
    timestamp: 5,
    duration: 5,
    type: 'lower_third',
    rationale: 'Speaker identification',
    content: {name: '[Speaker Name]', title: '[Title/Role]'},
  });

  // 3. Improvement: Topic shifts weighted higher than scene changes for screen shares
  // Add section titles at topic shifts first
  for (const shift of topicShifts) {
    if (shift > 10 && shift < duration - 15) {
      suggestions.push({
        timestamp: shift,
        duration: 3,
        type: 'section_title',
        rationale: `Topic shift detected at ${shift.toFixed(0)}s (transcript-based)`,
        content: {title: '[Section Title]'},
      });
    }
  }

  // Scene changes only if NOT already covered by a topic shift (secondary signal)
  for (const sc of sceneChanges) {
    if (sc > 10 && sc < duration - 15) {
      const alreadyCovered = topicShifts.some((ts) => Math.abs(ts - sc) < 15);
      if (!alreadyCovered) {
        suggestions.push({
          timestamp: sc,
          duration: 3,
          type: 'section_title',
          rationale: `Scene change at ${sc.toFixed(1)}s (visual-based, secondary)`,
          content: {title: '[Section Title]'},
        });
      }
    }
  }

  // 4. Improvement: Key statement callouts — now catches comparatives and action verbs
  const topStatements = keyStatements.slice(0, 3);
  for (const stat of topStatements) {
    if (stat.timestamp > 10 && stat.timestamp < duration - 15) {
      // Don't overlap with existing section titles
      const tooClose = suggestions.some(
        (s) => Math.abs(s.timestamp - stat.timestamp) < 5,
      );
      if (tooClose) continue;

      const shortText = stat.text.length > 50 ? stat.text.substring(0, 47) + '...' : stat.text;
      suggestions.push({
        timestamp: stat.timestamp,
        duration: 4,
        type: 'callout',
        rationale: `Key statement: "${shortText}"`,
        content: {text: shortText},
      });
    }
  }

  // 5. Lower third refresh every 25s
  for (let t = 30; t < duration - 20; t += 25) {
    const hasNearby = suggestions.some(
      (s) => Math.abs(s.timestamp - t) < 8 && s.type !== 'callout',
    );
    if (!hasNearby) {
      suggestions.push({
        timestamp: t,
        duration: 5,
        type: 'lower_third',
        rationale: `Lower third refresh at ${t}s`,
        content: {name: '[Speaker Name]', title: '[Topic]'},
      });
    }
  }

  // 6. Improvement: Better end-of-video spacing — CTA and outro don't overlap
  const ctaDuration = 4;
  const outroDuration = 3;
  const gap = 0.5; // Half second gap between CTA and outro
  const outroStart = duration - outroDuration;
  const ctaStart = outroStart - ctaDuration - gap;

  if (ctaStart > 0) {
    suggestions.push({
      timestamp: ctaStart,
      duration: ctaDuration,
      type: 'cta',
      rationale: 'End-of-video call to action',
      content: {text: 'Subscribe', subtext: 'For more content like this'},
    });
  }

  suggestions.push({
    timestamp: outroStart,
    duration: outroDuration,
    type: 'outro',
    rationale: 'Branded closing card',
    content: {text: 'Thanks for watching'},
  });

  // Sort by timestamp
  suggestions.sort((a, b) => a.timestamp - b.timestamp);

  return suggestions;
}

async function main() {
  const videoPath = process.argv[2];
  if (!videoPath || !existsSync(videoPath)) {
    console.log('Usage: npx ts-node scripts/analyze-scenes.ts <video-path>');
    console.log('Example: npx ts-node scripts/analyze-scenes.ts public/source.mp4');
    process.exit(1);
  }

  console.log(`Analyzing: ${videoPath}`);

  const duration = getVideoDuration(videoPath);
  console.log(`Duration: ${duration.toFixed(1)}s`);

  console.log('Detecting scene changes...');
  const sceneChanges = detectSceneChanges(videoPath);
  console.log(`Found ${sceneChanges.length} scene changes`);

  if (sceneChanges.length === 0) {
    console.log('(Screen share detected — relying on transcript for topic analysis)');
  }

  const baseName = path.basename(videoPath, path.extname(videoPath));
  const captionsPath = path.join(process.cwd(), 'public', `${baseName}.captions.json`);

  let topicShifts: number[] = [];
  let keyStatements: Array<{timestamp: number; text: string}> = [];

  if (existsSync(captionsPath)) {
    console.log('Loading transcript for topic analysis...');
    const captions: Caption[] = JSON.parse(readFileSync(captionsPath, 'utf-8'));
    topicShifts = detectTopicShifts(captions);
    keyStatements = findKeyStatements(captions);
    console.log(`Found ${topicShifts.length} topic shifts, ${keyStatements.length} key statements`);
  } else {
    console.log('No transcript found. Run "npm run transcribe" first for better suggestions.');
  }

  const suggestions = generateSuggestions(duration, sceneChanges, topicShifts, keyStatements);

  const outPath = path.join(process.cwd(), 'mg-suggestions.json');
  writeFileSync(outPath, JSON.stringify(suggestions, null, 2));

  console.log('\n## Motion Graphics Suggestions\n');
  console.log('| # | Time | Type | Rationale | Duration |');
  console.log('|---|------|------|-----------|----------|');
  suggestions.forEach((s, i) => {
    const mins = Math.floor(s.timestamp / 60);
    const secs = Math.floor(s.timestamp % 60);
    const time = `${mins}:${secs.toString().padStart(2, '0')}`;
    console.log(`| ${i + 1} | ${time} | ${s.type} | ${s.rationale} | ${s.duration}s |`);
  });

  console.log(`\nSaved to ${outPath}`);
}

main().catch(console.error);
