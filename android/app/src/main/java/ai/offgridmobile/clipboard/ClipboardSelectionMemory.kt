package ai.offgridmobile.clipboard

/**
 * The text a copy took, when the clipboard itself will not say.
 *
 * Android 10 and later refuse `primaryClip` to an app that does not hold focus, so a copy made in
 * ANOTHER app arrives as a change notification with no content: the listener fires, the read returns
 * null, and the copy is lost. Accessibility is the other half of that fact - it reports the selection
 * as the user makes it - so remembering the last selection turns a contentless notification into the
 * text that was actually copied.
 *
 * Pure and self-contained on purpose: this is the only judgement in the whole path ("is this selection
 * recent enough to be what was just copied"), and it must be readable without a device, a service, or
 * an emulator.
 */
internal class ClipboardSelectionMemory(
    /**
     * How long a selection stays eligible.
     *
     * A copy follows its selection by the time it takes to reach for the menu, so the window has to
     * cover a deliberate tap and no more. Too long and an old selection is attributed to an unrelated
     * copy - which would publish text the user never copied, the one outcome worse than losing it.
     */
    private val eligibilityMs: Long = 30_000L,
) {
    private var text: String? = null
    private var recordedAt: Long = 0L

    /** Accessibility saw the user select something. A fact, stored without interpretation. */
    fun remember(selected: String, at: Long) {
        val trimmed = selected.trim()
        if (trimmed.isEmpty()) return
        text = selected
        recordedAt = at
    }

    /**
     * The text to attribute to a copy that happened at `at`, or null when nothing may be.
     *
     * Consumed on read: one selection answers for ONE copy. Left in place, a single selection would be
     * re-published by every later clipboard change - a paste loop with no new content behind it.
     */
    fun takeFor(at: Long): String? {
        val remembered = text ?: return null
        if (at < recordedAt) return null
        if (at - recordedAt > eligibilityMs) {
            forget()
            return null
        }
        forget()
        return remembered
    }

    fun forget() {
        text = null
        recordedAt = 0L
    }
}
