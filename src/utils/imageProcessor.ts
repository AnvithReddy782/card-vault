import jsQR from 'jsqr';

export interface ImageTransformOptions {
  rotationDegrees?: 0 | 90 | 180 | 270;
  enhanceContrast?: boolean;
  exposureBoost?: boolean;
  reduceGlare?: boolean;
  forOcrEngine?: boolean;
  cropToCardGuide?: boolean;
}

export interface DetectedCardBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  foundTightCard: boolean;
  aspectRatio?: number;
  areaRatio?: number;
}

/**
 * Robust Business Card Contour & Boundary Detector:
 * 1. Analyzes central region to estimate card paper stock color.
 * 2. Scans outward to locate distinct top, bottom, left, and right physical boundaries.
 * 3. Validates that at least 3 distinct edges separate the card from the background table.
 * 4. Strictly verifies business card aspect ratio (1.20..2.25 landscape or 0.45..0.82 portrait).
 * 5. Rejects full-screen uniform surfaces (desks, walls, floors) where no card is present.
 */
export function detectCardRectangleBounds(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number,
  searchMarginRatio = 0.02
): DetectedCardBounds {
  const minX = Math.floor(width * searchMarginRatio);
  const maxX = Math.floor(width * (1 - searchMarginRatio));
  const minY = Math.floor(height * searchMarginRatio);
  const maxY = Math.floor(height * (1 - searchMarginRatio));
  const roiW = Math.max(10, maxX - minX);
  const roiH = Math.max(10, maxY - minY);

  // Sample central card region (30%..70% X, 32%..68% Y) to estimate card paper RGB color
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  const cX0 = Math.floor(width * 0.30);
  const cX1 = Math.floor(width * 0.70);
  const cY0 = Math.floor(height * 0.32);
  const cY1 = Math.floor(height * 0.68);

  for (let y = cY0; y < cY1; y += 2) {
    for (let x = cX0; x < cX1; x += 2) {
      const idx = (y * width + x) * 4;
      const r = rgbaData[idx];
      const g = rgbaData[idx + 1];
      const b = rgbaData[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      if (lum >= 90) {
        sumR += r;
        sumG += g;
        sumB += b;
        count++;
      }
    }
  }

  // Fallback if dark card stock
  if (count < 20) {
    sumR = 0;
    sumG = 0;
    sumB = 0;
    count = 0;
    for (let y = cY0; y < cY1; y += 2) {
      for (let x = cX0; x < cX1; x += 2) {
        const idx = (y * width + x) * 4;
        sumR += rgbaData[idx];
        sumG += rgbaData[idx + 1];
        sumB += rgbaData[idx + 2];
        count++;
      }
    }
  }

  const refR = count > 0 ? sumR / count : 220;
  const refG = count > 0 ? sumG / count : 220;
  const refB = count > 0 ? sumB / count : 220;

  const rowMatchRatio = new Float32Array(height);
  const colorTol = 68;
  const bandX0 = Math.floor(width * 0.16);
  const bandX1 = Math.floor(width * 0.84);

  for (let y = minY; y < maxY; y += 2) {
    let matches = 0;
    let total = 0;
    for (let x = bandX0; x < bandX1; x += 2) {
      const idx = (y * width + x) * 4;
      const dist =
        (Math.abs(rgbaData[idx] - refR) +
          Math.abs(rgbaData[idx + 1] - refG) +
          Math.abs(rgbaData[idx + 2] - refB)) /
        3;
      if (dist <= colorTol) matches++;
      total++;
    }
    rowMatchRatio[y] = total > 0 ? matches / total : 0;
    if (y + 1 < maxY) rowMatchRatio[y + 1] = rowMatchRatio[y];
  }

  let top = minY;
  let bottom = maxY;
  let topBoundaryFound = false;
  let bottomBoundaryFound = false;
  const midY = Math.floor(height / 2);

  for (let y = midY; y >= minY; y--) {
    if (rowMatchRatio[y] < 0.28) {
      top = y;
      topBoundaryFound = y > minY + Math.floor(height * 0.04);
      break;
    }
  }
  for (let y = midY; y < maxY; y++) {
    if (rowMatchRatio[y] < 0.28) {
      bottom = y;
      bottomBoundaryFound = y < maxY - Math.floor(height * 0.04);
      break;
    }
  }

  // Ensure vertical span [top, bottom] is valid before scanning columns
  const cardY0 = Math.max(minY, Math.min(top, Math.floor(height * 0.35)));
  const cardY1 = Math.min(maxY, Math.max(bottom, Math.floor(height * 0.65)));

  const colMatchRatio = new Float32Array(width);
  for (let x = minX; x < maxX; x += 2) {
    let matches = 0;
    let total = 0;
    for (let y = cardY0; y < cardY1; y += 2) {
      const idx = (y * width + x) * 4;
      const dist =
        (Math.abs(rgbaData[idx] - refR) +
          Math.abs(rgbaData[idx + 1] - refG) +
          Math.abs(rgbaData[idx + 2] - refB)) /
        3;
      if (dist <= colorTol) matches++;
      total++;
    }
    colMatchRatio[x] = total > 0 ? matches / total : 0;
    if (x + 1 < maxX) colMatchRatio[x + 1] = colMatchRatio[x];
  }

  let left = minX;
  let right = maxX;
  let leftBoundaryFound = false;
  let rightBoundaryFound = false;
  const midX = Math.floor(width / 2);

  for (let x = minX; x < midX; x++) {
    if (colMatchRatio[x] >= 0.32) {
      left = x;
      leftBoundaryFound = x > minX + Math.floor(width * 0.04);
      break;
    }
  }
  for (let x = maxX - 1; x > midX; x--) {
    if (colMatchRatio[x] >= 0.32) {
      right = x;
      rightBoundaryFound = x < maxX - Math.floor(width * 0.04);
      break;
    }
  }

  // Apply outward +2.5% safety margin so edge characters are never clipped
  const safetyPadX = Math.round(width * 0.025);
  const safetyPadY = Math.round(height * 0.022);
  const finalLeft = Math.max(0, left - safetyPadX);
  const finalTop = Math.max(0, top - safetyPadY);
  const finalRight = Math.min(width, right + safetyPadX);
  const finalBottom = Math.min(height, bottom + safetyPadY);

  const detectedW = finalRight - finalLeft;
  const detectedH = finalBottom - finalTop;
  const aspectRatio = detectedW / Math.max(1, detectedH);
  const areaRatio = (detectedW * detectedH) / (width * height);

  // Real card shape validation (Standard, Mini & Square business cards placed anywhere in view):
  // 1. At least 3 boundary edges must be distinctly identified against the background
  // 2. Area must occupy between 10% and 90% of the frame (supports smaller cards, mini cards & full view)
  // 3. Aspect ratio conforms to physical business cards:
  //    - Landscape: 1.15..2.45
  //    - Square: 0.88..1.15
  //    - Portrait: 0.40..0.88
  const edgesDetectedCount =
    (topBoundaryFound ? 1 : 0) +
    (bottomBoundaryFound ? 1 : 0) +
    (leftBoundaryFound ? 1 : 0) +
    (rightBoundaryFound ? 1 : 0);

  const isLandscapeCard = aspectRatio >= 1.15 && aspectRatio <= 2.45;
  const isSquareCard = aspectRatio >= 0.88 && aspectRatio <= 1.15;
  const isPortraitCard = aspectRatio >= 0.40 && aspectRatio <= 0.88;
  const hasValidCardAspect = isLandscapeCard || isSquareCard || isPortraitCard;
  const hasValidArea = areaRatio >= 0.10 && areaRatio <= 0.90;

  const foundTightCard = edgesDetectedCount >= 3 && hasValidCardAspect && hasValidArea;

  return {
    x: finalLeft,
    y: finalTop,
    width: detectedW,
    height: detectedH,
    foundTightCard,
    aspectRatio,
    areaRatio,
  };
}

/**
 * Locates any QR code on a canvas using jsQR and masks its square bounding box in pure white (#FFFFFF)
 * so Tesseract OCR never misreads QR code modules as stray letters ("ay anes", "[OER Rae", "Shay").
 */
export function maskQrCodeRegionsOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): string[] {
  const payloads: string[] = [];
  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const qr = jsQR(imgData.data, w, h, {
      inversionAttempts: 'attemptBoth',
    });
    if (qr && qr.location) {
      if (qr.data && qr.data.trim()) {
        payloads.push(qr.data.trim());
      }
      const xs = [
        qr.location.topLeftCorner.x,
        qr.location.topRightCorner.x,
        qr.location.bottomLeftCorner.x,
        qr.location.bottomRightCorner.x,
      ];
      const ys = [
        qr.location.topLeftCorner.y,
        qr.location.topRightCorner.y,
        qr.location.bottomLeftCorner.y,
        qr.location.bottomRightCorner.y,
      ];
      const pad = Math.max(8, Math.round(Math.min(w, h) * 0.015));
      const x0 = Math.max(0, Math.floor(Math.min(...xs) - pad));
      const y0 = Math.max(0, Math.floor(Math.min(...ys) - pad));
      const x1 = Math.min(w, Math.ceil(Math.max(...xs) + pad));
      const y1 = Math.min(h, Math.ceil(Math.max(...ys) + pad));

      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
      ctx.restore();
    }
  } catch {
    // ignore if canvas read fails
  }
  return payloads;
}

