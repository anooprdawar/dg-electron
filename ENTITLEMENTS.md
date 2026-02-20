# Entitlements & Permissions Guide

This guide covers the permissions and entitlements required for `@deepgram/electron` to capture system audio and microphone input on macOS.

## Required Entitlements

### For System Audio Capture

System audio capture uses Core Audio Taps (macOS 14+). Your Electron app needs to be **code-signed** for this to work. No specific entitlement is required for Core Audio Taps, but the app must not be sandboxed, or must have the appropriate exception entitlement.

For non-sandboxed apps (recommended for development):

```xml
<key>com.apple.security.app-sandbox</key>
<false/>
```

For sandboxed apps (required for Mac App Store):

```xml
<key>com.apple.security.app-sandbox</key>
<true/>
<key>com.apple.security.device.audio-input</key>
<true/>
```

### For Microphone Capture

```xml
<key>com.apple.security.device.audio-input</key>
<true/>
```

## Info.plist Keys

Add these to your Electron app's `Info.plist`:

```xml
<key>NSMicrophoneUsageDescription</key>
<string>This app needs microphone access for live transcription.</string>
```

Note: System audio capture via Core Audio Taps does not require a separate usage description string, but the app must be properly code-signed.

## electron-builder Configuration

Add the native binaries to your electron-builder config:

### package.json

```json
{
  "build": {
    "mac": {
      "target": ["dmg", "zip"],
      "hardenedRuntime": true,
      "entitlements": "build/entitlements.mac.plist",
      "entitlementsInherit": "build/entitlements.mac.plist",
      "extendInfo": {
        "NSMicrophoneUsageDescription": "This app needs microphone access for live transcription."
      }
    },
    "extraResources": [
      {
        "from": "node_modules/@deepgram/electron/bin/",
        "to": "bin/",
        "filter": ["dg-system-audio", "dg-mic-audio"]
      }
    ]
  }
}
```

### build/entitlements.mac.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.device.audio-input</key>
    <true/>
</dict>
</plist>
```

## electron-forge Configuration

If using electron-forge, configure in `forge.config.js`:

```javascript
module.exports = {
  packagerConfig: {
    osxSign: {
      entitlements: 'build/entitlements.mac.plist',
      'entitlements-inherit': 'build/entitlements.mac.plist',
    },
    extraResource: [
      './node_modules/@deepgram/electron/bin/dg-system-audio',
      './node_modules/@deepgram/electron/bin/dg-mic-audio',
    ],
    extendInfo: {
      NSMicrophoneUsageDescription: 'This app needs microphone access for live transcription.',
    },
  },
};
```

## Troubleshooting

### "System audio recording not granted"

1. Ensure your app is properly code-signed
2. On macOS 14+, check System Settings > Privacy & Security > Screen & System Audio Recording
3. Your app should appear in the list - toggle it on
4. Restart your app after granting permission

### "Microphone access not granted"

1. Ensure `NSMicrophoneUsageDescription` is in your Info.plist
2. Check System Settings > Privacy & Security > Microphone
3. Toggle your app on
4. Restart your app after granting permission

### Development (unsigned apps)

During development, unsigned apps may have limited access. You can:

1. Use `electron --no-sandbox` for development
2. Ad-hoc sign your development build: `codesign --force --deep --sign - YourApp.app`
3. Check permission status programmatically:

```typescript
const perms = await DeepgramElectron.checkPermissions();
console.log(perms);
// { systemAudio: "granted"|"denied"|"unknown", microphone: "granted"|"denied"|"unknown" }
```
