/**
 * Generates all required PWA icon files for BizSense Ghana.
 * Run once with: node scripts/generate-icons.mjs
 *
 * Brand: #00704A (Deep Forest Green), white "B", Inter-style sans-serif.
 * Outputs to public/ — committed to the repo so the production build can serve them.
 */

import sharp from 'sharp'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(__dirname, '..', 'public')

const GREEN = '#00704A'

/**
 * Build an SVG icon at the given logical size.
 * @param {number} size      - viewBox / nominal pixel size
 * @param {boolean} maskable - if true: no rounded rect (browser masks it), "B" smaller for safe-zone
 */
function buildSvg(size, maskable = false) {
  const fontSize = maskable ? size * 0.42 : size * 0.52
  // Vertical centre-of-cap for most sans-serif fonts is ≈ 72 % of em from top
  const textY = size * 0.5 + fontSize * 0.36

  const background = maskable
    ? `<rect width="${size}" height="${size}" fill="${GREEN}" />`
    : `<rect width="${size}" height="${size}" rx="${Math.round(size * 0.1875)}" fill="${GREEN}" />`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${background}
  <text
    x="${size / 2}"
    y="${textY.toFixed(1)}"
    font-family="Arial, Helvetica, sans-serif"
    font-size="${fontSize.toFixed(1)}"
    font-weight="700"
    text-anchor="middle"
    fill="white"
  >B</text>
</svg>`
}

const icons = [
  { file: 'icon-192.png',         size: 192, maskable: false },
  { file: 'icon-512.png',         size: 512, maskable: false },
  { file: 'icon-maskable-512.png',size: 512, maskable: true  },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
]

for (const { file, size, maskable } of icons) {
  const svg = buildSvg(size, maskable)
  const outPath = resolve(publicDir, file)
  await sharp(Buffer.from(svg))
    .png()
    .toFile(outPath)
  console.log(`✓  ${file}  (${size}×${size}${maskable ? ', maskable' : ''})`)
}

console.log('\nAll icons written to public/')
