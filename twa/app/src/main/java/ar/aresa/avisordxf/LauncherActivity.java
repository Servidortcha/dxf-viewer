/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package ar.aresa.avisordxf;

import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Base64;
import android.util.Log;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.URLEncoder;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {

    private static final String TAG = "AresaDXF";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();

        // If the app was launched to handle a .dxf file, read it and pass it as base64
        Intent intent = getIntent();
        if (intent != null && intent.getData() != null) {
            String fileName = queryFileName(intent.getData());
            if (fileName != null && fileName.toLowerCase().endsWith(".dxf")) {
                try {
                    byte[] bytes = readAllBytes(intent.getData());
                    String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                    String encodedName = URLEncoder.encode(fileName, "UTF-8").replace("+", "%20");
                    String encodedBase64 = URLEncoder.encode(base64, "UTF-8").replace("+", "%20");
                    String extra = "?dxf=" + encodedBase64 + "&dxfName=" + encodedName;
                    // Append to the launching URL (handling existing query/fragment)
                    String url = uri.toString();
                    if (url.contains("?")) {
                        url = url + "&" + extra.substring(1);
                    } else {
                        url = url + extra;
                    }
                    Log.d(TAG, "Passing DXF to web " + url.length() + " chars");
                    return Uri.parse(url);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to read DXF", e);
                }
            }
        }

        return uri;
    }

    private String queryFileName(Uri fileUri) {
        String name = null;
        try {
            String[] proj = {android.provider.OpenableColumns.DISPLAY_NAME};
            android.database.Cursor cursor = getContentResolver().query(fileUri, proj, null, null, null);
            if (cursor != null) {
                try {
                    if (cursor.moveToFirst()) {
                        int idx = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME);
                        if (idx >= 0) name = cursor.getString(idx);
                    }
                } finally {
                    cursor.close();
                }
            }
        } catch (Exception ignored) {
        }
        if (name == null) {
            String last = fileUri.getLastPathSegment();
            if (last != null) name = last.contains("/") ? last.substring(last.lastIndexOf('/') + 1) : last;
        }
        return name;
    }

    private byte[] readAllBytes(Uri fileUri) throws Exception {
        InputStream is = getContentResolver().openInputStream(fileUri);
        try {
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int n;
            while ((n = is.read(buffer)) != -1) {
                bos.write(buffer, 0, n);
            }
            return bos.toByteArray();
        } finally {
            if (is != null) is.close();
        }
    }
}
