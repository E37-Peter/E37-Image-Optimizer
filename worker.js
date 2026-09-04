function detectCropBounds(bitmap) {
  const W = bitmap.width, H = bitmap.height;
  const tc = new OffscreenCanvas(W, H);
  const tctx = tc.getContext('2d', { willReadFrequently: true });
  tctx.drawImage(bitmap, 0, 0);
  const d = tctx.getImageData(0, 0, W, H).data;
  function get(x, y) { const i = (y * W + x) * 4; return [d[i], d[i+1], d[i+2]]; }
  function far(p, bg) { return Math.max(Math.abs(p[0]-bg[0]), Math.abs(p[1]-bg[1]), Math.abs(p[2]-bg[2])) > 15; }
  const corners = [get(0,0), get(W-1,0), get(0,H-1), get(W-1,H-1)];
  const bg = [0,1,2].map(c => corners.reduce((s,p) => s+p[c], 0) / 4);
  let top = 0, bot = H-1, lft = 0, rgt = W-1;
  scanT: for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (far(get(x,y),bg)) { top = y; break scanT; }
  scanB: for (let y = H-1; y > top; y--) for (let x = 0; x < W; x++) if (far(get(x,y),bg)) { bot = y; break scanB; }
  scanL: for (let x = 0; x < W; x++) for (let y = top; y <= bot; y++) if (far(get(x,y),bg)) { lft = x; break scanL; }
  scanR: for (let x = W-1; x > lft; x--) for (let y = top; y <= bot; y++) if (far(get(x,y),bg)) { rgt = x; break scanR; }
  const pad = 2;
  const cx = Math.max(0, lft - pad), cy = Math.max(0, top - pad);
  return { x: cx, y: cy, w: Math.min(W - cx, rgt - lft + 1 + pad * 2), h: Math.min(H - cy, bot - top + 1 + pad * 2) };
}

function applySharpen(ctx, cw, ch, amount) {
  const src = ctx.getImageData(0, 0, cw, ch);
  const out = ctx.createImageData(cw, ch);
  const s = src.data, d = out.data;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const i = (y * cw + x) * 4;
      const t = (Math.max(y - 1, 0) * cw + x) * 4;
      const b = (Math.min(y + 1, ch - 1) * cw + x) * 4;
      const l = (y * cw + Math.max(x - 1, 0)) * 4;
      const r = (y * cw + Math.min(x + 1, cw - 1)) * 4;
      const k = 1 + 4 * amount;
      for (let c = 0; c < 3; c++) {
        d[i + c] = Math.min(255, Math.max(0, Math.round(k * s[i + c] - amount * (s[t + c] + s[b + c] + s[l + c] + s[r + c]))));
      }
      d[i + 3] = s[i + 3];
    }
  }
  ctx.putImageData(out, 0, 0);
}

async function findQuality(canvas, fmt, targetBytes) {
  let blob = await canvas.convertToBlob({ type: fmt, quality: 0.95 });
  if (blob.size <= targetBytes) return blob;
  let low = 0.50, high = 0.95, best = null;
  for (let i = 0; i < 8; i++) {
    const mid = (low + high) / 2;
    blob = await canvas.convertToBlob({ type: fmt, quality: mid });
    if (blob.size <= targetBytes) { best = blob; low = mid; }
    else high = mid;
  }
  return best ?? await canvas.convertToBlob({ type: fmt, quality: 0.50 });
}

self.onmessage = async function(e) {
  const { id, buffer, mimeType, settings } = e.data;
  const { size, ratio, customW, customH, fmt, quality, noUpscale, bgColor, sharpness, autoCrop, rotation, padding, ignoreExifOrientation } = settings;

  try {
    const blob = new Blob([buffer], { type: mimeType });
    // Explicitly normalize EXIF orientation (e.g. Orientation=3 on a JPEG from
    // certain phones/scanners) instead of relying on the browser's default,
    // which historically ignored EXIF orientation in createImageBitmap and
    // only started honoring it consistently in newer browser versions.
    // Without this, images can end up upside-down/mirrored after processing
    // even though they look correct in the OS file viewer or in an <img> tag.
    // A user can opt out per image (ignoreExifOrientation) via the metadata
    // panel, in which case the raw pixel data is used as-is.
    const bitmap = await createImageBitmap(blob, { imageOrientation: ignoreExifOrientation ? 'none' : 'from-image' });

    let cw, ch;
    if (ratio === '1:1') { cw = size; ch = size; }
    else if (ratio === '4:5') { cw = size; ch = Math.round(size * 5 / 4); }
    else {
      cw = customW;
      // customH === null/undefined means "auto": keep this image's own aspect
      // ratio instead of forcing a fixed height shared across the whole batch.
      ch = (customH != null) ? customH : Math.round(customW * bitmap.height / bitmap.width);
    }

    let srcX = 0, srcY = 0, srcW = bitmap.width, srcH = bitmap.height;
    if (autoCrop) {
      const crop = detectCropBounds(bitmap);
      srcX = crop.x; srcY = crop.y; srcW = crop.w; srcH = crop.h;
    }

    const canvas = new OffscreenCanvas(cw, ch);
    const ctx = canvas.getContext('2d');

    if (!(fmt === 'image/png' && bgColor === 'transparent')) {
      ctx.fillStyle = bgColor === 'transparent' ? '#ffffff' : bgColor;
      ctx.fillRect(0, 0, cw, ch);
    }

    const rot = (rotation || 0) % 360;
    const swap = rot === 90 || rot === 270;
    const effW = swap ? srcH : srcW, effH = swap ? srcW : srcH;
    const padPx = Math.round(Math.min(cw, ch) * (padding || 0) / 100);
    const maxScale = noUpscale ? 1 : Infinity;
    const scale = Math.min(maxScale, (cw - 2*padPx) / effW, (ch - 2*padPx) / effH);
    const dw = Math.round(effW * scale), dh = Math.round(effH * scale);

    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.rotate(rot * Math.PI / 180);
    if (swap) {
      ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, -dh / 2, -dw / 2, dh, dw);
    } else {
      ctx.drawImage(bitmap, srcX, srcY, srcW, srcH, -dw / 2, -dh / 2, dw, dh);
    }
    ctx.restore();
    bitmap.close();

    if (sharpness > 0) applySharpen(ctx, cw, ch, sharpness / 200);

    const outBlob = (settings.sizeMode && fmt !== 'image/png')
      ? await findQuality(canvas, fmt, settings.targetKB * 1024)
      : await canvas.convertToBlob({ type: fmt, quality });
    const outBuffer = await outBlob.arrayBuffer();

    self.postMessage(
      { id, success: true, buffer: outBuffer, cw, ch, srcX, srcY, srcW, srcH, dw, dh },
      [outBuffer]
    );
  } catch (err) {
    self.postMessage({ id, success: false, error: String(err) });
  }
};
