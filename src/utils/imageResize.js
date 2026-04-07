/**
 * Resize an image file/blob to fit within a bounding box, maintaining aspect ratio.
 * @param {File|Blob} fileOrBlob
 * @param {number} maxW - maximum width (default 50)
 * @param {number} maxH - maximum height (default 50)
 * @returns {Promise<string>} base64 data URL of the resized PNG
 */
export function resizeImage(fileOrBlob, maxW = 100, maxH = 100) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let w = img.naturalWidth;
      let h = img.naturalHeight;

      if (w <= 0 || h <= 0) {
        reject(new Error('Invalid image dimensions'));
        return;
      }

      // Scale down to fit bounding box
      const scale = Math.min(maxW / w, maxH / h, 1);
      w = Math.round(w * scale);
      h = Math.round(h * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
