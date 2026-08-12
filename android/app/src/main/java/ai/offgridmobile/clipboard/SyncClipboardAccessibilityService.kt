package ai.offgridmobile.clipboard

import android.accessibilityservice.AccessibilityService
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent

/**
 * Reports what the user selected, so a copy made OUTSIDE this app still has text behind it.
 *
 * It exists because of one platform rule: from Android 10, `primaryClip` is refused to an app without
 * focus. The change notification still arrives, so this app knows a copy HAPPENED and cannot know what
 * it was. Accessibility is the only sanctioned way to learn the second half.
 *
 * Deliberately narrow. It reads selection events and nothing else - no window content, no keystrokes,
 * no scraping of the screen - and it stores exactly one string at a time, in memory, consumed by the
 * next copy. Its config declares `typeViewTextSelectionChanged` alone, so the platform never delivers
 * the rest.
 *
 * It never touches the clipboard itself. `SyncClipboardObserver` owns that, and asks here only when the
 * platform has denied it a read.
 */
class SyncClipboardAccessibilityService : AccessibilityService() {
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val selection = event?.let(::selectedText) ?: return
        selectionMemory.remember(selection, System.currentTimeMillis())
    }

    override fun onInterrupt() {
        // Nothing to interrupt: this service holds one string and runs no work of its own.
    }

    override fun onDestroy() {
        // Turning the service off must not leave a selection behind for a later copy to claim.
        selectionMemory.forget()
        super.onDestroy()
    }

    /**
     * The selected substring, taken from the event's own indices.
     *
     * `fromIndex`/`toIndex` describe the selection inside the field's full text, so the range is what
     * the user highlighted and the whole text is not. A collapsed range (a caret move, not a selection)
     * carries nothing to copy.
     */
    private fun selectedText(event: AccessibilityEvent): String? {
        val whole = event.text.firstOrNull()?.toString() ?: return null
        val from = event.fromIndex
        val to = event.toIndex
        if (from < 0 || to < 0 || from >= to || to > whole.length) return null
        return whole.substring(from, to)
    }

    companion object {
        /**
         * Shared with `SyncClipboardObserver`, which is instantiated by the React module rather than by
         * the platform - so the two halves cannot be handed to each other and must meet on one owner.
         */
        internal val selectionMemory = ClipboardSelectionMemory()

        /**
         * Is the service switched on in system settings?
         *
         * Read from the setting rather than remembered, because the user can revoke it in Settings at
         * any time and this app is never told. A cached answer would promise a capture that cannot run.
         */
        fun isEnabled(context: android.content.Context): Boolean {
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES,
            ) ?: return false
            // The setting is a colon-separated list of component names, so reading it needs nothing
            // more than a split. `SimpleStringSplitter` is both Iterable and Iterator, which makes
            // `asSequence()` ambiguous and buys nothing here.
            val target = "${context.packageName}/${SyncClipboardAccessibilityService::class.java.name}"
            return enabled.split(':').any { it.trim().equals(target, ignoreCase = true) }
        }
    }
}
