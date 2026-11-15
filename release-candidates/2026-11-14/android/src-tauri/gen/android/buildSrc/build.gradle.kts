plugins {
    kotlin("jvm") version "2.4.21"
    kotlin("plugin.sam.with.receiver") version "2.4.21"
    `java-gradle-plugin`
}

gradlePlugin {
    plugins {
        create("pluginsForCoolKids") {
            id = "rust"
            implementationClass = "RustPlugin"
        }
    }
}

repositories {
    google()
    mavenCentral()
}

dependencies {
    compileOnly(gradleApi())
    compileOnly(gradleKotlinDsl())
    implementation("com.android.tools.build:gradle:9.3.1")
    implementation("org.jetbrains.kotlin:kotlin-gradle-plugin:2.4.21")
}


samWithReceiver { annotation("org.gradle.api.HasImplicitReceiver") }
