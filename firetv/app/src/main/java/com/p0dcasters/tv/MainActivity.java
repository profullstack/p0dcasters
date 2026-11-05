package com.p0dcasters.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.util.Xml;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;

import org.json.JSONArray;
import org.json.JSONObject;
import org.xmlpull.v1.XmlPullParser;

import java.io.ByteArrayOutputStream;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * A private RSS reader on Fire TV. The app has no preloaded podcast catalog:
 * the user supplies a secure feed URL, and this device fetches it directly.
 * assets/tv.js handles D-pad navigation; this class owns the native keyboard
 * and the user-requested feed download.
 */
public class MainActivity extends Activity {

    static final String HOME = "file:///android_asset/reader.html";
    private static final int MAX_FEED_BYTES = 2 * 1024 * 1024;
    private static final int MAX_EPISODES = 100;

    private WebView web;
    private FrameLayout root;
    private View fullscreen;
    private WebChromeClient.CustomViewCallback fullscreenDone;
    private String tvJs = "";
    private AlertDialog keyboard;
    private String pendingFeedUrl;
    private boolean readerReady;
    private final ExecutorService feedWorker = Executors.newSingleThreadExecutor();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        tvJs = readAsset("tv.js");

        root = new FrameLayout(this);
        root.setBackgroundColor(0xFF14140F);
        web = new WebView(this);
        web.setBackgroundColor(0xFF14140F);
        web.setFocusable(true);
        web.setFocusableInTouchMode(true);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setAllowFileAccess(true);
        s.setAllowFileAccessFromFileURLs(false);
        s.setAllowUniversalAccessFromFileURLs(false);
        s.setAllowContentAccess(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        web.addJavascriptInterface(new ReaderBridge(), "Podcasters");

        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());

