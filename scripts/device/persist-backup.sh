#!/sbin/sh
# Runs inside TWRP. Mounts the persist partition read-only and tars its files to /tmp.
# Reads only; never writes to persist.
set -e
DEV=/dev/block/by-name/persist
MNT=/tmp/persist_ro
echo "== blkid =="
blkid "$DEV" || true
mkdir -p "$MNT"
umount "$MNT" 2>/dev/null || true
mount -o ro "$DEV" "$MNT"
echo "== files =="
ls -laR "$MNT" | head -n 80
tar -C "$MNT" -cf /tmp/persist-files.tar .
umount "$MNT"
ls -l /tmp/persist-files.tar
echo "== recent storage errors =="
dmesg | grep -iE 'mmc0|i/o error|blk_update' | tail -n 12 || true
