plugins {
    alias(libs.plugins.androidApplication)
    alias(libs.plugins.composeCompiler)
}

val releaseName = providers.gradleProperty("localassistant.version").orNull ?: "0.1.0"
val releaseCode = providers.gradleProperty("localassistant.code").orNull?.toInt() ?: 1
val keystore = providers.environmentVariable("ANDROID_KEYSTORE_FILE").orNull?.takeIf { it.isNotEmpty() }

android {
    namespace = "dev.localassistant.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.orochibraru.localassistant"
        minSdk = 29
        targetSdk = 36
        versionCode = releaseCode
        versionName = releaseName
    }

    signingConfigs {
        if (keystore != null) {
            create("release") {
                storeFile = file(keystore)
                storePassword = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull
                keyAlias = providers.environmentVariable("ANDROID_KEY_ALIAS").orNull
                keyPassword = providers.environmentVariable("ANDROID_KEY_PASSWORD").orNull
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
        }
    }

    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(project(":shared"))
    implementation(libs.androidx.activity.compose)
}
