package com.ankit.greedling;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

public class MainActivity extends Activity {
    private static final String APP_HOST = "greedling.local";
    private static final String APP_URL = "https://" + APP_HOST + "/index.html";
    private static final String ASSET_VERSION = "3";

    private WebView webView;
    private File webRoot;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON, WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setStatusBarColor(Color.rgb(5, 9, 12));
        getWindow().setNavigationBarColor(Color.rgb(5, 9, 12));
        enterImmersiveMode();

        try {
            webRoot = prepareGameFiles();
        } catch (IOException error) {
            showFatalError("Could not unpack GREEDLING: " + error.getMessage());
            return;
        }

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(5, 9, 12));
        webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setSupportZoom(false);
        settings.setTextZoom(100);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new LocalGameWebViewClient());
        setContentView(webView);
        webView.loadUrl(APP_URL);
    }

    private File prepareGameFiles() throws IOException {
        File root = new File(getFilesDir(), "greedling-web");
        File marker = new File(root, ".version");
        if (marker.isFile() && ASSET_VERSION.equals(readSmallFile(marker)) && new File(root, "index.html").isFile()) {
            return root;
        }
        deleteRecursive(root);
        if (!root.mkdirs() && !root.isDirectory()) throw new IOException("Cannot create web directory");

        try (InputStream raw = getAssets().open("game.zip"); ZipInputStream zip = new ZipInputStream(raw)) {
            ZipEntry entry;
            byte[] buffer = new byte[16384];
            String rootPath = root.getCanonicalPath() + File.separator;
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) continue;
                File out = new File(root, entry.getName());
                String outPath = out.getCanonicalPath();
                if (!outPath.startsWith(rootPath)) throw new IOException("Invalid bundled path");
                File parent = out.getParentFile();
                if (parent != null && !parent.exists() && !parent.mkdirs()) throw new IOException("Cannot create asset directory");
                try (FileOutputStream output = new FileOutputStream(out)) {
                    int read;
                    while ((read = zip.read(buffer)) > 0) output.write(buffer, 0, read);
                }
            }
        }
        try (FileOutputStream output = new FileOutputStream(marker)) {
            output.write(ASSET_VERSION.getBytes("UTF-8"));
        }
        return root;
    }

    private final class LocalGameWebViewClient extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            return intercept(request.getUrl());
        }

        @Override
        @SuppressWarnings("deprecation")
        public WebResourceResponse shouldInterceptRequest(WebView view, String url) {
            return intercept(Uri.parse(url));
        }

        private WebResourceResponse intercept(Uri uri) {
            if (uri == null || !"https".equals(uri.getScheme()) || !APP_HOST.equals(uri.getHost())) return null;
            String path = uri.getPath();
            if (path == null || path.equals("/")) path = "/index.html";
            try {
                File requested = new File(webRoot, path.substring(1));
                String rootPath = webRoot.getCanonicalPath() + File.separator;
                String filePath = requested.getCanonicalPath();
                if (!filePath.startsWith(rootPath) || !requested.isFile()) {
                    return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null,
                            new java.io.ByteArrayInputStream("Not found".getBytes("UTF-8")));
                }
                return new WebResourceResponse(mimeType(path), "UTF-8", new FileInputStream(requested));
            } catch (IOException error) {
                return null;
            }
        }
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".mjs") || lower.endsWith(".js")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".mp3")) return "audio/mpeg";
        if (lower.endsWith(".ogg")) return "audio/ogg";
        return "application/octet-stream";
    }

    private void showFatalError(String message) {
        WebView errorView = new WebView(this);
        errorView.setBackgroundColor(Color.rgb(5, 9, 12));
        String html = "<html><body style='background:#05090c;color:#efe5d5;font-family:sans-serif;padding:28px'>" +
                "<h2 style='color:#c4a46a'>GREEDLING</h2><p>Startup error</p><pre style='white-space:pre-wrap'>" +
                escapeHtml(message) + "</pre></body></html>";
        errorView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        setContentView(errorView);
    }

    private static String escapeHtml(String value) {
        return value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String readSmallFile(File file) throws IOException {
        byte[] bytes = new byte[(int) Math.min(file.length(), 64)];
        try (FileInputStream input = new FileInputStream(file)) {
            int count = input.read(bytes);
            return count <= 0 ? "" : new String(bytes, 0, count, "UTF-8");
        }
    }

    private static void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) for (File child : children) deleteRecursive(child);
        }
        file.delete();
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN |
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY |
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) enterImmersiveMode();
    }

    @Override
    protected void onPause() {
        if (webView != null) webView.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
        enterImmersiveMode();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
