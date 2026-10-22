import 'dart:convert';

import 'package:dio/dio.dart' show DioException;
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/api_service.dart';
import '../services/auth_service.dart';
import '../services/notification_service.dart';
import '../services/widget_service.dart';

/// Holds the current authentication state and exposes all auth actions
/// to the widget tree via Provider.
class AuthProvider extends ChangeNotifier {
  AuthProvider() {
    _loadStoredSession();
  }

  final AuthService _authService = AuthService();

  // ── State ─────────────────────────────────────────────────────────────────

  String _token = '';
  Map<String, dynamic>? _user;
  bool _isLoading = false;
  bool _isInitializing = true;   // true until the stored session is loaded
  String? _errorMessage;

  /// Set after a successful register() call; cleared after verifyRegisterOTP().
  String? _pendingUserId;
  String? _pendingMaskedEmail;

  // ── Getters ───────────────────────────────────────────────────────────────

  String get token           => _token;
  Map<String, dynamic>? get user => _user;
  bool get isLoading         => _isLoading;
  /// True while the stored session is being read on cold start.
  /// The router redirect returns null (no redirect) during this window so the
  /// user never sees a flash to /login before the token is confirmed missing.
  bool get isInitializing    => _isInitializing;
  String? get errorMessage   => _errorMessage;
  bool get isLoggedIn        => _token.isNotEmpty;
  String? get pendingUserId      => _pendingUserId;
  String? get pendingMaskedEmail => _pendingMaskedEmail;

  // ── Initialisation ────────────────────────────────────────────────────────

