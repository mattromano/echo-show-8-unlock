# Runbook

Check items off as they're done, and log anything unexpected in the Log section at the bottom.

**Boot modes (after the unlock):**

| Mode | How to enter |
|---|---|
| Stock fastboot | Hold all three top buttons while connecting power |
| Hacked fastboot | Hold **Volume Down only** while connecting power (amonet v2.x) |
| TWRP recovery | Hold **Volume Up only** while connecting power |
| USBDL (unbrick) | Hold **Mute + Volume Down** while connecting power, with USB connected |

> **Fire OS 6575.1 patches the exploit** (announced 2026-11-03). We're on 6574.1, which works. Keep Wi-Fi OFF.
> See `xda-unlock-thread-notes.md`.

## 0. Prep

- [x] Confirm the model is Echo Show 8 1st gen (`crown`)
- [x] Fire OS is 6.5.7.4
- [ ] Wi-Fi turned off on the Echo
- [x] Platform Tools in `tools/platform-tools/`
- [x] USB driver installed (Amazon Kindle Fire driver)
- [x] Data-capable micro-USB cable confirmed (Windows sees the device)
- [x] **Plug straight into a motherboard USB port. No hubs, monitors or front panels.**
- [x] Stock fastboot reachable; `fastboot getvar` works
- [ ] Read the last pages of both XDA threads for 6.5.7.4 reports or patch news

## 1. Downloads (manual, from XDA, into `downloads/`)

- [x] `amonet-crown-v2.0.2.zip` (42 MB), from the attachments on post #1 of the unlock thread
  (SHA256 `45DD602D…0742A`; see `amonet-package-review.md`)
- [ ] crown `boot-root.zip` (7.7 MB), from the attachments on post #2
- [ ] crown LineageOS 18.1 zip, from the ROM thread (Option B only; **not** the `checkers` build)
- [x] Review the contents of `amonet-crown` before running it. Scripts match the source; see `amonet-package-review.md`.

## 2. Unlock (amonet)

- [ ] Power off. Hold all three top buttons while plugging in power to enter stock fastboot
- [ ] Connect micro-USB. Run `scripts/check-device.ps1` and confirm fastboot sees the device
- [ ] From the amonet folder, run `fastbrick.bat` (it uses its own bundled fastboot), then type `YES`
- [ ] **Don't touch anything after the 10-second grace period. Interrupting it is a permanent brick.** It takes up to 5 minutes.
- [ ] The device reboots into TWRP

## 3. Root boot image

- [x] Enter hacked fastboot (`adb reboot bootloader` from TWRP works too)
- [x] `fastboot oem flags 61`, which reported `fos_flags set to 3d`
- [x] `fastboot flash boot downloads\boot-root\boot-root.img` (the **crown** image, built from 6.5.7.1; see `boot-root-review.md`)
- [x] `fastboot reboot`. The first boot showed the Amazon logo, then dropped back to hacked fastboot. A second `fastboot reboot` booted Fire OS normally.

## 4. Jailbroken Fire OS (Option A stops here)

- [x] Boot Fire OS. Run `adb shell settings put global disable_bouncer 1`
- [ ] Sideload apps with `adb install <apk>`

## 5. Backup

- [x] **Full stock backup** in `backups/2026-11-04-stock/`: raw images of boot, system, persist, kb, dkb, metadata, swdl, expdb, MISC and logo, plus persist files and the TWRP boot backup. Sizes match the device and SHA256s are in `SHA256SUMS.txt`. Not copied: lk, preloader, tee and recovery, which we never touch.
- **Lesson:** all the earlier adb/MTP stalls were caused by the USB 2.0 hub (Genesys `05E3:0608`) and/or the old cable. Plugged straight into a motherboard port with a new cable, everything copied cleanly at about 13.6 MB/s.
- [x] TWRP Backup of **Boot** on the Echo: `/sdcard/TWRP/BACKUPS/G6G16D100373015U/2009-12-31--18-07-08_NS65741/` (16 MB). Not enough free space for System. Copying it to the PC over MTP/adb stalled, so only `boot.emmc.win.sha2` reached the PC; the image itself is only on the Echo. Restore it through TWRP > Restore.
- [ ] Optional: full raw boot/system images (adb in TWRP is unstable; the stock update.bin covers these)
- TWRP tip: turn off the screen timeout after **every** TWRP boot, or adb drops when the screen locks

