# Compares two Android boot images (header v0/v1): header fields, kernel bytes, and ramdisk contents.
# Read-only. Usage: compare-bootimg.ps1 <stock.img> <candidate.img>
param([string]$A, [string]$B)

function Read-BootImg($path) {
    $b = [IO.File]::ReadAllBytes($path)
    $magic = [Text.Encoding]::ASCII.GetString($b, 0, 8)
    if ($magic -ne 'ANDROID!') { throw "$path is not an Android boot image (magic '$magic')" }
    $u = { param($o) [BitConverter]::ToUInt32($b, $o) }
    $h = [ordered]@{
        kernel_size  = & $u 8;  kernel_addr  = '0x{0:X8}' -f (& $u 12)
        ramdisk_size = & $u 16; ramdisk_addr = '0x{0:X8}' -f (& $u 20)
        second_size  = & $u 24; tags_addr    = '0x{0:X8}' -f (& $u 32)
        page_size    = & $u 36; header_ver   = & $u 40
        os_version   = '0x{0:X8}' -f (& $u 44)
        name         = ([Text.Encoding]::ASCII.GetString($b, 48, 16)).TrimEnd([char]0)
        cmdline      = ([Text.Encoding]::ASCII.GetString($b, 64, 512)).TrimEnd([char]0)
    }
    $ps = $h.page_size
    $kOff = $ps
    $rOff = $kOff + [math]::Ceiling($h.kernel_size / $ps) * $ps
    $kernel = New-Object byte[] $h.kernel_size; [Array]::Copy($b, $kOff, $kernel, 0, $h.kernel_size)
    $ramdisk = New-Object byte[] $h.ramdisk_size; [Array]::Copy($b, $rOff, $ramdisk, 0, $h.ramdisk_size)
    [pscustomobject]@{ Header = $h; Kernel = $kernel; Ramdisk = $ramdisk }
}

function Get-Sha($bytes) {
    $s = [Security.Cryptography.SHA256]::Create()
    ([BitConverter]::ToString($s.ComputeHash($bytes)) -replace '-', '').ToLower()
}

function Expand-Ramdisk($bytes) {
    # MediaTek images may prefix a 512-byte header (magic 88 16 88 58, then a 4-byte size and a 32-byte name)
    if ($bytes[0] -eq 0x88 -and $bytes[1] -eq 0x16 -and $bytes[2] -eq 0x88 -and $bytes[3] -eq 0x58) {
        $mtkName = ([Text.Encoding]::ASCII.GetString($bytes, 8, 32)).TrimEnd([char]0)
        Write-Output ("  (MTK header '{0}' stripped)" -f $mtkName) | Out-Host
        $rest = New-Object byte[] ($bytes.Length - 512); [Array]::Copy($bytes, 512, $rest, 0, $rest.Length); $bytes = $rest
    }
    if ($bytes[0] -eq 0x1f -and $bytes[1] -eq 0x8b) {
        $in = New-Object IO.MemoryStream(,$bytes)
        $gz = New-Object IO.Compression.GZipStream($in, [IO.Compression.CompressionMode]::Decompress)
        $out = New-Object IO.MemoryStream
        $gz.CopyTo($out); $gz.Dispose()
        return , $out.ToArray()
    }
    throw ("ramdisk is not gzip (starts {0:X2}{1:X2}{2:X2}{3:X2})" -f $bytes[0], $bytes[1], $bytes[2], $bytes[3])
}

# Parses a newc cpio archive into name -> @{mode; sha; size}
function Read-Cpio($bytes) {
    $files = [ordered]@{}
    $o = 0
    while ($o + 110 -le $bytes.Length) {
        $hdr = [Text.Encoding]::ASCII.GetString($bytes, $o, 110)
        if (-not $hdr.StartsWith('070701')) { throw "bad cpio magic at $o" }
        $hex = { param($i) [Convert]::ToInt64($hdr.Substring(6 + 8 * $i, 8), 16) }
        $mode = & $hex 1; $fsize = & $hex 6; $nsize = & $hex 11
        $name = [Text.Encoding]::ASCII.GetString($bytes, $o + 110, $nsize - 1)
        $dOff = $o + 110 + $nsize; $dOff += (4 - ($dOff % 4)) % 4
        if ($name -eq 'TRAILER!!!') { break }
        $data = New-Object byte[] $fsize; [Array]::Copy($bytes, $dOff, $data, 0, $fsize)
        $files[$name] = @{ mode = [Convert]::ToString($mode, 8); size = $fsize; sha = (Get-Sha $data); data = $data }
        $o = $dOff + $fsize; $o += (4 - ($o % 4)) % 4
    }
    $files
}

$ia = Read-BootImg $A; $ib = Read-BootImg $B
"== header =="
foreach ($k in $ia.Header.Keys) {
    $va = $ia.Header[$k]; $vb = $ib.Header[$k]
    $tag = if ("$va" -eq "$vb") { 'same' } else { 'DIFF' }
    "{0,-13} {1}  stock={2}" -f $k, $tag, $va
    if ($tag -eq 'DIFF') { "{0,-13}       cand ={1}" -f '', $vb }
}
"== kernel =="
$ka = Get-Sha $ia.Kernel; $kb = Get-Sha $ib.Kernel
"stock {0}`ncand  {1}`nidentical: {2}" -f $ka, $kb, ($ka -eq $kb)
foreach ($img in @(@('stock', $ia), @('cand', $ib))) {
    $s = [Text.Encoding]::ASCII.GetString($img[1].Kernel)
    $m = [regex]::Match($s, 'Linux version [\x20-\x7e]{10,160}')
    "{0} kernel string: {1}" -f $img[0], $(if ($m.Success) { $m.Value } else { '(compressed; not visible)' })
}
"== ramdisk =="
$ra = Read-Cpio (Expand-Ramdisk $ia.Ramdisk); $rb = Read-Cpio (Expand-Ramdisk $ib.Ramdisk)
"stock files: $($ra.Count)  cand files: $($rb.Count)"
foreach ($n in ($ra.Keys + $rb.Keys | Sort-Object -Unique)) {
    if (-not $rb.Contains($n)) { "REMOVED  $n" }
    elseif (-not $ra.Contains($n)) { "ADDED    $n  ($($rb[$n].size) bytes, mode $($rb[$n].mode))" }
    elseif ($ra[$n].sha -ne $rb[$n].sha -or $ra[$n].mode -ne $rb[$n].mode) {
        "CHANGED  $n  ($($ra[$n].size) -> $($rb[$n].size) bytes, mode $($ra[$n].mode) -> $($rb[$n].mode))"
        $isText = ($rb[$n].data | Select-Object -First 4096 | Where-Object { $_ -eq 0 }).Count -eq 0
        if ($isText -and $rb[$n].size -lt 200000) {
            $la = [Text.Encoding]::UTF8.GetString($ra[$n].data) -split "`n"
            $lb = [Text.Encoding]::UTF8.GetString($rb[$n].data) -split "`n"
            Compare-Object $la $lb | ForEach-Object { "    {0} {1}" -f $(if ($_.SideIndicator -eq '=>') { '+' } else { '-' }), $_.InputObject.Trim() }
        }
    }
}
