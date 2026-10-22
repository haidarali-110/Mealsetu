import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import '../firebase_options.dart';
import '../utils/nav_key.dart';
import 'api_service.dart';

// ── Background message handler (top-level, not inside a class) ───────────────
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(
    options: DefaultFirebaseOptions.currentPlatform,
  );
}

// ── Android notification channel ─────────────────────────────────────────────
const AndroidNotificationChannel _channel = AndroidNotificationChannel(
  'mealsetu_channel',
  'MealSetu Notifications',
  description: 'Delivery and subscription updates',
  importance: Importance.high,
  playSound: true,
  enableVibration: true,
);

// ── Singleton service ─────────────────────────────────────────────────────────
class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  FirebaseMessaging get _fcm => FirebaseMessaging.instance;
  final FlutterLocalNotificationsPlugin _local = FlutterLocalNotificationsPlugin();

  bool _initialized = false;

  Future<void> initialize() async {
    // Firebase init is idempotent — safe to call multiple times
    await Firebase.initializeApp(
      options: DefaultFirebaseOptions.currentPlatform,
    );

    if (_initialized) {
      // Already set up listeners — just refresh the token
      await _saveToken();
      return;
    }
    _initialized = true;

    // Background handler must be registered before any other setup
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Request permissions
    await _fcm.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );

    // Create Android notification channel + init local notifications plugin
    await _setupLocalNotifications();

    // Save FCM token to backend
    await _saveToken();

    // Re-save whenever the token is refreshed by FCM
    _fcm.onTokenRefresh.listen(_sendTokenToBackend);

    // Foreground: show a local notification while the app is open
    FirebaseMessaging.onMessage.listen(_handleForegroundMessage);

    // App in background → user taps notification
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // App was killed → user taps notification
    // Defer until after first frame so navigatorKey context is ready
    _fcm.getInitialMessage().then((message) {
      if (message != null) {
        WidgetsBinding.instance.addPostFrameCallback(
          (_) => _handleNotificationTap(message),
        );
      }
    });

    // iOS: show alert/badge/sound for foreground notifications
    await _fcm.setForegroundNotificationPresentationOptions(
      alert: true,
      badge: true,
      sound: true,
    );
  }

  // ── Local notifications setup ─────────────────────────────────────────────

  Future<void> _setupLocalNotifications() async {
    // Create Android channel
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(_channel);

    await _local.initialize(
      const InitializationSettings(
        android: AndroidInitializationSettings('@mipmap/ic_launcher'),
        iOS: DarwinInitializationSettings(
          requestAlertPermission: false,
          requestBadgePermission: false,
          requestSoundPermission: false,
        ),
      ),
      onDidReceiveNotificationResponse: _onLocalNotificationTap,
    );
  }

  // ── Token management ──────────────────────────────────────────────────────

  Future<void> _saveToken() async {
    try {
      final token = await _fcm.getToken();
      if (token != null) await _sendTokenToBackend(token);
    } catch (_) {}
  }

  Future<void> _sendTokenToBackend(String token) async {
    try {
      await ApiService().post('/users/fcm-token', {'token': token});
    } catch (_) {}
  }

  Future<void> clearToken() async {
    try {
      await ApiService().post('/users/fcm-token', {'token': ''});
    } catch (_) {}
  }

  // ── Foreground message → local notification ───────────────────────────────

  void _handleForegroundMessage(RemoteMessage message) {
    final notification = message.notification;
    if (notification == null) return;

    _local.show(
      message.hashCode,
      notification.title,
      notification.body,
      NotificationDetails(
        android: AndroidNotificationDetails(
          _channel.id,
          _channel.name,
          channelDescription: _channel.description,
          importance: Importance.high,
          priority: Priority.high,
          icon: '@mipmap/ic_launcher',
          color: const Color(0xFFF26522),
          styleInformation:
              (notification.body != null && notification.body!.length > 40)
                  ? BigTextStyleInformation(notification.body!)
                  : null,
        ),
        iOS: const DarwinNotificationDetails(
          presentAlert: true,
          presentBadge: true,
          presentSound: true,
        ),
      ),
      payload: message.data['screen'],
    );
  }

  // ── Notification tap → navigate ───────────────────────────────────────────

  void _handleNotificationTap(RemoteMessage message) {
    _routeToScreen(
      type:   message.data['type'],
      screen: message.data['screen'],
    );
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    _routeToScreen(screen: response.payload);
  }

  void _routeToScreen({String? type, String? screen}) {
    final target = _resolveRoute(type: type, screen: screen);
    navigateTo(target);
  }

  String _resolveRoute({String? type, String? screen}) {
    switch (type) {
      case 'order_confirmed':
      case 'plan_expiring':
      case 'delivery_assigned':
      case 'meal_picked_up':
      case 'out_for_delivery':
      case 'delivered':
        return '/subscription';
      case 'new_offer':
        return '/offers';
      case 'points_earned':
        return '/loyalty';
      case 'new_batch':
      case 'salary_paid':
        return '/delivery-home';
      default:
        break;
    }
    // Fallback: use screen payload directly
    switch (screen) {
      case 'subscription': return '/subscription';
      case 'offers':       return '/offers';
      case 'loyalty':      return '/loyalty';
      case 'batches':      return '/delivery-home';
      default:             return '/home';
    }
  }
}
