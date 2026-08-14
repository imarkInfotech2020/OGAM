package ai.offgridmobile.clipboard

import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * The live bridge between Android's Accessibility service and the React clipboard observer.
 *
 * Android can withhold both clipboard content and the clipboard-change callback while Off Grid is in
 * the background. The Accessibility service sees the user's explicit Copy action, so it publishes the
 * selected text through this process-local bridge instead of waiting for a callback that may not come.
 */
internal class ClipboardAccessibilityCapture {
    private val lock = Any()
    private var listener: ((String, Long) -> Unit)? = null

    fun addListener(next: (String, Long) -> Unit) {
        synchronized(lock) {
            listener = next
        }
    }

    fun removeListener(current: (String, Long) -> Unit) {
        synchronized(lock) {
            if (listener === current) listener = null
        }
    }

    fun publish(text: String, at: Long) {
        val current = synchronized(lock) { listener }
        current?.invoke(text, at)
    }
}

/** Pure rules for the small set of Accessibility events used by clipboard Sync. */
internal class ClipboardAccessibilityEventRules(
    copyLabels: Set<String>,
) {
    private val normalizedCopyLabels = copyLabels.mapTo(mutableSetOf(), ::normalize)

    fun selectedText(text: List<CharSequence>, from: Int, to: Int): String? {
        if (from < 0 || to < 0 || from >= to) return null
        val whole = text.firstOrNull { to <= it.length }?.toString() ?: return null
        return whole.substring(from, to)
    }

    fun isCopyCommand(
        action: Int,
        eventType: Int,
        text: List<CharSequence>,
        contentDescription: CharSequence?,
    ): Boolean {
        if (
            action == AccessibilityNodeInfo.ACTION_COPY ||
            action == AccessibilityNodeInfo.ACTION_CUT
        ) return true
        if (eventType != AccessibilityEvent.TYPE_VIEW_CLICKED) return false
        val description = contentDescription?.let(::sequenceOf) ?: emptySequence()
        return (text.asSequence() + description)
            .map(CharSequence::toString)
            .map(::normalize)
            .any(normalizedCopyLabels::contains)
    }

    private companion object {
        fun normalize(value: String): String = value.trim().lowercase()
    }
}
