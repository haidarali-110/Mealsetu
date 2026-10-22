import 'dart:async';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:geolocator/geolocator.dart';

import '../services/api_service.dart';

class DeliveryProvider extends ChangeNotifier {
  final _api = ApiService();

  // ── Batches ───────────────────────────────────────────────────────────────
  List<Map<String, dynamic>> _batches = [];
  bool _isLoading = false;
  String? _activeMealSlot = 'lunch';

  List<Map<String, dynamic>> get batches   => _batches;
  bool                        get isLoading => _isLoading;

  // ── Stats ─────────────────────────────────────────────────────────────────
  Map<String, dynamic>? _riderStats;
  Map<String, dynamic>? get riderStats => _riderStats;

  // ── Location sharing ───────────────────────────────────────────────────────
  bool    _isLocationSharing = false;
  Timer?  _locationTimer;
  String? _activeBatchId;

  bool    get isLocationSharing => _isLocationSharing;
  String? get activeBatchId     => _activeBatchId;

  // ── Computed getters ───────────────────────────────────────────────────────

  int get totalBatches => _batches.length;

  int get completedBatches =>
      _batches.where((b) => b['batchStatus'] == 'completed').length;

  int get pendingBatches =>
      _batches.where((b) => b['batchStatus'] != 'completed').length;

  int get totalOrdersToday => _batches.fold(
        0,
        (sum, b) => sum + (((b['orders'] as List?)?.length) ?? 0),
      );

  int get deliveredOrdersToday => _batches.fold(
        0,
        (sum, b) =>
            sum +
            (((b['orders'] as List?)
                    ?.where((o) => o['status'] == 'delivered')
                    .length) ??
                0),
      );

  // ── Fetch batches ──────────────────────────────────────────────────────────

  Future<void> fetchBatches({String mealSlot = 'lunch'}) async {
    _isLoading = true;
    _activeMealSlot = mealSlot;
    notifyListeners();
    try {
      final today   = DateTime.now();
      final dateStr =
          '${today.year}-${today.month.toString().padLeft(2, '0')}'
          '-${today.day.toString().padLeft(2, '0')}';
      final res = await _api
          .get('/delivery/batches?date=$dateStr&mealSlot=$mealSlot');
      final raw = res.data;
      _batches = List<Map<String, dynamic>>.from(
        raw is List ? raw.map((e) => Map<String, dynamic>.from(e as Map)) : [],
      );
    } catch (e) {
      debugPrint('DeliveryProvider.fetchBatches: $e');
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  // ── Accept batch ───────────────────────────────────────────────────────────

  Future<void> acceptBatch(String batchId) async {
    try {
      await _api.patch('/delivery/batches/$batchId/accept', {});
      _activeBatchId = batchId;
      await fetchBatches(mealSlot: _activeMealSlot ?? 'lunch');
    } catch (e) {
      debugPrint('DeliveryProvider.acceptBatch: $e');
      rethrow;
    }
  }

  // ── Update order status ────────────────────────────────────────────────────

  Future<void> updateOrderStatus(
    String orderId,
    String status,
    String batchId, {
    double? gpsLat,
    double? gpsLng,
    double? latitude,
    double? longitude,
    double? accuracy,
    bool? cashCollected,
    double? cashAmount,
    bool? isMocked,
    String? proofPhotoUrl,
    String? failReason,
  }) async {
    try {
      final body = <String, dynamic>{'status': status, 'batchId': batchId};
      if (latitude != null || gpsLat != null) {
        body['latitude'] = latitude ?? gpsLat;
      }
      if (longitude != null || gpsLng != null) {
        body['longitude'] = longitude ?? gpsLng;
      }
      if (accuracy != null)       body['accuracy']      = accuracy;
      if (cashCollected != null)  body['cashCollected'] = cashCollected;
      if (cashAmount != null)     body['cashAmount']    = cashAmount;
      if (isMocked != null)       body['isMocked']      = isMocked;
      if (proofPhotoUrl != null)  body['proofPhotoUrl'] = proofPhotoUrl;
      if (failReason != null)     body['failReason']    = failReason;

      await _api.patch('/delivery/orders/$orderId/status', body);
      // Update locally for instant feedback
      for (final batch in _batches) {
        if (batch['_id']?.toString() == batchId) {
          final orders = batch['orders'] as List? ?? [];
          for (final order in orders) {
            if ((order as Map)['orderId']?.toString() == orderId) {
              order['status'] = status;
            }
          }
        }
      }
      notifyListeners();
    } catch (e) {
      debugPrint('DeliveryProvider.updateOrderStatus: $e');
      rethrow;
    }
  }

  // ── Upload delivery proof photo ────────────────────────────────────────────

  Future<String?> uploadDeliveryPhoto(File photoFile) async {
    try {
      final formData = FormData.fromMap({
        'photo': await MultipartFile.fromFile(
          photoFile.path,
          filename: 'delivery-proof.jpg',
        ),
      });
      final res = await _api.postFormData('/delivery/delivery-photo', formData);
      return (res.data as Map?)?['photoUrl'] as String?;
    } catch (e) {
      debugPrint('DeliveryProvider.uploadDeliveryPhoto: $e');
      return null;
    }
  }

  // ── Fetch stats ────────────────────────────────────────────────────────────

  Future<void> fetchStats() async {
    try {
      final res = await _api.get('/delivery/stats');
      _riderStats = Map<String, dynamic>.from(res.data as Map? ?? {});
      notifyListeners();
    } catch (e) {
      debugPrint('DeliveryProvider.fetchStats: $e');
    }
  }

  // ── Location sharing ───────────────────────────────────────────────────────

  Future<bool> startLocationSharing(String batchId) async {
    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied ||
        perm == LocationPermission.deniedForever) {
      return false;
    }

    _activeBatchId      = batchId;
    _isLocationSharing  = true;
    notifyListeners();

    // Immediate first ping
    await _sendLocation(batchId);

    _locationTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _sendLocation(batchId),
    );
    return true;
  }

