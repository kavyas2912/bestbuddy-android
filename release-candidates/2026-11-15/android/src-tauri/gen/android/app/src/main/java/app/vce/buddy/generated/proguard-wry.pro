# THIS FILE IS AUTO-GENERATED. DO NOT MODIFY!!

# Copyright 2020-2023 Tauri Programme within The Commons Conservancy
# SPDX-License-Identifier: Apache-2.0
# SPDX-License-Identifier: MIT

-keep class app.vce.buddy.* {
  native <methods>;
}

-keep class app.vce.buddy.WryActivity {
  public <init>(...);

  void setWebView(app.vce.buddy.RustWebView);
  java.lang.Class getAppClass(...);
  int getId();
  java.lang.String getVersion();
  int startActivity(...);
}

-keep class app.vce.buddy.Ipc {
  public <init>(...);

  @android.webkit.JavascriptInterface public <methods>;
}

-keep class app.vce.buddy.RustWebView {
  public <init>(...);

  void loadUrlMainThread(...);
  void loadHTMLMainThread(...);
  void evalScript(...);
}

-keep class app.vce.buddy.RustWebChromeClient,app.vce.buddy.RustWebViewClient {
  public <init>(...);
}
