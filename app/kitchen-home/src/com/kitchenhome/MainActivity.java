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
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

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
        web.loadUrl("file:///android_asset/index.html");
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

    private class Bridge {
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
