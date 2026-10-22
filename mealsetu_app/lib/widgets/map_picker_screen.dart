import 'dart:async';
import 'dart:convert';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:geolocator/geolocator.dart';
import 'package:http/http.dart' as http;
import 'package:latlong2/latlong.dart';

// ── Result returned when the user confirms a pin ──────────────────────────────

class MapPickerResult {
  const MapPickerResult({
    required this.lat,
    required this.lon,
    this.street  = '',
    this.area    = '',
    this.city    = '',
    this.pincode = '',
  });

  final double lat;
  final double lon;
  final String street;
  final String area;
  final String city;
  final String pincode;
}

// ── Full-screen map picker ────────────────────────────────────────────────────

class MapPickerScreen extends StatefulWidget {
  const MapPickerScreen({super.key, this.initialLat, this.initialLon});

  final double? initialLat;
  final double? initialLon;

  @override
  State<MapPickerScreen> createState() => _MapPickerScreenState();
}

class _MapPickerScreenState extends State<MapPickerScreen> {
  final _mapController = MapController();

  LatLng _center       = const LatLng(21.17, 72.83); // Gujarat fallback
  LatLng? _userLocation;                              // live blue dot

  bool _isLoadingAddress = false;

  String _street  = '';
  String _area    = '';
  String _city    = '';
  String _pincode = '';

  Timer? _geocodeTimer;