  Future<void> _loadStoredSession() async {
    _token = await _authService.getToken();
    _user  = await _authService.getUser();
    _isInitializing = false;
    notifyListeners();

    // If we have a token, silently refresh the stored profile with the latest
    // server data (phone / address / gender / profilePic) in the background.
    // Non-fatal — the user is already shown the home screen at this point.
    if (_token.isNotEmpty && _user != null) {
      await _authService.fetchAndSaveFullProfile(_token, _user!);
      _user = await _authService.getUser(); // pick up enriched data
      notifyListeners();
      // Refresh widget data on every cold start so it never stays stale
      WidgetService.refresh().ignore();
    }
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  /// Returns `true` on success; sets [errorMessage] on failure.
  /// role:"user" is sent automatically by [AuthService.login].
  Future<bool> login(String email, String password) async {
    _setLoading(true);
    try {
      // auth_service now owns all response parsing and saveUserData —
      // it throws a String on any failure, so there are no unsafe casts here.
      await _authService.login(email, password);

      // Read back what auth_service persisted to SharedPreferences.
      _token        = await _authService.getToken();
      _user         = await _authService.getUser();
      _errorMessage = null;
      // Save FCM token now that we have a valid auth session
      NotificationService().initialize().catchError((_) {});
      // Populate the home-screen widget with the user's subscription data
      WidgetService.refresh().ignore();
      return true;
    } on DioException catch (e) {
      // Safety net: DioException that escaped auth_service's own handler
      // (can happen with some Flutter-web CORS failure shapes).
      _errorMessage = ApiService().handleError(e);
      debugPrint(
        'Login DioException: ${e.type} | ${e.message} '
        '| status ${e.response?.statusCode} | body ${e.response?.data}',
      );
      return false;
    } on String catch (msg) {
      // Normal failure path — auth_service threw a human-readable String.
      // Apply portal-mismatch mapping before storing.
      _errorMessage = _resolveLoginError(msg);
      debugPrint('Login error (String): $msg');
      return false;
    } catch (e) {
      // True fallback — surface the real type and message instead of hiding it.
      _errorMessage = e.toString().replaceAll('Exception:', '').trim();
      debugPrint('Login unexpected error (${e.runtimeType}): $e');
      return false;
    } finally {
      _setLoading(false);
    }
  }

  // ── Register ──────────────────────────────────────────────────────────────

  // ── Address getters ───────────────────────────────────────────────────────

  String _getAddressField(String field) {
    final addr = _user?['address'];
    if (addr is Map) return addr[field] as String? ?? '';
    return '';
  }

  String get userFlatNo   => _getAddressField('flatHouseNo');
  String get userStreet   => _getAddressField('street');
  String get userArea     => _getAddressField('area');
  String get userLandmark => _getAddressField('landmark');
  String get userCity     => _getAddressField('city');

  String get userPinCode {
    final addr = _user?['address'];
    if (addr is Map) return addr['pincode'] as String? ?? _user?['pincode'] as String? ?? '';
    return _user?['pincode'] as String? ?? '';
  }

  double? get userLatitude {
    final addr = _user?['address'];
    if (addr is Map) return (addr['latitude'] as num?)?.toDouble();
    return null;
  }

  double? get userLongitude {
    final addr = _user?['address'];
    if (addr is Map) return (addr['longitude'] as num?)?.toDouble();
    return null;
  }

  String get userFullAddress {
    final addr = _user?['address'];
    if (addr is Map) return addr['fullAddress'] as String? ?? '';
    if (addr is String) return addr;
    return _user?['addressString'] as String? ?? '';
  }

  // ── Register ──────────────────────────────────────────────────────────────

  /// Returns `true` on success and stores [pendingUserId] + [pendingMaskedEmail]
  /// so the caller can navigate to the OTP verification screen.
  Future<bool> register({
    required String name,
    required String email,
    required String phone,
    required String password,
    String flatHouseNo = '',
    String street      = '',
    String area        = '',
    String landmark    = '',
    String city        = '',
    required String pinCode,
    double? latitude,
    double? longitude,
  }) async {
    _setLoading(true);
    try {
      final data = await _authService.register(
        name:        name,
        email:       email,
        phone:       phone,
        password:    password,
        flatHouseNo: flatHouseNo,
        street:      street,
        area:        area,
        landmark:    landmark,
        city:        city,
        pinCode:     pinCode,
        latitude:    latitude,
        longitude:   longitude,
      );

      if (data['success'] == false) {
        throw (data['message'] as String?)?.trim() ?? 'Registration failed.';
      }

      // Backend returns {userId, maskedEmail} — store for OTP screen.
      _pendingUserId      = data['userId'] as String?;
      _pendingMaskedEmail = data['maskedEmail'] as String?;
      _errorMessage       = null;
      notifyListeners();
      return true;
    } on String catch (msg) {
      _errorMessage = msg;
      return false;
    } catch (_) {
      _errorMessage = 'An unexpected error occurred.';
      return false;
    } finally {
      _setLoading(false);
    }
  }

  // ── Registration OTP ──────────────────────────────────────────────────────

  /// Verifies the registration OTP. On success the backend returns a token
  /// and user object — the session is saved automatically.
  Future<bool> verifyRegisterOTP(String otp) async {
    if (_pendingUserId == null) {
      _errorMessage = 'Session expired. Please register again.';
      notifyListeners();
      return false;
    }
    _setLoading(true);
    try {
      final data = await _authService.verifyRegisterOTP(_pendingUserId!, otp);

      if (data['success'] == false) {
        throw (data['message'] as String?)?.trim() ?? 'Invalid OTP.';
      }

      final token    = data['token'] as String;
      final userMap  = Map<String, dynamic>.from(data['user'] as Map);
      await _authService.saveUserData(token, userMap);
      // Enrich with phone / address / gender from /users/me (non-fatal).
      await _authService.fetchAndSaveFullProfile(token, userMap);
      _token              = await _authService.getToken();
      _user               = await _authService.getUser();
      _pendingUserId      = null;
      _pendingMaskedEmail = null;
      _errorMessage       = null;
      NotificationService().initialize().catchError((_) {});
      // Populate the home-screen widget with the user's subscription data
      WidgetService.refresh().ignore();
      return true;
    } on String catch (msg) {
      _errorMessage = msg;
      return false;
    } catch (_) {
      _errorMessage = 'OTP verification failed.';
      return false;
    } finally {
      _setLoading(false);
    }
  }

  /// Resends the registration OTP to the pending user's email.
  Future<bool> resendRegisterOTP() async {
    if (_pendingUserId == null) return false;
    _setLoading(true);
    try {
      final data = await _authService.resendRegisterOTP(_pendingUserId!);
      if (data['success'] == false) {
        throw (data['message'] as String?)?.trim() ?? 'Failed to resend OTP.';
      }
      _errorMessage = null;
      return true;
    } on String catch (msg) {
      _errorMessage = msg;
      return false;
    } catch (_) {
      _errorMessage = 'Failed to resend OTP.';
      return false;
    } finally {
      _setLoading(false);
    }
  }

  // ── Forgot-password OTP (3-step) ──────────────────────────────────────────
  //
  // These methods throw [String] on failure rather than setting errorMessage
  // and returning bool.  The caller (_ForgotPasswordDialog) manages its own
  // loading / error state — we don't want _isLoading to affect the login screen
  // buttons while the dialog is open.

  /// Step 1 — sends OTP to [email].  Throws [String] on error.
  Future<void> sendForgotOTP(String email) async {
    final data = await _authService.sendForgotOTP(email); // throws String
    if (data['success'] == false) {
      throw (data['message'] as String?)?.trim() ?? 'Failed to send OTP.';
    }
  }

  /// Step 2 — verifies [otp] for [email].  Throws [String] on error.
  Future<void> verifyForgotOTP(String email, String otp) async {
    final data = await _authService.verifyForgotOTP(email, otp);
    if (data['success'] == false) {
      throw (data['message'] as String?)?.trim() ?? 'Invalid or expired OTP.';
    }
  }

  /// Step 3 — sets the new [password] for [email].  Throws [String] on error.
  Future<void> resetPassword(String email, String password) async {
    final data = await _authService.resetPassword(email, password);
    if (data['success'] == false) {
      throw (data['message'] as String?)?.trim() ?? 'Password reset failed.';
    }
  }

  // ── Delivery login ────────────────────────────────────────────────────────

  /// Logs in a delivery rider via POST /delivery/login.
  /// Saves rider profile data to SharedPreferences for offline access.
  Future<bool> deliveryLogin(String email, String password) async {
    _setLoading(true);
    try {
      final data = await _authService.deliveryLogin(email, password);

      _token        = await _authService.getToken();
      _user         = await _authService.getUser();
      _errorMessage = null;
      NotificationService().initialize().catchError((_) {});

      // Persist rider-specific data separately so delivery screens can read it
      // without another API call (e.g. salary, service area, vendorId).
      final riderRaw = data['rider'];
      if (riderRaw is Map) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(
            'mealsetu_rider', jsonEncode(riderRaw));
        await prefs.setString('mealsetu_role', 'delivery');
      }

      return true;
    } on String catch (msg) {
      _errorMessage = msg;
      return false;
    } catch (_) {
      _errorMessage = 'Login failed. Please try again.';
      return false;
    } finally {
      _setLoading(false);
    }
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  Future<void> logout() async {
    // Clear FCM token from backend before wiping local session
    await NotificationService().clearToken().catchError((_) {});
    await _authService.clearUserData();
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('mealsetu_rider');
    await prefs.remove('mealsetu_role');
    _token              = '';
    _user               = null;
    _errorMessage       = null;
    _pendingUserId      = null;
    _pendingMaskedEmail = null;
    notifyListeners();
  }

  /// Re-reads the stored user JSON from SharedPreferences and notifies
  /// listeners.  Call this after any external update to the stored profile
  /// (e.g. EditProfileScreen saving new name / address).
  Future<void> reloadUser() async {
    _user = await _authService.getUser();
    notifyListeners();
  }

  void clearError() {
    _errorMessage = null;
    notifyListeners();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  void _setLoading(bool value) {
    _isLoading = value;
    notifyListeners();
  }

  /// Maps any portal-mismatch message variant to a single user-friendly string.
  String _resolveLoginError(String raw) {
    final lower = raw.toLowerCase();
    if (lower.contains('user portal')         ||
        lower.contains('vendor portal')       ||
        lower.contains('admin portal')        ||
        lower.contains('wrong portal')        ||
        lower.contains('registered as vendor')||
        lower.contains('registered as admin')) {
      return 'Please use the correct login. '
             'Contact support if the issue persists.';
    }
    return raw;
  }
}
