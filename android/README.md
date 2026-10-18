# Lax for Android

A small native shell around the Lax page. It adds:

- a background link to the Mac (`LaxService`, an SSE client on `/api/stream`) that survives the phone sleeping
- **Approve / Deny notifications** that buzz, wake the screen, and show on the lock screen and the cover screen
- Android's own speech recognition and text-to-speech (`window.LaxNative`, see `LaxBridge.kt`)
- pairing by QR or over USB, start on boot, and a prompt for the battery-optimisation exemption

It's Kotlin with framework APIs only (no androidx, no third-party libraries). minSdk 30, targetSdk 34.

## Tooling (Mac, once)

```bash
node scripts/setup.mjs android     # or: node scripts/android-tools.mjs
```

It puts a prebuilt JDK 17 (Temurin) and Google's Android command-line tools, platform-tools (`adb`), the Android 34 platform and build tools into `~/.lax-tools`, with no Homebrew (which compiles `openjdk@17` from source on Intel Macs: an hour or more). About 1 GB, a minute or two; every download is checked against its published checksum. Google's Android SDK licenses are shown for you to accept (`--accept-licenses` says yes for you). The command-line tools are pinned to 19.0, the plain `sdkmanager`: from 23.0 it hands over to Google's new `android` CLI, which downloads itself into `~/.android` and sends usage metrics.

`npm run android` uses these, else a Homebrew Android SDK (`brew install --cask android-commandlinetools`) and `JAVA_HOME`/`ANDROID_HOME` if you set them.

The Gradle wrapper (`android/gradlew`) is checked in, so Gradle downloads itself.

## Phone (once)

1. Settings → About phone → Software information → tap **Build number** 7×. Then Developer options → **USB debugging** on. Plug it into the Mac and accept the RSA prompt.
2. `npm run android -- --pair` builds, installs, and sends the pairing link. Tap **pair ▶**. You can also scan the app QR on `http://localhost:7777/pair`.
3. Allow the mic and notifications, and let Lax ignore battery optimisation.
4. Samsung: if Lax isn't battery-exempt, add it under Settings → Battery → Background usage limits → **Never sleeping apps**. Once it's exempt (unrestricted), One UI leaves it out of that list, and that's fine.

## Build

```bash
npm run android             # build, install over adb, launch
npm run android -- --build  # build only
adb logcat -s LaxService LaxBridge LaxPage
```

## Pairing link

`lax://pair?u=<Lax URL with ?t=token>&id=<CF-Access-Client-Id>&s=<CF-Access-Client-Secret>`

The service token lets the background link through Cloudflare Access, where there's no browser login. It's stored only in the app's private storage on the phone and in `~/.lax/secrets/env.json` on the Mac, never in git.
