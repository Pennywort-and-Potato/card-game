// Singleton that tracks the PixiJS viewport's current scale and offset.
// Call setViewport() from main.ts each time the window resizes.
// HTML overlays use these to match their position to PixiJS coordinates.

let vScale = 1;
let vOffX = 0;
let vOffY = 0;

export const setViewport = (scale: number, offX: number, offY: number) => {
  vScale = scale;
  vOffX = offX;
  vOffY = offY;
};

/** Convert a PixiJS viewport-local point to CSS screen pixels. */
export const toScreen = (pixiX: number, pixiY: number) => ({
  x: vOffX + pixiX * vScale,
  y: vOffY + pixiY * vScale,
});

/** Convert a PixiJS size to CSS pixels. */
export const toScreenSize = (pixiW: number, pixiH: number) => ({
  w: pixiW * vScale,
  h: pixiH * vScale,
});