        // Start on the bundled empty reader screen. Restoring a WebView state
        // could otherwise reopen the old directory from version 1.0.0.
        web.loadUrl(HOME);
        handle(getIntent());
        web.requestFocus();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handle(intent);
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (keyboard != null) keyboard.dismiss();
        feedWorker.shutdownNow();
        web.destroy();
        super.onDestroy();
    }

    /** Shared text may fill the field, but never starts a feed fetch. */
    private void handle(Intent intent) {
        String q = null;
        if (intent != null) {
            if (Intent.ACTION_SEND.equals(intent.getAction())) q = intent.getStringExtra(Intent.EXTRA_TEXT);
        }
        if (q != null && q.trim().length() > 0) {
            if (readerReady) setFeedUrl(q.trim());
            else pendingFeedUrl = q.trim();
        }
    }

    private void setFeedUrl(String value) {
        if (value == null) return;
        web.evaluateJavascript("window.setFeedUrl(" + JSONObject.quote(value.trim()) + ")", null);
    }

    // ---- keys -------------------------------------------------------------

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (fullscreen != null || keyboard != null && keyboard.isShowing()) return super.dispatchKeyEvent(e);
        int code = e.getKeyCode();
        String dir = null;
        switch (code) {
            case KeyEvent.KEYCODE_DPAD_UP: dir = "up"; break;
            case KeyEvent.KEYCODE_DPAD_DOWN: dir = "down"; break;
            case KeyEvent.KEYCODE_DPAD_LEFT: dir = "left"; break;
            case KeyEvent.KEYCODE_DPAD_RIGHT: dir = "right"; break;
            default: break;
        }
        if (dir != null) {
            if (e.getAction() == KeyEvent.ACTION_DOWN) nav(dir, e);
            return true;
        }
        if (code == KeyEvent.KEYCODE_DPAD_CENTER || code == KeyEvent.KEYCODE_ENTER
                || code == KeyEvent.KEYCODE_NUMPAD_ENTER) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) enter();
            return true;
        }
        String media = null;
        switch (code) {
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE: media = "playpause"; break;
            case KeyEvent.KEYCODE_MEDIA_PLAY: media = "play"; break;
            case KeyEvent.KEYCODE_MEDIA_PAUSE: media = "pause"; break;
            case KeyEvent.KEYCODE_MEDIA_FAST_FORWARD: media = "ff"; break;
            case KeyEvent.KEYCODE_MEDIA_REWIND: media = "rew"; break;
            default: break;
        }
        if (media != null) {
            if (e.getAction() == KeyEvent.ACTION_DOWN && e.getRepeatCount() == 0) {
                web.evaluateJavascript(tvJs + "\n;pitMedia('" + media + "')", null);
            }
            return true;
        }
        if (code == KeyEvent.KEYCODE_MENU || code == KeyEvent.KEYCODE_SEARCH) {
            if (e.getAction() == KeyEvent.ACTION_UP) openKeyboard("", getString(R.string.search_hint), "url", true);
            return true;
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    public void onBackPressed() {
        if (fullscreen != null) {
            exitFullscreen();
        } else if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void nav(final String dir, final KeyEvent original) {
        web.evaluateJavascript(tvJs + "\n;pitNav('" + dir + "')", new android.webkit.ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                // No answer means the page is not scriptable (still loading, or
                // a PDF): give the arrow to the WebView so it at least scrolls.
                if (v == null || "null".equals(v)) {
                    web.dispatchKeyEvent(original);
                    web.dispatchKeyEvent(KeyEvent.changeAction(original, KeyEvent.ACTION_UP));
                }
            }
        });
    }

    private void enter() {
        web.evaluateJavascript(tvJs + "\n;pitEnter()", new android.webkit.ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                String r = unquote(v);
                if (r != null && r.startsWith("text:")) {
                    try {
                        JSONObject f = new JSONObject(r.substring(5));
                        openKeyboard(f.optString("value"), f.optString("hint"), f.optString("type"), false);
                    } catch (Exception ignored) {
                        openKeyboard("", getString(R.string.search_hint), "search", true);
                    }
                } else if (r == null || "native".equals(r) || "none".equals(r)) {
                    long t = android.os.SystemClock.uptimeMillis();
                    web.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_CENTER, 0));
                    web.dispatchKeyEvent(new KeyEvent(t, t, KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_CENTER, 0));
                }
            }
        });
    }

    /**
     * A native text box, because it reliably opens the Fire TV keyboard and
     * its microphone. Standalone input fills the field; the user still presses
     * Load before any feed is fetched.
     */
    private void openKeyboard(String value, String hint, String type, final boolean standalone) {
        if (keyboard != null && keyboard.isShowing()) return;
        final EditText box = new EditText(this);
        box.setSingleLine(true);
        box.setText(value);
        box.setSelection(box.getText().length());
        box.setHint(hint.length() > 0 ? hint : getString(R.string.search_hint));
        box.setTextSize(22);
        int input = InputType.TYPE_CLASS_TEXT;
        if ("email".equals(type)) input |= InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS;
        else if ("url".equals(type)) input |= InputType.TYPE_TEXT_VARIATION_URI;
        else if ("password".equals(type)) input |= InputType.TYPE_TEXT_VARIATION_PASSWORD;
        else if ("number".equals(type) || "tel".equals(type)) input = InputType.TYPE_CLASS_NUMBER;
        box.setInputType(input);
        int action = "url".equals(type) ? EditorInfo.IME_ACTION_DONE : EditorInfo.IME_ACTION_SEARCH;
        box.setImeOptions(action | EditorInfo.IME_FLAG_NO_EXTRACT_UI);

        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        FrameLayout wrap = new FrameLayout(this);
        wrap.setPadding(pad, pad / 2, pad, 0);
        wrap.addView(box);

        final Runnable submit = new Runnable() {
            @Override
            public void run() {
                String text = box.getText().toString();
                InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) imm.hideSoftInputFromWindow(box.getWindowToken(), 0);
                if (keyboard != null) keyboard.dismiss();
                if (standalone) {
                    if (text.trim().length() > 0) setFeedUrl(text.trim());
                } else {
                    web.evaluateJavascript(tvJs + "\n;pitFill(" + JSONObject.quote(text) + ")", null);
                }
                web.requestFocus();
            }
        };

        keyboard = new AlertDialog.Builder(this, R.style.PitDialog)
                .setTitle(R.string.app_name)
                .setView(wrap)
                .setPositiveButton(R.string.search_go, new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface d, int w) { submit.run(); }
                })
                .create();
        box.setOnEditorActionListener(new android.widget.TextView.OnEditorActionListener() {
            @Override
            public boolean onEditorAction(android.widget.TextView v, int action, KeyEvent ev) {
                submit.run();
                return true;
            }
        });
        keyboard.setOnShowListener(new android.content.DialogInterface.OnShowListener() {
            @Override
            public void onShow(android.content.DialogInterface d) {
                box.requestFocus();
                InputMethodManager imm = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) imm.showSoftInput(box, InputMethodManager.SHOW_IMPLICIT);
            }
        });
        if (keyboard.getWindow() != null) {
            keyboard.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        }
        keyboard.show();
    }

    // ---- web clients --------------------------------------------------------

    private class Client extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return route(url);
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
            return route(req.getUrl().toString());
        }

        /** Keep the JavaScript bridge on the bundled reader page only. */
        private boolean route(String url) {
            return !HOME.equals(url);
        }

        @Override
        public void onPageCommitVisible(WebView view, String url) {
            view.evaluateJavascript(tvJs, null);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            view.evaluateJavascript(tvJs, null);
            readerReady = true;
            if (pendingFeedUrl != null) {
                String value = pendingFeedUrl;
                pendingFeedUrl = null;
                setFeedUrl(value);
            }
        }

    }

    /** Called by reader.html after the user presses Load. */
    private class ReaderBridge {
        @JavascriptInterface
        public void loadFeed(final String address) {
            feedWorker.execute(new Runnable() {
                @Override
                public void run() {
                    JSONObject result;
                    try {
                        result = fetchFeed(address);
                    } catch (Exception ignored) {
                        result = new JSONObject();
                        try {
                            result.put("error", "Couldn't load that feed. Check the HTTPS URL and try again.");
                        } catch (Exception ignoredJson) {}
                    }
                    final String json = result.toString();
                    runOnUiThread(new Runnable() {
                        @Override
                        public void run() {
                            if (!isFinishing() && web != null) {
                                web.evaluateJavascript("window.feedLoaded(" + json + ")", null);
                            }
                        }
                    });
                }
            });
        }
    }

    private JSONObject fetchFeed(String address) throws Exception {
        URL url = checkedFeedUrl(address);
        byte[] xml = null;

        for (int redirect = 0; redirect <= 5; redirect++) {
            HttpURLConnection connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(10000);
            connection.setReadTimeout(15000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("User-Agent", "podcasters-firetv/1.1");
            connection.setRequestProperty(
                    "Accept", "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9");
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status < 400) {
                    String location = connection.getHeaderField("Location");
                    if (location == null || redirect == 5) throw new IOException("redirect");
                    url = checkedFeedUrl(new URL(url, location).toString());
                    continue;
                }
                if (status < 200 || status >= 300) throw new IOException("response");
                int length = connection.getContentLength();
                if (length > MAX_FEED_BYTES) throw new IOException("large feed");
                try (InputStream in = connection.getInputStream()) {
                    xml = readBounded(in, MAX_FEED_BYTES);
                }
                break;
            } finally {
                connection.disconnect();
            }
        }

        if (xml == null) throw new IOException("feed unavailable");
        return parseFeed(xml, url);
    }

    private URL checkedFeedUrl(String raw) throws Exception {
        if (raw == null || raw.trim().length() == 0 || raw.length() > 2048) {
            throw new IOException("url");
        }
        Uri uri = Uri.parse(raw.trim());
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) || uri.getHost() == null || uri.getHost().length() == 0
                || uri.getUserInfo() != null) {
            throw new IOException("https required");
        }
        return new URL(raw.trim());
    }

    private byte[] readBounded(InputStream in, int maxBytes) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        int count;
        while ((count = in.read(buffer)) != -1) {
            total += count;
            if (total > maxBytes) throw new IOException("large feed");
            out.write(buffer, 0, count);
        }
        return out.toByteArray();
    }

    private JSONObject parseFeed(byte[] bytes, URL feedUrl) throws Exception {
        XmlPullParser parser = Xml.newPullParser();
        parser.setFeature(XmlPullParser.FEATURE_PROCESS_DOCDECL, false);
        parser.setInput(new ByteArrayInputStream(bytes), null);

        JSONArray episodes = new JSONArray();
        String feedTitle = "";
        StringBuilder text = null;
        boolean titleIsEpisode = false;
        boolean inEpisode = false;
        String episodeTitle = "";
        String audioUrl = "";

        int event = parser.getEventType();
        while (event != XmlPullParser.END_DOCUMENT && episodes.length() < MAX_EPISODES) {
            if (event == XmlPullParser.START_TAG) {
                String name = parser.getName().toLowerCase(Locale.ROOT);
                if ("item".equals(name) || "entry".equals(name)) {
                    inEpisode = true;
                    episodeTitle = "";
                    audioUrl = "";
                } else if ("title".equals(name)) {
                    text = new StringBuilder();
                    titleIsEpisode = inEpisode;
                } else if ("enclosure".equals(name) || "media:content".equals(name)) {
                    String candidate = parser.getAttributeValue(null, "url");
                    String type = parser.getAttributeValue(null, "type");
                    if (candidate != null && (type == null || type.trim().length() == 0
                            || type.toLowerCase(Locale.ROOT).startsWith("audio"))) {
                        audioUrl = resolveAudioUrl(feedUrl, candidate);
                    }
                } else if ("link".equals(name)
                        && "enclosure".equals(parser.getAttributeValue(null, "rel"))) {
                    String candidate = parser.getAttributeValue(null, "href");
                    if (candidate != null) audioUrl = resolveAudioUrl(feedUrl, candidate);
                }
            } else if ((event == XmlPullParser.TEXT || event == XmlPullParser.CDSECT) && text != null) {
                text.append(parser.getText());
            } else if (event == XmlPullParser.END_TAG) {
                String name = parser.getName().toLowerCase(Locale.ROOT);
                if ("title".equals(name) && text != null) {
                    String value = clean(text.toString(), 180);
                    if (titleIsEpisode) episodeTitle = value;
                    else if (feedTitle.length() == 0) feedTitle = value;
                    text = null;
                } else if (("item".equals(name) || "entry".equals(name)) && inEpisode) {
                    if (isHttpsUrl(audioUrl)) {
                        JSONObject episode = new JSONObject();
                        episode.put("title", episodeTitle.length() == 0 ? "Untitled episode" : episodeTitle);
                        episode.put("audio", audioUrl);
                        episodes.put(episode);
                    }
                    inEpisode = false;
                }
            }
            event = parser.next();
        }

        if (episodes.length() == 0) throw new IOException("no playable episodes");
        JSONObject result = new JSONObject();
        result.put("title", feedTitle.length() == 0 ? "Podcast feed" : feedTitle);
        result.put("episodes", episodes);
        return result;
    }

    private boolean isHttpsUrl(String raw) {
        try {
            Uri uri = Uri.parse(raw);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && uri.getHost() != null && uri.getUserInfo() == null;
        } catch (Exception ignored) {
            return false;
        }
    }

    private String resolveAudioUrl(URL base, String raw) {
        try {
            URL resolved = new URL(base, raw.trim());
            return "https".equalsIgnoreCase(resolved.getProtocol()) ? resolved.toString() : "";
        } catch (Exception ignored) {
            return "";
        }
    }

    private String clean(String value, int limit) {
        String result = value == null ? "" : value.replaceAll("\\s+", " ").trim();
        return result.length() > limit ? result.substring(0, limit) : result;
    }

    private class Chrome extends WebChromeClient {
        @Override
        public void onShowCustomView(View view, CustomViewCallback done) {
            if (fullscreen != null) {
                done.onCustomViewHidden();
                return;
            }
            fullscreen = view;
            fullscreenDone = done;
            root.addView(view, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            web.setVisibility(View.GONE);
        }

        @Override
        public void onHideCustomView() {
            exitFullscreen();
        }
    }

    private void exitFullscreen() {
        if (fullscreen == null) return;
        root.removeView(fullscreen);
        fullscreen = null;
        web.setVisibility(View.VISIBLE);
        if (fullscreenDone != null) fullscreenDone.onCustomViewHidden();
        fullscreenDone = null;
        web.requestFocus();
    }

    // ---- helpers ------------------------------------------------------------

    private String readAsset(String name) {
        try (InputStream in = getAssets().open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toString("UTF-8");
        } catch (IOException e) {
            return "";
        }
    }

    /** evaluateJavascript hands back a JSON value; our functions return strings. */
    static String unquote(String v) {
        if (v == null || "null".equals(v)) return null;
        try {
            return new JSONObject("{\"v\":" + v + "}").optString("v", null);
        } catch (Exception e) {
            return null;
        }
    }
}
