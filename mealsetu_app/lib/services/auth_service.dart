import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint, kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';

import 'api_service.dart';

// ── SharedPreferences keys ────────────────────────────────────────────────────
const String _kTokenKey = 'mealsetu_token';
const String _kUserKey  = 'mealsetu_user';

/// Low-level auth service. Every method either returns the raw response [Map]
/// or throws a human-readable [String] — callers never see [DioException].
class AuthService {
  AuthService._internal();
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  static AuthService get instance => _instance;

  final ApiService _api = ApiService();

  // ── Login / Register ──────────────────────────────────────────────────────

  /// POST /auth/login — role:"user" is REQUIRED by the backend.
  /// Without it the backend returns the "login via user portal" message.
  Future<Map<String, dynamic>> login(String email, String password) async {
    debugPrint('AuthService.login → POST /auth/login  (kIsWeb: $kIsWeb)');
    try {
      final response = await _api.post('/auth/login', {
        'email':    email.trim(),
        'password': password,
        'role':     'user',          // ← backend requirement
      });
      debugPrint('AuthService.login ← status ${response.statusCode}');

      // ── Safe response unwrap ─────────────────────────────────────────────
      // Never cast response.data directly to Map — it may be null or a String
      // (e.g. HTML error page) which causes "type 'Null' is not a subtype of Map".
      final dynamic raw = response.data;
      if (raw == null)  throw 'Empty response from server.';
      if (raw is! Map)  throw 'Unexpected response format: ${raw.runtimeType}';
      final data = Map<String, dynamic>.from(raw);

      // Backend returns HTTP 200 even for failures (e.g. wrong portal).
      // A missing token is the reliable signal that login did not succeed.
      if (data['token'] == null) {
        throw (data['message'] as String?)?.trim() ?? 'Login failed.';
      }

      // ── Build user map from FLAT response ────────────────────────────────
      // The backend sends _id / name / email / role / profilePic / pincode
      // at the TOP LEVEL — there is no nested 'user' key.
      final token = data['token'] as String;
      final user  = <String, dynamic>{
        '_id':        data['_id'],
        'name':       data['name'],
        'email':      data['email'],
        'role':       data['role'],
        'profilePic': data['profilePic'],
        // Required by HomeScreen → vendors-by-pincode query.
        'pincode':    data['pincode'],
      };

      await saveUserData(token, user);
      // Enrich stored profile with phone / address / gender from /users/me.
      // Non-fatal: user stays logged in even if this secondary call fails.
      await fetchAndSaveFullProfile(token, user);
      debugPrint('AuthService.login ✓  user: ${data['name']}  role: ${data['role']}');
      return data;
    } on DioException catch (e) {
      debugPrint(
        'AuthService.login DioException: ${e.type} '
        '| status ${e.response?.statusCode} | ${e.message}',
      );
      throw _api.handleError(e);
    } on String {
      rethrow; // our own thrown Strings — pass straight through to the caller
    } catch (e) {
      debugPrint('AuthService.login unexpected (${e.runtimeType}): $e');
      throw 'Login failed. Please try again.';
    }
  }

