# Runbook

Check items off as they're done, and log anything unexpected in the Log section at the bottom.

**Boot modes (after the unlock):**

| Mode | How to enter |
|---|---|
| Stock fastboot | Power off, hold all three top buttons, plug in power |
| Hacked fastboot | Power off, hold **Mute**, power on |
| TWRP recovery | Power off, hold **Volume Up**, power on |

## 0. Prep

- [x] Confirm the model is Echo Show 8 1st gen (`crown`)
- [x] Fire OS is 6.5.7.4
- [ ] Wi-Fi turned off on the Echo
- [x] Platform Tools in `tools/platform-tools/`
- [ ] USB driver installed (Amazon Kindle Fire driver, or Google USB driver as a fallback)
- [ ] Data-capable micro-USB cable confirmed (Windows sees the device)
- [ ] Read the last pages of both XDA threads for 6.5.7.4 reports or patch news

## 1. Downloads (manual, from XDA, into `downloads/`)

- [ ] `amonet-crown.zip`, from the unlock thread
- [ ] crown `boot-root.zip`, from the unlock thread (post 90356932)
- [ ] crown LineageOS 18.1 zip, from the ROM thread (Option B only; **not** the `checkers` build)
- [ ] Review the contents of `amonet-crown` before running it

## 2. Unlock (amonet)

- [ ] Power off. Hold all three top buttons while plugging in power to enter stock fastboot
- [ ] Connect micro-USB. Run `scripts/check-device.ps1` and confirm fastboot sees the device
- [ ] From the amonet folder, in an elevated prompt: `fastbrick.bat`, then type `YES`
- [ ] The device shows the amonet screen, flashes, and reboots into TWRP

## 3. Root boot image

- [ ] Enter hacked fastboot (Mute + power)
- [ ] `fastboot oem flags 61`
- [ ] `fastboot flash boot downloads\boot-root.img` (the **crown** image)
- [ ] `fastboot reboot`

## 4. Jailbroken Fire OS (Option A stops here)

- [ ] Boot Fire OS. Run `adb shell settings put global disable_bouncer 1`
- [ ] Sideload apps with `adb install <apk>`

## 5. Backup

- [ ] Boot TWRP (Volume Up + power). Make a full backup
- [ ] Copy the backup to `backups/` with `adb pull` and confirm the files are readable

## 6. LineageOS (Option B)

- [ ] `adb push downloads\<lineage-crown>.zip /sdcard/` (don't unzip it)
- [ ] TWRP: Wipe > Advanced Wipe > **system, data, cache only**
- [ ] TWRP: Install > the zip > reboot
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
| 2026-11-04 | 0 | Repo created. Platform Tools 37.0.1 installed. Fire OS 6.5.7.4. |
