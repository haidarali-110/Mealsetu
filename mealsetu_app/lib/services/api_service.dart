import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:shared_preferences/shared_preferences.dart';

// ── DEV NETWORK CONFIG ────────────────────────────────────────────────────────
//
//  Step 1: Run `ipconfig` in Command Prompt.
//          Look for "IPv4 Address" under "Wireless LAN adapter Wi-Fi".
//          Replace the value of [_wifiIp] below with that address.
//
//  Step 2: Set [_physicalDevice]:
//          false → Android emulator  (10.0.2.2 maps to your laptop localhost)
//          true  → Physical phone    (uses [_wifiIp] below)
//
//  Chrome always uses localhost automatically — no change needed for web.
// ─────────────────────────────────────────────────────────────────────────────

const bool _physicalDevice = true;          // ← flip to true for real phone
const String _wifiIp         ='192.168.10.52';   // ← replace X with your WiFi IP

String _resolveBaseUrl() {
  if (kIsWeb)           return 'http://localhost:5000/api';        // Chrome
  if (_physicalDevice)  return 'http://$_wifiIp:5000/api';         // real phone
  return                       'http://192.168.10.52/api';        // emulator
}

/// Singleton Dio wrapper used by every service in the app.
///
/// Usage:
///   final api = ApiService();
///   final response = await api.get('/vendors');
class ApiService {
  // ── Singleton ─────────────────────────────────────────────────────────────

  ApiService._internal() {
    _dio = Dio(
      BaseOptions(
        baseUrl: _resolveBaseUrl(),
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: const {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      ),
    );
    _dio.interceptors.add(_buildAuthInterceptor());
  }

  static final ApiService _instance = ApiService._internal();

  /// Access the singleton: `ApiService()` or `ApiService.instance`.
  factory ApiService() => _instance;
  static ApiService get instance => _instance;

  /// Exposed so SocketService can derive the WebSocket URL.
  String get baseUrl => _resolveBaseUrl();

  late final Dio _dio;

  // ── Interceptors ──────────────────────────────────────────────────────────

  /// Attaches the Bearer token on every outgoing request.
  /// Clears stored credentials when the server returns 401 Unauthorized.
  InterceptorsWrapper _buildAuthInterceptor() {
    return InterceptorsWrapper(
      onRequest: (RequestOptions options, RequestInterceptorHandler handler) async {
        final prefs = await SharedPreferences.getInstance();
        final token = prefs.getString('mealsetu_token') ?? '';
        if (token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
        handler.next(options);
      },
      onResponse: (Response response, ResponseInterceptorHandler handler) {
        handler.next(response);
      },
      onError: (DioException error, ErrorInterceptorHandler handler) async {
        if (error.response?.statusCode == 401) {
          // Token expired or invalid — wipe stored session data.
          final prefs = await SharedPreferences.getInstance();
          await prefs.remove('mealsetu_token');
          await prefs.remove('mealsetu_user');
        }
        handler.next(error);
      },
    );
  }

  // ── Error handling ────────────────────────────────────────────────────────

  /// Converts a [DioException] into a user-readable message.
  /// Prefers the `message` field in the server's JSON body when present.
  String handleError(DioException e) {
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
        return 'Connection timed out. Please check your internet.';

      case DioExceptionType.sendTimeout:
        return 'Upload timed out. Please try again.';

      case DioExceptionType.receiveTimeout:
        return 'Server took too long to respond. Please try again.';

      case DioExceptionType.badResponse:
        // Prefer the server's own error message when available.
        final serverMsg = e.response?.data is Map
            ? (e.response!.data as Map)['message'] as String?
            : null;
        if (serverMsg != null && serverMsg.isNotEmpty) return serverMsg;

        switch (e.response?.statusCode) {
          case 400: return 'Bad request. Please check your input.';
          case 401: return 'Session expired. Please log in again.';
          case 403: return 'You don\'t have permission to do that.';
          case 404: return 'Resource not found.';
          case 409: return 'Conflict — the record may already exist.';
          case 422: return 'Validation error. Please review your input.';
          case 429: return 'Too many requests. Please slow down.';
          default:
            if ((e.response?.statusCode ?? 0) >= 500) {
              return 'Server error. Please try again later.';
            }
            return 'Unexpected response (${e.response?.statusCode}).';
        }

      case DioExceptionType.cancel:
        return 'Request was cancelled.';

      case DioExceptionType.connectionError:
        return 'No internet connection. Please check your network.';

      case DioExceptionType.badCertificate:
        return 'SSL certificate error. Contact support.';

      case DioExceptionType.unknown:
        return e.message ?? 'An unexpected error occurred.';
    }
  }

  // ── HTTP methods ──────────────────────────────────────────────────────────

  /// GET request. Throws [DioException] on failure (use [handleError] to
  /// convert it to a readable message).
  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) =>
      _dio.get(path, queryParameters: queryParameters);

  /// POST request with a JSON body.
  Future<Response<dynamic>> post(
    String path,
    Map<String, dynamic> data,
  ) =>
      _dio.post(path, data: data);

  /// PUT request — full replacement.
  Future<Response<dynamic>> put(
    String path,
    Map<String, dynamic> data,
  ) =>
      _dio.put(path, data: data);

  /// PATCH request — partial update.
  Future<Response<dynamic>> patch(
    String path,
    Map<String, dynamic> data,
  ) =>
      _dio.patch(path, data: data);

  /// DELETE request.
  Future<Response<dynamic>> delete(String path) => _dio.delete(path);

  /// Downloads a binary file (PDF, image, etc.) and returns the raw bytes.
  /// The auth token is attached automatically via the existing interceptor.
  Future<List<int>> getBytes(String path) async {
    final response = await _dio.get<List<int>>(
      path,
      options: Options(
        responseType: ResponseType.bytes,
        receiveTimeout: const Duration(seconds: 30),
      ),
    );
    return response.data ?? [];
  }

  /// PUT request with multipart [FormData] body (used for file uploads).
  /// Dio automatically sets Content-Type to multipart/form-data.
  Future<Response<dynamic>> putFormData(String path, FormData data) =>
      _dio.put(path, data: data);

  /// POST request with multipart [FormData] body (used for file uploads).
  Future<Response<dynamic>> postFormData(String path, FormData data) =>
      _dio.post(path, data: data);
}
