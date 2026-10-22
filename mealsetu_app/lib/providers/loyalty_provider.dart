import 'package:dio/dio.dart' show DioException;
import 'package:flutter/foundation.dart';

import '../services/api_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Data model
// ─────────────────────────────────────────────────────────────────────────────

class VendorLoyaltyNotice {
  const VendorLoyaltyNotice({
    required this.vendorName,
    required this.message,
    required this.canUseWallet,
  });

  final String vendorName;
  final String message;
  final bool   canUseWallet; // true = existing subscriber still protected

  factory VendorLoyaltyNotice.fromJson(Map<String, dynamic> j) =>
      VendorLoyaltyNotice(
        vendorName:   j['vendorName']  as String? ?? '',
        message:      j['message']     as String? ?? '',
        canUseWallet: j['canUseWallet'] as bool?  ?? false,
      );
}

class LoyaltyData {
  const LoyaltyData({
    required this.points,
    required this.totalEarned,
    required this.totalRedeemed,
    required this.totalSubscriptions,
    required this.walletValue,
    required this.pointsToNextRedeem,
    this.nextMilestone,
    required this.level,
    required this.transactions,
    this.vendorLoyaltyNotice,
  });

  final int points;
  final int totalEarned;
  final int totalRedeemed;
  final int totalSubscriptions;
  final int walletValue;
  final int pointsToNextRedeem;
  final Map<String, dynamic>? nextMilestone;
  final Map<String, dynamic> level;
  final List<Map<String, dynamic>> transactions;
  /// Non-null when user's current vendor has loyalty discounts turned OFF.
  final VendorLoyaltyNotice? vendorLoyaltyNotice;

  factory LoyaltyData.fromJson(Map<String, dynamic> j) => LoyaltyData(
        points:             (j['points']             as num? ?? 0).toInt(),
        totalEarned:        (j['totalEarned']        as num? ?? 0).toInt(),
        totalRedeemed:      (j['totalRedeemed']      as num? ?? 0).toInt(),
        totalSubscriptions: (j['totalSubscriptions'] as num? ?? 0).toInt(),
        walletValue:        (j['walletValue']        as num? ?? 0).toInt(),
        pointsToNextRedeem: (j['pointsToNextRedeem'] as num? ?? 100).toInt(),
        nextMilestone:      j['nextMilestone'] as Map<String, dynamic>?,
        level: (j['level'] as Map<String, dynamic>?) ??
            {'name': 'Starter', 'icon': '🌱', 'color': '#9CA3AF'},
        transactions: (j['transactions'] as List<dynamic>? ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
        vendorLoyaltyNotice: j['vendorLoyaltyNotice'] != null
            ? VendorLoyaltyNotice.fromJson(
                Map<String, dynamic>.from(j['vendorLoyaltyNotice'] as Map))
            : null,
      );
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

class LoyaltyProvider extends ChangeNotifier {
  final _api = ApiService();

  LoyaltyData? _loyaltyData;
  List<Map<String, dynamic>> _leaderboard = [];
  Map<String, dynamic>? _yourRank;  // current user's own rank (may be outside top 10)
  double _walletBalance = 0;
  bool _isLoading   = false;
  bool _isRedeeming = false;
  String? _error;

  LoyaltyData? get loyaltyData  => _loyaltyData;
  List<Map<String, dynamic>> get leaderboard => _leaderboard;
  Map<String, dynamic>? get yourRank => _yourRank;
  double  get walletBalance     => _walletBalance;
  bool    get isLoading         => _isLoading;
  bool    get isRedeeming       => _isRedeeming;
  String? get error             => _error;

  // ── Fetch loyalty points + wallet ────────────────────────────────────────
  Future<void> fetchLoyalty() async {
    _isLoading = true;
    _error = null;
    notifyListeners();
    try {
      final resp = await _api.get('/loyalty/points');
      _loyaltyData =
          LoyaltyData.fromJson(Map<String, dynamic>.from(resp.data as Map));

      // Fetch actual wallet balance from profile (non-fatal)
      try {
        final me = await _api.get('/users/me');
        _walletBalance =
            ((me.data as Map)['wallet'] as num? ?? 0).toDouble();
      } catch (_) {
        _walletBalance = _loyaltyData?.walletValue.toDouble() ?? 0;
      }
    } on DioException catch (e) {
      _error = _api.handleError(e);
    } catch (e) {
      _error = e.toString();
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // ── Redeem points ────────────────────────────────────────────────────────
  /// Returns the server response map on success, null on failure.
  Future<Map<String, dynamic>?> redeemPoints(int points) async {
    _isRedeeming = true;
    _error = null;
    notifyListeners();
    try {
      final resp = await _api.post('/loyalty/redeem', {'points': points});
      final result = Map<String, dynamic>.from(resp.data as Map);
      await fetchLoyalty(); // refresh state
      return result;
    } on DioException catch (e) {
      _error = _api.handleError(e);
      notifyListeners();
      return null;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return null;
    } finally {
      _isRedeeming = false;
      notifyListeners();
    }
  }

  // ── Leaderboard ───────────────────────────────────────────────────────────
  Future<void> fetchLeaderboard() async {
    try {
      final resp = await _api.get('/loyalty/leaderboard');
      final body = resp.data as Map;
      _leaderboard = (body['leaderboard'] as List<dynamic>? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();
      _yourRank = body['yourRank'] != null
          ? Map<String, dynamic>.from(body['yourRank'] as Map)
          : null;
      notifyListeners();
    } on DioException catch (e) {
      debugPrint('Leaderboard: ${_api.handleError(e)}');
    } catch (e) {
      debugPrint('Leaderboard: $e');
    }
  }
}
