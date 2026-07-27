package ai.offgridmobile.clipboard

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.app.Application
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
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
        assertEquals("received from desktop" to 42.0, observed.last())

        observer.setEnabled(false)
        clipboard.setPrimaryClip(ClipData.newPlainText("test", "must stay local"))
        assertEquals(2, observed.size)
    }
}
