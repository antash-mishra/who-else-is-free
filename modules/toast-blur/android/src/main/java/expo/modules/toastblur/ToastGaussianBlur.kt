package expo.modules.toastblur

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import eightbitlab.com.blurview.BlurAlgorithm

/** CPU filter for this small transient surface; no device-specific material or blur API. */
internal class ToastGaussianBlur(private val captureWidth: () -> Int) : BlurAlgorithm {
  private var pixels = IntArray(0)
  private var scratch = IntArray(0)
  private val paint = Paint(Paint.FILTER_BITMAP_FLAG)

  override fun blur(bitmap: Bitmap, blurRadius: Float): Bitmap {
    val count = bitmap.width * bitmap.height
    if (pixels.size != count) {
      pixels = IntArray(count)
      scratch = IntArray(count)
    }
    bitmap.getPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    // The controller rounds its capture width; compensate using the actual ratio.
    val sigma = blurRadius * bitmap.width / captureWidth().coerceAtLeast(1)
    for (index in pixels.indices) pixels[index] = premultiply(pixels[index])
    GaussianPixels.blur(pixels, bitmap.width, bitmap.height, sigma, scratch)
    for (index in pixels.indices) pixels[index] = unpremultiply(pixels[index])
    bitmap.setPixels(pixels, 0, bitmap.width, 0, 0, bitmap.width, bitmap.height)
    return bitmap
  }

  private fun premultiply(pixel: Int): Int {
    val a = pixel ushr 24
    if (a == 255) return pixel
    return (a shl 24) or
      (((((pixel ushr 16) and 255) * a + 127) / 255) shl 16) or
      (((((pixel ushr 8) and 255) * a + 127) / 255) shl 8) or
      (((pixel and 255) * a + 127) / 255)
  }

  private fun unpremultiply(pixel: Int): Int {
    val a = pixel ushr 24
    if (a == 255 || a == 0) return pixel
    return (a shl 24) or
      (((((pixel ushr 16) and 255) * 255 + a / 2) / a).coerceAtMost(255) shl 16) or
      (((((pixel ushr 8) and 255) * 255 + a / 2) / a).coerceAtMost(255) shl 8) or
      ((((pixel and 255) * 255 + a / 2) / a).coerceAtMost(255))
  }

  override fun render(canvas: Canvas, bitmap: Bitmap) { canvas.drawBitmap(bitmap, 0f, 0f, paint) }
  override fun scaleFactor(): Float = 4f
  override fun canModifyBitmap(): Boolean = true
  override fun getSupportedBitmapConfig(): Bitmap.Config = Bitmap.Config.ARGB_8888
  override fun destroy() { pixels = IntArray(0); scratch = IntArray(0) }
}
