package com.agent.bridge;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUserAgentString("Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36 DeepSeekBridge/2");

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(webView, true);

        webView.addJavascriptInterface(new TermuxAgentBridge(), "TermuxAgentBridge");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                injectBridgeScript();
            }
        });

        webView.loadUrl("https://chat.deepseek.com");
    }

    private void injectBridgeScript() {
        try {
            BufferedReader reader = new BufferedReader(new InputStreamReader(getAssets().open("bridge.js")));
            StringBuilder script = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                script.append(line).append('
');
            }
            reader.close();
            webView.evaluateJavascript("javascript:(function(){" + script.toString() + "})()", null);
        } catch (Exception error) {
            Toast.makeText(this, "Bridge injection failed: " + error.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    public static class TermuxAgentBridge {
        @JavascriptInterface
        public String get(String url) {
            return request("GET", url, null);
        }

        @JavascriptInterface
        public String post(String url, String jsonPayload) {
            return request("POST", url, jsonPayload == null ? "{}" : jsonPayload);
        }

        private String request(String method, String urlText, String body) {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(urlText);
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod(method);
                connection.setConnectTimeout(5000);
                connection.setReadTimeout(5000);
                connection.setRequestProperty("Accept", "application/json");

                if (body != null) {
                    connection.setDoOutput(true);
                    connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    OutputStream out = connection.getOutputStream();
                    byte[] bytes = body.getBytes("UTF-8");
                    out.write(bytes, 0, bytes.length);
                    out.close();
                }

                int code = connection.getResponseCode();
                BufferedReader reader = new BufferedReader(new InputStreamReader(
                    code >= 400 ? connection.getErrorStream() : connection.getInputStream()
                ));
                StringBuilder response = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) response.append(line);
                reader.close();
                return response.toString();
            } catch (Exception error) {
                return "{"ok":false,"error":"" + safe(error.getMessage()) + ""}";
            } finally {
                if (connection != null) connection.disconnect();
            }
        }

        private static String safe(String value) {
            if (value == null) return "unknown";
            return value.replace("\", "\\").replace(""", "\"").replace("
", " ").replace("", " ");
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
