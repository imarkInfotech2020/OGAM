package ai.offgridmobile.pdf

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise
import com.tom_roush.pdfbox.android.PDFBoxResourceLoader
import com.tom_roush.pdfbox.pdmodel.PDDocument
import com.tom_roush.pdfbox.text.PDFTextStripper
import java.io.File

class PDFExtractorModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        PDFBoxResourceLoader.init(reactContext)
    }

    override fun getName(): String = "PDFExtractorModule"

    @ReactMethod
    fun extractText(filePath: String, promise: Promise) {
        Thread {
            try {
                val file = File(filePath)
                if (!file.exists()) {
                    promise.reject("PDF_ERROR", "File not found: $filePath")
                    return@Thread
                }

                val document = PDDocument.load(file)
                val stripper = PDFTextStripper()
                val text = stripper.getText(document)
                document.close()

                promise.resolve(text)
            } catch (e: Exception) {
                promise.reject("PDF_ERROR", "Failed to extract text: ${e.message}", e)
            }
        }.start()
    }
}
