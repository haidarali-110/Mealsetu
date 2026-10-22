import 'package:flutter/material.dart';

/// Centralized color palette for the MealSetu app.
/// All colors are sourced directly from the MealSetu website design.
class AppColors {
  // Private constructor — this class should never be instantiated.
  AppColors._();

  // ── Brand ─────────────────────────────────────────────────────────────────

  /// Orange — used on the "Order Now" button, logo accent, and CTAs.
  static const Color primary = Color(0xFFE8570C);

  /// Dark navy — sidebar / drawer background.
  static const Color primaryDark = Color(0xFF1E2A3A);

  // ── Backgrounds ───────────────────────────────────────────────────────────

  /// Light grey — default page / scaffold background.
  static const Color background = Color(0xFFF5F6FA);

  /// Pure white — cards, modals, input fields.
  static const Color white = Colors.white;

  // ── Text ──────────────────────────────────────────────────────────────────

  /// Near-black — primary headings and body text.
  static const Color textDark = Color(0xFF1A1A2E);

  /// Medium grey — secondary labels, subtitles, hints.
  static const Color textGrey = Color(0xFF6B7280);

  // ── Semantic / Status ─────────────────────────────────────────────────────

  /// Green — "Active" status badge, FSSAI verified badge.
  static const Color success = Color(0xFF16A34A);

  /// Amber — "Pending" / warning badges.
  static const Color warning = Color(0xFFD97706);

  // ── UI Chrome ─────────────────────────────────────────────────────────────

  /// Light grey — card borders, dividers, input outlines.
  static const Color cardBorder = Color(0xFFE5E7EB);

  /// Bright green — "Nearby" availability indicator dot.
  static const Color nearbyGreen = Color(0xFF22C55E);
}
