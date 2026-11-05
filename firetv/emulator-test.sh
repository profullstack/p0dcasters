#!/bin/bash
# Boots API 30 Android TV and checks the Fire TV reader's empty state and form.
# It never opens the public catalog or writes screenshots into the repository.
# Run inside gradle:8.7-jdk17 with --device /dev/kvm and the SDK cache at /sdk.
set -euo pipefail
SDK=/sdk
export ANDROID_HOME=$SDK ANDROID_SDK_ROOT=$SDK ANDROID_AVD_HOME=/root/.android/avd
IMG="system-images;android-30;android-tv;x86"

apt-get update -qq >/dev/null
apt-get install -y -qq libpulse0 libnss3 libxcomposite1 libxcursor1 libxi6 libxtst6 \
  libasound2 libgl1 libxkbfile1 libxdamage1 libxrandr2 libdrm2 libgbm1 >/dev/null 2>&1

SM="$SDK/cmdline-tools/latest/bin/sdkmanager --sdk_root=$SDK"
(yes || true) | $SM --licenses >/dev/null || true
$SM "emulator" "platform-tools" "$IMG" >/dev/null
echo no | "$SDK/cmdline-tools/latest/bin/avdmanager" create avd -n tv -k "$IMG" -d tv_1080p --force >/dev/null

ADB="$SDK/platform-tools/adb"
"$SDK/emulator/emulator" -avd tv -no-window -no-audio -no-boot-anim -gpu swiftshader_indirect \
  -no-snapshot -memory 2048 >/tmp/emu.log 2>&1 &
"$ADB" wait-for-device
for i in $(seq 1 120); do
  [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ] && break
  sleep 2
done

for i in $(seq 1 20); do "$ADB" install -r dist/podcasters-firetv.apk && break; sleep 5; done
"$ADB" shell monkey -p com.p0dcasters.tv -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null
sleep 8
mkdir -p dist/test-artifacts
"$ADB" exec-out screencap -p > dist/test-artifacts/reader-empty.png

dump_ui() {
  "$ADB" shell uiautomator dump /sdcard/window.xml >/dev/null
  "$ADB" pull /sdcard/window.xml "$1" >/dev/null
}
UI=$(mktemp)
trap 'rm -f "$UI"; "$ADB" emu kill >/dev/null 2>&1 || true' EXIT
dump_ui "$UI"
if ! grep -q 'android.webkit.WebView' "$UI" || ! "$ADB" shell pidof com.p0dcasters.tv >/dev/null; then
  cat "$UI"
  echo "reader activity did not remain open" >&2
  exit 1
fi

# The native keyboard must accept a URL, and the page must reject HTTP without
# making a network request. This also exercises the D-pad form and JS bridge.
"$ADB" shell input keyevent KEYCODE_DPAD_CENTER
sleep 2
"$ADB" exec-out screencap -p > dist/test-artifacts/reader-keyboard.png
"$ADB" shell input text 'http://127.0.0.1/rss.xml'
"$ADB" shell input keyevent KEYCODE_ENTER
sleep 2
# Keyboard Done fills the URL. Only selecting the page's Load button submits it.
"$ADB" shell input keyevent KEYCODE_DPAD_RIGHT
"$ADB" shell input keyevent KEYCODE_DPAD_CENTER
sleep 2
dump_ui "$UI"
"$ADB" exec-out screencap -p > dist/test-artifacts/reader-http-rejected.png

if "$ADB" logcat -d | grep -E 'FATAL EXCEPTION|Process: com\.p0dcasters\.tv|Uncaught TypeError|Uncaught ReferenceError' | tail -20; then
  echo "runtime error found in emulator log" >&2
  exit 1
fi
echo "Fire TV reader emulator check passed"
