package expo.modules.systemnavigation

import android.os.Build
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** The app theme keeps Android's default protection; only onboarding opts out. */
class SystemNavigationModule : Module() {
  private var onboardingActive = false

  override fun definition() = ModuleDefinition {
    Name("SystemNavigation")

    AsyncFunction("setOnboardingActive") { active: Boolean ->
      onboardingActive = active
      applyContrast()
    }.runOnQueue(Queues.MAIN)

    // Activity recreation and returning from the photo picker must retain the
    // focused route's policy rather than leave the newly created window default.
    OnActivityEntersForeground {
      appContext.currentActivity?.runOnUiThread { applyContrast() }
    }

    OnDestroy {
      onboardingActive = false
      appContext.currentActivity?.runOnUiThread { applyContrast() }
    }
  }

  private fun applyContrast() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      appContext.currentActivity?.window?.isNavigationBarContrastEnforced = !onboardingActive
    }
  }
}
