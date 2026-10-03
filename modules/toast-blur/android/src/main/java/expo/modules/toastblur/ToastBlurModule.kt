package expo.modules.toastblur

import android.view.View
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ToastBlurModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ToastBlur")
    View(ToastBlurView::class) {
      Prop("blurSigmaDp") { view: ToastBlurView, radius: Float -> view.setRadius(radius) }
      Prop("materialColor") { view: ToastBlurView, color: Int -> view.setMaterialColor(color) }
      GroupView<ToastBlurView> {
        AddChildView<View> { parent, child, index -> parent.addView(child, index + 1) }
        GetChildCount { parent -> parent.childCount - 1 }
        GetChildViewAt<View> { parent, index -> parent.getChildAt(index + 1) }
        RemoveChildViewAt { parent, index -> parent.removeViewAt(index + 1) }
        RemoveChildView<View> { parent, child -> parent.removeView(child) }
      }
    }
  }
}