## 6. LineageOS (Option B)

- [ ] `adb push downloads\<lineage-crown>.zip /sdcard/` (don't unzip it)
- [ ] TWRP: Wipe > Advanced Wipe > **system, data, cache only**
- [ ] TWRP: Install > the zip, **before** rebooting (rebooting after the wipe without installing leaves it stuck on the Amazon logo)
- [ ] Reboot
- [ ] Developer options: tap Build number 7 times, then enable USB debugging
- [ ] Install F-Droid with `adb install F-Droid.apk`
- [ ] Optional: Magisk from the GitHub releases page only

## 7. Apps / setup

- Device: Android 7.1.2 (API 25), `armeabi-v7a` only, 1280x800 at 213 dpi. Widevine engine present.
- [x] SmartTube 32.68 stable (armeabi-v7a) from GitHub yuliskov/SmartTube, SHA256 `2130B23B…3A60D9`. Package `org.smarttube.stable`.
- [x] Olauncher 6.9.17 from GitHub tanujnotes/Olauncher, SHA256 `BC72DF3B…AE5AA19`. Package `app.olauncher`.
  Fossify and Neo need API 26+.
  `cmd package set-home-activity` isn't enough: Amazon's `com.amazon.paladin` home has system priority 50 and still wins.
- [x] **Olauncher is the home screen**: `pm disable-user --user 0 com.amazon.paladin` plus `cmd package set-home-activity app.olauncher/.MainActivity`.
  **Undo:** `adb shell pm enable com.amazon.paladin`. Screenshot: `docs/img/olauncher-home.png`.
- Netflix is **preinstalled**: `com.netflix.mediaclient.echo` 8.141.2, Amazon's Echo build, launchable. Hulu, Peacock and Silk aren't installed.
- [x] Hulu 6.31.0 (Fire Tablet build, `com.hulu.plus`) from APKMirror, SHA256 `B600A81D…0A42B7C`
- [x] Peacock 6.11.11 (armeabi-v7a, `com.peacock.peacockfiretv`) from APKMirror, SHA256 `B6C2722F…EFC72395`
- [x] Spotify 9.1.36.1938 (`com.spotify.music`) from an APKMirror .apkm, SHA256 `537DE694…3DA5D`.
  Installed with `adb install-multiple base.apk split_config.armeabi_v7a.apk split_config.en.apk split_config.tvdpi.apk`.
  Skipped the dynamic-feature splits; the audiomodel one ships arm64 only.
- All four launch with no crashes. Offline, they show "no internet" dialogs (`docs/img/launch-*.png`). /data has 950 MB free.
- [x] **Amazon updates disabled** (done before turning Wi-Fi on). The device had been auto-updating every 2–4 weeks, most recently 2026-10-26.
  `pm disable-user --user 0` on `com.amazon.device.software.ota`, `com.amazon.device.software.ota.override` and `com.amazon.device.smarthome.ota`.
  **Undo:** `adb shell pm enable <pkg>`. No pending update in `/data/ota_package` at the time.
- [x] **Kitchen Home** (`com.kitchenhome`, see `app/kitchen-home/`) built, installed and set as the home screen.
  It shows weather (Open-Meteo, 90245), 6 app tiles, and Hue rooms. Hue is paired with the bridge at 192.168.4.2, with 3 rooms: Bedroom, Living room, Office.
- [x] **Control the Echo from the PC**: scrcpy v5.0.1 (Genymobile, SHA-256 verified against the release's SHA256SUMS.txt) in `tools/scrcpy-win64-v5.0.1/`.
  Run `scripts\echo-screen.ps1`. It uses the project adb. Alt+H = Home, Alt+B = Back, Ctrl+V pastes the PC clipboard.
- Streaming app results (2026-11-04, online):
  - **Hulu app (Fire Tablet build):** "App Not Owned". It's Amazon Appstore DRM, so the Amazon account needs an entitlement.
  - **Peacock 6.11.11:** "Update Required". Peacock retired it, and the newer Fire Tablet builds are arm64 only.
  - **Spotify:** "install a browser". There was no app that handles https links.
  - **Netflix (Echo build):** screenshots come out blank (a secure surface, as expected for DRM video). Its log shows one `MediaDrm ... Unsupported scheme (-2006)` property query. Playback still needs confirming.
- [x] **Kitchen Home 0.2** adds a built-in **browser** (`BrowserActivity`) that handles http/https links (fixes Spotify sign-in), passes app callback links (spotify://, intent://) back to apps,
  allows Widevine (protected media) only, and switches automatically to a **desktop user agent** for peacocktv.com, hulu.com and similar sites, which block mobile browsers.
  The Hulu and Peacock tiles now open the websites (`web:hulu`, `web:peacock`). Both sites load in desktop mode. Playback after sign-in is untested.
- [x] **Kitchen Home 0.3**:
  - **DRM:** platform Widevine is **L1** (systemId 13812, max HDCP 2.2), via `Native.drmInfo()`. In the browser, Widevine EME works at `SW_SECURE_CRYPTO`; `HW_SECURE_ALL` isn't exposed in WebView.
  - **Peacock's block** was its inline check `minimumSupportedBrowserVersions` (Chrome ≥ 125), and the WebView is Chrome 118.
    Desktop mode now reports Chrome 131 and also spoofs `navigator.platform`, `maxTouchPoints`, `window.chrome` and `userAgentData` in JS.
    Peacock now reaches its sign-in page; Hulu reaches `/welcome`. Playback after sign-in is still untested.
  - **Tools:** `scripts/cdp-eval.ps1` runs JS in a WebView page on the Echo over DevTools (`adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`).
  - **Gotcha:** the broken Hulu app still claims hulu.com links system-wide (an "Open with" prompt). The tiles avoid it by targeting BrowserActivity directly.
- [ ] Wi-Fi on, then sign in to Netflix, Hulu, Peacock, Spotify and SmartTube, and check that playback works (DRM)
- [ ] Media: Jellyfin, Kodi, VLC
- [ ] Test audio output and Bluetooth (unconfirmed on LineageOS)
- [ ] Screen timeout / doze tweaks

## Log

| Date | Step | Notes |
|---|---|---|
| 2026-11-04 | 0 | Repo created. Platform Tools 37.0.1 installed. Fire OS 6574.1. |
| 2026-11-04 | 0 | Read the XDA thread. 6575.1 is patched; 6574.1 is confirmed working. Current package is amonet-crown-v2.0.2. |
| 2026-11-04 | 2 | **Unlocked.** `fastbrick.bat` (run by hand in the Terminal panel) detected CROWN / LK 44072a3-20240709, reported "Exploit most likely successful", and the Echo rebooted into TWRP 3.7.0_9-0 (adb shows `omni_crown`, root shell). |
| 2026-11-04 | 3-4 | **Rooted Fire OS.** boot-root.img flashed. Fire OS 6574.1 boots with the 6.5.7.1 boot image; adb runs as root (`uid=0`, context `u:r:su:s0`), SELinux is Enforcing, `disable_bouncer=1`, and Wi-Fi is still off. /data has 1.3 GB free. Launcher is `com.amazon.paladin`. |
| 2026-11-04 | 5 | Backup is partial. TWRP's adb keeps going "offline", partly from the TWRP lock screen (the timeout setting doesn't survive a reboot), and the raw `kb` and `persist` reads hung. Saved: `MISC`, `dkb`, `logo` raw images, and `persist` **as files** (`calibration.bin`, `dha_certificate.pem`). Hashes are in `backups/2026-11-04-stock/SHA256SUMS.txt`. Not saved: `kb`, `boot`, `system`, `metadata`, `swdl`, `expdb`. boot and system can be restored from a stock update.bin (ftvdb.com) through TWRP, per the thread. |
| 2026-11-04 | 0 | Stock fastboot works (three buttons while connecting power). Kindle Fire driver gives "Android Bootloader Interface" (USB 0BB4:0C01). getvar: product=CROWN, secure=yes, unlock_status=false, lk_build_desc=44072a3-20240709_164449, max-download-size=0x6d00000. This LK matches a reported successful 6.5.7.4 unlock (tjbaker72, 2026-10-30). The patched LK is fbacd25-20260415_110052. |
