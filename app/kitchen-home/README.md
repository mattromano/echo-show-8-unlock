# Kitchen Home

A custom home screen for the unlocked Echo Show 8. It's a tiny Android app (`com.kitchenhome`) that registers
as the HOME activity and shows a local HTML dashboard in a full-screen WebView.

![Kitchen Home on the Echo](../../docs/img/kitchen-home-v5.png)

![Idle screensaver](../../docs/img/kitchen-home-saver.png)

## What's on it

- **Clock and date**
- **Weather** for ZIP 90245 (El Segundo) from [Open-Meteo](https://open-meteo.com/). It needs no API key, refreshes every 15 minutes, and falls back to the last cached forecast when offline.
- **Six app tiles**, configurable in Settings. Defaults: Netflix, Hulu, Peacock, YouTube (SmartTube), Spotify, Settings.
- **Philips Hue rooms**, via the bridge's local v1 API. Tap a room to toggle it; long-press for brightness.
- **All-apps drawer** and **Settings**: Hue pairing, tile picker, and a night dim from 10 pm to 6 am.
- **Rotating photo background** (0.5): a slow cross-fade with a gentle zoom, changing every 60 s. Sources:
  - Bing's recent daily images (no key; toggle in Settings)
  - your own photos copied to **`/sdcard/Pictures/KitchenHome`** (Explorer: Echo Show 8 → Internal Storage → Pictures → KitchenHome)
- **Kitchen timers** (0.5): the stopwatch button opens presets (1–60 min) or a custom ±1/±5 timer. Running timers show as chips under the clock; tap ✕ to cancel.
  Each timer is also scheduled with `AlarmManager` (`TimerReceiver`), so it **brings Kitchen Home to the front and rings even while Peacock/Spotify is open**.
  The alarm is a full-screen flash with WebAudio beeps, Stop or +1 min.
- **Now playing** (0.5): album art, title and artist, with prev/play-pause/next for whatever app has an active media session (Spotify, SmartTube).
  This needs the notification listener (`MediaListener`) enabled; see setup below.
- **Idle screensaver** (0.5): after 5 min (configurable) without a touch, a full-screen slideshow with a big clock, date and weather. Tap to wake. Not shown while a timer is ringing or a panel is open.

## Layout

```
AndroidManifest.xml          HOME + LAUNCHER activity, minSdk 25, cleartext allowed (Hue bridge is http on the LAN)
src/com/kitchenhome/         MainActivity: WebView plus the `Native` JS bridge (launch, apps, icon, installed, settings, brightness)
assets/index.html, style.css, app.js
res/mipmap-xxhdpi/           generated launcher icon
```

## Build and install

```powershell
scripts\build-kitchen-home.ps1 -Install
```

No Gradle: the script runs aapt2, javac, d8, zipalign and apksigner from `tools/` (JDK 17 plus Android build-tools 34).
The signing key is created once in `keystore/` (gitignored); keep it, or updates won't install over the existing app.

Make it the home screen (already done on the device):

```powershell
adb shell cmd package set-home-activity com.kitchenhome/.MainActivity
```

Olauncher is still installed as a fallback: `adb shell cmd package set-home-activity app.olauncher/.MainActivity`.

One-time permissions (already done on the device):

```powershell
adb shell pm grant com.kitchenhome android.permission.READ_EXTERNAL_STORAGE
adb shell pm grant com.kitchenhome android.permission.WRITE_EXTERNAL_STORAGE
adb shell settings put secure enabled_notification_listeners com.kitchenhome/com.kitchenhome.MediaListener
```

## Debugging

WebView remote debugging is on. With the Echo on USB, open `chrome://inspect` on the PC to get DevTools for the dashboard.

## Hue

The bridge is at `192.168.4.2` (BSB002, API 1.78). Pairing stores the bridge IP and API username in the WebView's localStorage on the Echo.
