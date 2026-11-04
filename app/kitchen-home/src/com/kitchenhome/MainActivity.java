package com.kitchenhome;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.drawable.BitmapDrawable;
import android.graphics.drawable.Drawable;
import android.os.Bundle;
import android.provider.Settings;
import android.util.Base64;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.util.List;

/**
 * Home screen shell: a full-screen WebView showing assets/index.html,
 * plus a small "Native" JavaScript bridge for launching and listing apps.
 */
public class MainActivity extends Activity {
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED);

        WebView.setWebContentsDebuggingEnabled(true);
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        // Lets the local dashboard call the Hue bridge (LAN http) and Open-Meteo directly.
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        web.setBackgroundColor(0xFF0B0F14);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Native");
        setContentView(web);
        hideSystemUi();
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                deliverTimer(getIntent());
            }
        });
        web.loadUrl("file:///android_asset/index.html");
    }

    /** If this launch came from a finished kitchen timer, tell the page to ring. */
    private void deliverTimer(Intent intent) {
        if (web == null || intent == null || !intent.hasExtra("timerDone")) return;
        int id = intent.getIntExtra("timerDone", 0);
        String label = intent.getStringExtra("timerLabel");
        intent.removeExtra("timerDone");
        web.evaluateJavascript("window.onTimerDone && window.onTimerDone(" + id + "," + JSONObject.quote(label == null ? "" : label) + ")", null);
    }

    private void hideSystemUi() {
        web.setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.onHomeResume && window.onHomeResume()", null);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.hasExtra("timerDone")) { deliverTimer(intent); return; }
        // Pressing Home while already home: close any open panel.
        if (web != null) web.evaluateJavascript("window.onHomePressed && window.onHomePressed()", null);
    }

    @Override
    public void onBackPressed() {
        if (web != null) web.evaluateJavascript("window.onBackPressed && window.onBackPressed()", null);
        // Never leave the home screen via Back.
    }

    private static String iconToDataUrl(Drawable d, int size) {
        Bitmap bmp;
        if (d instanceof BitmapDrawable && ((BitmapDrawable) d).getBitmap() != null) {
            bmp = Bitmap.createScaledBitmap(((BitmapDrawable) d).getBitmap(), size, size, true);
        } else {
            bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas c = new Canvas(bmp);
            d.setBounds(0, 0, size, size);
            d.draw(c);
        }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        bmp.compress(Bitmap.CompressFormat.PNG, 100, out);
        return "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
    }

    private android.media.session.MediaController currentController() {
        try {
            android.media.session.MediaSessionManager msm =
                    (android.media.session.MediaSessionManager) getSystemService(MEDIA_SESSION_SERVICE);
            List<android.media.session.MediaController> list =
                    msm.getActiveSessions(new android.content.ComponentName(this, MediaListener.class));
            android.media.session.MediaController best = null;
            for (android.media.session.MediaController c : list) {
                if (c.getMetadata() == null) continue;
                android.media.session.PlaybackState st = c.getPlaybackState();
                if (st != null && st.getState() == android.media.session.PlaybackState.STATE_PLAYING) return c;
                if (best == null) best = c;
            }
            return best;
        } catch (Exception e) {
            return null;
        }
    }

    private class Bridge {
        /** file:// URLs of photos in /sdcard/Pictures/KitchenHome (for the background slideshow). */
        @JavascriptInterface
        public String localPhotos() {
            JSONArray arr = new JSONArray();
            try {
                java.io.File dir = new java.io.File(android.os.Environment.getExternalStorageDirectory(), "Pictures/KitchenHome");
                if (!dir.isDirectory()) dir.mkdirs();
                java.io.File[] files = dir.listFiles();
                if (files != null) {
                    for (java.io.File f : files) {
                        String n = f.getName().toLowerCase();
                        if (n.endsWith(".jpg") || n.endsWith(".jpeg") || n.endsWith(".png") || n.endsWith(".webp")) {
                            arr.put(android.net.Uri.fromFile(f).toString());
                        }
                    }
                }
            } catch (Exception ignored) { }
            return arr.toString();
        }

        /** Rings at endMs even if another app (Peacock, Spotify) is in front. */
        @JavascriptInterface
        public void scheduleTimer(int id, double endMs, String label) {
            android.app.AlarmManager am = (android.app.AlarmManager) getSystemService(ALARM_SERVICE);
            Intent i = new Intent(MainActivity.this, TimerReceiver.class).putExtra("id", id).putExtra("label", label);
            android.app.PendingIntent pi = android.app.PendingIntent.getBroadcast(MainActivity.this, id, i,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT);
            am.setExactAndAllowWhileIdle(android.app.AlarmManager.RTC_WAKEUP, (long) endMs, pi);
        }

        @JavascriptInterface
        public void cancelTimer(int id) {
            android.app.AlarmManager am = (android.app.AlarmManager) getSystemService(ALARM_SERVICE);
            Intent i = new Intent(MainActivity.this, TimerReceiver.class);
            android.app.PendingIntent pi = android.app.PendingIntent.getBroadcast(MainActivity.this, id, i,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT);
            am.cancel(pi);
            pi.cancel();
        }

        /** What's playing in other apps (Spotify, SmartTube...). Art only when withArt is true. */
        @JavascriptInterface
        public String nowPlaying(boolean withArt) {
            JSONObject o = new JSONObject();
            try {
                android.media.session.MediaController c = currentController();
                if (c == null) return "null";
                android.media.MediaMetadata md = c.getMetadata();
                android.media.session.PlaybackState st = c.getPlaybackState();
                o.put("pkg", c.getPackageName());
                try {
                    o.put("app", String.valueOf(getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(c.getPackageName(), 0))));
                } catch (Exception e) { o.put("app", c.getPackageName()); }
                o.put("title", md.getString(android.media.MediaMetadata.METADATA_KEY_TITLE));
                String artist = md.getString(android.media.MediaMetadata.METADATA_KEY_ARTIST);
                if (artist == null) artist = md.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM_ARTIST);
                o.put("artist", artist);
                o.put("album", md.getString(android.media.MediaMetadata.METADATA_KEY_ALBUM));
                o.put("playing", st != null && st.getState() == android.media.session.PlaybackState.STATE_PLAYING);
                if (withArt) {
                    Bitmap art = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ALBUM_ART);
                    if (art == null) art = md.getBitmap(android.media.MediaMetadata.METADATA_KEY_ART);
                    if (art != null) {
                        Bitmap small = Bitmap.createScaledBitmap(art, 160, 160 * art.getHeight() / Math.max(1, art.getWidth()), true);
                        ByteArrayOutputStream out = new ByteArrayOutputStream();
                        small.compress(Bitmap.CompressFormat.JPEG, 85, out);
                        o.put("art", "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                    }
                }
            } catch (Exception e) {
                return "null";
            }
            return o.toString();
        }

        @JavascriptInterface
        public void media(final String action) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    android.media.session.MediaController c = currentController();
                    if (c == null) return;
                    android.media.session.MediaController.TransportControls t = c.getTransportControls();
                    if ("play".equals(action)) t.play();
                    else if ("pause".equals(action)) t.pause();
                    else if ("next".equals(action)) t.skipToNext();
                    else if ("prev".equals(action)) t.skipToPrevious();
                }
            });
        }

        @JavascriptInterface
        public boolean launch(String pkg) {
            try {
                Intent i = getPackageManager().getLaunchIntentForPackage(pkg);
                if (i == null) {
                    Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(pkg);
                    List<ResolveInfo> r = getPackageManager().queryIntentActivities(q, 0);
                    if (r.isEmpty()) return false;
                    i = q.setClassName(pkg, r.get(0).activityInfo.name);
                }
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
                startActivity(i);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** JSON array of {pkg, label} for every launchable app, sorted by label. */
        @JavascriptInterface
        public String apps() {
            JSONArray arr = new JSONArray();
            try {
                PackageManager pm = getPackageManager();
                Intent q = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
                List<ResolveInfo> list = pm.queryIntentActivities(q, 0);
                java.util.Collections.sort(list, new ResolveInfo.DisplayNameComparator(pm));
                for (ResolveInfo ri : list) {
                    String pkg = ri.activityInfo.packageName;
                    if (pkg.equals(getPackageName())) continue;
                    JSONObject o = new JSONObject();
                    o.put("pkg", pkg);
                    o.put("label", String.valueOf(ri.loadLabel(pm)));
                    arr.put(o);
                }
            } catch (Exception ignored) { }
            return arr.toString();
        }

        @JavascriptInterface
        public String icon(String pkg) {
            try {
                return iconToDataUrl(getPackageManager().getApplicationIcon(pkg), 144);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean installed(String pkg) {
            try {
                ApplicationInfo ai = getPackageManager().getApplicationInfo(pkg, 0);
                return ai.enabled;
            } catch (Exception e) {
                return false;
            }
        }

        /** Opens a web page in the built-in browser (used for Hulu / Peacock web tiles). */
        @JavascriptInterface
        public boolean openUrl(String url) {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(url))
                        .setClass(MainActivity.this, BrowserActivity.class)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(i);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Widevine details from the platform DRM: security level (L1/L3), version, HDCP. */
        @JavascriptInterface
        public String drmInfo() {
            JSONObject o = new JSONObject();
            android.media.MediaDrm drm = null;
            try {
                java.util.UUID wv = new java.util.UUID(0xEDEF8BA979D64ACEL, 0xA3C827DCD51D21EDL);
                o.put("widevineSupported", android.media.MediaDrm.isCryptoSchemeSupported(wv));
                drm = new android.media.MediaDrm(wv);
                for (String p : new String[] { "securityLevel", "version", "vendor", "systemId", "hdcpLevel", "maxHdcpLevel" }) {
                    try { o.put(p, drm.getPropertyString(p)); } catch (Exception e) { o.put(p, "n/a"); }
                }
            } catch (Exception e) {
                try { o.put("error", String.valueOf(e)); } catch (Exception ignored) { }
            } finally {
                if (drm != null) drm.release();
            }
            return o.toString();
        }

        @JavascriptInterface
        public void openSettings() {
            try {
                startActivity(new Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) { }
        }

        @JavascriptInterface
        public void openWifiSettings() {
            try {
                startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            } catch (Exception ignored) { }
        }

        /** 0..255 window brightness override; -1 restores the system setting. */
        @JavascriptInterface
        public void setBrightness(final int level) {
            runOnUiThread(new Runnable() {
                @Override public void run() {
                    WindowManager.LayoutParams lp = getWindow().getAttributes();
                    lp.screenBrightness = level < 0 ? WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE : Math.max(1, level) / 255f;
                    getWindow().setAttributes(lp);
                }
            });
        }
    }
}
