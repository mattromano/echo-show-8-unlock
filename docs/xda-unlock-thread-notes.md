# XDA unlock thread notes

These are my own notes, read on 2026-11-04. The thread is
[UNLOCK][ROOT][TWRP][UNBRICK] Amazon Echo Show 8 1st Gen - 2019 (crown), by Rortiz2:
https://xdaforums.com/t/unlock-root-twrp-unbrick-amazon-echo-show-8-1st-gen-2019-crown.4766687/
It had 23 pages, and the first post was last edited 2026-11-03.

Always re-read the first post and the last page of the thread before acting.

## Firmware status (most important)

- **Fire OS 6575.1 (NS65751/8848) patches the exploit.** The developer announced this on 2026-11-03.
  A failed attempt on 6575.1 got stuck at "Sending payload", showed "data is too large" and left the device still locked.
- **Fire OS 6574.1 (NS65741/8149), which is ours, still works.** The developer answered "Yes" to exactly this question on 2026-10-21.
- Once unlocked, TWRP stops future updates from removing the unlock.
- **So: keep Wi-Fi off and don't let the device update. Boot straight into fastboot.**

## Current package

- Current release: `amonet-crown-v2.0.2.zip` (42 MB), from the attachments on post #1.
- Other attachments on post #1: older amonet versions, `restore-stock-crown.zip` (12 MB) and `motherboard.jpg` (test-point photo).
- Post #2 has `boot-root.zip` (7.7 MB).
- Sources:
  - https://github.com/R0rt1z2/amonet/tree/mt8163-echo-show
  - https://github.com/amazon-oss/android_bootable_recovery
  - https://github.com/R0rt1z2/twrp_device_amazon_echo-mt8163

## Option 1 unlock (working device, Windows or Linux)

1. Install the Kindle Fire USB driver. Fall back to Google's USB driver if that doesn't work.
2. Extract the amonet zip and run `fastbrick.bat` (Windows) or `./fastbrick.sh` (Linux).
3. With the charger connected, hold **all three buttons** until `=> FASTBOOT mode...` appears.
4. Connect micro-USB. The script should detect the device. Type `YES` when asked.
5. **After the 10-second grace period, do not interrupt. An interruption is a permanent brick.**
   It can take up to 5 minutes, then the device reboots into TWRP.

Option 2 (bootroms on bricked 2019/early-2020 units) needs Linux, taking the device apart and shorting test point TP30. We don't need it.

## Boot modes once unlocked (v2.x remaps the buttons)

| Mode | How to enter |
|---|---|
| Hacked fastboot | Hold **Volume Down only** while connecting power |
| TWRP | Hold **Volume Up only** while connecting power |
| USBDL (unbrick via MTKClient) | Hold **Mute + Volume Down** while connecting power, with USB connected |

Post #2 still says to press Mute for hacked fastboot, but it predates v2. Volume Down is the documented v2 combo.
The zip also includes `boot-recovery` and `boot-fastboot` scripts.

## After unlocking (post #2)

- **Rooted Fire OS:** in hacked fastboot, run `fastboot oem flags 61`, then
  `fastboot flash boot boot-root.img`, then `fastboot reboot`. ADB is now on with a root shell.
- **Sideload on Fire OS:** `adb shell settings put global disable_bouncer 1`, then `adb install x.apk`.
- **Custom launcher:** `adb remount`, then rename `/system/priv-app/com.amazon.paladin/com.amazon.paladin.apk`
  to `.bak` and reboot. Rename it back to undo.
- **LineageOS 18.1:** see the separate ROM thread.

## Going back to Fire OS

Download a stock update from ftvdb.com and rename `.bin` to `.zip`. In TWRP, run Factory Reset, then Install that zip.
One user (2026-11-03) reported a boot loop after doing this and had no answer yet.

## Hard rules

- **Never** modify LK, Preloader, TEE/TZ or any other critical partition. Most units have no BROM recovery, so a brick there is permanent.
- Only flash stock firmware through TWRP.
- In USBDL mode, **never** flash TEE1, LK or Preloader.

## Recent issues worth knowing

- 2026-10-25: touchscreen stopped working after TWRP was installed (one report, no answer).
- 2026-10-30: stuck on the Amazon logo after wiping system, data and cache and rebooting *before* installing LineageOS.
  **Install the ROM zip before rebooting after a wipe.**
- 2026-10-30: a macOS user notes the bundled fastboot is Linux/Windows only, plus a size check in current platform-tools.
  Use the fastboot bundled in the amonet zip, not ours, for `fastbrick`.
- 2026-10-22: Amazon recently updated LK on the Echo Dot 2nd gen, so be cautious.
