
plugins {
    alias(libs.plugins.gradle.versions)
    alias(libs.plugins.version.catalog.update)
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.parcelize) apply false
    alias(libs.plugins.compose) apply false

    id("com.google.devtools.ksp") version "2.0.21-1.0.27" apply false
}

apply("${project.rootDir}/buildscripts/toml-updater-config.gradle")
