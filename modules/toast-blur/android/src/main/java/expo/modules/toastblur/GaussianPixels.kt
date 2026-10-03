package expo.modules.toastblur

import kotlin.math.floor
import kotlin.math.roundToInt
import kotlin.math.sqrt

/** Three separable box passes approximate a Gaussian, identically on every Android API. */
internal object GaussianPixels {
  fun blur(pixels: IntArray, width: Int, height: Int, sigma: Float, scratch: IntArray) {
    val ideal = sqrt(4 * sigma * sigma + 1.0)
    var lower = floor(ideal).toInt()
    if (lower % 2 == 0) lower--
    lower = lower.coerceAtLeast(1)
    val upper = lower + 2
    val lowerPasses = ((12 * sigma * sigma - 3 * lower * lower - 12 * lower - 9) /
      (-4.0 * lower - 4)).roundToInt().coerceIn(0, 3)
    repeat(3) { pass ->
      val radius = ((if (pass < lowerPasses) lower else upper) - 1) / 2
      box(pixels, scratch, width, height, radius, horizontal = true)
      box(scratch, pixels, width, height, radius, horizontal = false)
    }
  }

  private fun box(source: IntArray, target: IntArray, width: Int, height: Int, radius: Int, horizontal: Boolean) {
    val length = if (horizontal) width else height
    val lines = if (horizontal) height else width
    val stride = if (horizontal) 1 else width
    val divisor = 2 * radius + 1
    for (line in 0 until lines) {
      val start = if (horizontal) line * width else line
      var a = 0
      var r = 0
      var g = 0
      var b = 0
      for (offset in -radius..radius) {
        val pixel = source[start + offset.coerceIn(0, length - 1) * stride]
        a += pixel ushr 24
        r += (pixel ushr 16) and 255
        g += (pixel ushr 8) and 255
        b += pixel and 255
      }
      for (position in 0 until length) {
        target[start + position * stride] =
          (((a + divisor / 2) / divisor) shl 24) or
          (((r + divisor / 2) / divisor) shl 16) or
          (((g + divisor / 2) / divisor) shl 8) or
          ((b + divisor / 2) / divisor)
        val outgoing = source[start + (position - radius).coerceIn(0, length - 1) * stride]
        val incoming = source[start + (position + radius + 1).coerceIn(0, length - 1) * stride]
        a += (incoming ushr 24) - (outgoing ushr 24)
        r += ((incoming ushr 16) and 255) - ((outgoing ushr 16) and 255)
        g += ((incoming ushr 8) and 255) - ((outgoing ushr 8) and 255)
        b += (incoming and 255) - (outgoing and 255)
      }
    }
  }
}
