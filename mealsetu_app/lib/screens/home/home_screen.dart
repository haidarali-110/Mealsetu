import 'dart:convert';
import 'dart:math' as math;

import 'package:dio/dio.dart' show DioException;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:geocoding/geocoding.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shimmer/shimmer.dart';


import '../../constants/app_colors.dart';
import '../../models/vendor_model.dart';
import '../../services/api_service.dart';
import '../../services/widget_service.dart';
import '../../widgets/vendor_card.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with WidgetsBindingObserver {
  final ApiService _api = ApiService();

  List<VendorModel> _vendors = [];
  String _pincode = '';
  bool _isLoading = true;
  bool _isDetecting = false;
  String? _error;

  // User GPS coords — sent with API so backend returns distanceKm per vendor
  double? _userLat;
  double? _userLon;

  // 0 = All, 1 = <1km, 3 = <3km, 5 = <5km, 10 = <10km
  int _selectedFilterKm = 0;

  // Vendors filtered by the selected distance chip
  List<VendorModel> get _filteredVendors {
    if (_selectedFilterKm == 0) return _vendors;
    return _vendors
        .where(
          (v) => v.distanceKm != null && v.distanceKm! <= _selectedFilterKm,
        )
        .toList();
  }

  // Draggable FAB position (–1 = unset → snaps to bottom-right on first layout)
  double _fabX = -1;
  double _fabY = -1;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _loadVendors();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Refresh widget when app comes back to foreground
    if (state == AppLifecycleState.resumed) {
      WidgetService.refresh().ignore();
    }
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  Future<void> _loadVendors() async {
    final prefs = await SharedPreferences.getInstance();
    final userRaw = prefs.getString('mealsetu_user');
    String pincode = '';

    if (userRaw != null && userRaw.isNotEmpty) {
      try {
        final user = jsonDecode(userRaw) as Map<String, dynamic>;
        pincode = user['pincode'] as String? ?? '';
        // Priority: registered address → top-level profile → GPS cache
        // Address-based distance reflects where delivery will happen.
        final addr = user['address'] as Map<String, dynamic>?;
        _userLat =
            (addr?['latitude'] as num?)?.toDouble() ??
            (user['latitude'] as num?)?.toDouble() ??
            prefs.getDouble('mealsetu_user_lat');
        _userLon =
            (addr?['longitude'] as num?)?.toDouble() ??
            (user['longitude'] as num?)?.toDouble() ??
            prefs.getDouble('mealsetu_user_lon');
      } catch (_) {}
    }

    if (pincode.isEmpty) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error =
              'Pincode not found in your profile.\n'
              'Please enter a pincode to find nearby vendors.';
        });
      }
      return;
    }

    // Fire GPS update in the background — never blocks the vendor fetch.
    // When it resolves it recalculates distances without a network call.
    _updateGpsInBackground(prefs).ignore();

    await _fetchVendors(pincode);
  }

  /// Silently gets a single GPS fix and refreshes distance badges.
  /// Only runs when the user has no registered address coordinates —
  /// address-based distance always takes priority over live GPS.
  Future<void> _updateGpsInBackground(SharedPreferences prefs) async {
    // Skip if we already have address-based coordinates
    if (_userLat != null && _userLon != null) return;

    final position = await _silentGps();
    if (position == null || !mounted) return;

    final lat = position.latitude;
    final lon = position.longitude;

    // Skip pointless rebuild if coords didn't change
    if (lat == _userLat && lon == _userLon) return;

    _userLat = lat;
    _userLon = lon;
    await prefs.setDouble('mealsetu_user_lat', lat);
    await prefs.setDouble('mealsetu_user_lon', lon);

    if (!mounted || _vendors.isEmpty) return;
    setState(() {
      _vendors =
          _vendors.map((v) {
            if (v.vendorLat != null && v.vendorLon != null) {
              return v.copyWithDistance(
                _haversineKm(lat, lon, v.vendorLat!, v.vendorLon!),
              );
            }
            return v;
          }).toList()..sort((a, b) {
            if (a.distanceKm == null && b.distanceKm == null) return 0;
            if (a.distanceKm == null) return 1;
            if (b.distanceKm == null) return -1;
            return a.distanceKm!.compareTo(b.distanceKm!);
          });
    });
  }

  /// Returns the current position if permission is already granted, else null.
  /// Never triggers a permission prompt.
  Future<Position?> _silentGps() async {
    try {
      final perm = await Geolocator.checkPermission();
      if (perm == LocationPermission.always ||
          perm == LocationPermission.whileInUse) {
        // ignore: deprecated_member_use
        return await Geolocator.getCurrentPosition(
          desiredAccuracy: LocationAccuracy.medium,
          timeLimit: const Duration(seconds: 4),
        );
      }
    } catch (_) {}
    return null;
  }

  Future<void> _fetchVendors(String pincode) async {
    if (pincode.isEmpty) return;

    setState(() {
      _isLoading = true;
      _error = null;
      _pincode = pincode;
    });

    try {
      final response = await _api.get(
        '/users/vendors-by-pincode',
        queryParameters: {
          'pincode': pincode,
          if (_userLat != null) 'userLat': _userLat,
          if (_userLon != null) 'userLon': _userLon,
        },
      );

      final data = response.data as Map<String, dynamic>? ?? {};
      var list = (data['vendors'] as List<dynamic>? ?? [])
          .map((v) => VendorModel.fromJson(v as Map<String, dynamic>))
          .toList();

      // If user GPS is available, recalculate distances client-side using the
      // vendor's lat/lon from the API response — this is the authoritative value
      // and overrides whatever the backend computed (fixes stale DB coordinates).
      if (_userLat != null && _userLon != null) {
        list = list.map((v) {
          if (v.vendorLat != null && v.vendorLon != null) {
            return v.copyWithDistance(
              _haversineKm(_userLat!, _userLon!, v.vendorLat!, v.vendorLon!),
            );
          }
          return v;
        }).toList();
      }

      // Sort closest → farthest; vendors without distance go to end
      list.sort((a, b) {
        if (a.distanceKm == null && b.distanceKm == null) return 0;
        if (a.distanceKm == null) return 1;
        if (b.distanceKm == null) return -1;
        return a.distanceKm!.compareTo(b.distanceKm!);
      });

      if (mounted) {
        setState(() {
          _vendors = list;
          _isLoading = false;
        });
        // Refresh the home-screen widget with today's tiffin data (fire-and-forget)
        WidgetService.refresh().ignore();
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = ApiService().handleError(e);
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLoading = false;
          _error = 'Failed to load vendors. Please try again.';
        });
      }
    }
  }

  // ── GPS location detection ────────────────────────────────────────────────

  Future<void> _detectLocation() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Please turn on GPS / Location Services'),
            duration: Duration(seconds: 3),
          ),
        );
      }
      return;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Location permission denied'),
              duration: Duration(seconds: 3),
            ),
          );
        }
        return;
      }
    }
    if (permission == LocationPermission.deniedForever) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Enable location access in phone Settings'),
            duration: Duration(seconds: 4),
          ),
        );
      }
      return;
    }

    if (mounted) setState(() => _isDetecting = true);

    try {
      // ignore: deprecated_member_use
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      );

      final placemarks = await placemarkFromCoordinates(
        position.latitude,
        position.longitude,
      );

      if (!mounted) return;

      if (placemarks.isNotEmpty) {
        final pincode = placemarks.first.postalCode ?? '';
        if (pincode.isNotEmpty) {
          _userLat = position.latitude;
          _userLon = position.longitude;
          // Persist so distance badge shows on every future load without re-detecting
          final prefs = await SharedPreferences.getInstance();
          await prefs.setDouble('mealsetu_user_lat', position.latitude);
          await prefs.setDouble('mealsetu_user_lon', position.longitude);
          await _fetchVendors(pincode);
          if (mounted) setState(() => _isDetecting = false);
        } else {
          setState(() => _isDetecting = false);
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                'Could not detect pincode — try entering it manually',
              ),
              duration: Duration(seconds: 3),
            ),
          );
        }
      } else {
        setState(() => _isDetecting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('No location data found. Try manually.'),
            duration: Duration(seconds: 3),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isDetecting = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Location error: ${e.toString().split('\n').first}'),
            duration: const Duration(seconds: 4),
          ),
        );
      }
    }
  }

  // ── Change-pincode dialog ─────────────────────────────────────────────────

  Future<void> _showChangePincodeDialog() async {
    final controller = TextEditingController(text: _pincode);
    final formKey = GlobalKey<FormState>();

    final newPincode = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change Pincode'),
        content: Form(
          key: formKey,
          child: TextFormField(
            controller: controller,
            keyboardType: TextInputType.number,
            maxLength: 6,
            autofocus: true,
            decoration: const InputDecoration(
              labelText: 'Enter pincode',
              hintText: 'e.g. 380015',
              border: OutlineInputBorder(),
              counterText: '',
            ),
            validator: (v) {
              if (v == null || v.trim().isEmpty) return 'Enter a pincode';
              if (v.trim().length != 6) return 'Pincode must be 6 digits';
              if (!RegExp(r'^\d{6}$').hasMatch(v.trim())) {
                return 'Enter a valid 6-digit pincode';
              }
              return null;
            },
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () {
              if (formKey.currentState!.validate()) {
                Navigator.of(ctx).pop(controller.text.trim());
              }
            },
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
            ),
            child: const Text('Search'),
          ),
        ],
      ),
    );

    if (newPincode != null && mounted) {
      await _fetchVendors(newPincode);
    }
  }

  // ── Haversine distance (km, 1 decimal) ───────────────────────────────────

  double _haversineKm(double lat1, double lon1, double lat2, double lon2) {
    const r = 6371.0;
    final dLat = (lat2 - lat1) * math.pi / 180;
    final dLon = (lon2 - lon1) * math.pi / 180;
    final a =
        math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1 * math.pi / 180) *
            math.cos(lat2 * math.pi / 180) *
            math.sin(dLon / 2) *
            math.sin(dLon / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return (r * c * 10).roundToDouble() / 10;
  }

  // ── UI sections ───────────────────────────────────────────────────────────

  // FIX 1 + FIX 4: compact location display, dark mode container with border
  Widget _buildLocationBar() {
    final cs = Theme.of(context).colorScheme;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E2E) : Colors.white,
        border: Border(
          bottom: BorderSide(
            color: isDark ? const Color(0xFF2D2D3E) : const Color(0xFFE2E8F0),
            width: 1,
          ),
        ),
      ),
      child: Row(
        children: [
          // FIX 1: two-line location display — no text overflow
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                const Text(
                  '📍 Near you',
                  style: TextStyle(
                    fontSize: 11,
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  _pincode.isNotEmpty ? _pincode : 'Set location',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: cs.onSurface,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: _showChangePincodeDialog,
            style: OutlinedButton.styleFrom(
              side: const BorderSide(color: AppColors.primary),
              foregroundColor: AppColors.primary,
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              textStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
            child: const Text('Change'),
          ),
          const SizedBox(width: 6),
          ElevatedButton.icon(
            onPressed: (_isDetecting || _isLoading) ? null : _detectLocation,
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              disabledBackgroundColor: AppColors.primary.withAlpha(153),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              minimumSize: Size.zero,
              tapTargetSize: MaterialTapTargetSize.shrinkWrap,
              textStyle: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
              elevation: 0,
            ),
            icon: _isDetecting
                ? const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(
                      color: Colors.white,
                      strokeWidth: 2,
                    ),
                  )
                : const Icon(Icons.my_location, size: 14),
            label: Text(_isDetecting ? 'Detecting…' : 'Detect'),
          ),
        ],
      ),
    );
  }

  // Greeting header — time-aware, shown when content is ready
  Widget _buildGreetingHeader() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final hour = DateTime.now().hour;
    final greeting = hour < 12
        ? 'Good Morning'
        : hour < 17
        ? 'Good Afternoon'
        : 'Good Evening';

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$greeting! ',
            style: TextStyle(
              fontSize: 20,
              fontWeight: FontWeight.w800,
              color: isDark ? Colors.white : const Color(0xFF1A1A2E),
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Fresh homemade tiffins, delivered daily',
            style: TextStyle(
              fontSize: 13,
              color: isDark ? const Color(0xFF9CA3AF) : const Color(0xFF6B7280),
            ),
          ),
        ],
      ),
    );
  }

  // Distance filter chips — only rendered when GPS coords are available
  Widget _buildDistanceFilter() {
    if (_userLat == null) return const SizedBox.shrink();
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filters = const [
      (0, 'All'),
      (1, '<1 km'),
      (3, '<3 km'),
      (5, '<5 km'),
      (10, '<10 km'),
    ];
    return SizedBox(
      height: 40,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16),
        itemCount: filters.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final (km, label) = filters[i];
          final selected = _selectedFilterKm == km;
          return GestureDetector(
            onTap: () => setState(() => _selectedFilterKm = km),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: selected
                    ? const Color(0xFFF26522)
                    : (isDark ? const Color(0xFF1E1E2E) : Colors.white),
                border: Border.all(
                  color: selected
                      ? const Color(0xFFF26522)
                      : (isDark
                            ? const Color(0xFF3D3D55)
                            : const Color(0xFFE2E8F0)),
                ),
                borderRadius: BorderRadius.circular(20),
                boxShadow: selected
                    ? [
                        BoxShadow(
                          color: const Color(
                            0xFFF26522,
                          ).withValues(alpha: 0.25),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ]
                    : [],
              ),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: selected
                      ? Colors.white
                      : (isDark
                            ? const Color(0xFF9CA3AF)
                            : const Color(0xFF6B7280)),
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // Section header — shows filtered count when a filter is active
  Widget _buildVendorCount() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final filtered = _filteredVendors;
    final showingAll = _selectedFilterKm == 0;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          Text(
            'Tiffin Providers',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: isDark ? Colors.white : const Color(0xFF1A1A2E),
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: const Color(0xFFF26522).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              showingAll
                  ? '${filtered.length} near $_pincode'
                  : '${filtered.length} within $_selectedFilterKm km',
              style: const TextStyle(
                fontSize: 11,
                color: Color(0xFFF26522),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Shimmer skeleton ──────────────────────────────────────────────────────

  Widget _buildShimmer() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Shimmer.fromColors(
      baseColor: isDark ? Colors.grey.shade800 : Colors.grey.shade300,
      highlightColor: isDark ? Colors.grey.shade700 : Colors.grey.shade100,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: 2,
        itemBuilder: (_, _) => const _SkeletonCard(),
      ),
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  Widget _buildError() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(
          height: MediaQuery.of(context).size.height * 0.65,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.error_outline,
                    size: 64,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _error ?? 'Something went wrong.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 20),
                  ElevatedButton.icon(
                    onPressed: _showChangePincodeDialog,
                    icon: const Icon(Icons.edit_location_alt_outlined),
                    label: const Text('Enter Pincode'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────

  Widget _buildEmpty() {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      children: [
        SizedBox(
          height: MediaQuery.of(context).size.height * 0.65,
          child: Center(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.restaurant_outlined,
                    size: 72,
                    color: Colors.grey.shade400,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    'No vendors found',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'No meal providers are available in '
                    'pincode $_pincode yet.',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 14,
                      color: Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      OutlinedButton.icon(
                        onPressed: () => _fetchVendors(_pincode),
                        icon: const Icon(Icons.refresh),
                        label: const Text('Retry'),
                        style: OutlinedButton.styleFrom(
                          foregroundColor: AppColors.primary,
                          side: const BorderSide(color: AppColors.primary),
                        ),
                      ),
                      const SizedBox(width: 12),
                      ElevatedButton.icon(
                        onPressed: _showChangePincodeDialog,
                        icon: const Icon(Icons.edit_location_alt_outlined),
                        label: const Text('Try Another'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ── No results for active distance filter ────────────────────────────────

  Widget _buildFilterEmpty() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.location_off_outlined,
              size: 64,
              color: Colors.grey.shade400,
            ),
            const SizedBox(height: 16),
            Text(
              'No vendors within $_selectedFilterKm km',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: isDark ? Colors.white : const Color(0xFF1A1A2E),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Try a wider distance filter to see more options.',
              textAlign: TextAlign.center,
              style: TextStyle(
                fontSize: 13,
                color: isDark
                    ? const Color(0xFF9CA3AF)
                    : const Color(0xFF6B7280),
              ),
            ),
            const SizedBox(height: 20),
            ElevatedButton(
              onPressed: () => setState(() => _selectedFilterKm = 0),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
              ),
              child: const Text('Show All'),
            ),
          ],
        ),
      ),
    );
  }

  // ── Root build ────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      // FIX 7: dark mode scaffold background
      backgroundColor: isDark
          ? const Color(0xFF0F0F1A)
          : const Color(0xFFF5F6FA),
      appBar: AppBar(
        // FIX 6: dark mode AppBar background
        backgroundColor: isDark ? const Color(0xFF1E1E2E) : Colors.white,
        elevation: 0,
        surfaceTintColor: Colors.transparent,
        // FIX 5: logo icon + title
        title: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(width: 8),
            const Text(
              'MealSetu',
              style: TextStyle(
                color: Color(0xFFF26522),
                fontWeight: FontWeight.w800,
                fontSize: 20,
              ),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_outlined),
            tooltip: 'Notifications',
            onPressed: () {
              ScaffoldMessenger.of(context)
                ..hideCurrentSnackBar()
                ..showSnackBar(
                  const SnackBar(
                    content: Text('No new notifications'),
                    behavior: SnackBarBehavior.floating,
                    duration: Duration(seconds: 2),
                  ),
                );
            },
          ),
        ],
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          final fabX = _fabX < 0 ? constraints.maxWidth - 76.0 : _fabX;
          final fabY = _fabY < 0 ? constraints.maxHeight - 76.0 : _fabY;

          return Stack(
            children: [
              // ── Main content ───────────────────────────────────────────────
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildLocationBar(),
                  _buildGreetingHeader(),
                  if (!_isLoading && _error == null && _vendors.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    _buildDistanceFilter(),
                    _buildVendorCount(),
                  ],
                  Expanded(
                    child: RefreshIndicator(
                      color: AppColors.primary,
                      onRefresh: () =>
                          _fetchVendors(_pincode.isNotEmpty ? _pincode : ''),
                      child: _buildBody(),
                    ),
                  ),
                ],
              ),

              // ── Draggable AI FAB ───────────────────────────────────────────
              Positioned(
                left: fabX,
                top: fabY,
                child: GestureDetector(
                  onPanUpdate: (details) {
                    setState(() {
                      final curX = _fabX < 0 ? fabX : _fabX;
                      final curY = _fabY < 0 ? fabY : _fabY;
                      _fabX = (curX + details.delta.dx).clamp(
                        0.0,
                        constraints.maxWidth - 62.0,
                      );
                      _fabY = (curY + details.delta.dy).clamp(
                        0.0,
                        constraints.maxHeight - 62.0,
                      );
                    });
                  },
                  onTap: () => context.push('/ai-chat'),
                  child: const _AiFab(),
                ),
              ),
            ],
          );
        },
      ),
    );
  }

  Widget _buildBody() {
    if (_isLoading) return _buildShimmer();
    if (_error != null) return _buildError();
    if (_vendors.isEmpty) return _buildEmpty();

    final vendors = _filteredVendors;
    if (vendors.isEmpty && _selectedFilterKm != 0) {
      return _buildFilterEmpty();
    }
    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: vendors.length,
      itemBuilder: (_, i) => VendorCard(vendor: vendors[i]),
    );
  }
}

