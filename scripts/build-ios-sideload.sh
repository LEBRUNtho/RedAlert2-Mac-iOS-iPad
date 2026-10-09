#!/usr/bin/env bash
# Compile une app iPhone signée à la main avec un profil de sideloading (quand la signature
# automatique d'Xcode n'est pas possible) et produit une IPA :
#   ./outils-build-iphone.sh        → « Yuri's Revenge » (releases/YurisRevenge-iOS.ipa)
#   ./outils-build-iphone.sh ra2    → « Red Alert 2 » + campagne RA2 (releases/RedAlert2-iOS.ipa)
# Signature : fichier local hors dépôt ($RA2_SIGNATURE, par défaut ~/.config/ra2-ios/signature.sh) qui définit
#   SIGN_IDENTITY (empreinte du certificat), SIGN_TEAM (équipe), SIGN_PROFILE (.mobileprovision joker),
#   BUNDLE_PREFIX (ex. com.monnom, compatible avec le profil).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:$PATH"
B="$HOME/ra2-build"
source "${RA2_SIGNATURE:-$HOME/.config/ra2-ios/signature.sh}"
BUNDLE_PREFIX="${BUNDLE_PREFIX:-com.example}"
VARIANT="${1:-yr}"
if [ "$VARIANT" = ra2 ]; then
  BUNDLE_ID="$BUNDLE_PREFIX.ra2"; IPA_NAME="RedAlert2-iOS.ipa"; STAGE_ARGS="--ra2"
else
  BUNDLE_ID="$BUNDLE_PREFIX.ra2yr"; IPA_NAME="YurisRevenge-iOS.ipa"; STAGE_ARGS=""
fi

echo "== Web + ressources (scripts/build-ios.sh, partie avant Xcode)"
# Le script du dépôt fait web + staging + xcodegen puis tente xcodebuild : on l'arrête avant.
sed '/^echo "==> Building"$/,$d' "$ROOT/scripts/build-ios.sh" > "$ROOT/scripts/.stage-ios.sh"
RA2_LIVENESS_OK=1 RA2_TEAM_ID="$SIGN_TEAM" RA2_BUNDLE_ID="$BUNDLE_ID" bash "$ROOT/scripts/.stage-ios.sh" $STAGE_ARGS

echo "== Icône de l'app ($VARIANT)"
# Une icône par app (ios/AppIcons/ra2.png ou yr.png), posée le temps du build puis l'icône du dépôt est remise.
ICON="$ROOT/ios/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png"
if [ -f "$ROOT/ios/AppIcons/$VARIANT.png" ]; then
  cp "$ICON" "$B/AppIcon.orig.png"
  trap 'cp "$B/AppIcon.orig.png" "$ICON"' EXIT
  cp "$ROOT/ios/AppIcons/$VARIANT.png" "$ICON"
fi

echo "== Xcode (sans signature)"
rm -rf "$B/dd"
xcodebuild -project "$ROOT/ios/RA2.xcodeproj" -scheme RA2 -configuration Release \
  -destination 'generic/platform=iOS' -derivedDataPath "$B/dd" \
  CODE_SIGNING_ALLOWED=NO PRODUCT_BUNDLE_IDENTIFIER="$BUNDLE_ID" build > "$B/xc.log" 2>&1 \
  || { tail -30 "$B/xc.log"; exit 1; }
APP="$B/dd/Build/Products/Release-iphoneos/RA2.app"

echo "== Signature"
cp "$SIGN_PROFILE" "$APP/embedded.mobileprovision"
cat > "$B/ent.plist" <<EOP
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>application-identifier</key><string>$SIGN_TEAM.$BUNDLE_ID</string>
  <key>com.apple.developer.team-identifier</key><string>$SIGN_TEAM</string>
  <key>get-task-allow</key><true/>
</dict></plist>
EOP
find "$APP" \( -name "*.dylib" -o -name "*.framework" \) -print0 | while IFS= read -r -d '' f; do
  codesign --force --sign "$SIGN_IDENTITY" --timestamp=none "$f"; done
codesign --force --sign "$SIGN_IDENTITY" --timestamp=none --entitlements "$B/ent.plist" "$APP"
codesign --verify "$APP"

echo "== IPA"
STAGE=$(mktemp -d); mkdir -p "$STAGE/Payload"
ditto --norsrc --noextattr "$APP" "$STAGE/Payload/RA2.app"
mkdir -p "$ROOT/releases"; IPA="$ROOT/releases/$IPA_NAME"; rm -f "$IPA"
(cd "$STAGE" && zip -qry -X "$IPA" Payload); rm -rf "$STAGE"
ls -lh "$IPA"