  /// POST /auth/register — returns {userId, maskedEmail, requiresOTPVerification}.
  /// Sends individual structured address fields; backend assembles the address object.
  Future<Map<String, dynamic>> register({
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
    try {
      final body = <String, dynamic>{
        'name':        name.trim(),
        'email':       email.trim(),
        'password':    password,
        'role':        'user',
        'phone':       phone.trim(),
        'pincode':     pinCode.trim(),
        'flatHouseNo': flatHouseNo.trim(),
        'street':      street.trim(),
        'area':        area.trim(),
        'landmark':    landmark.trim(),
        'city':        city.trim(),
      };
      if (latitude  != null) body['latitude']  = latitude;
      if (longitude != null) body['longitude'] = longitude;

      final response = await _api.post('/auth/register', body);
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (e) {
      throw _api.handleError(e);
    } catch (e) {
      throw 'Registration failed. Please try again.';
    }
  }

  // ── Registration OTP ──────────────────────────────────────────────────────

  /// POST /auth/register-verify-otp — verifies OTP and returns {token, user}.
  Future<Map<String, dynamic>> verifyRegisterOTP(
    String userId,
    String otp,
  ) async {
    try {
      final response = await _api.post('/auth/register-verify-otp', {
        'userId': userId,
        'otp':    otp,
      });
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (e) {
      throw _api.handleError(e);
    } catch (e) {
      throw 'OTP verification failed. Please try again.';
    }
  }

  /// POST /auth/register-resend-otp — sends a fresh OTP to the user's email.
  Future<Map<String, dynamic>> resendRegisterOTP(String userId) async {
    try {
      final response = await _api.post('/auth/register-resend-otp', {
        'userId': userId,
      });
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (e) {
      throw _api.handleError(e);
    } catch (e) {
      throw 'Failed to resend OTP. Please try again.';
    }
  }

  // ── Forgot-password OTP (3-step) ──────────────────────────────────────────

  /// Step 1 — POST /auth/forgot-password/send-otp
  Future<Map<String, dynamic>> sendForgotOTP(String email) async {
    try {
      final response = await _api.post(
        '/auth/forgot-password/send-otp',
        {'email': email.trim()},
      );
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (e) {
      throw _api.handleError(e);
    } catch (e) {
      throw 'Failed to send OTP. Please try again.';
    }
  }

  /// Step 2 — POST /auth/forgot-password/verify-otp
  Future<Map<String, dynamic>> verifyForgotOTP(
    String email,
    String otp,
  ) async {
    try {
      final response = await _api.post('/auth/forgot-password/verify-otp', {
        'email': email.trim(),
        'otp':   otp,
      });
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (e) {
      throw _api.handleError(e);
    } catch (e) {
      throw 'OTP verification failed. Please try again.';
    }
  }

  /// Step 3 — POST /auth/forgot-password/reset-password
  /// Backend field name is `password` (not `newPassword`).
  Future<Map<String, dynamic>> resetPassword(
    String email,
    String password,
  ) async {
    try {
      final response = await _api.post(
        '/auth/forgot-password/reset-password',
        {
          'email':    email.trim(),
          'password': password,      // ← backend field name
        },
      );
      return Map<String, dynamic>.from(response.data as Map);
    } on DioException catch (e) {
      throw _api.handleError(e);
    } catch (e) {
      throw 'Password reset failed. Please try again.';
    }
  }

  // ── Full profile fetch ────────────────────────────────────────────────────

  /// Calls GET /users/me and merges extra fields (phone, address, gender,
  /// pincode) into the stored user JSON so screens never need a second API
  /// call just to read the user's address or phone number.
  ///
  /// The token MUST already be saved in SharedPreferences before calling this,
  /// because [ApiService]'s auth interceptor reads from SharedPreferences.
  ///
  /// Non-fatal — any error is swallowed so login / OTP verification succeed
  /// even if the enrichment call fails (e.g. slow network on first open).
  Future<void> fetchAndSaveFullProfile(
    String token,
    Map<String, dynamic> basicUser,
  ) async {
    try {
      final response = await _api.get('/users/me');
      final data = response.data as Map<String, dynamic>? ?? {};

      // Start from the already-saved basic fields and layer the extras on top.
      final fullUser = Map<String, dynamic>.from(basicUser);
      fullUser['phone']         = data['phone'];
      fullUser['address']       = data['address'];       // object or legacy string
      fullUser['addressString'] = data['addressString']; // pre-computed display string
      fullUser['gender']        = data['gender'];
      // Keep the richer value — login may already have pincode; /me is authoritative.
      final addrMap = data['address'];
      final addrPin = (addrMap is Map ? addrMap['pincode'] : null) as String?;
      final topPin  = data['pincode'] as String?;
      final pincode = (addrPin?.isNotEmpty == true ? addrPin : topPin) ?? '';
      if (pincode.isNotEmpty) fullUser['pincode'] = pincode;
      if ((data['name']       as String?)?.isNotEmpty == true) fullUser['name']       = data['name'];
      if ((data['profilePic'] as String?)?.isNotEmpty == true) fullUser['profilePic'] = data['profilePic'];

      await saveUserData(token, fullUser);
      debugPrint(
        'AuthService.fetchAndSaveFullProfile ✓  '
        'phone: ${data["phone"]}  pincode: ${data["pincode"]}  gender: ${data["gender"]}',
      );
    } catch (e) {
      debugPrint('AuthService.fetchAndSaveFullProfile failed (non-fatal): $e');
    }
  }

  // ── Delivery login ────────────────────────────────────────────────────────

  /// POST /delivery/login — returns {token, user:{...}, rider:{...}, vendorName}.
  Future<Map<String, dynamic>> deliveryLogin(
      String email, String password) async {
    try {
      final response = await _api.post('/delivery/login', {
        'email':    email.trim(),
        'password': password,
      });

      final dynamic raw = response.data;
      if (raw == null) throw 'Empty response from server.';
      if (raw is! Map)  throw 'Unexpected response format.';
      final data = Map<String, dynamic>.from(raw);

      final token    = data['token'] as String?;
      if (token == null) {
        throw (data['message'] as String?)?.trim() ?? 'Login failed.';
      }

      final userRaw  = data['user'] as Map<String, dynamic>? ?? {};
      final user     = Map<String, dynamic>.from(userRaw);

      await saveUserData(token, user);

      // Save rider-specific data (salary, serviceArea, isAvailable, etc.)
      // so DeliveryProfileScreen can load it from 'mealsetu_rider'.
      final riderRaw = data['rider'] as Map<String, dynamic>?;
      if (riderRaw != null && riderRaw.isNotEmpty) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('mealsetu_rider', jsonEncode(riderRaw));
      }

      debugPrint('AuthService.deliveryLogin ✓  user: ${user['name']}');
      return data;
    } on DioException catch (e) {
      throw _api.handleError(e);
    } on String {
      rethrow;
    } catch (e) {
      debugPrint('AuthService.deliveryLogin unexpected: $e');
      throw 'Login failed. Please try again.';
    }
  }

  // ── Session persistence ───────────────────────────────────────────────────

  Future<void> saveUserData(String token, Map<String, dynamic> user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_kTokenKey, token);
    await prefs.setString(_kUserKey, jsonEncode(user));
  }

  Future<void> clearUserData() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_kTokenKey);
    await prefs.remove(_kUserKey);
  }

  // ── Session readers ───────────────────────────────────────────────────────

  Future<String> getToken() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_kTokenKey) ?? '';
  }

  Future<Map<String, dynamic>?> getUser() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_kUserKey);
    if (raw == null || raw.isEmpty) return null;
    try {
      return Map<String, dynamic>.from(jsonDecode(raw) as Map);
    } catch (_) {
      return null; // corrupt data → treat as logged-out
    }
  }

  Future<bool> isLoggedIn() async => (await getToken()).isNotEmpty;
}
