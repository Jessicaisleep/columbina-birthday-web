/**
 * Builds a collision mask from a PNG's alpha channel.  The visible art remains
 * the source of truth: transparent pixels can never cause a collision.
 */
export function loadAlphaMask(source) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d', { willReadFrequently: true })
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const alpha = new Uint8ClampedArray(canvas.width * canvas.height)
      for (let index = 0; index < alpha.length; index += 1) alpha[index] = pixels[index * 4 + 3]
      resolve({ width: canvas.width, height: canvas.height, alpha })
    }
    image.onerror = () => reject(new Error('障碍物透明遮罩读取失败'))
    image.src = source
  })
}

function overlaps(first, second) {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y
}

/**
 * Tests the player's hit box against the opaque pixels of a rendered image.
 * `flipX` and `flipY` follow the CSS transforms used by mirrored obstacles.
 */
export function collidesWithAlpha(hitBox, imageBox, mask, { flipX = false, flipY = false, threshold = 36 } = {}) {
  if (!mask || !overlaps(hitBox, imageBox)) return false

  const left = Math.max(hitBox.x, imageBox.x)
  const right = Math.min(hitBox.x + hitBox.width, imageBox.x + imageBox.width)
  const top = Math.max(hitBox.y, imageBox.y)
  const bottom = Math.min(hitBox.y + hitBox.height, imageBox.y + imageBox.height)
  const sampleStep = Math.max(2, Math.min(5, Math.floor(Math.min(imageBox.width, imageBox.height) / 18)))

  for (let y = top; y < bottom; y += sampleStep) {
    for (let x = left; x < right; x += sampleStep) {
      const rawX = (x - imageBox.x) / imageBox.width
      const rawY = (y - imageBox.y) / imageBox.height
      const normalizedX = flipX ? 1 - rawX : rawX
      const normalizedY = flipY ? 1 - rawY : rawY
      const pixelX = Math.max(0, Math.min(mask.width - 1, Math.floor(normalizedX * mask.width)))
      const pixelY = Math.max(0, Math.min(mask.height - 1, Math.floor(normalizedY * mask.height)))
      if (mask.alpha[pixelY * mask.width + pixelX] > threshold) return true
    }
  }
  return false
}
