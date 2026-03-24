import React from 'react';
import {Composition} from 'remotion';
import {FinalVideo} from './compositions/FinalVideo';
import {DEFAULT_BRAND} from './config/brand';

// These values get updated by Claude Code per project based on ffprobe analysis
const VIDEO_DURATION_SECONDS = 60;
const VIDEO_WIDTH = 1920;
const VIDEO_HEIGHT = 1080;
const VIDEO_FPS = 30;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="FinalVideo"
        component={FinalVideo}
        durationInFrames={Math.ceil(VIDEO_DURATION_SECONDS * VIDEO_FPS)}
        fps={VIDEO_FPS}
        width={VIDEO_WIDTH}
        height={VIDEO_HEIGHT}
        defaultProps={{
          brand: DEFAULT_BRAND,
        }}
      />
    </>
  );
};
