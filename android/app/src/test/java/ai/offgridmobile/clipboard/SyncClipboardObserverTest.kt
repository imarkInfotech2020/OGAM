package ai.offgridmobile.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.app.Application
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33], application = Application::class)
class SyncClipboardObserverTest {
    @Test
    fun observesAndWritesTheRealAndroidClipboardOnlyWhileEnabled() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val clipboard =
            context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val observed = mutableListOf<Pair<String, Double>>()
        val observer = SyncClipboardObserver(
            context,
            clipboard,
            { text, timestamp -> observed.add(text to timestamp) },
            now = { 42L },
        )

        observer.setEnabled(true)
        clipboard.setPrimaryClip(ClipData.newPlainText("test", "copied locally"))

        assertEquals(listOf("copied locally" to 42.0), observed)

        observer.writeText("received from desktop")
        assertEquals("received from desktop", clipboard.primaryClip?.getItemAt(0)?.text)
        assertEquals(
            "A programmatic Sync write must not be attributed as a local copy",
            listOf("copied locally" to 42.0),
            observed,
        )

        observer.setEnabled(false)
        clipboard.setPrimaryClip(ClipData.newPlainText("test", "must stay local"))
        assertEquals(1, observed.size)
    }

    @Test
    fun selectedTextCopiedOutsideOffGridReachesTheRealObserverWithoutAClipboardCallback() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        val clipboard =
            context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val observed = mutableListOf<Pair<String, Double>>()
        val observer = SyncClipboardObserver(
            context,
            clipboard,
            { text, timestamp -> observed.add(text to timestamp) },
        )
        val service = Robolectric.buildService(SyncClipboardAccessibilityService::class.java)
            .create()
            .get()

        observer.setEnabled(true)
        val selection = AccessibilityEvent().apply {
            eventType = AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED
            text.add("prefix copied outside Off Grid suffix")
            fromIndex = 7
            toIndex = 30
        }
        service.onAccessibilityEvent(selection)

        val copy = AccessibilityEvent().apply {
            eventType = AccessibilityEvent.TYPE_VIEW_CLICKED
            text.add("Copy")
        }
        service.onAccessibilityEvent(copy)

        assertEquals(1, observed.size)
        assertEquals("copied outside Off Grid", observed.single().first)

        service.onAccessibilityEvent(copy)
        assertEquals("One selection must answer for one copy only", 1, observed.size)

        observer.setEnabled(false)
        service.onAccessibilityEvent(selection)
        service.onAccessibilityEvent(copy)
        assertEquals(1, observed.size)
        service.onDestroy()
    }

    @Test
    fun accessibilityRulesKeepOnlyTheSelectionAndRecognizeCopyCommands() {
        val rules = ClipboardAccessibilityEventRules(setOf("Copy", "Cut"))

        assertEquals(
            "selected",
            rules.selectedText(listOf("not long", "the selected value"), 4, 12),
        )
        assertEquals(null, rules.selectedText(listOf("caret"), 2, 2))
        assertTrue(
            rules.isCopyCommand(
                action = 0,
                eventType = AccessibilityEvent.TYPE_VIEW_CLICKED,
                text = listOf("Copy"),
                contentDescription = null,
            ),
        )
        assertTrue(
            rules.isCopyCommand(
                action = AccessibilityNodeInfo.ACTION_COPY,
                eventType = 99,
                text = emptyList(),
                contentDescription = null,
            ),
        )
        assertFalse(
            rules.isCopyCommand(
                action = 0,
                eventType = AccessibilityEvent.TYPE_VIEW_CLICKED,
                text = listOf("Share"),
                contentDescription = null,
            ),
        )
    }

    @Test
    fun anOldSelectionCannotBeAttributedToALaterCopy() {
        val memory = ClipboardSelectionMemory(eligibilityMs = 30_000L)

        memory.remember("private old selection", at = 10L)

        assertEquals(null, memory.takeFor(at = 30_011L))
        assertEquals(null, memory.takeFor(at = 30_012L))
    }
}
