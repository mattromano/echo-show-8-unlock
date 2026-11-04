package com.kitchenhome;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.webkit.CookieManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import java.net.URISyntaxException;

/**
 * Minimal web browser so apps that hand sign-in off to "a browser" (Spotify, etc.)
 * have somewhere to go. Non-http links (spotify://, intent://) are passed back to apps,
 * which is how the sign-in result returns to the app that asked for it.
 */
public class BrowserActivity extends Activity {
    private WebView web;
    private EditText address;
    private ProgressBar progress;
    private Button desktopBtn;
    private String mobileUa;
    private boolean desktop;

    /** Sites that refuse mobile browsers; they get "desktop site" mode automatically. */
    private static final String[] DESKTOP_HOSTS = { "peacocktv.com", "hulu.com", "disneyplus.com", "max.com", "paramountplus.com" };
    private static final String DESKTOP_UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36";

    private static boolean wantsDesktop(String url) {
        String host = Uri.parse(url).getHost();
        if (host == null) return false;
        for (String h : DESKTOP_HOSTS) if (host.equals(h) || host.endsWith("." + h)) return true;
        return false;
    }

    private void setDesktop(boolean on) {
        desktop = on;
        web.getSettings().setUserAgentString(on ? DESKTOP_UA : mobileUa);
        desktopBtn.setTextColor(on ? 0xFFF2B45A : 0xFF8B98AA);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xFF0B0F14);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(12, 8, 12, 8);
        bar.setBackgroundColor(0xFF161D27);

        Button back = button("←");
        back.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { if (web.canGoBack()) web.goBack(); else finish(); }
        });
        Button close = button("✕");
        close.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { finish(); }
        });

        address = new EditText(this);
        address.setSingleLine(true);
        address.setTextColor(0xFFEEF2F6);
        address.setHintTextColor(0xFF8B98AA);
        address.setHint("Search or enter address");
        address.setTextSize(16);
        address.setBackgroundColor(0xFF0B0F14);
        address.setPadding(20, 14, 20, 14);
        address.setImeOptions(EditorInfo.IME_ACTION_GO);
        address.setSelectAllOnFocus(true);
        address.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            @Override public boolean onEditorAction(TextView v, int actionId, KeyEvent event) {
                go(address.getText().toString());
                return true;
            }
        });

        desktopBtn = button("Desktop");
        desktopBtn.setTextSize(14);
        desktopBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { setDesktop(!desktop); web.reload(); }
        });

        bar.addView(back);
        bar.addView(address, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        bar.addView(desktopBtn);
        bar.addView(close);

        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(100);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        mobileUa = s.getUserAgentString();
        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                return handleSpecial(req.getUrl().toString());
            }
            @SuppressWarnings("deprecation")
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleSpecial(url);
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                if (!address.hasFocus()) address.setText(url);
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int p) {
                progress.setProgress(p);
                progress.setVisibility(p >= 100 ? View.GONE : View.VISIBLE);
            }
            @Override public void onPermissionRequest(PermissionRequest request) {
                // Allow DRM (Widevine) for streaming sites; nothing else.
                for (String r : request.getResources()) {
                    if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID.equals(r)) {
                        request.grant(new String[] { PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID });
                        return;
                    }
                }
                request.deny();
            }
        });

        root.addView(bar, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(progress, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 6));
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        Uri data = getIntent().getData();
        go(data != null ? data.toString() : "https://duckduckgo.com/");
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.getData() != null) go(intent.getData().toString());
    }

    private Button button(String label) {
        Button b = new Button(this);
        b.setText(label);
        b.setTextSize(18);
        b.setTextColor(0xFFEEF2F6);
        b.setBackgroundColor(0x00000000);
        return b;
    }

    private void go(String input) {
        String s = input == null ? "" : input.trim();
        if (TextUtils.isEmpty(s)) return;
        if (!s.contains("://")) {
            s = (s.contains(".") && !s.contains(" ")) ? "https://" + s : "https://duckduckgo.com/?q=" + Uri.encode(s);
        }
        if (!handleSpecial(s)) {
            if (wantsDesktop(s) != desktop) setDesktop(wantsDesktop(s));
            address.setText(s);
            web.loadUrl(s);
        }
        web.requestFocus();
    }

    /** Hands non-web links (app callbacks like spotify:// or intent://) to the system. */
    private boolean handleSpecial(String url) {
        Uri u = Uri.parse(url);
        String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
        if (scheme.equals("http") || scheme.equals("https")) {
            if (wantsDesktop(url) && !desktop) {
                // Switch to desktop mode and reload this navigation with the new user agent.
                setDesktop(true);
                web.loadUrl(url);
                return true;
            }
            return false;
        }
        if (scheme.equals("about") || scheme.equals("data") || scheme.equals("blob")) {
            return false;
        }
        try {
            Intent i = scheme.equals("intent") ? Intent.parseUri(url, Intent.URI_INTENT_SCHEME) : new Intent(Intent.ACTION_VIEW, u);
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            i.setComponent(null);
            i.setSelector(null);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
            if (!web.canGoBack()) finish();
        } catch (URISyntaxException | ActivityNotFoundException e) {
            if (scheme.equals("intent")) {
                try {
                    String fallback = Intent.parseUri(url, Intent.URI_INTENT_SCHEME).getStringExtra("browser_fallback_url");
                    if (fallback != null) { web.loadUrl(fallback); return true; }
                } catch (URISyntaxException ignored) { }
            }
        }
        return true;
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        CookieManager.getInstance().flush();
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
