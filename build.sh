#!/data/data/com.termux/files/usr/bin/sh
set -eu
cd "$(dirname "$0")"
ANDROID_JAR="${ANDROID_JAR:-$PREFIX/share/aapt/android.jar}"
if [ ! -f "$ANDROID_JAR" ]; then
  ANDROID_JAR="$(find "$PREFIX" -name android.jar 2>/dev/null | head -n 1)"
fi
if [ -z "$ANDROID_JAR" ] || [ ! -f "$ANDROID_JAR" ]; then
  echo "android.jar not found. Install aapt/aapt2 package first." >&2
  exit 1
fi
rm -rf build classes.dex unsigned.apk release-agent-bridge.apk debug.keystore
mkdir -p build/classes build/gen
AAPT_BIN="$(command -v aapt || true)"
if [ -z "$AAPT_BIN" ]; then echo "aapt missing" >&2; exit 1; fi
$AAPT_BIN package -f -m -J build/gen -M AndroidManifest.xml -S res -I "$ANDROID_JAR"
ecj -source 1.8 -target 1.8 -d build/classes -classpath "$ANDROID_JAR" build/gen/com/agent/bridge/R.java src/com/agent/bridge/MainActivity.java
d8 --lib "$ANDROID_JAR" --output build build/classes/com/agent/bridge/*.class build/classes/com/agent/bridge/R*.class
$AAPT_BIN package -f -M AndroidManifest.xml -S res -I "$ANDROID_JAR" -F unsigned.apk
(cd build && zip -q ../unsigned.apk classes.dex)
keytool -genkeypair -keystore debug.keystore -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
apksigner sign --ks debug.keystore --ks-pass pass:android --out release-agent-bridge.apk unsigned.apk
echo "Built: $(pwd)/release-agent-bridge.apk"
