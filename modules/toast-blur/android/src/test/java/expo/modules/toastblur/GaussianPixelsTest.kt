package expo.modules.toastblur

import org.junit.Assert.*
import org.junit.Test

class GaussianPixelsTest {
  @Test fun `flat colors survive the filter including alpha`() {
    for (color in intArrayOf(0xff000000.toInt(), 0xffffffff.toInt(), 0xff3b91ac.toInt(), 0)) {
      val pixels = IntArray(35) { color }
      GaussianPixels.blur(pixels, 7, 5, 3f, IntArray(35))
      assertTrue(pixels.all { it == color })
    }
  }

  @Test fun `hard edge becomes a monotonic symmetric transition`() {
    val pixels = IntArray(320) { if (it % 64 < 32) 0xff000000.toInt() else 0xffffffff.toInt() }
    GaussianPixels.blur(pixels, 64, 5, 5f, IntArray(320))
    val row = (0 until 64).map { pixels[128 + it] and 255 }
    assertEquals(0, row.first()); assertEquals(255, row.last())
    assertTrue(row.zipWithNext().all { (left, right) -> left <= right })
    assertTrue(row[28] in 1..126); assertTrue(row[35] in 129..254)
    for (x in 0 until 64) assertTrue(kotlin.math.abs(row[x] + row[63 - x] - 255) <= 2)
  }

  @Test fun `fresh capture does not retain an old frame`() {
    val pixels = IntArray(100) { if (it % 10 < 5) 0xff000000.toInt() else 0xffffffff.toInt() }
    val scratch = IntArray(100)
    GaussianPixels.blur(pixels, 10, 10, 2f, scratch)
    pixels.fill(0xff123456.toInt())
    GaussianPixels.blur(pixels, 10, 10, 2f, scratch)
    assertTrue(pixels.all { it == 0xff123456.toInt() })
  }

  @Test fun `small captures and kernels wider than the capture stay valid`() {
    val pixels = intArrayOf(0xff010203.toInt())
    GaussianPixels.blur(pixels, 1, 1, 20f, IntArray(1))
    assertEquals(0xff010203.toInt(), pixels[0])
  }
  @Test fun `blur is isotropic across horizontal and vertical edges`() {
    val horizontal = IntArray(64 * 64) { if (it % 64 < 32) 0xff000000.toInt() else 0xffffffff.toInt() }
    val vertical = IntArray(64 * 64) { if (it / 64 < 32) 0xff000000.toInt() else 0xffffffff.toInt() }
    GaussianPixels.blur(horizontal, 64, 64, 5f, IntArray(4096))
    GaussianPixels.blur(vertical, 64, 64, 5f, IntArray(4096))
    for (x in 0 until 64) assertEquals(horizontal[32 * 64 + x], vertical[x * 64 + 32])
  }

}
