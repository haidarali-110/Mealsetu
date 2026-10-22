import 'package:flutter/foundation.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import 'api_service.dart';

/// Singleton Socket.IO wrapper.
class SocketService {
  // ── Singleton ──────────────────────────────────────────────────────────────
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;
  SocketService._internal();

  io.Socket? _socket;
  String?    _userId;
  String?    _role;

  bool get isConnected => _socket?.connected ?? false;

  // ── Connect ────────────────────────────────────────────────────────────────

  void connect(String userId, String role) {
    _userId = userId;
    _role   = role;

    final apiBase = ApiService().baseUrl;
    final wsUrl   = apiBase.replaceFirst(RegExp(r'/api$'), '');

    _socket = io.io(
      wsUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .disableAutoConnect()
          .enableReconnection()
          .setReconnectionAttempts(10)
          .setReconnectionDelay(1000)
          .build(),
    );

    _socket!.onConnect((_) {
      debugPrint('Socket connected');
      _joinRooms();
    });

    _socket!.onReconnect((_) {
      debugPrint('Socket reconnected');
      _joinRooms();
    });

    _socket!.onDisconnect((_) => debugPrint('Socket disconnected'));
    _socket!.onError((e)      => debugPrint('Socket error: $e'));

    _socket!.connect();
  }

  void _joinRooms() {
    if (_userId == null) return;
    _socket!.emit('join', _userId);
    if (_role == 'delivery') {
      _socket!.emit('joinDelivery', _userId);
    }
  }

  // ── Delivery partner events ────────────────────────────────────────────────

  /// Listen for new batch assigned to this rider (new system).
  void onNewBatchAssigned(void Function(dynamic) callback) {
    _socket?.on('new_batch_assigned', callback);
  }

  /// Listen for salary payment confirmation from vendor.
  void onSalaryPaid(void Function(dynamic) callback) {
    _socket?.on('salary_paid', callback);
  }

  /// Legacy: individual delivery order assigned.
  void onNewDeliveryAssigned(void Function(dynamic) callback) {
    _socket?.on('new_delivery_assigned', callback);
  }

  /// Join a batch-level tracking room so the vendor/customer can see progress.
  void joinBatchTracking(String batchId) {
    _socket?.emit('joinBatchTracking', batchId);
  }

  // ── Customer tracking events ───────────────────────────────────────────────

  void joinTracking(String orderId) {
    _socket?.emit('joinTracking', orderId);
  }

  void leaveTracking(String orderId) {
    _socket?.emit('leaveTracking', orderId);
  }

  void onDeliveryStatusChanged(void Function(dynamic) callback) {
    _socket?.on('delivery_status_changed', callback);
  }

  /// Called when the rider broadcasts a location update.
  void onLocationUpdate(void Function(dynamic) callback) {
    _socket?.on('location_update', callback);
  }

  void offLocationUpdate() {
    _socket?.off('location_update');
  }

  void onDeliveryStatusUpdate(void Function(dynamic) callback) {
    _socket?.on('delivery_status_update', callback);
  }

  void offDeliveryStatusUpdate() {
    _socket?.off('delivery_status_update');
  }

  // ── Generic ────────────────────────────────────────────────────────────────

  void off(String event) {
    _socket?.off(event);
  }

  // ── Disconnect ─────────────────────────────────────────────────────────────

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
    _socket = null;
    _userId = null;
    _role   = null;
  }
}
