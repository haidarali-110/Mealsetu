/// Centralized string constants for the MealSetu app.
/// Keeps copy and configuration values out of widget trees.
class AppStrings {
  // Private constructor — this class should never be instantiated.
  AppStrings._();

  // ── App Identity ──────────────────────────────────────────────────────────

  static const String appName = 'MealSetu';

  // ── API Base URLs ─────────────────────────────────────────────────────────

  /// Android emulator — 10.0.2.2 maps to the host machine's localhost.
  static const String baseUrl = 'http://10.0.2.2:5000/api';

  /// Chrome / web — direct localhost reference for browser-based testing.
  static const String baseUrlChrome = 'http://localhost:5000/api';
}