/**
 * Gentle, Edge-Preserving Local Illumination Normalization for OCR:
 * - Never clips outer card text margins and never bleaches colored/navy ink or watermarked text.
 * - Masks QR codes in pure white first so QR modules never confuse OCR.
 */
function isolateCardTextForOcr(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Mask out any QR code in pure white before running illumination normalization
  maskQrCodeRegionsOnCanvas(ctx, w, h);

  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  const totalPixels = w * h;
  const lum = new Uint8Array(totalPixels);

  const hist = new Uint32Array(256);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Use minimum of RGB and weighted luminance so dark-blue / navy / red ink retains deep contrast
    const weighted = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    const minChan = Math.min(r, g, b);
    const yVal = Math.round(weighted * 0.65 + minChan * 0.35);
    lum[p] = yVal;
    hist[yVal]++;
  }

  let cumulative = 0;
  let medianLum = 200;
  for (let v = 0; v < 256; v++) {
    cumulative += hist[v];
    if (cumulative >= totalPixels * 0.5) {
      medianLum = v;
      break;
    }
  }

  if (medianLum < 102) {
    // Dark card stock — invert so light text becomes dark ink on white background
    for (let p = 0; p < totalPixels; p++) {
      lum[p] = 255 - lum[p];
    }
    medianLum = 255 - medianLum;
  }

  const integral = new Float64Array((w + 1) * (h + 1));
  const stride = w + 1;
  for (let y = 1; y <= h; y++) {
    let rowSum = 0;
    const srcRow = (y - 1) * w;
    const dstRow = y * stride;
    const prevRow = (y - 1) * stride;
    for (let x = 1; x <= w; x++) {
      rowSum += lum[srcRow + (x - 1)];
      integral[dstRow + x] = integral[prevRow + x] + rowSum;
    }
  }

  // Use a wide radius (8% of min dimension) so bold headers or divider lines never pull localBg down
  const radius = Math.max(28, Math.round(Math.min(w, h) * 0.08));
  const minAllowedBg = Math.max(120, Math.round(medianLum * 0.86));

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h, y + radius + 1);

    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w, x + radius + 1);
      const area = (x1 - x0) * (y1 - y0);

      const sum =
        integral[y1 * stride + x1] -
        integral[y0 * stride + x1] -
        integral[y1 * stride + x0] +
        integral[y0 * stride + x0];
      const localBg = Math.max(minAllowedBg, sum / area);
      const pixelLum = lum[y * w + x];

      const ratio = pixelLum / localBg;

      let outVal: number;
      if (ratio >= 0.96) {
        outVal = 255;
      } else if (ratio <= 0.74) {
        outVal = 10;
      } else {
        outVal = Math.round(10 + ((ratio - 0.74) / 0.22) * 245);
      }

      data[idx] = outVal;
      data[idx + 1] = outVal;
      data[idx + 2] = outVal;
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

