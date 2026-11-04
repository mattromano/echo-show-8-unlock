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

- [ ] Enter hacked fastboot (Volume Down while connecting power)
- [ ] `fastboot oem flags 61`
- [ ] `fastboot flash boot downloads\boot-root.img` (the **crown** image)
- [ ] `fastboot reboot`

## 4. Jailbroken Fire OS (Option A stops here)

- [ ] Boot Fire OS. Run `adb shell settings put global disable_bouncer 1`
- [ ] Sideload apps with `adb install <apk>`

## 5. Backup

- [x] Device-unique data saved to `backups/2026-11-04-stock/`: persist files, dkb, MISC, logo (`kb` read hangs)
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

- [ ] Media: Jellyfin, Kodi, VLC, SmartTube / NewPipe
- [ ] Test audio output and Bluetooth (unconfirmed on LineageOS)
- [ ] Screen timeout / doze tweaks

## Log

| Date | Step | Notes |
|---|---|---|
| 2026-11-04 | 0 | Repo created. Platform Tools 37.0.1 installed. Fire OS 6574.1. |
| 2026-11-04 | 0 | Read the XDA thread. 6575.1 is patched; 6574.1 is confirmed working. Current package is amonet-crown-v2.0.2. |
| 2026-11-04 | 2 | **Unlocked.** `fastbrick.bat` (run by hand in the Terminal panel) detected CROWN / LK 44072a3-20240709, reported "Exploit most likely successful", and the Echo rebooted into TWRP 3.7.0_9-0 (adb shows `omni_crown`, root shell). |
| 2026-11-04 | 5 | Backup is partial. TWRP's adb keeps going "offline", partly from the TWRP lock screen (the timeout setting doesn't survive a reboot), and the raw `kb` and `persist` reads hung. Saved: `MISC`, `dkb`, `logo` raw images, and `persist` **as files** (`calibration.bin`, `dha_certificate.pem`). Hashes are in `backups/2026-11-04-stock/SHA256SUMS.txt`. Not saved: `kb`, `boot`, `system`, `metadata`, `swdl`, `expdb`. boot and system can be restored from a stock update.bin (ftvdb.com) through TWRP, per the thread. |
| 2026-11-04 | 0 | Stock fastboot works (three buttons while connecting power). Kindle Fire driver gives "Android Bootloader Interface" (USB 0BB4:0C01). getvar: product=CROWN, secure=yes, unlock_status=false, lk_build_desc=44072a3-20240709_164449, max-download-size=0x6d00000. This LK matches a reported successful 6.5.7.4 unlock (tjbaker72, 2026-10-30). The patched LK is fbacd25-20260415_110052. |
