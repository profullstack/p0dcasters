# podcasters RSS reader for Fire TV

A small native Android app (`com.p0dcasters.tv`) for playing podcast episodes from HTTPS RSS
feeds that the viewer enters. It includes no podcast directory, show artwork or preloaded feeds.
The feed is fetched only after the viewer chooses Load; audio is played from the publisher's
HTTPS URL. No dependencies beyond the Android SDK.

- **Bundled reader UI** (`app/src/main/assets/reader.html`): a local page with no external scripts,
  images or catalog requests. Native code downloads the user-selected RSS document and accepts
  HTTPS audio enclosures only.
- **Remote navigation** (`app/src/main/assets/tv.js`): Chromium's WebView scrolls on arrow
  keys instead of moving between controls, so every D-pad press runs `pitNav(dir)` in the page:
  spatial focus to the nearest link/button, scrolling across long gaps, and a large focus
  ring.
- **Typing**: OK on a text field (or Menu/Search anywhere) opens a native text box, the one
  thing that reliably raises the Fire TV keyboard and its microphone. Text fills the feed URL;
  the viewer still presses Load before the app makes a request.
- **Playback**: remote play/pause, fast-forward 30 s and rewind 15 s control the selected episode.
- **Back** exits the app. Feed titles are rendered as text, and remote feed links cannot navigate
  the WebView away from the bundled page.
- Leanback launcher + banner, touchscreen not required, so the Appstore lists it for Fire TV.

## Build

Needs only Docker. The SDK caches in `~/scratch/android-sdk`.

```sh
# release key (once, ever): vault profullstack/p0dcasters-firetv--signing
logicsrc teams pull profullstack p0dcasters-firetv signing --env keys/release.env
sed -n 's/^PIT_TV_KEYSTORE_B64=//p' keys/release.env | tr -d '"' | base64 -d > keys/release.jks

docker run --rm -e OWNER=$(id -u):$(id -g) -e GRADLE_USER_HOME=/gh \
  -v ~/scratch/gradle-home:/gh -v ~/scratch/android-sdk:/sdk -v "$PWD/keys:/keys:ro" \
  -v "$PWD/firetv:/w" -w /w gradle:8.7-jdk17 sh build.sh
# -> firetv/dist/podcasters-firetv.apk (lint + signed release)
```

Without `/keys` the APK is built unsigned. Bump `versionCode`/`versionName` in
`app/build.gradle` for every Appstore upload. `new-key.sh` minted the key; never run it
again or installed copies cannot update.

## Test on an Android TV emulator

```sh
docker run --rm --device /dev/kvm -e OWNER=$(id -u):$(id -g) -v ~/scratch/android-sdk:/sdk \
  -v "$PWD/firetv:/w" -w /w gradle:8.7-jdk17 bash emulator-test.sh
```

Boots API 30 Android TV (the base of Fire OS 8), installs the APK and checks the blank reader,
native keyboard and HTTP URL rejection. Screenshots go under the ignored `dist/test-artifacts/`.

## Appstore

Listing copy is in `store/listing.md`; `store/render.sh` regenerates the icons/banner from
`store/src/*.svg`.