/**
 * High-precision card image normalization, portrait/landscape rectangular card cropping,
 * QR code white-masking (when `forOcrEngine: true`), and gentle illumination enhancement.
 */
export async function normalizeCardImage(
  sourceDataUrl: string,
  options: ImageTransformOptions = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let cropX = 0;
      let cropY = 0;
      let cropW = img.width;
      let cropH = img.height;

      if (options.cropToCardGuide) {
        const probeCanvas = document.createElement('canvas');
        const probeScale = Math.min(1, 520 / Math.max(img.width, img.height));
        probeCanvas.width = Math.max(60, Math.round(img.width * probeScale));
        probeCanvas.height = Math.max(60, Math.round(img.height * probeScale));
        const probeCtx = probeCanvas.getContext('2d', { willReadFrequently: true });
        if (probeCtx) {
          probeCtx.drawImage(img, 0, 0, probeCanvas.width, probeCanvas.height);
          const probeData = probeCtx.getImageData(
            0,
            0,
            probeCanvas.width,
            probeCanvas.height
          ).data;
          const bounds = detectCardRectangleBounds(
            probeData,
            probeCanvas.width,
            probeCanvas.height,
            0.02
          );
          if (bounds.foundTightCard) {
            // Generous safety margin (+5%) so edge phone numbers or URLs are never clipped
            const rawW = Math.round(bounds.width / probeScale);
            const rawH = Math.round(bounds.height / probeScale);
            const padX = Math.round(rawW * 0.05);
            const padY = Math.round(rawH * 0.05);
            cropX = Math.max(0, Math.round(bounds.x / probeScale) - padX);
            cropY = Math.max(0, Math.round(bounds.y / probeScale) - padY);
            cropW = Math.min(img.width - cropX, rawW + 2 * padX);
            cropH = Math.min(img.height - cropY, rawH + 2 * padY);
          } else {
            // Keep full frame if bounds are ambiguous so OCR gets all details
            cropX = 0;
            cropY = 0;
            cropW = img.width;
            cropH = img.height;
          }
        }
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(sourceDataUrl);
        return;
      }

      const rot = options.rotationDegrees || 0;
      const targetMaxDim = options.forOcrEngine ? 1600 : 1280;
      const scale = options.forOcrEngine
        ? Math.min(2.0, targetMaxDim / Math.max(cropW, cropH))
        : Math.min(1.2, targetMaxDim / Math.max(cropW, cropH));
      const outW = Math.max(160, Math.round(cropW * scale));
      const outH = Math.max(120, Math.round(cropH * scale));

      if (rot === 90 || rot === 270) {
        canvas.width = outH;
        canvas.height = outW;
      } else {
        canvas.width = outW;
        canvas.height = outH;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(img, cropX, cropY, cropW, cropH, -outW / 2, -outH / 2, outW, outH);
      ctx.restore();

      if (options.exposureBoost) {
        const w = canvas.width;
        const h = canvas.height;
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const lut = new Uint8Array(256);
        for (let v = 0; v < 256; v++) {
          const lifted = Math.pow(v / 255, 0.72) * 255;
          const contrasted = (lifted - 128) * 1.14 + 132;
          lut[v] = Math.max(0, Math.min(255, Math.round(contrasted)));
        }
        for (let i = 0; i < data.length; i += 4) {
          data[i] = lut[data[i]];
          data[i + 1] = lut[data[i + 1]];
          data[i + 2] = lut[data[i + 2]];
        }
        ctx.putImageData(imgData, 0, 0);
      }

      if (options.forOcrEngine) {
        isolateCardTextForOcr(ctx, canvas.width, canvas.height);
      } else if (options.enhanceContrast) {
        const w = canvas.width;
        const h = canvas.height;
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.max(0, Math.min(255, Math.round((data[i] - 128) * 1.12 + 128)));
          data[i + 1] = Math.max(
            0,
            Math.min(255, Math.round((data[i + 1] - 128) * 1.12 + 128))
          );
          data[i + 2] = Math.max(
            0,
            Math.min(255, Math.round((data[i + 2] - 128) * 1.12 + 128))
          );
        }
        ctx.putImageData(imgData, 0, 0);
      }

      resolve(
        canvas.toDataURL(
          options.forOcrEngine ? 'image/png' : 'image/jpeg',
          options.forOcrEngine ? 1.0 : 0.94
        )
      );
    };
    img.onerror = (err) => reject(err);
    img.src = sourceDataUrl;
  });
}

