import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart';
import 'package:provider/provider.dart';

import '../../providers/delivery_provider.dart';

const _kOrange = Color(0xFFF26522);
const _kGreen  = Color(0xFF16A34A);
const _kBlue   = Color(0xFF2563EB);
const _kRed    = Color(0xFFDC2626);

const _kBatchHues = <double>[
  BitmapDescriptor.hueOrange,
  BitmapDescriptor.hueViolet,
  BitmapDescriptor.hueGreen,
  BitmapDescriptor.hueRed,
];

const _kBatchColors = [
  _kOrange,
  Color(0xFF8B5CF6),
  _kGreen,
  _kRed,
];

const _googleApiKey = 'AIzaSyCgJ0v4LEJaPxZUQR20A56GpBeFa8cf3LQ';

class DeliveryMapScreen extends StatefulWidget {
  const DeliveryMapScreen({super.key});

  @override
  State<DeliveryMapScreen> createState() => _DeliveryMapScreenState();
}

class _DeliveryMapScreenState extends State<DeliveryMapScreen> {
  GoogleMapController? _mapController;
  final _dio = Dio();

  LatLng? _currentPosition;
  bool    _locationSharingEnabled = false;
  String  _currentMealSlot        = 'lunch';
  bool    _showRoute              = true;
  bool    _fetchingRoutes         = false;

  // batchId → decoded road-following polyline points
  final Map<String, List<LatLng>> _routePoints = {};
  // Last position we fetched routes for (to avoid re-fetching on tiny moves)
  LatLng? _lastRouteFetchPos;

