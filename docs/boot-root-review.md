# boot-root.img review

Reviewed 2026-11-04 with `scripts/compare-bootimg.ps1` against our stock boot (`backups/2026-11-04-stock/boot.img`, Fire OS 6574.1).

| | |
|---|---|
| `boot-root.zip` | 8,094,961 bytes, SHA256 `D18F8256869820A87527EC08E75EC495362103ED4AD669E946D052F0F705012D` (XDA post #2) |
| `boot-root.img` | 8,413,184 bytes, SHA256 `0FF15CD0FBC423269AD08D3966285F9A17B9AE65BF9B30BF6CF3BEE02E7EAF1C` |
| Built from | **Fire OS 6.5.7.1** (`Amazon/crown/crown:6.0/NS6571/6190N`, Oct 2025). This is the crown boot from an older firmware than ours. |
| Ours | Fire OS 6.5.7.4 (`NS65741/8151N`, boot built Oct 2026) |

## What it changes (the expected root changes)

- `default.prop`: `ro.secure=0`, `ro.debuggable=1`, `ro.adb.secure=0`, `service.adb.root=1`, `persist.sys.usb.config=mtp,adb`
- `init.fosflags.sh`: Amazon's script that turns adb off is replaced with three `setprop` lines that keep adb on, with root and no auth
- `sbin/adbd`: replaced with a different (insecure/root) adbd binary
- Symlink modes changed from 644 to 777, which is just a difference in how the repack was done

## What differs only because it's built from 6.5.7.1

- **Kernel** (6,507,933 vs 6,507,973 bytes, different hash), `sepolicy`, `file_contexts.bin`, `healthd`, and the security patch level in `os_version` (2025-08 vs our 2026-03)
- `init.whad_cc.rc` drops `net_raw` from one service's groups

Nothing unexpected was added, and the cmdline and load addresses are identical.

## Risk

Pairing a 6.5.7.1 kernel and sepolicy with a 6.5.7.4 system *usually* works on Fire OS point releases, and people on 6574.1 in the thread were told to use "the same files". It's still the most likely cause if something misbehaves (bootloop, Wi-Fi or audio quirks).
**Fallback:** boot TWRP (Volume Up while connecting power), then Restore our boot backup, or `fastboot flash boot backups/2026-11-04-stock/boot.img` from hacked fastboot.
If 6.5.7.1 boot causes problems, the cleaner option is a rooted boot built from **our own** stock boot (Magisk, or the same ramdisk edits repacked onto it).