/**
 * Masks any QR code on a natural RGB card image without altering ink/paper colors,
 * used for Primary OCR Pass A so natural colored typography is read at 100% fidelity while QR noise is blanked.
 */
export async function maskQrOnNaturalImage(sourceDataUrl: string): Promise<{
  maskedDataUrl: string;
  qrPayloads: string[];
}> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve({ maskedDataUrl: sourceDataUrl, qrPayloads: [] });
        return;
      }
      ctx.drawImage(img, 0, 0);
      const qrPayloads = maskQrCodeRegionsOnCanvas(ctx, canvas.width, canvas.height);
      resolve({
        maskedDataUrl: canvas.toDataURL('image/jpeg', 0.95),
        qrPayloads,
      });
    };
    img.onerror = () => resolve({ maskedDataUrl: sourceDataUrl, qrPayloads: [] });
    img.src = sourceDataUrl;
  });
}

export function computePerceptualSignatureFromPixels(
  rgbaData: Uint8ClampedArray,
  width: number,
  height: number
): number[] {
  const grid = 16;
  const sig: number[] = [];
  const marginX = Math.floor(width * 0.14);
  const marginY = Math.floor(height * 0.2);
  const innerW = width - marginX * 2;
  const innerH = height - marginY * 2;
  const cellW = Math.max(1, Math.floor(innerW / grid));
  const cellH = Math.max(1, Math.floor(innerH / grid));

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      let sum = 0;
      let count = 0;
      const startY = marginY + gy * cellH;
      const startX = marginX + gx * cellW;
      for (let y = startY; y < startY + cellH && y < height; y += 2) {
        for (let x = startX; x < startX + cellW && x < width; x += 2) {
          const idx = (y * width + x) * 4;
          sum +=
            0.299 * rgbaData[idx] +
            0.587 * rgbaData[idx + 1] +
            0.114 * rgbaData[idx + 2];
          count++;
        }
      }
      sig.push(count > 0 ? Math.round(sum / count) : 0);
    }
  }
  return sig;
}

export function comparePerceptualSignatures(sigA: number[], sigB: number[]): number {
  if (!sigA.length || sigA.length !== sigB.length) return 0;
  let totalDiff = 0;
  for (let i = 0; i < sigA.length; i++) {
    totalDiff += Math.abs(sigA[i] - sigB[i]);
  }
  const avgDiff = totalDiff / sigA.length;
  return Math.max(0, Math.min(100, Math.round(100 - (avgDiff / 56) * 100)));
}

/**
 * Portrait- & Landscape-Aware Live Video Frame Stability & Business Card Detector:
 * Automatically adapts its Region of Interest (ROI) when the user holds their phone vertically (portrait)
 * so dark background above/below the horizontal business card never blocks auto-capture.
 */
