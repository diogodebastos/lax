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
        versionCode = 1
        versionName = "0.2.0"
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
