# Lax for Android

A small native shell around the Lax page. It adds:

- a background link to the Mac (`LaxService`, an SSE client on `/api/stream`) that survives the phone sleeping
- **Approve / Deny notifications** that buzz, wake the screen, and show on the lock screen and the cover screen
- Android's own speech recognition and text-to-speech (`window.LaxNative`, see `LaxBridge.kt`)
- pairing by QR or over USB, start on boot, and a prompt for the battery-optimisation exemption

It's Kotlin with framework APIs only (no androidx, no third-party libraries). minSdk 30, targetSdk 34.

## Tooling (Mac, once)

```bash
brew install openjdk@17 gradle
brew install --cask android-commandlinetools
export JAVA_HOME=$(brew --prefix)/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
yes | sdkmanager --sdk_root=$(brew --prefix)/share/android-commandlinetools --licenses
sdkmanager --sdk_root=$(brew --prefix)/share/android-commandlinetools "platform-tools" "platforms;android-34" "build-tools;34.0.0"
```

## Phone (once)

1. Settings → About phone → Software information → tap **Build number** 7×. Then Developer options → **USB debugging** on. Plug it into the Mac and accept the RSA prompt.
2. `npm run android -- --pair` builds, installs, and sends the pairing link. Tap **pair ▶**. You can also scan the app QR on `http://localhost:7777/pair`.
3. Allow the mic and notifications, and let Lax ignore battery optimisation.
4. Samsung: Settings → Battery → Background usage limits → **Never sleeping apps** → add Lax.

## Build

```bash
npm run android             # build, install over adb, launch
npm run android -- --build  # build only
adb logcat -s LaxService LaxBridge LaxPage
```

## Pairing link

`lax://pair?u=<Lax URL with ?t=token>&id=<CF-Access-Client-Id>&s=<CF-Access-Client-Secret>`

The service token lets the background link through Cloudflare Access, where there's no browser login. It's stored only in the app's private storage on the phone and in `data/env.json` on the Mac, never in git.
