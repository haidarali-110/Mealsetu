import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'constants/app_colors.dart';
import 'constants/app_strings.dart';
import 'providers/auth_provider.dart';
import 'providers/delivery_provider.dart';
import 'providers/loyalty_provider.dart';
import 'providers/theme_provider.dart';
import 'router/app_router.dart';
import 'services/notification_service.dart';
import 'services/widget_service.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Initialize Firebase + FCM listeners (token save may fail before login — that's OK)
  await NotificationService().initialize().catchError((_) {});
  // Initialize home_widget app group (iOS) — no-op on Android
  await WidgetService.initialize().catchError((_) {});
  runApp(const MealSetuApp());
}

/// [MealSetuApp] is a [StatefulWidget] so that [AuthProvider] and the
/// [GoRouter] instance (which holds a [refreshListenable] reference to
/// [AuthProvider]) can be created once and kept alive for the app's lifetime.
class MealSetuApp extends StatefulWidget {
  const MealSetuApp({super.key});

  @override
  State<MealSetuApp> createState() => _MealSetuAppState();
}

class _MealSetuAppState extends State<MealSetuApp> {
  final AuthProvider _authProvider = AuthProvider();
  late final _router = createRouter(_authProvider);

  // ── Light theme ────────────────────────────────────────────────────────────
  static final ThemeData _lightTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      surface: AppColors.background,
    ),
    scaffoldBackgroundColor: AppColors.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.white,
      foregroundColor: AppColors.textDark,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: AppColors.textDark,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.white,
      selectedItemColor: AppColors.primary,
      unselectedItemColor: Colors.grey,
    ),
    cardTheme: CardThemeData(
      color: AppColors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.cardBorder),
      ),
    ),
    dividerColor: AppColors.cardBorder,
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.cardBorder),
      ),
    ),
  );

  // ── Dark theme ─────────────────────────────────────────────────────────────
  static final ThemeData _darkTheme = ThemeData(
    useMaterial3: true,
    brightness: Brightness.dark,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primary,
      brightness: Brightness.dark,
    ),
    scaffoldBackgroundColor: const Color(0xFF0F0F0F),
    appBarTheme: const AppBarTheme(
      backgroundColor: Color(0xFF1A1A2E),
      foregroundColor: Colors.white,
      elevation: 0,
      centerTitle: false,
      titleTextStyle: TextStyle(
        color: Colors.white,
        fontSize: 18,
        fontWeight: FontWeight.w700,
      ),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: Color(0xFF1A1A2E),
      selectedItemColor: AppColors.primary,
      unselectedItemColor: Colors.grey,
    ),
    cardTheme: CardThemeData(
      color: const Color(0xFF1E1E2E),
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: Color(0xFF2A2A3E)),
      ),
    ),
    dividerColor: const Color(0xFF2A2A3E),
    listTileTheme: const ListTileThemeData(
      tileColor: Color(0xFF1A1A2E),
      iconColor: Colors.white70,
      textColor: Colors.white,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: const Color(0xFF1E1E2E),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Color(0xFF2A2A3E)),
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(value: _authProvider),
        ChangeNotifierProvider<DeliveryProvider>(create: (_) => DeliveryProvider()),
        ChangeNotifierProvider<LoyaltyProvider>(create: (_) => LoyaltyProvider()),
        ChangeNotifierProvider<ThemeProvider>(create: (_) => ThemeProvider()),
      ],
      child: Consumer<ThemeProvider>(
        builder: (context, themeProv, _) {
          return MaterialApp.router(
            title: AppStrings.appName,
            debugShowCheckedModeBanner: false,
            routerConfig: _router,
            theme: _lightTheme,
            darkTheme: _darkTheme,
            themeMode: themeProv.themeMode,
          );
        },
      ),
    );
  }
}
