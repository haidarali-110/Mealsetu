import 'dart:async';

import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../services/api_service.dart';
import '../../services/socket_service.dart';

const _kOrange = Color(0xFFF26522);

class OrderTrackingScreen extends StatefulWidget {
  final String orderId;
  const OrderTrackingScreen({super.key, required this.orderId});

  @override
  State<OrderTrackingScreen> createState() =>
      _OrderTrackingScreenState();
}

class _OrderTrackingScreenState
    extends State<OrderTrackingScreen> {
  GoogleMapController? _mapController;
  final ApiService     _api = ApiService();

  String  _deliveryStatus       = 'pending';
  String  _statusMessage        = 'Preparing your meal...';
  double? _riderLat;
  double? _riderLng;
  double? _customerLat;
  double? _customerLng;
  Map<String, dynamic>? _riderInfo;
  int     _stopsAhead           = 0;
  bool    _isLoading            = true;
  String? _error;
  bool    _ratingSubmitted      = false;
  bool    _deliveredDialogShown = false;

  Timer? _pollTimer;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _fetchTrackingData();
    _setupSocketListeners();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 5),
      (_) => _fetchTrackingData(),
    );
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    SocketService().leaveTracking(widget.orderId);
    SocketService().offLocationUpdate();
    SocketService().offDeliveryStatusUpdate();
    super.dispose();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  void _animateTo(double lat, double lng, double zoom) {
    _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(LatLng(lat, lng), zoom),
    );
  }

  Future<void> _fetchTrackingData() async {
    try {
      final res  = await _api.get(
          '/users/track-order/${widget.orderId}');
      final data = res.data as Map<String, dynamic>? ?? {};

      _deliveryStatus = data['deliveryStatus'] as String? ??
          _deliveryStatus;
      _riderInfo  = data['deliveryPartner'] as Map<String, dynamic>?;
      _stopsAhead = (data['stopsAhead'] as num?)?.toInt() ?? 0;

      final riderLoc =
          _riderInfo?['currentLocation'] as Map<String, dynamic>?;
      final newLat = (riderLoc?['latitude'] as num?)?.toDouble();
      final newLng = (riderLoc?['longitude'] as num?)?.toDouble();

      if (!mounted) return;
      setState(() {
        _isLoading = false;
        _error     = null;
        if (newLat != null && newLng != null) {
          _riderLat = newLat;
          _riderLng = newLng;
        }
        if (_customerLat == null) {
          final cLat = (data['customerLat'] as num?)?.toDouble();
          final cLng = (data['customerLng'] as num?)?.toDouble();
          if (cLat != null && cLng != null) {
            _customerLat = cLat;
            _customerLng = cLng;
          }
        }
      });

      if (_riderLat != null) {
        _animateTo(_riderLat!, _riderLng!, 15.0);
      }

      if (_deliveryStatus == 'delivered' && !_deliveredDialogShown) {
        _deliveredDialogShown = true;
        _showDeliveredDialog();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = _error ?? 'Could not load tracking data';
        });
      }
    }
  }

  void _setupSocketListeners() {
    SocketService().joinTracking(widget.orderId);

    SocketService().onLocationUpdate((data) {
      if (!mounted) return;
      final d = data as Map<String, dynamic>? ?? {};
      final lat = (d['latitude']  as num?)?.toDouble();
      final lng = (d['longitude'] as num?)?.toDouble();
      if (lat == null || lng == null) return;
      setState(() {
        _riderLat = lat;
        _riderLng = lng;
      });
      _animateTo(lat, lng, 15.0);
    });

    SocketService().onDeliveryStatusUpdate((data) {
      if (!mounted) return;
      final d = data as Map<String, dynamic>? ?? {};
      if (d['orderId']?.toString() != widget.orderId) return;
      setState(() {
        _deliveryStatus =
            d['status'] as String? ?? _deliveryStatus;
        _statusMessage =
            d['message'] as String? ?? _statusMessage;
      });
      if (_deliveryStatus == 'delivered' && !_deliveredDialogShown) {
        _deliveredDialogShown = true;
        _showDeliveredDialog();
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  bool _isDone(String step) {
    const order = [
      'pending',
      'picked_up',
      'on_the_way',
      'delivered'
    ];
    final current = order.indexOf(_deliveryStatus);
    final target  = order.indexOf(step);
    return current >= 0 && target >= 0 && current >= target;
  }

  void _showDeliveredDialog() {
    if (!mounted) return;
    showDialog(
      context:             context,
      barrierDismissible:  false,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🎉',
                style: TextStyle(fontSize: 52),
                textAlign: TextAlign.center),
            const SizedBox(height: 12),
            const Text('Delivered!',
                style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            const Text('Enjoy your meal! 😋',
                style: TextStyle(color: Colors.grey),
                textAlign: TextAlign.center),
          ],
        ),
        actionsAlignment: MainAxisAlignment.center,
        actions: [
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                if (mounted) _showRatingSheet();
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: _kOrange,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(10)),
                elevation: 0,
              ),
              child: const Text('Rate Your Experience',
                  style: TextStyle(
                      fontWeight: FontWeight.w600)),
            ),
          ),
          TextButton(
            onPressed: () {
              Navigator.of(ctx).pop();
              if (mounted) Navigator.of(context).pop();
            },
            child: const Text('Skip',
                style: TextStyle(color: Colors.grey)),
          ),
        ],
      ),
    );
  }

  void _showRatingSheet() {
    if (_ratingSubmitted || !mounted) return;
    int stars = 0;
    final commentCtrl = TextEditingController();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(24))),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => Padding(
          padding: EdgeInsets.only(
            left: 24, right: 24, top: 24,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 32,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                    color: Colors.grey.shade300,
                    borderRadius: BorderRadius.circular(2)),
              ),
              const SizedBox(height: 18),
              const Text('Rate Your Rider',
                  style: TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800)),
              const SizedBox(height: 6),
              Text(
                _riderInfo?['name'] != null
                    ? 'How was ${_riderInfo!['name']}?'
                    : 'How was your delivery?',
                style: const TextStyle(color: Colors.grey),
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(
                  5,
                  (i) => GestureDetector(
                    onTap: () => setS(() => stars = i + 1),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      child: Icon(
                        i < stars
                            ? Icons.star_rounded
                            : Icons.star_outline_rounded,
                        color: _kOrange,
                        size: 44,
                      ),
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: commentCtrl,
                decoration: InputDecoration(
                  hintText: 'Any comments? (optional)',
                  border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12)),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(12),
                    borderSide: const BorderSide(color: _kOrange),
                  ),
                  contentPadding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 12),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 48,
                child: ElevatedButton(
                  onPressed: stars == 0
                      ? null
                      : () async {
                          Navigator.pop(ctx);
                          await _submitRating(stars, commentCtrl.text);
                          commentCtrl.dispose();
                        },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _kOrange,
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: Colors.grey.shade200,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: const Text('Submit Rating',
                      style: TextStyle(
                          fontWeight: FontWeight.w700, fontSize: 16)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _submitRating(int stars, String comment) async {
    final riderId = _riderInfo?['_id']?.toString() ??
        _riderInfo?['id']?.toString();
    if (riderId == null) return;
    try {
      await _api.post('/delivery/rate-rider', {
        'orderId': widget.orderId,
        'riderId': riderId,
        'rating':  stars,
        if (comment.trim().isNotEmpty) 'comment': comment.trim(),
      });
      if (mounted) {
        setState(() => _ratingSubmitted = true);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Thanks for rating! ⭐ $stars/5'),
            backgroundColor: _kOrange,
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
          ),
        );
        Navigator.of(context).pop();
      }
    } catch (_) {
      // Non-critical — rating failure is silent
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final riderPhone =
        _riderInfo?['phone'] as String?;

    return Scaffold(
      backgroundColor: Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.white,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new,
              color: Colors.black87, size: 20),
          onPressed: () => Navigator.pop(context),
        ),
        title: const Text('Track Delivery',
            style: TextStyle(
                color: Colors.black87,
                fontWeight: FontWeight.w700,
                fontSize: 18)),
        actions: [
          if (riderPhone != null)
            IconButton(
              icon: const Icon(Icons.call_outlined,
                  color: _kOrange),
              onPressed: () => launchUrl(
                  Uri.parse('tel:$riderPhone')),
              tooltip: 'Call Rider',
            ),
          IconButton(
            icon: const Icon(Icons.refresh_rounded,
                color: _kOrange),
            onPressed: _fetchTrackingData,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(
                  color: _kOrange, strokeWidth: 2.5))
          : _error != null
              ? _buildError()
              : Column(
                  children: [
                    Expanded(
                      flex: 55,
                      child: _buildMap(),
                    ),
                    Expanded(
                      flex: 45,
                      child: _buildStatusPanel(),
                    ),
                  ],
                ),
    );
  }

  Widget _buildError() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.location_off_rounded,
                size: 56, color: Colors.grey),
            const SizedBox(height: 16),
            Text(_error!,
                textAlign: TextAlign.center,
                style:
                    const TextStyle(color: Colors.grey)),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  _isLoading = true;
                  _error     = null;
                });
                _fetchTrackingData();
              },
              style: ElevatedButton.styleFrom(
                  backgroundColor: _kOrange,
                  foregroundColor: Colors.white),
              child: const Text('Retry'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildMap() {
    final Set<Marker> markers = {};
    final Set<Polyline> polylines = {};

    if (_riderLat != null && _riderLng != null) {
      markers.add(Marker(
        markerId: const MarkerId('rider'),
        position: LatLng(_riderLat!, _riderLng!),
        icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueOrange),
        infoWindow: InfoWindow(
          title: '🛵 ${_riderInfo?['name'] ?? 'Rider'}',
          snippet: 'Your delivery rider',
        ),
      ));
    }

    if (_customerLat != null && _customerLng != null) {
      markers.add(Marker(
        markerId: const MarkerId('customer'),
        position: LatLng(_customerLat!, _customerLng!),
        icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueAzure),
        infoWindow: const InfoWindow(
          title: '🏠 Delivery Location',
        ),
      ));
    }

    if (_riderLat != null && _customerLat != null) {
      polylines.add(Polyline(
        polylineId: const PolylineId('route'),
        points: [
          LatLng(_riderLat!, _riderLng!),
          LatLng(_customerLat!, _customerLng!),
        ],
        color: _kOrange.withValues(alpha: 0.5),
        width: 3,
      ));
    }

    return Stack(
      children: [
        GoogleMap(
          onMapCreated: (ctrl) => _mapController = ctrl,
          initialCameraPosition: CameraPosition(
            target: _riderLat != null
                ? LatLng(_riderLat!, _riderLng!)
                : const LatLng(23.0225, 72.5714),
            zoom: 15.0,
          ),
          markers:               markers,
          polylines:             polylines,
          myLocationButtonEnabled: false,
          zoomControlsEnabled:   false,
          mapToolbarEnabled:     false,
        ),

        // Waiting for location overlay
        if (_riderLat == null)
          Positioned(
            top: 16, left: 16, right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                color: Colors.white
                    .withValues(alpha: 0.95),
                borderRadius:
                    BorderRadius.circular(10),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black
                          .withValues(alpha: 0.08),
                      blurRadius: 8)
                ],
              ),
              child: const Row(
                children: [
                  SizedBox(
                    width: 16, height: 16,
                    child: CircularProgressIndicator(
                        color: _kOrange,
                        strokeWidth: 2),
                  ),
                  SizedBox(width: 10),
                  Text('Waiting for rider location...',
                      style: TextStyle(
                          fontSize: 13,
                          color: Colors.grey)),
                ],
              ),
            ),
          ),

        // Stops ahead badge
        if (_stopsAhead > 0)
          Positioned(
            top: 16, right: 16,
            child: Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius:
                    BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                      color: Colors.black
                          .withValues(alpha: 0.1),
                      blurRadius: 8),
                ],
              ),
              child: Text(
                '$_stopsAhead stop'
                '${_stopsAhead > 1 ? 's' : ''}'
                ' before you',
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: _kOrange),
              ),
            ),
          ),
      ],
    );
  }

  Widget _buildStatusPanel() {
    return Container(
      color: Colors.white,
      padding:
          const EdgeInsets.fromLTRB(20, 16, 20, 12),
      child: Column(
        children: [
          // 4-step progress
          Row(
            mainAxisAlignment:
                MainAxisAlignment.spaceBetween,
            children: [
              _Step('📦', 'Picked\nUp',
                  _isDone('picked_up')),
              _StepLine(_isDone('picked_up')),
              _Step('🛵', 'On\nWay',
                  _isDone('on_the_way')),
              _StepLine(_isDone('on_the_way')),
              _Step('🏠', 'Near\nYou',
                  _isDone('on_the_way')),
              _StepLine(_isDone('delivered')),
              _Step('✅', 'Delivered',
                  _isDone('delivered')),
            ],
          ),
          const SizedBox(height: 14),

          // Status message
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(
                vertical: 12, horizontal: 14),
            decoration: BoxDecoration(
              color: _kOrange.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(10),
              border: Border.all(
                  color:
                      _kOrange.withValues(alpha: 0.25)),
            ),
            child: Text(
              _statusMessage,
              textAlign: TextAlign.center,
              style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: _kOrange),
            ),
          ),
          const SizedBox(height: 12),

          // Rider card
          if (_riderInfo != null)
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 14, vertical: 12),
              decoration: BoxDecoration(
                color: Colors.grey.shade50,
                borderRadius:
                    BorderRadius.circular(12),
              ),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 22,
                    backgroundColor:
                        _kOrange.withValues(alpha: 0.15),
                    child: Text(
                      ((_riderInfo!['name']
                                  as String?) ??
                              'R')
                          .substring(0, 1)
                          .toUpperCase(),
                      style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w700,
                          color: _kOrange),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Text(
                          _riderInfo!['name']
                                  as String? ??
                              'Delivery Rider',
                          style: const TextStyle(
                              fontSize: 14,
                              fontWeight:
                                  FontWeight.w700),
                        ),
                        const Text(
                            '🛵 Your delivery rider',
                            style: TextStyle(
                                fontSize: 12,
                                color: Colors.grey)),
                      ],
                    ),
                  ),
                  if (_riderInfo!['phone'] != null)
                    GestureDetector(
                      onTap: () => launchUrl(
                        Uri.parse(
                            'tel:${_riderInfo!["phone"]}'),
                      ),
                      child: Container(
                        width: 38, height: 38,
                        decoration: BoxDecoration(
                          color: _kOrange
                              .withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.call,
                            color: _kOrange, size: 18),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── Step widget ───────────────────────────────────────────────────────────────

class _Step extends StatelessWidget {
  const _Step(this.emoji, this.label, this.isDone);
  final String emoji;
  final String label;
  final bool   isDone;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 36, height: 36,
          decoration: BoxDecoration(
            color: isDone
                ? _kOrange
                : Colors.grey.shade200,
            shape: BoxShape.circle,
          ),
          child: Center(
            child:
                Text(emoji, style: const TextStyle(fontSize: 14)),
          ),
        ),
        const SizedBox(height: 4),
        Text(label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 9,
              fontWeight: isDone
                  ? FontWeight.w700
                  : FontWeight.w400,
              color: isDone ? _kOrange : Colors.grey,
            )),
      ],
    );
  }
}

class _StepLine extends StatelessWidget {
  const _StepLine(this.isDone);
  final bool isDone;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        height: 2.5,
        color: isDone ? _kOrange : Colors.grey.shade300,
      ),
    );
  }
}
