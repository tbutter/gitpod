package io.gitpod.jetbrains.launcher

import com.automation.remarks.junit5.Video
import com.intellij.remoterobot.RemoteRobot
import com.intellij.remoterobot.fixtures.CommonContainerFixture
import com.intellij.remoterobot.fixtures.ComponentFixture
import com.intellij.remoterobot.search.locators.byXpath
import com.intellij.remoterobot.stepsProcessing.StepLogger
import com.intellij.remoterobot.stepsProcessing.StepWorker
import com.intellij.remoterobot.utils.Locators
import com.intellij.remoterobot.utils.hasSingleComponent
import com.intellij.remoterobot.utils.waitFor
import okhttp3.OkHttpClient
import org.junit.jupiter.api.*
import org.junit.jupiter.api.extension.ExtendWith
import org.junit.jupiter.api.extension.ExtensionContext
import org.junit.jupiter.api.extension.TestWatcher
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.time.Duration
import java.util.concurrent.TimeUnit
import javax.imageio.ImageIO
import javax.swing.Box
import javax.swing.JDialog

@Timeout(value = 25, unit = TimeUnit.MINUTES)
class CommandLineProjectTest {
    companion object {
        private var gatewayProcess: Process? = null
        private var tmpDir: Path = Files.createTempDirectory("launcher")
        private lateinit var remoteRobot: RemoteRobot

        @BeforeAll
        @JvmStatic
        fun startIdea() {
            val gatewayLink = System.getProperty("gateway_link")
            val gatewayPluginPath = System.getProperty("gateway_plugin_path")
            if (gatewayPluginPath == null || gatewayPluginPath == "") {
                fail("please provider gateway plugin path")
            }
            if (gatewayLink == null || gatewayLink == "") {
                fail("please provider gateway link")
            }
            StepWorker.registerProcessor(StepLogger())

            val client = OkHttpClient()
            remoteRobot = RemoteRobot("http://localhost:8082", client)
            val ideDownloader = IdeDownloader(client)
            gatewayProcess = IdeLauncher.launchIde(
                ideDownloader.downloadAndExtractLatestEap(Ide.GATEWAY, tmpDir),
                mapOf("robot-server.port" to 8082),
                emptyList(),
                listOf(
                    ideDownloader.downloadRobotPlugin(tmpDir),
                    Path.of(gatewayPluginPath)
                ),
                tmpDir,
                listOf(gatewayLink)
            )
            waitFor(Duration.ofSeconds(90), Duration.ofSeconds(5)) {
                remoteRobot.isAvailable()
            }
        }

        @AfterAll
        @JvmStatic
        fun cleanUp() {
            gatewayProcess?.destroy()
            tmpDir.toFile().deleteRecursively()
        }
    }

    @Test
    @Video
    fun test() {
        remoteRobot.find<CommonContainerFixture>(
            Locators.byProperties(Locators.XpathProperty.SIMPLE_CLASS_NAME to "FlatWelcomeFrame"),
            Duration.ofSeconds(100)
        )
    }
}