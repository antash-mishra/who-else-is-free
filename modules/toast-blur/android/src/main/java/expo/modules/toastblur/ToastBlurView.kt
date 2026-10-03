package expo.modules.toastblur

import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.view.ViewGroup
import eightbitlab.com.blurview.BlurView
import eightbitlab.com.blurview.BlurViewCanvas
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

/** Toast content and tint are excluded together from the live backdrop capture. */
class ToastBlurView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val blurView = BlurView(context)
  private var sigmaDp = 12.5f
  private var materialColor = Color.TRANSPARENT
  private var configured = false

  init {
    addView(blurView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  // Unlike Expo BlurView's JS siblings, our label is inside this capture boundary.
  override fun draw(canvas: Canvas) {
    if (canvas is BlurViewCanvas) return
    super.draw(canvas)
  }

  // LinearLayout's measurement would give MATCH_PARENT backdrop all available
  // width and remeasure the React text to zero. Yoga owns React child sizes.
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) {
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))
  }

  // Yoga lays out React children; only the internal backdrop needs native layout.
  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    layoutBackdrop()
  }

  private fun layoutBackdrop() {
    if (width == 0 || height == 0) return
    blurView.measure(
      MeasureSpec.makeMeasureSpec(width, MeasureSpec.EXACTLY),
      MeasureSpec.makeMeasureSpec(height, MeasureSpec.EXACTLY)
    )
    blurView.layout(0, 0, width, height)
  }

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    if (!configured) {
      var ancestor = parent
      var root: ViewGroup? = null
      while (ancestor != null) {
        if (ancestor.javaClass.name == "com.swmansion.rnscreens.Screen") {
          root = ancestor as ViewGroup
          break
        }
        ancestor = ancestor.parent
      }
      val decor = appContext.throwingActivity.window.decorView
      root = root ?: decor.findViewById(android.R.id.content)
      blurView.setupWith(root, ToastGaussianBlur { blurView.width })
        .setFrameClearDrawable(decor.background)
      configured = true
    }
    blurView.setBlurAutoUpdate(true)
    applyMaterial()
  }

  override fun onDetachedFromWindow() {
    blurView.setBlurAutoUpdate(false)
    super.onDetachedFromWindow()
  }

  fun setRadius(radius: Float) {
    sigmaDp = radius.coerceIn(1f, 24f)
    layoutBackdrop()
    applyMaterial()
  }

  fun setMaterialColor(color: Int) {
    materialColor = color
    applyMaterial()
  }

  private fun applyMaterial() {
    if (!configured) return
    blurView.setOverlayColor(materialColor)
    blurView.setBlurRadius(sigmaDp * resources.displayMetrics.density)
    blurView.invalidate()
  }

}
