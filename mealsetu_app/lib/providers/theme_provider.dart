import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Manages the app-wide [ThemeMode] (light / dark / system).
///
/// Usage in widget tree:
///   `context.watch<ThemeProvider>().themeMode`  — current mode
///   `context.read<ThemeProvider>().setTheme(ThemeMode.dark)`
class ThemeProvider extends ChangeNotifier {
  ThemeProvider() {
    _load();
  }

  static const _kKey = 'theme_mode';

  ThemeMode _themeMode = ThemeMode.system;

  /// Current active theme mode.
  ThemeMode get themeMode => _themeMode;

  /// Whether dark mode is actually on right now (accounting for system).
  bool isDark(BuildContext context) {
    if (_themeMode == ThemeMode.dark) return true;
    if (_themeMode == ThemeMode.light) return false;
    return MediaQuery.platformBrightnessOf(context) == Brightness.dark;
  }

  // ── Persistence ───────────────────────────────────────────────────────────

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(_kKey) ?? 'system';
    _themeMode = _parse(saved);
    notifyListeners();
  }

  /// Persist and apply a new [ThemeMode].
  Future<void> setTheme(ThemeMode mode) async {
    if (_themeMode == mode) return;
    _themeMode = mode;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kKey, _serialize(mode));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  ThemeMode _parse(String s) => switch (s) {
        'light'  => ThemeMode.light,
        'dark'   => ThemeMode.dark,
        _        => ThemeMode.system,
      };

  String _serialize(ThemeMode m) => switch (m) {
        ThemeMode.light  => 'light',
        ThemeMode.dark   => 'dark',
        _                => 'system',
      };

  /// Human-readable label for the current mode.
  String get label => switch (_themeMode) {
        ThemeMode.light  => 'Light',
        ThemeMode.dark   => 'Dark',
        _                => 'System default',
      };
}
