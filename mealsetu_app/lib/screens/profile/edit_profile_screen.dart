import 'dart:async';
import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart' show DioException, FormData, MultipartFile;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geocoding/geocoding.dart';
import 'package:geolocator/geolocator.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../constants/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// EditProfileScreen
// ─────────────────────────────────────────────────────────────────────────────

class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key});

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _api     = ApiService();
  final _picker  = ImagePicker();

  // Text controllers
  final _nameCtrl     = TextEditingController();
  final _phoneCtrl    = TextEditingController();
  final _flatCtrl     = TextEditingController();
  final _streetCtrl   = TextEditingController();
  final _areaCtrl     = TextEditingController();
  final _landmarkCtrl = TextEditingController();
  final _cityCtrl     = TextEditingController();
  final _pincodeCtrl  = TextEditingController();

  // Profile data
  String _userId        = '';
  String _email         = '';
  String _gender        = '';
  String _profilePicUrl = '';

  // GPS state
  double? _detectedLat;
  double? _detectedLng;
  bool _isDetecting     = false;
  bool _locationDetected = false;

  // Location search autocomplete
  final _locationSearchCtrl       = TextEditingController();
  List<dynamic> _locationSuggestions = [];
  bool _isSearchingLocation       = false;
  Timer? _searchDebounce;

  // Loading flags
  bool _isLoading   = true;   // initial load from SharedPreferences
  bool _isSaving    = false;  // "Save Changes" API call
  bool _isUploading = false;  // profile-pic upload

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _loadFromPrefs();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _flatCtrl.dispose();
    _streetCtrl.dispose();
    _areaCtrl.dispose();
    _landmarkCtrl.dispose();
    _cityCtrl.dispose();
    _pincodeCtrl.dispose();
    _locationSearchCtrl.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  // ── Load profile ──────────────────────────────────────────────────────────
  //
  // Step 1: Instantly fill the form from the SharedPreferences cache so the
  //         screen feels snappy even on slow connections.
  // Step 2: Call GET /users/me in the background to pull the latest server
  //         data and overwrite the form fields.

  Future<void> _loadFromPrefs() async {
    // ── Step 1: cache ─────────────────────────────────────────────────────
    final prefs = await SharedPreferences.getInstance();
    final raw   = prefs.getString('mealsetu_user');
    if (raw != null && raw.isNotEmpty) {
      try {
        final user = jsonDecode(raw) as Map<String, dynamic>;
        _applyUserMap(user);
      } catch (_) {}
    }
    if (mounted) setState(() => _isLoading = false);

    // ── Step 2: fetch fresh data from server ──────────────────────────────
    try {
      final response = await _api.get('/users/me');
      final data = response.data as Map<String, dynamic>? ?? {};
      if (data.isNotEmpty && mounted) {
        final updatedRaw = prefs.getString('mealsetu_user');
        Map<String, dynamic> stored = {};
        if (updatedRaw != null) {
          try { stored = jsonDecode(updatedRaw) as Map<String, dynamic>; } catch (_) {}
        }
        stored.addAll({
          'name':       data['name'],
          'phone':      data['phone'],
          'address':    data['address'],
          'pincode':    data['pincode'],
          'gender':     data['gender'],
          'profilePic': data['profilePic'],
        }..removeWhere((_, v) => v == null));
        await prefs.setString('mealsetu_user', jsonEncode(stored));
        if (mounted) setState(() => _applyUserMap(data));
      }
    } catch (_) {
      // No internet / backend down — keep showing cache data.
    }
  }

  /// Fills all form controllers and state variables from a user [map].
  void _applyUserMap(Map<String, dynamic> user) {
    _userId        = user['_id']        as String? ?? _userId;
    _email         = user['email']      as String? ?? _email;
    _gender        = user['gender']     as String? ?? _gender;
    _profilePicUrl = user['profilePic'] as String? ?? _profilePicUrl;

    final name  = user['name']  as String? ?? '';
    final phone = user['phone'] as String? ?? '';
    if (name.isNotEmpty)  _nameCtrl.text  = name;
    if (phone.isNotEmpty) _phoneCtrl.text = phone;

    // Pincode — check top-level and inside address object
    final addr = user['address'];
    if (addr is Map) {
      final a = Map<String, dynamic>.from(addr);
      _flatCtrl.text     = a['flatHouseNo'] as String? ?? '';
      _streetCtrl.text   = a['street']      as String? ?? '';
      _areaCtrl.text     = a['area']        as String? ?? '';
      _landmarkCtrl.text = a['landmark']    as String? ?? '';
      _cityCtrl.text     = a['city']        as String? ?? '';
      final pin = a['pincode'] as String?;
      if (pin != null && pin.isNotEmpty) _pincodeCtrl.text = pin;
      _detectedLat = (a['latitude']  as num?)?.toDouble();
      _detectedLng = (a['longitude'] as num?)?.toDouble();
    } else if (addr is String && addr.isNotEmpty) {
      // Legacy string address — put it in street for editing
      _streetCtrl.text = addr;
    }

    // Top-level pincode fallback (login response)
    final topPin = user['pincode'] as String? ?? '';
    if (topPin.isNotEmpty && _pincodeCtrl.text.isEmpty) {
      _pincodeCtrl.text = topPin;
    }
  }

  // ── GPS detect ────────────────────────────────────────────────────────────

  Future<void> _detectLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      _snack('Please turn on GPS / Location Services');
      return;
    }
    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied) {
        _snack('Location permission denied', isError: true);
        return;
      }
    }
    if (perm == LocationPermission.deniedForever) {
      _snack('Enable location access in phone Settings', isError: true);
      return;
    }

    setState(() => _isDetecting = true);
    try {
      // ignore: deprecated_member_use
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      );
      _detectedLat = pos.latitude;
      _detectedLng = pos.longitude;
      final marks = await placemarkFromCoordinates(pos.latitude, pos.longitude);
      if (marks.isNotEmpty && mounted) {
        final p = marks.first;
        if ((p.street ?? '').isNotEmpty)      _streetCtrl.text  = p.street!;
        if ((p.subLocality ?? p.locality ?? '').isNotEmpty) _areaCtrl.text = p.subLocality ?? p.locality!;
        if ((p.locality ?? '').isNotEmpty)    _cityCtrl.text    = p.locality!;
        if ((p.postalCode ?? '').isNotEmpty)  _pincodeCtrl.text = p.postalCode!;
        setState(() { _locationDetected = true; _isDetecting = false; });
        _snack('Location found. Available address details were filled; complete any missing fields before saving.', isSuccess: true);
      } else {
        setState(() => _isDetecting = false);
        _snack('Location not found. Please fill manually.');
      }
    } catch (e) {
      setState(() => _isDetecting = false);
      _snack('Location error. Try again.', isError: true);
    }
  }

  // ── Change profile picture ────────────────────────────────────────────────

  Future<void> _changePicture() async {
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 10),
              decoration: BoxDecoration(
                color: Colors.grey.shade300,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            ListTile(
              leading: const Icon(Icons.camera_alt_outlined, color: AppColors.primary),
              title: Text('Take Photo',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w500)),
              onTap: () => Navigator.of(ctx).pop(ImageSource.camera),
            ),
            ListTile(
              leading: const Icon(Icons.photo_library_outlined, color: AppColors.primary),
              title: Text('Choose from Gallery',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w500)),
              onTap: () => Navigator.of(ctx).pop(ImageSource.gallery),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );

    if (source == null || !mounted) return;

    final file = await _picker.pickImage(
      source: source, imageQuality: 70, maxWidth: 800,
    );
    if (file == null || !mounted) return;

    setState(() => _isUploading = true);

    try {
      final formData = FormData.fromMap({
        'profilePic': await MultipartFile.fromFile(
          file.path,
          filename: 'profile_${DateTime.now().millisecondsSinceEpoch}.jpg',
        ),
      });

      final response = await _api.putFormData('/users/$_userId/profile-pic', formData);
      final data   = response.data as Map<String, dynamic>? ?? {};
      final newPic = data['profilePic'] as String? ?? '';

      if (newPic.isNotEmpty && mounted) {
        final prefs = await SharedPreferences.getInstance();
        final raw   = prefs.getString('mealsetu_user');
        if (raw != null) {
          try {
            final user = jsonDecode(raw) as Map<String, dynamic>;
            user['profilePic'] = newPic;
            await prefs.setString('mealsetu_user', jsonEncode(user));
          } catch (_) {}
        }
        setState(() {
          _profilePicUrl = newPic;
          _isUploading   = false;
        });
        _snack('Profile picture updated ✓', isSuccess: true);
      } else {
        if (mounted) setState(() => _isUploading = false);
        _snack('Upload succeeded but no URL returned', isError: true);
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() => _isUploading = false);
        _snack(_api.handleError(e), isError: true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isUploading = false);
        _snack('Failed to upload photo. Try again.', isError: true);
      }
    }
  }

  static const _googleApiKey = 'AIzaSyCgJ0v4LEJaPxZUQR20A56GpBeFa8cf3LQ';

  // ── Location search autocomplete (Google Places) ──────────────────────────

  Future<void> _searchLocation(String q) async {
    if (q.length < 3) {
      setState(() => _locationSuggestions = []);
      return;
    }
    setState(() => _isSearchingLocation = true);
    try {
      final uri = Uri.parse(
        'https://maps.googleapis.com/maps/api/place/autocomplete/json'
        '?input=${Uri.encodeComponent(q)}'
        '&key=$_googleApiKey'
        '&components=country:in'
        '&language=en',
      );
      final res = await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200 && mounted) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        setState(() => _locationSuggestions = (data['predictions'] as List<dynamic>? ?? []));
      }
    } catch (_) {
      if (mounted) setState(() => _locationSuggestions = []);
    } finally {
      if (mounted) setState(() => _isSearchingLocation = false);
    }
  }

  void _onLocationSearchChanged(String q) {
    _searchDebounce?.cancel();
    if (q.length < 3) {
      setState(() => _locationSuggestions = []);
      return;
    }
    _searchDebounce = Timer(
      const Duration(milliseconds: 400),
      () => _searchLocation(q),
    );
  }

  Future<void> _selectLocationSuggestion(Map<String, dynamic> s) async {
    final description = s['description'] as String? ?? '';
    final placeId     = s['place_id']    as String? ?? '';
    setState(() {
      _locationSearchCtrl.text = description;
      _locationSuggestions     = [];
      _isSearchingLocation     = true;
    });
    if (placeId.isEmpty) {
      setState(() => _isSearchingLocation = false);
      return;
    }
    try {
      final uri = Uri.parse(
        'https://maps.googleapis.com/maps/api/place/details/json'
        '?place_id=$placeId'
        '&key=$_googleApiKey'
        '&fields=geometry,address_components'
        '&language=en',
      );
      final res = await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200 && mounted) {
        final data   = jsonDecode(res.body) as Map<String, dynamic>;
        final result = (data['result'] as Map<String, dynamic>?) ?? {};
        final comps  = (result['address_components'] as List<dynamic>? ?? [])
            .cast<Map<String, dynamic>>();
        String area = '', city = '', pincode = '';
        for (final c in comps) {
          final types = (c['types'] as List<dynamic>).cast<String>();
          final name  = c['long_name'] as String? ?? '';
          if (types.contains('sublocality_level_1') || types.contains('sublocality')) {
            area = name;
          } else if (types.contains('locality')) {
            city = name;
          } else if (types.contains('postal_code')) {
            pincode = name;
          }
        }
        final geo = (result['geometry'] as Map?)?.cast<String, dynamic>() ?? {};
        final loc = (geo['location']   as Map?)?.cast<String, dynamic>() ?? {};
        setState(() {
          if (area.isNotEmpty)    _areaCtrl.text    = area;
          if (city.isNotEmpty)    _cityCtrl.text    = city;
          if (pincode.isNotEmpty) _pincodeCtrl.text = pincode;
          _detectedLat         = (loc['lat'] as num?)?.toDouble();
          _detectedLng         = (loc['lng'] as num?)?.toDouble();
          _locationSuggestions = [];
        });
      }
    } catch (_) {}
    if (mounted) setState(() => _isSearchingLocation = false);
  }

  // ── Fallback geocode (typed address → lat/lng via Google Geocoding) ───────

  Future<void> _geocodeFallback() async {
    final q = [
      _areaCtrl.text.trim(),
      _cityCtrl.text.trim(),
      _pincodeCtrl.text.trim(),
    ].where((s) => s.isNotEmpty).join(', ');
    if (q.length < 4) return;
    try {
      final uri = Uri.parse(
        'https://maps.googleapis.com/maps/api/geocode/json'
        '?address=${Uri.encodeComponent(q)}'
        '&key=$_googleApiKey'
        '&region=in&language=en',
      );
      final res = await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200) {
        final data    = jsonDecode(res.body) as Map<String, dynamic>;
        final results = (data['results'] as List<dynamic>? ?? []);
        if (results.isNotEmpty) {
          final loc = ((results[0] as Map)['geometry'] as Map)['location'] as Map;
          _detectedLat = (loc['lat'] as num?)?.toDouble();
          _detectedLng = (loc['lng'] as num?)?.toDouble();
        }
      }
    } catch (_) {}
  }

  // ── Save text fields ──────────────────────────────────────────────────────

  Future<void> _saveChanges() async {
    if (!_formKey.currentState!.validate()) return;
    if (_userId.isEmpty) {
      _snack('User ID not found. Please log out and log in again.', isError: true);
      return;
    }

    // If user typed address without GPS, try to geocode it silently
    if (_detectedLat == null) await _geocodeFallback();

    setState(() => _isSaving = true);

    try {
      final pin = _pincodeCtrl.text.trim();
      final addressObj = <String, dynamic>{
        'flatHouseNo': _flatCtrl.text.trim(),
        'street':      _streetCtrl.text.trim(),
        'area':        _areaCtrl.text.trim(),
        'landmark':    _landmarkCtrl.text.trim(),
        'city':        _cityCtrl.text.trim(),
        'pincode':     pin,
        'fullAddress': [
          _flatCtrl.text.trim(),
          _streetCtrl.text.trim(),
          _areaCtrl.text.trim(),
          _landmarkCtrl.text.trim(),
          _cityCtrl.text.trim(),
          pin,
        ].where((s) => s.isNotEmpty).join(', '),
      };
      // Only include GPS coords if user actively used Detect Location this session.
      // If they only typed the address (or didn't change it), omit lat/lng so the
      // backend re-geocodes from the address text — prevents stale coords being saved.
      if (_locationDetected && _detectedLat != null) {
        addressObj['latitude']  = _detectedLat;
        addressObj['longitude'] = _detectedLng;
      }

      await _api.put('/users/$_userId', {
        'name':    _nameCtrl.text.trim(),
        'phone':   _phoneCtrl.text.trim(),
        'address': addressObj,
        'pincode': pin,
        'gender':  _gender,
      });

      // Persist to SharedPreferences
      final prefs = await SharedPreferences.getInstance();
      final raw   = prefs.getString('mealsetu_user');
      Map<String, dynamic> user = {};
      if (raw != null) {
        try { user = jsonDecode(raw) as Map<String, dynamic>; } catch (_) {}
      }
      user['name']    = _nameCtrl.text.trim();
      user['phone']   = _phoneCtrl.text.trim();
      user['address'] = addressObj;
      user['pincode'] = pin;
      user['gender']  = _gender;
      // Keep top-level lat/lon in sync so home_screen distance calc is accurate
      if (_detectedLat != null) {
        user['latitude']  = _detectedLat;
        user['longitude'] = _detectedLng;
        // Clear the GPS-cache override so home screen uses the updated profile coords
        await prefs.remove('mealsetu_user_lat');
        await prefs.remove('mealsetu_user_lon');
      }
      await prefs.setString('mealsetu_user', jsonEncode(user));

      // Let AuthProvider know the stored profile changed.
      if (mounted) {
        final authProvider = context.read<AuthProvider>();
        final messenger    = ScaffoldMessenger.of(context);
        final nav          = Navigator.of(context);
        setState(() => _isSaving = false);
        await authProvider.reloadUser();
        messenger.showSnackBar(SnackBar(
          content: Text(
            'Profile updated successfully ✓',
            style: GoogleFonts.poppins(color: Colors.white),
          ),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ));
        nav.pop();
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() => _isSaving = false);
        _snack(_api.handleError(e), isError: true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isSaving = false);
        _snack('Failed to save. Try again.', isError: true);
      }
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  void _snack(String msg, {bool isError = false, bool isSuccess = false}) {
    if (!mounted) return;
    final bg = isError
        ? Colors.red.shade600
        : isSuccess
            ? AppColors.success
            : Colors.grey.shade800;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg,
            style: GoogleFonts.poppins(color: Colors.white, fontSize: 13)),
        backgroundColor: bg,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 4),
      ));
  }

  InputDecoration _fieldDeco({
    required String label,
    String? hint,
    Widget? suffix,
    bool readOnly = false,
  }) {
    final cs = Theme.of(context).colorScheme;
    return InputDecoration(
      labelText:  label,
      hintText:   hint,
      hintStyle:  GoogleFonts.poppins(color: cs.onSurfaceVariant, fontSize: 14),
      labelStyle: GoogleFonts.poppins(
        color:    readOnly ? cs.onSurfaceVariant : cs.onSurface,
        fontSize: 14,
      ),
      suffixIcon:     suffix,
      filled:         readOnly,
      fillColor:      readOnly ? cs.surfaceContainerHighest : null,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: cs.outlineVariant),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: cs.outlineVariant),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.8),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.red.shade400),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: Colors.red.shade400, width: 1.8),
      ),
      disabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: BorderSide(color: cs.outlineVariant),
      ),
    );
  }

  Widget _locationSearchField() => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Text(
        'Search Area / Locality',
        style: GoogleFonts.poppins(fontSize: 13, fontWeight: FontWeight.w500,
            color: Theme.of(context).colorScheme.onSurface),
      ),
      const SizedBox(height: 6),
      TextFormField(
        controller: _locationSearchCtrl,
        onChanged:  _onLocationSearchChanged,
        style: GoogleFonts.poppins(
            color: Theme.of(context).colorScheme.onSurface, fontSize: 14),
        decoration: _fieldDeco(
          label: '',
          hint:  'Type area, e.g. Koramangala, Bengaluru…',
          suffix: _isSearchingLocation
              ? const Padding(
                  padding: EdgeInsets.all(12),
                  child: SizedBox(
                    width: 16, height: 16,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.primary),
                  ),
                )
              : const Icon(Icons.search, color: AppColors.primary, size: 20),
        ),
      ),
      if (_locationSuggestions.isNotEmpty)
        Container(
          margin: const EdgeInsets.only(top: 4),
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
                color: Theme.of(context).colorScheme.outlineVariant),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withAlpha(20),
                blurRadius: 8,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: _locationSuggestions.length,
            separatorBuilder: (context, index) =>
                Divider(height: 1, color: Colors.grey.shade100),
            itemBuilder: (context, i) {
              final s  = _locationSuggestions[i] as Map<String, dynamic>;
              final sf = (s['structured_formatting'] as Map?)?.cast<String, dynamic>() ?? {};
              final title = (sf['main_text']      as String?) ?? (s['description'] as String? ?? '').split(',').first.trim();
              final sub   = (sf['secondary_text'] as String?) ?? '';
              return InkWell(
                onTap: () => _selectLocationSuggestion(s),
                borderRadius: BorderRadius.only(
                  topLeft:  Radius.circular(i == 0 ? 12 : 0),
                  topRight: Radius.circular(i == 0 ? 12 : 0),
                  bottomLeft:  Radius.circular(i == _locationSuggestions.length - 1 ? 12 : 0),
                  bottomRight: Radius.circular(i == _locationSuggestions.length - 1 ? 12 : 0),
                ),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 10),
                  child: Row(
                    children: [
                      Icon(Icons.location_on,
                          color: AppColors.primary, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(title,
                                style: GoogleFonts.poppins(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: Theme.of(context)
                                        .colorScheme
                                        .onSurface)),
                            if (sub.isNotEmpty)
                              Text(sub,
                                  style: GoogleFonts.poppins(
                                      fontSize: 11,
                                      color: Theme.of(context)
                                          .colorScheme
                                          .onSurfaceVariant)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          ),
        ),
      const SizedBox(height: 16),
    ],
  );

  Widget _addressSectionHeader() => Padding(
    padding: const EdgeInsets.only(bottom: 14),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Delivery Address',
          style: GoogleFonts.poppins(
            fontSize:   15,
            fontWeight: FontWeight.w600,
            color:      Theme.of(context).colorScheme.onSurface,
          ),
        ),
        const SizedBox(height: 4),
        Container(
          width: 48, height: 3,
          decoration: BoxDecoration(
            color: AppColors.primary,
            borderRadius: BorderRadius.circular(2),
          ),
        ),
      ],
    ),
  );

  Widget _gpsDetectRow() => Container(
    margin: const EdgeInsets.only(bottom: 16),
    padding: const EdgeInsets.all(14),
    decoration: BoxDecoration(
      color:        AppColors.primary.withAlpha(15),
      borderRadius: BorderRadius.circular(12),
      border:       Border.all(color: AppColors.primary.withAlpha(60)),
    ),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color:        AppColors.primary.withAlpha(30),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.gps_fixed, color: AppColors.primary, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                'Auto-detect my location',
                style: GoogleFonts.poppins(
                  fontSize: 13, fontWeight: FontWeight.w600, height: 1.2,
                  color: const Color(0xFF1A1A2E),
                ),
              ),
              const SizedBox(height: 2),
              Text(
                _locationDetected ? '✅ Location saved' : 'Fills address fields automatically',
                style: GoogleFonts.poppins(
                  fontSize: 11, height: 1.2,
                  color: _locationDetected ? const Color(0xFF16A34A) : const Color(0xFF94A3B8),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(width: 8),
        _isDetecting
            ? const SizedBox(
                width: 20, height: 20,
                child: CircularProgressIndicator(color: Color(0xFFF26522), strokeWidth: 2.5),
              )
            : SizedBox(
                height: 36,
                child: ElevatedButton(
                  onPressed: _detectLocation,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    elevation: 0,
                  ),
                  child: const Text('Detect', style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
                ),
              ),
      ],
    ),
  );

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return Scaffold(
        appBar: AppBar(title: const Text('Edit Profile')),
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(
          'Edit Profile',
          style: GoogleFonts.poppins(fontWeight: FontWeight.w700, fontSize: 18),
        ),
        elevation: 0,
        actions: [
          TextButton(
            onPressed: (_isSaving || _isUploading) ? null : _saveChanges,
            child: Text(
              'Save',
              style: GoogleFonts.poppins(
                color: (_isSaving || _isUploading)
                    ? Theme.of(context).colorScheme.onSurfaceVariant
                    : AppColors.primary,
                fontWeight: FontWeight.w600,
                fontSize:   15,
              ),
            ),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // ── Profile picture ──────────────────────────────────────────
              _buildAvatar(),
              const SizedBox(height: 28),

              // ── Full name ────────────────────────────────────────────────
              TextFormField(
                controller:         _nameCtrl,
                keyboardType:       TextInputType.name,
                textCapitalization: TextCapitalization.words,
                textInputAction:    TextInputAction.next,
                style: GoogleFonts.poppins(
                    color: Theme.of(context).colorScheme.onSurface, fontSize: 14),
                decoration: _fieldDeco(label: 'Full Name *'),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Name is required';
                  return null;
                },
              ),
              const SizedBox(height: 16),

              // ── Email (read-only) ────────────────────────────────────────
              TextFormField(
                initialValue: _email,
                readOnly:     true,
                style: GoogleFonts.poppins(
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontSize: 14),
                decoration: _fieldDeco(label: 'Email', readOnly: true),
              ),
              const SizedBox(height: 16),

              // ── Phone ────────────────────────────────────────────────────
              TextFormField(
                controller:      _phoneCtrl,
                keyboardType:    TextInputType.phone,
                textInputAction: TextInputAction.next,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(10),
                ],
                style: GoogleFonts.poppins(
                    color: Theme.of(context).colorScheme.onSurface, fontSize: 14),
                decoration: _fieldDeco(label: 'Phone Number *'),
                validator: (v) {
                  final t = v?.trim() ?? '';
                  if (t.isEmpty) return 'Phone number is required';
                  if (t.length != 10) return 'Enter valid 10-digit phone number';
                  return null;
                },
              ),
              const SizedBox(height: 24),

              // ── Address section ──────────────────────────────────────────
              _addressSectionHeader(),
              _gpsDetectRow(),
              _locationSearchField(),

              // Flat / House No
              TextFormField(
                controller:      _flatCtrl,
                keyboardType:    TextInputType.streetAddress,
                textInputAction: TextInputAction.next,
                style: GoogleFonts.poppins(
                    color: Theme.of(context).colorScheme.onSurface, fontSize: 14),
                decoration: _fieldDeco(
                  label: 'Flat / House No',
                  hint:  'e.g. 101, Block B',
                ),
              ),
              const SizedBox(height: 14),

              // Street
              TextFormField(
                controller:      _streetCtrl,
                keyboardType:    TextInputType.streetAddress,
                textInputAction: TextInputAction.next,
                style: GoogleFonts.poppins(
                    color: Theme.of(context).colorScheme.onSurface, fontSize: 14),
                decoration: _fieldDeco(
                  label: 'Street / Road',
                  hint:  'e.g. MG Road',
                ),
              ),
              const SizedBox(height: 14),

              // Area
              TextFormField(
                controller:      _areaCtrl,
                keyboardType:    TextInputType.streetAddress,
                textInputAction: TextInputAction.next,
                style: GoogleFonts.poppins(
                    color: Theme.of(context).colorScheme.onSurface, fontSize: 14),
                decoration: _fieldDeco(
                  label: 'Area / Locality *',
                  hint:  'e.g. Koramangala',
                ),
                validator: (v) {
                  if (v == null || v.trim().isEmpty) return 'Area is required';
                  return null;
                },
              ),
              const SizedBox(height: 14),

              // Landmark
              TextFormField(
                controller:      _landmarkCtrl,
                keyboardType:    TextInputType.streetAddress,
                textInputAction: TextInputAction.next,
                style: GoogleFonts.poppins(
                    color: Theme.of(context).colorScheme.onSurface, fontSize: 14),
                decoration: _fieldDeco(
                  label: 'Landmark (optional)',
                  hint:  'e.g. Near City Mall',
                ),
              ),
              const SizedBox(height: 14),

              // City + Pincode (2 columns)
              Row(
                children: [
                  Expanded(
                    flex: 3,
                    child: TextFormField(
                      controller:      _cityCtrl,
                      keyboardType:    TextInputType.text,
                      textInputAction: TextInputAction.next,
                      style: GoogleFonts.poppins(
                          color: Theme.of(context).colorScheme.onSurface,
                          fontSize: 14),
                      decoration: _fieldDeco(
                        label: 'City *',
                        hint:  'e.g. Bengaluru',
                      ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'City is required';
                        return null;
                      },
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    flex: 2,
                    child: TextFormField(
                      controller:      _pincodeCtrl,
                      keyboardType:    TextInputType.number,
                      textInputAction: TextInputAction.done,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(6),
                      ],
                      style: GoogleFonts.poppins(
                          color: Theme.of(context).colorScheme.onSurface,
                          fontSize: 14),
                      decoration: _fieldDeco(label: 'Pincode *'),
                      validator: (v) {
                        final t = v?.trim() ?? '';
                        if (t.isEmpty) return 'Required';
                        if (t.length != 6) return 'Enter 6 digits';
                        return null;
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // ── Gender ───────────────────────────────────────────────────
              _buildGenderSelector(),
              const SizedBox(height: 32),

              // ── Save button ──────────────────────────────────────────────
              SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: (_isSaving || _isUploading) ? null : _saveChanges,
                  style: ElevatedButton.styleFrom(
                    backgroundColor:         AppColors.primary,
                    foregroundColor:         Colors.white,
                    disabledBackgroundColor: AppColors.primary.withAlpha(153),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                  child: _isSaving
                      ? const SizedBox(
                          width: 22, height: 22,
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2.5),
                        )
                      : Text(
                          'Save Changes',
                          style: GoogleFonts.poppins(
                            fontSize: 16, fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  // ── Avatar widget ─────────────────────────────────────────────────────────

  Widget _buildAvatar() {
    return Center(
      child: Column(
        children: [
          GestureDetector(
            onTap: _isUploading ? null : _changePicture,
            child: Stack(
              alignment: Alignment.bottomRight,
              children: [
                CircleAvatar(
                  radius: 52,
                  backgroundColor: Colors.grey.shade200,
                  child: _isUploading
                      ? const SizedBox(
                          width: 32, height: 32,
                          child: CircularProgressIndicator(
                              color: AppColors.primary, strokeWidth: 3),
                        )
                      : ClipOval(
                          child: _profilePicUrl.isNotEmpty
                              ? CachedNetworkImage(
                                  imageUrl: _profilePicUrl,
                                  width:    104,
                                  height:   104,
                                  fit:      BoxFit.cover,
                                  errorWidget: (ctx, url, err) => _defaultAvatar(),
                                )
                              : _defaultAvatar(),
                        ),
                ),
                Container(
                  width: 30, height: 30,
                  decoration: const BoxDecoration(
                    color: AppColors.primary, shape: BoxShape.circle,
                  ),
                  child: const Icon(Icons.camera_alt, color: Colors.white, size: 16),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          Text(
            'Tap to change photo',
            style: GoogleFonts.poppins(
              fontSize: 12,
              color:    Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  Widget _defaultAvatar() => Icon(
    Icons.person, size: 64, color: Colors.grey.shade400,
  );

  // ── Gender selector ───────────────────────────────────────────────────────

  Widget _buildGenderSelector() {
    const genders = ['male', 'female', 'other'];
    const labels  = ['Male', 'Female', 'Other'];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Gender (optional)',
          style: GoogleFonts.poppins(
            fontSize:   14,
            color:      Theme.of(context).colorScheme.onSurface,
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 8),
        Row(
          children: List.generate(genders.length, (i) {
            final selected = _gender == genders[i];
            return Expanded(
              child: GestureDetector(
                onTap: () => setState(() => _gender = genders[i]),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  margin:  EdgeInsets.only(right: i < genders.length - 1 ? 8 : 0),
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  decoration: BoxDecoration(
                    color: selected ? AppColors.primary : Colors.transparent,
                    border: Border.all(
                      color: selected
                          ? AppColors.primary
                          : Theme.of(context).colorScheme.outlineVariant,
                      width: 1.5,
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    labels[i],
                    textAlign: TextAlign.center,
                    style: GoogleFonts.poppins(
                      fontSize:   13,
                      fontWeight: FontWeight.w500,
                      color: selected
                          ? Colors.white
                          : Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ),
              ),
            );
          }),
        ),
      ],
    );
  }
}