  @override
  void initState() {
    super.initState();
    final hour = DateTime.now().hour;
    _currentMealSlot = hour >= 15 ? 'dinner' : 'lunch';
    _requestPermission();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _getCurrentLocation();
    });
  }

  Future<void> _requestPermission() async {
    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      await Geolocator.requestPermission();
    }
  }

  Future<void> _getCurrentLocation() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return;
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.denied ||
          perm == LocationPermission.deniedForever) {
        return;
      }

      final pos = await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.high);

      if (!mounted) return;
      setState(() => _currentPosition = LatLng(pos.latitude, pos.longitude));
      _mapController?.animateCamera(
        CameraUpdate.newLatLngZoom(_currentPosition!, 14.0),
      );

      // Fetch road-following routes after location is obtained
      if (mounted) {
        final provider = context.read<DeliveryProvider>();
        _fetchRoadRoutes(provider.batches);
      }
    } catch (e) {
      debugPrint('DeliveryMapScreen location error: $e');
    }
  }

  // ── Google Directions API ─────────────────────────────────────────────────

  /// Decode Google's encoded polyline format into LatLng list.
  static List<LatLng> _decodePolyline(String encoded) {
    final points = <LatLng>[];
    int index = 0, lat = 0, lng = 0;
    while (index < encoded.length) {
      int shift = 0, result = 0, b;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1F) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      shift = 0;
      result = 0;
      do {
        b = encoded.codeUnitAt(index++) - 63;
        result |= (b & 0x1F) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += (result & 1) != 0 ? ~(result >> 1) : (result >> 1);
      points.add(LatLng(lat / 1e5, lng / 1e5));
    }
    return points;
  }

  Future<void> _fetchRoadRoutes(List<dynamic> batches) async {
    final origin = _currentPosition;
    if (origin == null || _fetchingRoutes) return;

    // Skip if we already fetched from very close to this position (< 300 m)
    if (_lastRouteFetchPos != null) {
      final dist = Geolocator.distanceBetween(
        _lastRouteFetchPos!.latitude, _lastRouteFetchPos!.longitude,
        origin.latitude, origin.longitude,
      );
      if (dist < 300) return;
    }

    if (mounted) setState(() => _fetchingRoutes = true);
    _lastRouteFetchPos = origin;

    final newRoutes = <String, List<LatLng>>{};

    for (final batch in batches) {
      if (batch['batchStatus'] == 'completed') continue;
      final batchId = batch['_id']?.toString() ?? '';
      final orders  = (batch['orders'] as List? ?? []).cast<Map<String, dynamic>>();

      final sorted = [...orders]
        ..sort((a, b) => (a['sequence'] as int? ?? 0)
            .compareTo(b['sequence'] as int? ?? 0));

      // Collect undelivered stops in sequence order
      final stops = <LatLng>[];
      for (final o in sorted) {
        if (o['status'] == 'delivered') continue;
        final addr = o['address'];
        if (addr is! Map) continue;
        final lat = (addr['latitude']  as num?)?.toDouble();
        final lng = (addr['longitude'] as num?)?.toDouble();
        if (lat != null && lng != null) stops.add(LatLng(lat, lng));
      }

      if (stops.isEmpty) continue;

      try {
        final dest = stops.last;
        final buf  = StringBuffer(
          'https://maps.googleapis.com/maps/api/directions/json'
          '?origin=${origin.latitude},${origin.longitude}'
          '&destination=${dest.latitude},${dest.longitude}'
          '&key=$_googleApiKey',
        );

        // Add intermediate waypoints if more than one stop
        if (stops.length > 1) {
          final waypts = stops
              .sublist(0, stops.length - 1)
              .map((p) => '${p.latitude},${p.longitude}')
              .join('|');
          buf.write('&waypoints=optimize:false|$waypts');
        }

        final res  = await _dio.get<Map<String, dynamic>>(buf.toString());
        final data = res.data;
        final routes = data?['routes'] as List?;
        if (routes != null && routes.isNotEmpty) {
          final encoded = routes[0]['overview_polyline']?['points'] as String?;
          if (encoded != null && encoded.isNotEmpty) {
            newRoutes[batchId] = _decodePolyline(encoded);
          }
        }
      } catch (_) {
        // Directions API unavailable – will fall back to straight lines
      }
    }

    if (mounted) {
      setState(() {
        _routePoints
          ..clear()
          ..addAll(newRoutes);
        _fetchingRoutes = false;
      });
    }
  }

  // ── GPS sharing ───────────────────────────────────────────────────────────

  Future<void> _startSharing(DeliveryProvider provider) async {
    final active = provider.batches.firstWhere(
      (b) => b['batchStatus'] == 'in_progress',
      orElse: () => <String, dynamic>{},
    );
    if (active.isEmpty) {
      setState(() => _locationSharingEnabled = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:  Text('Accept a batch first to share location'),
          behavior: SnackBarBehavior.floating,
        ));
      }
      return;
    }
    final started =
        await provider.startLocationSharing(active['_id']?.toString() ?? '');
    if (!started && mounted) {
      setState(() => _locationSharingEnabled = false);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:  Text('Location permission required'),
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  // ── Active batch ──────────────────────────────────────────────────────────

  Map<String, dynamic>? get _activeBatch {
    try {
      return context
          .read<DeliveryProvider>()
          .batches
          .firstWhere((b) => b['batchStatus'] == 'in_progress');
    } catch (_) {
      return null;
    }
  }

  // ── Markers ───────────────────────────────────────────────────────────────

  Set<Marker> _buildAllMarkers(DeliveryProvider provider) {
    final markers = <Marker>{};

    if (_currentPosition != null) {
      markers.add(Marker(
        markerId: const MarkerId('_me'),
        position: _currentPosition!,
        icon: BitmapDescriptor.defaultMarkerWithHue(
            BitmapDescriptor.hueAzure),
        infoWindow: const InfoWindow(title: '🛵 You'),
        zIndexInt: 10,
      ));
    }

    int colorIdx = 0;
    for (final batch in provider.batches) {
      if (batch['batchStatus'] == 'completed') { colorIdx++; continue; }
      final hue    = _kBatchHues[colorIdx % _kBatchHues.length];
      final orders = (batch['orders'] as List? ?? []).cast<Map<String, dynamic>>();
      colorIdx++;

      for (int i = 0; i < orders.length; i++) {
        final order     = orders[i];
        final addr      = order['address'];
        if (addr is! Map) continue;
        final lat       = (addr['latitude']  as num?)?.toDouble();
        final lng       = (addr['longitude'] as num?)?.toDouble();
        if (lat == null || lng == null) continue;

        final seq       = order['sequence'] as int? ?? (i + 1);
        final name      = order['customerName'] as String? ?? '?';
        final status    = order['status'] as String? ?? 'pending';
        final delivered = status == 'delivered';
        final markerId  = order['_id']?.toString() ?? 'stop_${colorIdx}_$i';

        markers.add(Marker(
          markerId: MarkerId(markerId),
          position: LatLng(lat, lng),
          icon: BitmapDescriptor.defaultMarkerWithHue(
              delivered ? BitmapDescriptor.hueYellow : hue),
          infoWindow: InfoWindow(
            title: delivered ? '✅ $name' : '#$seq · $name',
            snippet: delivered ? 'Delivered' : 'Stop $seq',
          ),
        ));
      }
    }
    return markers;
  }

  // ── Polylines (road-following when available) ─────────────────────────────

  Set<Polyline> _buildRoutePolylines(DeliveryProvider provider) {
    if (!_showRoute) return {};
    final polylines = <Polyline>{};
    int colorIdx = 0;

    for (final batch in provider.batches) {
      if (batch['batchStatus'] == 'completed') { colorIdx++; continue; }
      final color   = _kBatchColors[colorIdx % _kBatchColors.length];
      final batchId = batch['_id']?.toString() ?? '';
      final orders  = (batch['orders'] as List? ?? []).cast<Map<String, dynamic>>();
      colorIdx++;

      List<LatLng> points;

      // Use road-following route if fetched; otherwise fall back to straight line
      if (_routePoints.containsKey(batchId)) {
        points = _routePoints[batchId]!;
      } else {
        // Straight-line fallback
        final sorted = [...orders]
          ..sort((a, b) => (a['sequence'] as int? ?? 0)
              .compareTo(b['sequence'] as int? ?? 0));
        points = <LatLng>[];
        if (_currentPosition != null) points.add(_currentPosition!);
        for (final order in sorted) {
          if (order['status'] == 'delivered') continue;
          final addr = order['address'];
          if (addr is! Map) continue;
          final lat = (addr['latitude']  as num?)?.toDouble();
          final lng = (addr['longitude'] as num?)?.toDouble();
          if (lat != null && lng != null) points.add(LatLng(lat, lng));
        }
      }

      if (points.length >= 2) {
        polylines.add(Polyline(
          polylineId: PolylineId('route_$batchId'),
          points:     points,
          color:      color.withValues(alpha: 0.75),
          width:      4,
          jointType:  JointType.round,
          startCap:   Cap.roundCap,
          endCap:     Cap.roundCap,
        ));
      }
    }
    return polylines;
  }

  // ── Active batch bottom panel ─────────────────────────────────────────────

  Widget _buildActiveBatchPanel(DeliveryProvider provider) {
    final batch = _activeBatch;

    if (batch == null) {
      return Card(
        elevation: 6,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Share Live Location',
                        style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 2),
                    Text(
                      provider.isLocationSharing
                          ? '📍 Broadcasting every 5s'
                          : 'Enable while delivering',
                      style: TextStyle(
                          fontSize: 12,
                          color: provider.isLocationSharing
                              ? _kGreen
                              : Colors.grey),
                    ),
                  ],
                ),
              ),
              Switch(
                value: _locationSharingEnabled || provider.isLocationSharing,
                activeThumbColor: _kOrange,
                onChanged: (val) {
                  setState(() => _locationSharingEnabled = val);
                  if (val) {
                    _startSharing(provider);
                  } else {
                    provider.stopLocationSharing();
                  }
                },
              ),
            ],
          ),
        ),
      );
    }

    final orders      = (batch['orders'] as List? ?? []).cast<Map<String, dynamic>>();
    final totalStops  = orders.length;
    final doneStops   = orders.where((o) => o['status'] == 'delivered').length;
    final area        = batch['area'] as String? ?? '';
    final deadlineRaw = batch['deliveryDeadline'];

    DateTime? deadline;
    try { deadline = DateTime.parse(deadlineRaw.toString()).toLocal(); } catch (_) {}

    String deadlineStr = '--:--';
    if (deadline != null) {
      final h   = deadline.hour % 12 == 0 ? 12 : deadline.hour % 12;
      final m   = deadline.minute.toString().padLeft(2, '0');
      final apm = deadline.hour >= 12 ? 'PM' : 'AM';
      deadlineStr = '$h:$m $apm';
    }

    String timeLeft = '';
    Color  timeColor = _kGreen;
    if (deadline != null) {
      final diff = deadline.difference(DateTime.now());
      if (diff.isNegative) {
        timeLeft  = '⚠️ OVERDUE';
        timeColor = _kRed;
      } else if (diff.inMinutes < 30) {
        timeLeft  = '${diff.inMinutes}m left';
        timeColor = _kRed;
      } else if (diff.inMinutes < 60) {
        timeLeft  = '${diff.inMinutes}m left';
        timeColor = Colors.orange;
      } else {
        timeLeft  = '${diff.inHours}h ${diff.inMinutes % 60}m left';
        timeColor = _kGreen;
      }
    }

    return Card(
      elevation: 6,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: _kOrange.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Text('🛵 Active Delivery',
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w700,
                          color: _kOrange)),
                ),
                const Spacer(),
                if (timeLeft.isNotEmpty)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: timeColor.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(timeLeft,
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: timeColor)),
                  ),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _InfoPill('📦 $area', Colors.grey.shade100, Colors.black87),
                const SizedBox(width: 8),
                _InfoPill('⏰ By $deadlineStr', Colors.orange.shade50,
                    Colors.orange.shade800),
                const SizedBox(width: 8),
                _InfoPill(
                    '$doneStops/$totalStops done',
                    doneStops == totalStops
                        ? _kGreen.withValues(alpha: 0.1)
                        : _kBlue.withValues(alpha: 0.1),
                    doneStops == totalStops ? _kGreen : _kBlue),
              ],
            ),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(4),
              child: LinearProgressIndicator(
                value: totalStops > 0 ? doneStops / totalStops : 0,
                backgroundColor: Colors.grey.shade200,
                valueColor: AlwaysStoppedAnimation<Color>(
                    doneStops == totalStops ? _kGreen : _kOrange),
                minHeight: 6,
              ),
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      Icon(
                          provider.isLocationSharing
                              ? Icons.location_on
                              : Icons.location_off,
                          size: 14,
                          color: provider.isLocationSharing
                              ? _kGreen
                              : Colors.grey),
                      const SizedBox(width: 4),
                      Text(
                        provider.isLocationSharing
                            ? 'GPS sharing active'
                            : 'GPS sharing off',
                        style: TextStyle(
                            fontSize: 11,
                            color: provider.isLocationSharing
                                ? _kGreen
                                : Colors.grey),
                      ),
                    ],
                  ),
                ),
                Switch(
                  value: _locationSharingEnabled || provider.isLocationSharing,
                  activeThumbColor: _kOrange,
                  materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                  onChanged: (val) {
                    setState(() => _locationSharingEnabled = val);
                    if (val) {
                      _startSharing(provider);
                    } else {
                      provider.stopLocationSharing();
                    }
                  },
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<DeliveryProvider>(
      builder: (context, provider, _) {
        return Scaffold(
          backgroundColor: Colors.white,
          appBar: AppBar(
            backgroundColor: Colors.white,
            elevation: 0,
            surfaceTintColor: Colors.white,
            title: const Text('Delivery Map',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Colors.black87)),
            actions: [
              // Refresh road routes
              if (_fetchingRoutes)
                const Padding(
                  padding: EdgeInsets.symmetric(horizontal: 12),
                  child: SizedBox(
                    width: 20, height: 20,
                    child: CircularProgressIndicator(
                        color: _kOrange, strokeWidth: 2),
                  ),
                )
              else
                IconButton(
                  icon: const Icon(Icons.route, color: _kOrange),
                  tooltip: 'Refresh Road Route',
                  onPressed: () => _fetchRoadRoutes(provider.batches),
                ),
              IconButton(
                icon: Icon(
                    _showRoute ? Icons.layers : Icons.layers_outlined,
                    color: _showRoute ? _kOrange : Colors.grey),
                tooltip: 'Toggle Route',
                onPressed: () => setState(() => _showRoute = !_showRoute),
              ),
              Container(
                margin: const EdgeInsets.only(right: 4),
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.grey.shade300),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: DropdownButtonHideUnderline(
                  child: DropdownButton<String>(
                    value: _currentMealSlot,
                    isDense: true,
                    items: ['lunch', 'dinner']
                        .map((s) => DropdownMenuItem(
                              value: s,
                              child: Text(s,
                                  style: const TextStyle(fontSize: 13)),
                            ))
                        .toList(),
                    onChanged: (val) {
                      if (val == null) return;
                      setState(() => _currentMealSlot = val);
                      provider.fetchBatches(mealSlot: val);
                    },
                  ),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.my_location, color: _kOrange),
                onPressed: _getCurrentLocation,
                tooltip: 'My Location',
              ),
            ],
          ),
          body: Stack(
            children: [
              GoogleMap(
                onMapCreated: (ctrl) => _mapController = ctrl,
                initialCameraPosition: CameraPosition(
                  target: _currentPosition ?? const LatLng(23.0225, 72.5714),
                  zoom: 13.0,
                ),
                markers:                 _buildAllMarkers(provider),
                polylines:               _buildRoutePolylines(provider),
                myLocationButtonEnabled: false,
                zoomControlsEnabled:     false,
                mapToolbarEnabled:       false,
              ),

              // Legend
              Positioned(
                top: 12, right: 12,
                child: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: Colors.white.withValues(alpha: 0.92),
                    borderRadius: BorderRadius.circular(10),
                    boxShadow: [
                      BoxShadow(
                          color: Colors.black.withValues(alpha: 0.12),
                          blurRadius: 6),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _LegendItem(_kBlue,               'You'),
                      const SizedBox(height: 4),
                      _LegendItem(_kOrange,             'Pending stop'),
                      const SizedBox(height: 4),
                      _LegendItem(Colors.grey.shade400, 'Delivered'),
                    ],
                  ),
                ),
              ),

              // Route type badge
              if (_showRoute)
                Positioned(
                  top: 12, left: 12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.92),
                      borderRadius: BorderRadius.circular(8),
                      boxShadow: [
                        BoxShadow(
                            color: Colors.black.withValues(alpha: 0.10),
                            blurRadius: 4),
                      ],
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          _routePoints.isNotEmpty
                              ? Icons.alt_route
                              : Icons.straighten,
                          size: 12,
                          color: _routePoints.isNotEmpty
                              ? _kGreen
                              : Colors.grey,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          _routePoints.isNotEmpty
                              ? 'Road route'
                              : 'Straight line',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w600,
                            color: _routePoints.isNotEmpty
                                ? _kGreen
                                : Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

              // Bottom panel
              Positioned(
                bottom: 16, left: 12, right: 12,
                child: _buildActiveBatchPanel(provider),
              ),
            ],
          ),
        );
      },
    );
  }
}

// ── Info pill ─────────────────────────────────────────────────────────────────

class _InfoPill extends StatelessWidget {
  const _InfoPill(this.label, this.bg, this.color);
  final String label;
  final Color  bg;
  final Color  color;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: bg, borderRadius: BorderRadius.circular(8)),
        child: Text(label,
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w600, color: color)),
      );
}

// ── Legend item ───────────────────────────────────────────────────────────────

class _LegendItem extends StatelessWidget {
  const _LegendItem(this.color, this.label);
  final Color  color;
  final String label;

  @override
  Widget build(BuildContext context) => Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 12, height: 12,
            decoration:
                BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(label,
              style: const TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w600)),
        ],
      );
}
