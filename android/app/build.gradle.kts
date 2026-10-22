plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.diogodebastos.lax"
    compileSdk = 34
    defaultConfig {
        applicationId = "com.diogodebastos.lax"
        minSdk = 30
        targetSdk = 34
        versionCode = 2
        versionName = "0.3.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

// An offline copy of the Lax page, shown (asleep) when the Mac can't be reached.
val laxAssets = layout.buildDirectory.dir("generated/laxAssets")
val laxPage = tasks.register<Copy>("laxPage") {
    from(rootProject.file("../public")) { include("index.html", "lax.js", "heard.js", "chip.js", "body.js") }
    into(laxAssets)
    filter { it.replace(Regex("lax\\.js\\?v=\\d+"), "lax.js") }
}
android.sourceSets["main"].assets.srcDir(laxAssets.get().asFile)
tasks.named("preBuild") { dependsOn(laxPage) }
