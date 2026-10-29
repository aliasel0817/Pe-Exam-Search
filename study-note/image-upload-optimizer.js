/*
 * Study-note image upload optimizer.
 * 1 MiB+ still images: browser-native WebP quality 0.98, unchanged dimensions.
 * The browser encoder is not bit-identical to PixelSaver's Pillow/libwebp
 * quality=98, method=6, exact=True encoder. Existing Drive files are never
 * modified here. No external services or metadata are accessed.
 *
 * Metadata-bearing and animated images keep their originals: browser canvas
 * does not reliably retain EXIF/ICC/XMP or animation frames.
 */
(function attachImageUploadOptimizer(root) {
  'use strict';

  const THRESHOLD_BYTES = 1024 * 1024;
  const QUALITY = 0.98;
  const MAX_DIMENSION = 16384;
  const MAX_PIXELS = 32 * 1024 * 1024;

  function ascii(bytes, offset, length) {
    if (offset < 0 || offset + length > bytes.length) return '';
    return String.fromCharCode(...bytes.subarray(offset, offset + length));
  }

  function hasSensitivePngMetadata(bytes) {
    if (ascii(bytes, 1, 3) !== 'PNG') return true;
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = ((bytes[offset] * 0x1000000) + (bytes[offset + 1] << 16)
        + (bytes[offset + 2] << 8) + bytes[offset + 3]) >>> 0;
      const kind = ascii(bytes, offset + 4, 4);
      if (['iCCP', 'eXIf', 'tEXt', 'zTXt', 'iTXt', 'acTL', 'fcTL'].includes(kind)) return true;
      if (length > bytes.length - offset - 12) return true;
      offset += 12 + length;
      if (kind === 'IEND') return false;
    }
    return true;
  }

  function hasSensitiveJpegMetadata(bytes) {
    if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return true;
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset] !== 0xff) return true;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda) return false; // EOI or pixel data begins
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return true;
      const length = bytes[offset] * 256 + bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) return true;
      // APP1=EXIF/XMP; APP2=ICC; APP13=IPTC; comments also carry user data.
      if ([0xe1, 0xe2, 0xed, 0xfe].includes(marker)) return true;
      offset += length;
    }
    return true;
  }

  function hasSensitiveWebpMetadata(bytes) {
    if (ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return true;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = ascii(bytes, offset, 4);
      const length = (bytes[offset + 4] + bytes[offset + 5] * 256
        + bytes[offset + 6] * 65536 + bytes[offset + 7] * 16777216) >>> 0;
      if (['ANIM', 'ANMF', 'ICCP', 'EXIF', 'XMP '].includes(kind)) return true;
      if (kind === 'VP8X' && length >= 1 && (bytes[offset + 8] & 0x2e)) return true;
      if (length > bytes.length - offset - 8) return true;
      offset += 8 + length + (length % 2);
    }
    return offset !== bytes.length;
  }

  async function hasSensitiveMetadata(file, mime) {
    const data = new Uint8Array(await file.arrayBuffer());
    if (mime === 'image/png') return hasSensitivePngMetadata(data);
    if (mime === 'image/jpeg') return hasSensitiveJpegMetadata(data);
    if (mime === 'image/webp') return hasSensitiveWebpMetadata(data);
    return true;
  }

  async function decodeImage(file) {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file);
      return { width: bitmap.width, height: bitmap.height,
        draw(ctx) { ctx.drawImage(bitmap, 0, 0); },
        release() { bitmap.close?.(); } };
    }
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('이미지 디코딩 실패'));
        img.src = url;
      });
      return { width: img.naturalWidth, height: img.naturalHeight,
        draw(ctx) { ctx.drawImage(img, 0, 0); }, release() {} };
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  function encodeWebp(canvas) {
    return new Promise((resolve, reject) => {
      if (typeof canvas.toBlob !== 'function') return reject(new Error('WebP 인코더 미지원'));
      try { canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('WebP 인코딩 실패')),
        'image/webp', QUALITY); }
      catch (error) { reject(error); }
    });
  }

  function unchanged(file, reason) {
    return { file, optimized: false, reason, originalBytes: file.size, outputBytes: file.size };
  }

  async function optimizeFile(file) {
    if (!file || typeof file.size !== 'number') throw new TypeError('올바른 이미지 파일이 아닙니다.');
    if (file.size < THRESHOLD_BYTES) return unchanged(file, 'below-threshold');
    const mime = String(file.type || '').toLowerCase();
    // Animated GIF, animated WebP, and unknown formats must never lose frames.
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return unchanged(file, 'unsupported-format');
    if (typeof document === 'undefined') return unchanged(file, 'no-browser');

    try {
      if (await hasSensitiveMetadata(file, mime)) return unchanged(file, 'metadata-or-animation');
      const decoded = await decodeImage(file);
      let canvas;
      try {
        if (!decoded.width || !decoded.height || decoded.width > MAX_DIMENSION
          || decoded.height > MAX_DIMENSION || decoded.width * decoded.height > MAX_PIXELS) {
          return unchanged(file, 'too-large-to-render-safely');
        }
        canvas = document.createElement('canvas');
        canvas.width = decoded.width;
        canvas.height = decoded.height;
        const context = canvas.getContext('2d', { alpha: true });
        if (!context) return unchanged(file, 'canvas-unavailable');
        decoded.draw(context);
      } finally { decoded.release(); }
      const converted = await encodeWebp(canvas);
      canvas.width = 0;
      canvas.height = 0;
      if (converted.type !== 'image/webp') return unchanged(file, 'webp-unsupported');
      if (converted.size >= file.size) return unchanged(file, 'not-smaller');
      const verify = await decodeImage(converted);
      const sameSize = verify.width === decoded.width && verify.height === decoded.height;
      verify.release();
      if (!sameSize) return unchanged(file, 'dimensions-changed');
      const baseName = String(file.name || 'image').replace(/\.[^.]+$/, '');
      const optimized = new File([converted], baseName + '_optimized.webp', {
        type: 'image/webp', lastModified: file.lastModified || Date.now(),
      });
      return { file: optimized, optimized: true, reason: 'optimized',
        originalBytes: file.size, outputBytes: optimized.size };
    } catch (error) {
      // Never replace original content after a decoder, encoder, or metadata failure.
      return unchanged(file, 'failed:' + (error?.message || String(error)));
    }
  }

  const api = Object.freeze({ THRESHOLD_BYTES, QUALITY, optimizeFile });
  root.PEImageUploadOptimizer = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
