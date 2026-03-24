import React from 'react';
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from 'remotion';
import {BrandProvider} from '../config/BrandContext';
import type {BrandConfig} from '../config/brand';
import {DEFAULT_BRAND} from '../config/brand';

interface FinalVideoProps {
  brand?: BrandConfig;
}

/**
 * FinalVideo composition template.
 *
 * Claude Code populates this per project:
 * 1. Reads the transcript to understand what's being said
 * 2. Identifies key moments for motion graphics
 * 3. Writes custom MG components (visual reinforcement, no text)
 * 4. Places them as Sequence overlays at the right timestamps
 *
 * The video plays continuously as the base layer.
 * MGs overlay on top (or behind via z-index) at specific moments.
 */
export const FinalVideo: React.FC<FinalVideoProps> = ({
  brand = DEFAULT_BRAND,
}) => {
  const {fps} = useVideoConfig();

  return (
    <BrandProvider config={brand}>
      <AbsoluteFill style={{backgroundColor: 'black'}}>
        {/* BASE LAYER: Video plays continuously, never stops */}
        <OffthreadVideo src={staticFile('source.mp4')} />

        {/*
          MOTION GRAPHICS: Claude writes these per project.

          Types of MGs:
          - Full screen takeover (dark background + animated shapes)
          - Overlay on video (shapes moving around/behind the speaker)
          - Behind speaker (render before video layer, swirls/glows peek around edges)
          - Split screen (graphic on one side, video on the other)

          Rules:
          - No text in MGs unless it reinforces what's being said
          - Motion follows the 10 principles of motion design
          - Brand colors from brand.json via useBrand() hook
          - Video never stops playing

          Example:
          <Sequence from={Math.round(10 * fps)} durationInFrames={4 * fps}>
            <YourCustomMotionGraphic />
          </Sequence>
        */}
      </AbsoluteFill>
    </BrandProvider>
  );
};