export function analyzeVideoFrameStability(
  video: HTMLVideoElement,
  analysisCanvas: HTMLCanvasElement,
  prevPixels: Uint8ClampedArray | null,
  lastCapturedSignature?: number[] | null
): {
  stabilityScore: number;
  cardDetected: boolean;
  textLineSignal: number;
  focusSharpness: number;
  sameCardStillInView: boolean;
  similarityToLastCard: number;
  motionDelta: number;
  lightingStatus: 'optimal' | 'low_light' | 'glare';
  currentPixels: Uint8ClampedArray;
  currentSignature: number[];
  cardConfidence: number;
  detectionStatus: 'NO_CARD' | 'CARD_DETECTED' | 'CARD_STEADY' | 'CARD_LOCKED';
} {
  const isPortraitStream =
    video.videoHeight > 0 &&
    video.videoWidth > 0 &&
    video.videoHeight > video.videoWidth * 1.05;
  const w = isPortraitStream ? 280 : 400;
  const h = isPortraitStream ? 380 : 260;

  analysisCanvas.width = w;
  analysisCanvas.height = h;
  const ctx = analysisCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || video.readyState < 2) {
    return {
      stabilityScore: 0,
      cardDetected: false,
      textLineSignal: 0,
      focusSharpness: 0,
      sameCardStillInView: false,
      similarityToLastCard: 0,
      motionDelta: 0,
      lightingStatus: 'optimal',
      currentPixels: prevPixels || new Uint8ClampedArray(0),
      currentSignature: [],
      cardConfidence: 0,
      detectionStatus: 'NO_CARD',
    };
  }

  ctx.drawImage(video, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h).data;
  const currentSignature = computePerceptualSignatureFromPixels(imgData, w, h);

  let totalLum = 0;
  let brightPixels = 0;
  let diffSum = 0;
  const pixelCount = w * h;
  const lumGrid = new Uint8Array(pixelCount);

  for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
    const lum = Math.round(
      0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2]
    );
    lumGrid[p] = lum;
    totalLum += lum;
    if (lum > 246) brightPixels++;

    if (prevPixels && prevPixels.length === imgData.length) {
      const prevLum =
        0.299 * prevPixels[i] + 0.587 * prevPixels[i + 1] + 0.114 * prevPixels[i + 2];
      diffSum += Math.abs(lum - prevLum);
    }
  }

  // 1. Broad field-of-view scan covering the active viewfinder (6% to 94% vertical, 5% to 95% horizontal)
  const scanStartY = Math.max(1, Math.floor(h * 0.06));
  const scanEndY = Math.min(h - 1, Math.floor(h * 0.94));
  const scanStartX = Math.max(1, Math.floor(w * 0.05));
  const scanEndX = Math.min(w - 1, Math.floor(w * 0.95));

  let roiPixels = 0;
  let smoothPaperPixels = 0;
  let sharpEdgeGradSum = 0;
  let sharpEdgeCount = 0;
  let minCardLum = 255;
  let maxCardLum = 0;

  // Track printed text strokes and typography lines
  let distinctTextLines = 0;
  let activeTextRowStreak = 0;
  let totalFineStrokePairs = 0;

  for (let y = scanStartY; y < scanEndY; y += 2) {
    const rowOffset = y * w;
    let fineStrokePairsInRow = 0;
    let lastEdgeX = -100;

    for (let x = scanStartX; x < scanEndX; x++) {
      const lum = lumGrid[rowOffset + x];
      const prevX = lumGrid[rowOffset + x - 1];
      const gradX = Math.abs(lum - prevX);
      const gradY = Math.abs(lum - lumGrid[(y - 1) * w + x]);
      const grad = Math.max(gradX, gradY);

      roiPixels++;
      if (lum < minCardLum) minCardLum = lum;
      if (lum > maxCardLum) maxCardLum = lum;

      if (grad <= 16) {
        smoothPaperPixels++;
      }

      if (gradX >= 14) {
        sharpEdgeGradSum += gradX;
        sharpEdgeCount++;

        const strokeWidth = x - lastEdgeX;
        if (strokeWidth >= 1 && strokeWidth <= 16) {
          fineStrokePairsInRow++;
          totalFineStrokePairs++;
        }
        lastEdgeX = x;
      }
    }

    // A row with 2 or more fine text strokes represents printed character glyphs
    const isTextRow = fineStrokePairsInRow >= 2 && fineStrokePairsInRow <= 75;
    if (isTextRow) {
      activeTextRowStreak++;
    } else {
      if (activeTextRowStreak >= 2) {
        distinctTextLines++;
      }
      activeTextRowStreak = 0;
    }
  }

  if (activeTextRowStreak >= 2) {
    distinctTextLines++;
  }

  const paperSmoothnessRatio = roiPixels > 0 ? smoothPaperPixels / roiPixels : 0;

  const focusSharpness =
    sharpEdgeCount >= 8 ? Math.round((sharpEdgeGradSum / sharpEdgeCount) * 0.6) : 0;

  // 2. Guide-box boundary contrast check
  const startY = Math.floor(h * (isPortraitStream ? 0.22 : 0.12));
  const endY = Math.floor(h * (isPortraitStream ? 0.78 : 0.88));
  const startX = Math.floor(w * 0.06);
  const endX = Math.floor(w * 0.94);

  let topBorderDelta = 0;
  let bottomBorderDelta = 0;
  let leftBorderDelta = 0;
  let rightBorderDelta = 0;
  let borderSamplePoints = 0;

  const sampleStep = 4;
  for (let x = startX + 4; x < endX - 4; x += sampleStep) {
    const yTopIn = (startY + 3) * w + x;
    const yTopOut = Math.max(0, startY - 5) * w + x;
    topBorderDelta += Math.abs(lumGrid[yTopIn] - lumGrid[yTopOut]);

    const yBottomIn = (endY - 3) * w + x;
    const yBottomOut = Math.min(h - 1, endY + 5) * w + x;
    bottomBorderDelta += Math.abs(lumGrid[yBottomIn] - lumGrid[yBottomOut]);
    borderSamplePoints++;
  }

  let sideSamplePoints = 0;
  for (let y = startY + 4; y < endY - 4; y += sampleStep) {
    const xLeftIn = y * w + (startX + 3);
    const xLeftOut = y * w + Math.max(0, startX - 5);
    leftBorderDelta += Math.abs(lumGrid[xLeftIn] - lumGrid[xLeftOut]);

    const xRightIn = y * w + (endX - 3);
    const xRightOut = y * w + Math.min(w - 1, endX + 5);
    rightBorderDelta += Math.abs(lumGrid[xRightIn] - lumGrid[xRightOut]);
    sideSamplePoints++;
  }

  const avgTopBottomContrast = borderSamplePoints > 0 ? (topBorderDelta + bottomBorderDelta) / (2 * borderSamplePoints) : 0;
  const avgLeftRightContrast = sideSamplePoints > 0 ? (leftBorderDelta + rightBorderDelta) / (2 * sideSamplePoints) : 0;
  const cardBoundaryContrast = Math.round((avgTopBottomContrast + avgLeftRightContrast) / 2);

  // 3. Document quadrilateral detection check anywhere in the frame
  const detectedBounds = detectCardRectangleBounds(imgData, w, h, 0.02);
  const foundDocumentQuad = detectedBounds.foundTightCard;

  const avgLum = totalLum / pixelCount;
  const glareRatio = brightPixels / pixelCount;
  const avgDiff = prevPixels && prevPixels.length === imgData.length ? diffSum / pixelCount : 25;

  const lightingStatus: 'optimal' | 'low_light' | 'glare' =
    avgLum < 28 ? 'low_light' : glareRatio > 0.40 ? 'glare' : 'optimal';

  const contrastSpan = maxCardLum - minCardLum;

  // Genuine multi-cue business card confidence scoring (0-100)
  const isSharpFocus = focusSharpness >= (lightingStatus === 'low_light' ? 5 : 7);
  const isGoodContrast = contrastSpan >= 28 && avgLum >= 20 && avgLum <= 245;

  // Genuine printed typography:
  // Business cards contain multiple words, lines, and phone/email glyphs.
  // Wood tables or grain texture produce random isolated pixels, NOT coherent lines of text.
  const hasGenuineTypography =
    (distinctTextLines >= 2 && totalFineStrokePairs >= 8) ||
    (distinctTextLines >= 1 && totalFineStrokePairs >= 14) ||
    totalFineStrokePairs >= 18;

  // Physical card boundary requirement:
  // A business card is a distinct rectangular paper object. Either detected quad or edge contrast.
  const hasPhysicalCardBoundary =
    foundDocumentQuad ||
    detectedBounds.foundTightCard ||
    (cardBoundaryContrast >= 11 &&
      (detectedBounds.areaRatio ?? 0) >= 0.08 &&
      (detectedBounds.areaRatio ?? 0) <= 0.95 &&
      (((detectedBounds.aspectRatio ?? 0) >= 0.35 && (detectedBounds.aspectRatio ?? 0) <= 2.8)));

  let cardConfidence = 0;
  if (isGoodContrast) cardConfidence += 15;
  if (isSharpFocus) cardConfidence += 20;
  if (hasGenuineTypography) cardConfidence += 35;
  if (hasPhysicalCardBoundary) cardConfidence += 30;

  // STRICT FILTER: If scene has no printed typography AND no physical card boundaries, it's an empty desk/wall.
  const hasSubstantialText = totalFineStrokePairs >= 8 || distinctTextLines >= 2;
  const isCompletelyEmptyDesk = !hasSubstantialText && !foundDocumentQuad && !detectedBounds.foundTightCard && cardBoundaryContrast < 11;

  if (isCompletelyEmptyDesk) {
    cardConfidence = 0;
  }

  // A card is detected when sharp focus, good contrast, and at least one strong card cue (typography or boundary) are confirmed
  const cardDetected =
    !isCompletelyEmptyDesk &&
    isSharpFocus &&
    isGoodContrast &&
    (hasGenuineTypography || hasPhysicalCardBoundary) &&
    cardConfidence >= 55;

  const textLineSignal = Math.max(distinctTextLines, Math.min(5, Math.floor(totalFineStrokePairs / 8)));

  // Stability is ONLY active when a real card is confirmed. If no card, stability is strictly 0.
  const rawStability = Math.max(0, Math.min(100, Math.round(100 - avgDiff * 4.4)));
  const stabilityScore = cardDetected ? rawStability : 0;

  const similarityToLastCard =
    lastCapturedSignature && lastCapturedSignature.length > 0
      ? comparePerceptualSignatures(currentSignature, lastCapturedSignature)
      : 0;

  const sameCardStillInView = similarityToLastCard >= 78;

  let detectionStatus: 'NO_CARD' | 'CARD_DETECTED' | 'CARD_STEADY' | 'CARD_LOCKED' = 'NO_CARD';
  if (!cardDetected) {
    detectionStatus = 'NO_CARD';
  } else if (stabilityScore >= 60 && !sameCardStillInView) {
    detectionStatus = 'CARD_STEADY';
  } else {
    detectionStatus = 'CARD_DETECTED';
  }

  return {
    stabilityScore,
    cardDetected,
    textLineSignal,
    focusSharpness,
    sameCardStillInView,
    similarityToLastCard,
    motionDelta: avgDiff,
    lightingStatus,
    currentPixels: new Uint8ClampedArray(imgData),
    currentSignature,
    cardConfidence,
    detectionStatus,
  };
}

