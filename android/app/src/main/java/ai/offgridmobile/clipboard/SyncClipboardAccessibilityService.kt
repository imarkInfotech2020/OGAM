package ai.offgridmobile.clipboard

import android.accessibilityservice.AccessibilityService
import android.provider.Settings
import android.view.accessibility.AccessibilityEvent

/**
 * Reports what the user selected, so a copy made OUTSIDE this app still has text behind it.
 *
 * It exists because of one platform rule: from Android 10, clipboard reads and change callbacks can be
 * refused to an app without focus. Accessibility is the sanctioned path that still sees the user's
 * explicit selection and Copy action.
 *
 * Deliberately narrow. It reads selection changes and Copy/Cut clicks - no window content, no
 * keystrokes, no scraping of the screen - and stores exactly one string at a time, in memory, consumed
 * by the next explicit Copy action.
 *
 * It never touches the clipboard itself. It publishes the selected text directly to
 * `SyncClipboardObserver`, so delivery does not depend on a background clipboard callback.
 */
class SyncClipboardAccessibilityService : AccessibilityService() {
    private val eventRules by lazy {
        ClipboardAccessibilityEventRules(
            setOf(
                resources.getString(android.R.string.copy),
                resources.getString(android.R.string.cut),
            ),
        )
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        val at = System.currentTimeMillis()

        if (event.eventType == AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED) {
            eventRules.selectedText(event.text, event.fromIndex, event.toIndex)?.let { selection ->
                selectionMemory.remember(selection, at)
            }
        }

        if (
            eventRules.isCopyCommand(
                action = event.action,
                eventType = event.eventType,
                text = event.text,
                contentDescription = event.contentDescription,
            )
        ) {
            selectionMemory.takeFor(at)?.let { selected -> capture.publish(selected, at) }
        }
    }

    override fun onInterrupt() {
        // Nothing to interrupt: this service holds one string and runs no work of its own.
    }

    override fun onDestroy() {
        // Turning the service off must not leave a selection behind for a later copy to claim.
        selectionMemory.forget()
        super.onDestroy()
    }

    companion object {
        /**
         * Shared with `SyncClipboardObserver`, which is instantiated by the React module rather than by
         * the platform - so the two halves cannot be handed to each other and must meet on one owner.
         */
        internal val selectionMemory = ClipboardSelectionMemory()
        internal val capture = ClipboardAccessibilityCapture()

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