// ── AI Chat FAB ───────────────────────────────────────────────────────────────
// Shows ONLY your real logo image — no orange box, no "AI" badge, no extra
// background. Just a subtle drop shadow so it lifts off the screen like a
// real floating icon. Gentle breathing scale animation kept from before.

class _AiFab extends StatefulWidget {
  const _AiFab();

  @override
  State<_AiFab> createState() => _AiFabState();
}

class _AiFabState extends State<_AiFab> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1800),
    )..repeat(reverse: true);
    _scale = Tween<double>(
      begin: 1.0,
      end: 1.06,
    ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut));
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScaleTransition(
      scale: _scale,
      child: Container(
        width: 62,
        height: 62,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: Colors.black.withAlpha(70),
              blurRadius: 14,
              spreadRadius: 1,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Image.asset(
          'assets/icon/ai_logo.png',
          width: 62,
          height: 62,
          fit: BoxFit.contain,
        ),
      ),
    );
  }
}

// ── Skeleton card (rendered inside Shimmer) ───────────────────────────────────

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(height: 180, color: Colors.white),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(height: 18, width: 200, color: Colors.white),
                const SizedBox(height: 8),
                Container(
                  height: 13,
                  width: double.infinity,
                  color: Colors.white,
                ),
                const SizedBox(height: 6),
                Container(height: 13, width: 160, color: Colors.white),
                const SizedBox(height: 16),
                Container(height: 13, width: 240, color: Colors.white),
                const SizedBox(height: 16),
                Container(
                  height: 44,
                  width: double.infinity,
                  color: Colors.white,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
