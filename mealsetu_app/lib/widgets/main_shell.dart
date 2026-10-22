import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../constants/app_colors.dart';

/// Persistent bottom-navigation shell that wraps the four main tab screens.
/// [child] is the currently active tab's widget, supplied by go_router's
/// ShellRoute.
class MainShell extends StatelessWidget {
  const MainShell({required this.child, super.key});

  final Widget child;

  // Map each tab index to its route path.
  static const List<String> _routes = [
    '/home',
    '/subscription',
    '/history',
    '/more',
  ];

  /// Derives the active tab index from the current matched location so the
  /// indicator stays correct when navigating via deep-links or back button.
  int _currentIndex(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    if (location.startsWith('/subscription')) return 1;
    if (location.startsWith('/history')) return 2;
    if (location.startsWith('/more')) return 3;
    return 0; // default to Home
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex(context),
        onTap: (index) => context.go(_routes[index]),
        type: BottomNavigationBarType.fixed,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: Colors.grey,
        selectedLabelStyle: const TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
        unselectedLabelStyle: const TextStyle(
          fontWeight: FontWeight.w400,
          fontSize: 12,
        ),
        backgroundColor: AppColors.white,
        elevation: 8,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.restaurant_outlined),
            activeIcon: Icon(Icons.restaurant),
            label: 'Home',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long_outlined),
            activeIcon: Icon(Icons.receipt_long),
            label: 'Subscription',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.history_outlined),
            activeIcon: Icon(Icons.history),
            label: 'History',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.menu_outlined),
            activeIcon: Icon(Icons.menu),
            label: 'More',
          ),
        ],
      ),
    );
  }
}
