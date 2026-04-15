const DEFAULT_MAX_DIMENSION = 1920
const JPEG_QUALITY = 0.8

/**
 * Resize an image file to at most maxDimension px on the longest side and export as JPEG.
 * Returns the raw base64 string and a data URL for preview.
 *
 * @param file - The image File to resize.
 * @param maxDimension - Maximum pixels on the longest side (default 1920). Pass 800 for product images.
 */
export function resizeImage(
  file: File,
  maxDimension = DEFAULT_MAX_DIMENSION,
): Promise<{ base64: string; dataUrl: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(url)

      let { width, height } = img
      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height / width) * maxDimension)
          width = maxDimension
        } else {
          width = Math.round((width / height) * maxDimension)
          height = maxDimension
        }
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)
      const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
      const base64 = dataUrl.split(',')[1]
      resolve({ base64, dataUrl })
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to load image'))
    }

    img.src = url
  })
}