/**
 * Fast Preliminary Frame Business Card Validation:
 * Quickly verifies whether a captured video canvas contains a discernible business card
 * or whether the camera was pointed at an empty table, wall, ceiling, keyboard, or darkness.
 */
export function validateFrameCardPresence(canvas: HTMLCanvasElement): {
  hasCard: boolean;
  confidence: number;
  reason?: string;
} {
  const w = Math.min(canvas.width, 320);
  const h = Math.round((w * canvas.height) / Math.max(1, canvas.width));
  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const ctx = tmpCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { hasCard: true, confidence: 50 };

  ctx.drawImage(canvas, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h).data;

  let totalLum = 0;
  let minLum = 255;
  let maxLum = 0;
  const totalPixels = w * h;

  for (let i = 0; i < imgData.length; i += 4) {
    const lum = Math.round(0.299 * imgData[i] + 0.587 * imgData[i + 1] + 0.114 * imgData[i + 2]);
    totalLum += lum;
    if (lum < minLum) minLum = lum;
    if (lum > maxLum) maxLum = lum;
  }
  const avgLum = totalLum / totalPixels;
  const contrastSpan = maxLum - minLum;

  if (avgLum < 18) {
    return { hasCard: false, confidence: 0, reason: 'Camera view is too dark. Please illuminate the card.' };
  }
  if (avgLum > 248 && contrastSpan < 22) {
    return { hasCard: false, confidence: 0, reason: 'Camera view is blank or overexposed.' };
  }
  if (contrastSpan < 32) {
    return { hasCard: false, confidence: 5, reason: 'No card contrast or edges detected in frame.' };
  }

  // Check document rectangle bounds
  const bounds = detectCardRectangleBounds(imgData, w, h, 0.02);

  // Check typographic character strokes in horizontal sweeps
  let totalFineStrokePairs = 0;
  let distinctTextLines = 0;
  let activeStreak = 0;

  for (let y = 6; y < h - 6; y += 3) {
    let rowStrokes = 0;
    let lastEdgeX = -100;
    for (let x = 6; x < w - 6; x++) {
      const idx = (y * w + x) * 4;
      const prevIdx = (y * w + (x - 1)) * 4;
      const grad = Math.abs(imgData[idx] - imgData[prevIdx]);
      if (grad >= 16) {
        const span = x - lastEdgeX;
        if (span >= 2 && span <= 14) {
          rowStrokes++;
          totalFineStrokePairs++;
        }
        lastEdgeX = x;
      }
    }
    if (rowStrokes >= 2 && rowStrokes <= 50) {
      activeStreak++;
    } else {
      if (activeStreak >= 2) distinctTextLines++;
      activeStreak = 0;
    }
  }
  if (activeStreak >= 2) distinctTextLines++;

  const hasTypography =
    (distinctTextLines >= 2 && totalFineStrokePairs >= 8) ||
    (distinctTextLines >= 1 && totalFineStrokePairs >= 14) ||
    totalFineStrokePairs >= 18;
  const hasBounds =
    bounds.foundTightCard ||
    ((bounds.areaRatio ?? 0) >= 0.08 &&
      (((bounds.aspectRatio ?? 0) >= 0.35 && (bounds.aspectRatio ?? 0) <= 2.8)));

  if (!hasBounds && !hasTypography) {
    return {
      hasCard: false,
      confidence: 0,
      reason: 'No business card or printed text detected in camera view.',
    };
  }

  const confidence = Math.min(
    100,
    (hasBounds ? 40 : 20) + (hasTypography ? 40 : 20) + (contrastSpan >= 35 ? 20 : 10)
  );
  return { hasCard: true, confidence };
}