  void stopLocationSharing() {
    _locationTimer?.cancel();
    _locationTimer      = null;
    _isLocationSharing  = false;
    _activeBatchId      = null;
    notifyListeners();
  }

  // Threshold in metres — rider within this distance triggers auto "near_you"
  static const double _nearYouMetres = 400;

  Future<void> _sendLocation(String batchId) async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      await _api.post('/delivery/location', {
        'latitude':  pos.latitude,
        'longitude': pos.longitude,
        'batchId':   batchId,
      });

      // Auto-trigger "near_you" when rider is within threshold of delivery address
      for (final batch in _batches) {
        if (batch['_id']?.toString() != batchId) continue;
        final orders = batch['orders'] as List? ?? [];
        for (final o in orders) {
          final order = o as Map<String, dynamic>;
          if (order['status'] != 'on_the_way') continue;
          final addr = order['address'] as Map<String, dynamic>?;
          final destLat = (addr?['latitude']  as num?)?.toDouble();
          final destLng = (addr?['longitude'] as num?)?.toDouble();
          if (destLat == null || destLng == null) continue;
          final dist = Geolocator.distanceBetween(
              pos.latitude, pos.longitude, destLat, destLng);
          if (dist <= _nearYouMetres) {
            final orderId = order['orderId']?.toString() ?? '';
            if (orderId.isNotEmpty) {
              await updateOrderStatus(orderId, 'near_you', batchId);
              debugPrint('Auto near_you triggered for $orderId (${dist.toStringAsFixed(0)}m)');
            }
          }
        }
      }
    } catch (e) {
      debugPrint('DeliveryProvider._sendLocation: $e');
    }
  }

  // ── Socket helper: add newly assigned batch ────────────────────────────────

  void addAssignedBatch(Map<String, dynamic> batch) {
    final exists = _batches.any((b) => b['_id'] == batch['_id']);
    if (!exists) {
      _batches.insert(0, batch);
      notifyListeners();
    }
  }

  @override
  void dispose() {
    _locationTimer?.cancel();
    super.dispose();
  }
}