  @override
  void initState() {
    super.initState();
    if (widget.initialLat != null && widget.initialLon != null) {
      _center = LatLng(widget.initialLat!, widget.initialLon!);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _reverseGeocode(_center);
      _loadUserLocation();
    });
  }

  @override
  void dispose() {
    _geocodeTimer?.cancel();
    super.dispose();
  }

  // ── Live location blue dot ────────────────────────────────────────────────

  Future<void> _loadUserLocation() async {
    try {
      final perm = await Geolocator.checkPermission();
      if (perm != LocationPermission.always &&
          perm != LocationPermission.whileInUse) {
        return;
      }
      // ignore: deprecated_member_use
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.medium,
        timeLimit: const Duration(seconds: 8),
      );
      if (mounted) {
        setState(() => _userLocation = LatLng(pos.latitude, pos.longitude));
      }
    } catch (_) {}
  }

  // ── Reverse geocode ───────────────────────────────────────────────────────

  void _scheduleGeocode(LatLng ll) {
    _geocodeTimer?.cancel();
    _geocodeTimer = Timer(
      const Duration(milliseconds: 700),
      () => _reverseGeocode(ll),
    );
  }

  Future<void> _reverseGeocode(LatLng ll) async {
    if (!mounted) return;
    setState(() => _isLoadingAddress = true);
    try {
      final uri = Uri.parse(
        'https://nominatim.openstreetmap.org/reverse'
        '?lat=${ll.latitude}&lon=${ll.longitude}'
        '&format=json&zoom=18&addressdetails=1',
      );
      final res = await http
          .get(uri, headers: {
            'Accept-Language': 'en',
            'User-Agent': 'MealSetu/1.0 (com.mealsetu.app)',
          })
          .timeout(const Duration(seconds: 10));
      if (!mounted) return;
      if (res.statusCode == 200) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final a       = (data['address'] as Map<String, dynamic>?) ?? {};
        final hasCity = a['city'] != null || a['town'] != null;
        setState(() {
          _street = [
            a['house_number'] as String? ?? '',
            (a['road'] ?? a['pedestrian'] ?? a['footway'] ?? '') as String,
          ].where((s) => s.isNotEmpty).join(' ');
          _area = (a['suburb'] ?? a['neighbourhood'] ?? a['quarter'] ??
              a['hamlet'] ?? a['locality'] ??
              (hasCity ? a['village'] : null) ?? '') as String;
          _city    = (a['city'] ?? a['town'] ?? a['village'] ??
              a['municipality'] ?? '') as String;
          _pincode = (a['postcode'] ?? '') as String;
        });
      }
    } catch (e) {
      debugPrint('Reverse geocode error: $e');
    } finally {
      if (mounted) setState(() => _isLoadingAddress = false);
    }
  }

  // ── Confirm ───────────────────────────────────────────────────────────────

  void _confirm() => Navigator.of(context).pop(MapPickerResult(
        lat:     _center.latitude,
        lon:     _center.longitude,
        street:  _street,
        area:    _area,
        city:    _city,
        pincode: _pincode,
      ));

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          // ── Map ───────────────────────────────────────────────────────────
          FlutterMap(
            mapController: _mapController,
            options: MapOptions(
              initialCenter: _center,
              initialZoom:   16,
              onPositionChanged: (camera, hasGesture) {
                if (hasGesture) {
                  _center = camera.center;
                  _scheduleGeocode(camera.center);
                }
              },
            ),
            children: [
              TileLayer(
                urlTemplate:          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                userAgentPackageName: 'com.mealsetu.app',
              ),
              // ── Live location blue dot ─────────────────────────────────
              if (_userLocation != null)
                CircleLayer(
                  circles: [
                    // Accuracy ring
                    CircleMarker(
                      point:             _userLocation!,
                      radius:            20,
                      color:             const Color(0x264285F4),
                      borderColor:       const Color(0x804285F4),
                      borderStrokeWidth: 1,
                      useRadiusInMeter:  false,
                    ),
                    // Solid blue dot
                    CircleMarker(
                      point:             _userLocation!,
                      radius:            8,
                      color:             const Color(0xFF4285F4),
                      borderColor:       Colors.white,
                      borderStrokeWidth: 2,
                      useRadiusInMeter:  false,
                    ),
                  ],
                ),
            ],
          ),

          // ── Centred pin (always at viewport centre) ───────────────────────
          const Center(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _PinWidget(),
                SizedBox(height: 80),
              ],
            ),
          ),

          // ── Top bar ───────────────────────────────────────────────────────
          Positioned(
            top: 0, left: 0, right: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.12),
                        blurRadius: 12,
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      GestureDetector(
                        onTap: () => Navigator.of(context).pop(),
                        child: Container(
                          width: 36, height: 36,
                          decoration: BoxDecoration(
                            color: const Color(0xFFF26522).withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: const Icon(
                            Icons.arrow_back_ios_new,
                            color: Color(0xFFF26522),
                            size: 15,
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      const Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              'Pin Your Location',
                              style: TextStyle(
                                fontSize:   15,
                                fontWeight: FontWeight.w700,
                                color:      Color(0xFF1A1A2E),
                              ),
                            ),
                            Text(
                              'Pan & zoom to position the pin exactly',
                              style: TextStyle(
                                  fontSize: 11, color: Color(0xFF94A3B8)),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),

          // ── Bottom address card ───────────────────────────────────────────
          Positioned(
            bottom: 0, left: 0, right: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color:      Colors.black.withValues(alpha: 0.13),
                        blurRadius: 24,
                        offset:     const Offset(0, -6),
                      ),
                    ],
                  ),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Icon(Icons.location_on,
                              color: Color(0xFFF26522), size: 16),
                          const SizedBox(width: 6),
                          const Text(
                            'Detected Address',
                            style: TextStyle(
                              fontSize:   11,
                              fontWeight: FontWeight.w600,
                              color:      Color(0xFF94A3B8),
                            ),
                          ),
                          const Spacer(),
                          if (_isLoadingAddress)
                            const SizedBox(
                              width: 14, height: 14,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  color: Color(0xFFF26522)),
                            ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      if (_isLoadingAddress)
                        const Text('Fetching address…',
                            style: TextStyle(
                                fontSize: 13, color: Color(0xFF94A3B8)))
                      else ...[
                        if (_street.isNotEmpty)
                          _addrLine(Icons.route_outlined, _street),
                        if (_area.isNotEmpty)
                          _addrLine(Icons.villa_outlined, _area),
                        if (_city.isNotEmpty || _pincode.isNotEmpty)
                          _addrLine(
                            Icons.location_city_outlined,
                            [_city, _pincode]
                                .where((s) => s.isNotEmpty)
                                .join('  —  '),
                          ),
                        if (_street.isEmpty && _area.isEmpty && _city.isEmpty)
                          const Text(
                            'No address found — you can still confirm this spot.',
                            style: TextStyle(
                                fontSize: 12, color: Color(0xFF94A3B8)),
                          ),
                      ],
                      const SizedBox(height: 14),
                      SizedBox(
                        width:  double.infinity,
                        height: 50,
                        child: ElevatedButton.icon(
                          onPressed: _confirm,
                          icon:  const Icon(Icons.check_circle_outline, size: 18),
                          label: const Text(
                            'Confirm Location',
                            style: TextStyle(
                                fontSize: 15, fontWeight: FontWeight.w700),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFF26522),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                            elevation: 0,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _addrLine(IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 5),
        child: Row(
          children: [
            Icon(icon, size: 13, color: const Color(0xFF94A3B8)),
            const SizedBox(width: 6),
            Expanded(
              child: Text(
                text,
                style: const TextStyle(
                    fontSize: 13, color: Color(0xFF1A1A2E)),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ],
        ),
      );
}

// ── Orange pin drawn at the centre of the map ─────────────────────────────────

class _PinWidget extends StatelessWidget {
  const _PinWidget();

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 44, height: 44,
          decoration: const BoxDecoration(
            color: Color(0xFFF26522),
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color:        Color(0x50F26522),
                blurRadius:   12,
                spreadRadius: 2,
              ),
            ],
          ),
          child: const Icon(Icons.restaurant, color: Colors.white, size: 22),
        ),
        CustomPaint(
          size: const Size(14, 10),
          painter: _TrianglePainter(),
        ),
        Container(
          width: 6, height: 6,
          decoration: const BoxDecoration(
            color: Color(0xFFF26522),
            shape: BoxShape.circle,
          ),
        ),
      ],
    );
  }
}

class _TrianglePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final path = ui.Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = const Color(0xFFF26522));
  }

  @override
  bool shouldRepaint(_) => false;
}