let sharedAudioCtx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new AudioCtx();
    } catch {
      return null;
    }
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getSharedAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {}
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}

/**
 * Plays an authentic mechanical camera shutter click (two-stage blade release and snap) with 0ms latency
 */
export function playShutterClickSound(enabled = true): void {
  if (!enabled) return;
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // Stage 1: Mechanical Shutter Blade Release Click (High snappy transient)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    const filter1 = ctx.createBiquadFilter();
    filter1.type = 'bandpass';
    filter1.frequency.setValueAtTime(1400, now);
    filter1.Q.setValueAtTime(3, now);

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(1200, now);
    osc1.frequency.exponentialRampToValueAtTime(300, now + 0.025);

    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc1.connect(filter1);
    filter1.connect(gain1);
    gain1.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.028);

    // Stage 2: Mechanical Shutter Close Thud (Crisp metallic closure ~35ms later)
    const t2 = now + 0.035;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    const filter2 = ctx.createBiquadFilter();
    filter2.type = 'lowpass';
    filter2.frequency.setValueAtTime(950, t2);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(800, t2);
    osc2.frequency.exponentialRampToValueAtTime(180, t2 + 0.035);

    gain2.gain.setValueAtTime(0.3, t2);
    gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.035);

    osc2.connect(filter2);
    filter2.connect(gain2);
    gain2.connect(ctx.destination);

    osc2.start(t2);
    osc2.stop(t2 + 0.038);
  } catch {
    // Ignore if audio context blocked
  }
}

