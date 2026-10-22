import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Global navigator key passed to GoRouter.
/// Use [appNavigatorKey.currentContext?.go('/path')] to navigate
/// from outside the widget tree (e.g. notification handlers).
final GlobalKey<NavigatorState> appNavigatorKey = GlobalKey<NavigatorState>();

/// Convenience wrapper — navigate without needing a BuildContext.
void navigateTo(String path) {
  final ctx = appNavigatorKey.currentContext;
  if (ctx != null && ctx.mounted) {
    GoRouter.of(ctx).go(path);
  }
}
