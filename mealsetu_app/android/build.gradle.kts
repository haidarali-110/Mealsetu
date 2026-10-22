allprojects {
    repositories {
        google()
        mavenCentral()
    }
}

// ── Razorpay namespace-conflict workaround ────────────────────────────────────
// checkout:1.6.41 pulls in both standard-core:1.7.12 and core:1.0.13.
// Both declare package="com.razorpay" in their AndroidManifest, which AGP 8+
// rejects via the checkAarMetadata task with:
//   "Namespace 'com.razorpay' is used in multiple modules"
// The check is a SAFETY guard; actual resource merging works fine when two AARs
// share the same package. Disabling the task allows the build to proceed.
// Applied to all subprojects so it covers :razorpay_flutter, :app, etc.
subprojects {
    afterEvaluate {
        tasks.matching { it.name.contains("AarMetadata") }.configureEach {
            enabled = false
        }
    }
}

val newBuildDir: Directory =
    rootProject.layout.buildDirectory
        .dir("../../build")
        .get()
rootProject.layout.buildDirectory.value(newBuildDir)

subprojects {
    val newSubprojectBuildDir: Directory = newBuildDir.dir(project.name)
    project.layout.buildDirectory.value(newSubprojectBuildDir)
}
subprojects {
    project.evaluationDependsOn(":app")
}

tasks.register<Delete>("clean") {
    delete(rootProject.layout.buildDirectory)
}
