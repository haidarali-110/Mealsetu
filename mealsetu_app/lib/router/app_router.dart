import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../providers/auth_provider.dart';
import '../utils/nav_key.dart';
import '../screens/splash/splash_screen.dart';
import '../screens/auth/login_screen.dart';
import '../screens/auth/register_screen.dart';
import '../screens/auth/verify_otp_screen.dart';
import '../screens/home/home_screen.dart';
import '../screens/subscription/subscription_screen.dart';
import '../screens/subscription/subscribe_screen.dart';
import '../screens/history/history_screen.dart';
import '../screens/more/more_screen.dart';
import '../models/vendor_model.dart';
import '../screens/vendor/vendor_detail_screen.dart';
import '../screens/payment/payment_success_screen.dart';
import '../screens/offers/offers_screen.dart';
import '../screens/safety/safety_screen.dart';
import '../screens/profile/edit_profile_screen.dart';
import '../screens/chat/ai_chat_screen.dart';
import '../screens/loyalty/loyalty_screen.dart';
import '../screens/about/about_screen.dart';
import '../screens/contact/contact_screen.dart';
import '../widgets/main_shell.dart';
import '../screens/delivery/delivery_shell.dart';
import '../screens/tracking/order_tracking_screen.dart';

// ── Auth guard ────────────────────────────────────────────────────────────────

/// Routes that are reachable without a token.
const _publicRoutes = {'/login', '/register', '/verify-otp'};

/// Splash manages its own navigation — exempt from all redirects.
const _selfManagedRoutes = {'/splash'};

// ── Router factory ────────────────────────────────────────────────────────────

GoRouter createRouter(AuthProvider authProvider) {
  return GoRouter(
    navigatorKey: appNavigatorKey,
    initialLocation: '/splash',
    debugLogDiagnostics: true, // remove before release
    refreshListenable: authProvider,
    redirect: (BuildContext context, GoRouterState state) {
      if (authProvider.isInitializing) return null;

      final location = state.matchedLocation;

      if (_selfManagedRoutes.contains(location)) return null;

      final loggedIn   = authProvider.isLoggedIn;
      final isPublic   = _publicRoutes.contains(location);
      final role       = authProvider.user?['role'] as String? ?? '';
      final isDelivery = role == 'delivery';

      if (!loggedIn && !isPublic) return '/login';
      if (loggedIn  &&  isPublic) {
        return isDelivery ? '/delivery-home' : '/home';
      }

      // Prevent delivery partners from accessing the customer area.
      if (loggedIn && isDelivery && !location.startsWith('/delivery')) {
        return '/delivery-home';
      }

      return null;
    },
    routes: [
      // ── Splash ────────────────────────────────────────────────────────────
      GoRoute(
        path: '/splash',
        name: 'splash',
        builder: (context, state) => const SplashScreen(),
      ),

      // ── Auth ──────────────────────────────────────────────────────────────
      GoRoute(
        path: '/login',
        name: 'login',
        builder: (context, state) => const LoginScreen(),
      ),
      GoRoute(
        path: '/register',
        name: 'register',
        builder: (context, state) => const RegisterScreen(),
      ),
      GoRoute(
        path: '/verify-otp',
        name: 'verifyOtp',
        builder: (context, state) {
          final extra       = (state.extra ?? {}) as Map<String, dynamic>;
          final userId      = extra['userId']      as String? ?? '';
          final maskedEmail = extra['maskedEmail'] as String? ?? '';
          return VerifyOtpScreen(userId: userId, maskedEmail: maskedEmail);
        },
      ),

      // ── Delivery partner shell (own bottom nav) ────────────────────────
      GoRoute(
        path: '/delivery-home',
        name: 'deliveryHome',
        builder: (context, state) => const DeliveryShell(),
      ),

      // ── Customer shell (bottom navigation) ────────────────────────────
      ShellRoute(
        builder: (context, state, child) => MainShell(child: child),
        routes: [
          GoRoute(
            path: '/home',
            name: 'home',
            builder: (context, state) => const HomeScreen(),
          ),
          GoRoute(
            path: '/subscription',
            name: 'subscription',
            builder: (context, state) => const SubscriptionScreen(),
          ),
          GoRoute(
            path: '/history',
            name: 'history',
            builder: (context, state) => const HistoryScreen(),
          ),
          GoRoute(
            path: '/more',
            name: 'more',
            builder: (context, state) => const MoreScreen(),
          ),
        ],
      ),

      // ── Order tracking ─────────────────────────────────────────────────
      GoRoute(
        path: '/track-order',
        name: 'trackOrder',
        builder: (context, state) {
          final orderId = state.extra as String? ?? '';
          return OrderTrackingScreen(orderId: orderId);
        },
      ),

      // ── Top-level pages (no bottom nav) ───────────────────────────────
      GoRoute(
        path: '/vendor/:id',
        name: 'vendorDetail',
        builder: (context, state) {
          final vendorId = state.pathParameters['id']!;
          final vendor   = state.extra as VendorModel?;
          return VendorDetailScreen(vendorId: vendorId, vendor: vendor);
        },
      ),
      GoRoute(
        path: '/subscribe',
        name: 'subscribe',
        builder: (context, state) => const SubscribeScreen(),
      ),
      GoRoute(
        path: '/payment-success',
        name: 'paymentSuccess',
        builder: (context, state) => const PaymentSuccessScreen(),
      ),
      GoRoute(
        path: '/offers',
        name: 'offers',
        builder: (context, state) => const OffersScreen(),
      ),
      GoRoute(
        path: '/safety',
        name: 'safety',
        builder: (context, state) => const SafetyScreen(),
      ),
      GoRoute(
        path: '/profile/edit',
        name: 'editProfile',
        builder: (context, state) => const EditProfileScreen(),
      ),
      GoRoute(
        path: '/ai-chat',
        name: 'aiChat',
        builder: (context, state) => const AiChatScreen(),
      ),
      GoRoute(
        path: '/loyalty',
        name: 'loyalty',
        builder: (context, state) => const LoyaltyScreen(),
      ),
      GoRoute(
        path: '/about',
        name: 'about',
        builder: (context, state) => const AboutScreen(),
      ),
      GoRoute(
        path: '/contact',
        name: 'contact',
        builder: (context, state) => const ContactScreen(),
      ),
    ],
  );
}
