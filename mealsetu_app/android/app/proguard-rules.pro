# ── Razorpay ProGuard rules ───────────────────────────────────────────────────
# Required so R8 does not obfuscate/strip Razorpay classes (CheckoutActivity,
# 3DS handler, OTP WebView bridge) in release builds.
# Source: https://razorpay.com/docs/payments/payment-gateway/android-integration/

-keepattributes *Annotation*
-dontwarn com.razorpay.**
-keep class com.razorpay.** { *; }
-optimizations !method/inlining/
-keepclasseswithmembers class * {
    public void onPayment*(...);
}

# ── Flutter default rules ─────────────────────────────────────────────────────
-keep class io.flutter.app.** { *; }
-keep class io.flutter.plugin.**  { *; }
-keep class io.flutter.util.**  { *; }
-keep class io.flutter.view.**  { *; }
-keep class io.flutter.**  { *; }
-keep class io.flutter.plugins.**  { *; }