/**
 * Plays a crisp musical notification chime when extraction completes or flags duplicate/error.
 */
export function playScannerBeep(
  type: 'captured' | 'review' | 'duplicate' | 'error',
  enabled = true
): void {
  if (!enabled) return;
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      if (type === 'captured') navigator.vibrate([40]);
      else if (type === 'review') navigator.vibrate([35, 50, 35]);
      else if (type === 'duplicate') navigator.vibrate([70, 40, 70]);
    }

    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    if (type === 'captured') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, now); // D5
      osc.frequency.setValueAtTime(880, now + 0.065); // A5
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.22);
    } else if (type === 'review') {
      // Pleasant 2-tone alert chime indicating card segregated for review
      osc.type = 'sine';
      osc.frequency.setValueAtTime(659.25, now); // E5
      osc.frequency.setValueAtTime(523.25, now + 0.08); // C5
      gain.gain.setValueAtTime(0.20, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
      osc.start(now);
      osc.stop(now + 0.26);
    } else if (type === 'duplicate') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(349.23, now + 0.09);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now);
      osc.stop(now + 0.25);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(330, now);
      gain.gain.setValueAtTime(0.14, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.start(now);
      osc.stop(now + 0.18);
    }
  } catch {
    // ignore if audio context blocked
  }
}

/**
 * Chime-only notification policy: spoken voice words ("Card saved", "Same card") are disabled
 * per user preference so only the crisp chime sound plays.
 */
export function speakVoiceNotification(_shortCue: string, _enabled = true): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

/**
 * Decodes QR codes directly on-device using cross-browser `jsQR` + native `BarcodeDetector` fallback.
 */
export async function decodeQrOrBarcodeFromDataUrl(dataUrl: string): Promise<string[]> {
  if (typeof window === 'undefined' || !dataUrl) {
    return [];
  }
  const found = new Set<string>();
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = dataUrl;
    });

    // 1. Cross-browser jsQR decode
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1000 / Math.max(img.width, img.height));
    canvas.width = Math.max(80, Math.round(img.width * scale));
    canvas.height = Math.max(80, Math.round(img.height * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const qr = jsQR(imgData.data, canvas.width, canvas.height, {
        inversionAttempts: 'attemptBoth',
      });
      if (qr && qr.data && qr.data.trim()) {
        found.add(qr.data.trim());
      }
    }

    // 2. Native BarcodeDetector if available
    if ('BarcodeDetector' in window) {
      const DetectorClass = (window as any).BarcodeDetector;
      const detector = new DetectorClass({ formats: ['qr_code'] });
      const results = await detector.detect(img);
      if (Array.isArray(results)) {
        for (const r of results) {
          const val = String(r?.rawValue || '').trim();
          if (val) found.add(val);
        }
      }
    }
  } catch {
    // ignore
  }
  return Array.from(found);
}

export async function detectCardOrientationFromDataUrl(
  dataUrl: string
): Promise<'horizontal' | 'vertical'> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e);
      el.src = dataUrl;
    });
    return img.height > img.width * 1.08 ? 'vertical' : 'horizontal';
  } catch {
    return 'horizontal';
  }
}
