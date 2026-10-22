import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';

import '../../constants/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';

class RegisterScreen extends StatefulWidget {
  const RegisterScreen({super.key});

  @override
  State<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends State<RegisterScreen> {
  final _formKey = GlobalKey<FormState>();

  // Personal info
  final _nameController     = TextEditingController();
  final _emailController    = TextEditingController();
  final _phoneController    = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmController  = TextEditingController();

  // Structured address
  final _flatController     = TextEditingController();
  final _streetController   = TextEditingController();
  final _areaController     = TextEditingController();
  final _landmarkController = TextEditingController();
  final _cityController     = TextEditingController();
  final _pincodeController  = TextEditingController();

  bool _obscurePassword     = true;
  bool _obscureConfirm      = true;
  double? _detectedLat;
  double? _detectedLng;
  bool _locationDetected    = false;
  bool _isDetectingLocation = false;
  String _detectedArea      = '';

  // Location search autocomplete
  final _locationSearchCtrl      = TextEditingController();
  List<dynamic> _locationSuggestions = [];
  bool _isSearchingLocation      = false;
  Timer? _searchDebounce;

  // Dark mode helper — valid to call during build / helper widgets
  bool get _isDark =>
      Theme.of(context).brightness == Brightness.dark;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmController.dispose();
    _flatController.dispose();
    _streetController.dispose();
    _areaController.dispose();
    _landmarkController.dispose();
    _cityController.dispose();
    _pincodeController.dispose();
    _locationSearchCtrl.dispose();
    _searchDebounce?.cancel();
    super.dispose();
  }

  // ── GPS detect ────────────────────────────────────────────────────────────

  Future<void> _detectLocation() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      _showSnack('Please turn on GPS / Location Services', color: Colors.orange);
      return;
    }
    LocationPermission perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
      if (perm == LocationPermission.denied) {
        _showSnack('Location permission denied', color: Colors.red.shade600);
        return;
      }
    }
    if (perm == LocationPermission.deniedForever) {
      _showSnack('Enable location access in phone Settings', color: Colors.red.shade600);
      return;
    }

    setState(() => _isDetectingLocation = true);
    try {
      // ignore: deprecated_member_use
      final pos = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 15),
      );
      _detectedLat = pos.latitude;
      _detectedLng = pos.longitude;
      final geoUri = Uri.parse(
        '${ApiService().baseUrl}/maps/geocode/reverse'
        '?lat=${pos.latitude}&lng=${pos.longitude}',
      );
      final geoRes = await http.get(geoUri).timeout(const Duration(seconds: 8));
      if (geoRes.statusCode == 200 && mounted) {
        final geoData = jsonDecode(geoRes.body) as Map<String, dynamic>;
        final results = (geoData['results'] as List<dynamic>? ?? []);
        if (results.isNotEmpty) {
          final comps = ((results[0] as Map)['address_components'] as List<dynamic>? ?? [])
              .cast<Map<String, dynamic>>();
          String street = '', area = '', city = '', pincode = '';
          for (final c in comps) {
            final types = (c['types'] as List<dynamic>).cast<String>();
            final name  = c['long_name'] as String? ?? '';
            if (types.contains('route') || types.contains('premise')) {
              street = name;
            } else if (types.contains('sublocality_level_1') || types.contains('sublocality')) {
              area = name;
            } else if (types.contains('locality')) {
              city = name;
            } else if (types.contains('postal_code')) {
              pincode = name;
            }
          }
          if (area.isEmpty) area = city;
          if (street.isNotEmpty)  _streetController.text  = street;
          if (area.isNotEmpty)    _areaController.text    = area;
          if (city.isNotEmpty)    _cityController.text    = city;
          if (pincode.isNotEmpty) _pincodeController.text = pincode;
          _detectedArea = _areaController.text;
          setState(() { _locationDetected = true; _isDetectingLocation = false; });
          _showSnack('Location found. Available address details were filled; complete any missing fields before continuing.', color: Colors.green.shade700);
        } else {
          setState(() => _isDetectingLocation = false);
          _showSnack('Location not found. Please fill manually.', color: Colors.orange);
        }
      } else {
        setState(() => _isDetectingLocation = false);
        _showSnack('Location not found. Please fill manually.', color: Colors.orange);
      }
    } catch (e) {
      setState(() => _isDetectingLocation = false);
      _showSnack('Location error. Try again.', color: Colors.red.shade600);
    }
  }

  // ── Location search autocomplete ──────────────────────────────────────────

  Future<void> _searchLocation(String q) async {
    if (q.length < 3) {
      setState(() => _locationSuggestions = []);
      return;
    }
    setState(() => _isSearchingLocation = true);
    try {
      final uri = Uri.parse(
        '${ApiService().baseUrl}/maps/places/autocomplete'
        '?input=${Uri.encodeComponent(q)}',
      );
      final res = await http.get(uri).timeout(const Duration(seconds: 8));
      if (res.statusCode == 200 && mounted) {
        final data = jsonDecode(res.body) as Map<String, dynamic>;
        final predictions = (data['predictions'] as List<dynamic>? ?? []);
        setState(() => _locationSuggestions = predictions);
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
        '${ApiService().baseUrl}/maps/places/details'
        '?place_id=${Uri.encodeComponent(placeId)}',
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
          if (types.contains('sublocality_level_1') || types.contains('sublocality'))    { area    = name; }
          else if (types.contains('locality'))                                          { city    = name; }
          else if (types.contains('postal_code'))                                       { pincode = name; }
        }
        final geo = (result['geometry'] as Map?)?.cast<String, dynamic>() ?? {};
        final loc = (geo['location']   as Map?)?.cast<String, dynamic>() ?? {};
        final lat = (loc['lat'] as num?)?.toDouble();
        final lng = (loc['lng'] as num?)?.toDouble();
        setState(() {
          if (area.isNotEmpty)    _areaController.text    = area;
          if (city.isNotEmpty)    _cityController.text    = city;
          if (pincode.isNotEmpty) _pincodeController.text = pincode;
          _detectedLat      = lat;
          _detectedLng      = lng;
          _locationDetected = lat != null;
          _detectedArea     = area.isNotEmpty ? area : city;
        });
      }
    } catch (_) {}
    if (mounted) setState(() => _isSearchingLocation = false);
  }

  // ── Fallback geocode (typed address → lat/lng via Google Geocoding) ───────

  Future<void> _geocodeFallback() async {
    final q = [
      _areaController.text.trim(),
      _cityController.text.trim(),
      _pincodeController.text.trim(),
    ].where((s) => s.isNotEmpty).join(', ');
    if (q.length < 4) return;
    try {
      final uri = Uri.parse(
        '${ApiService().baseUrl}/maps/geocode'
        '?address=${Uri.encodeComponent(q)}',
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

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    final auth = context.read<AuthProvider>();

    if (_detectedLat == null) await _geocodeFallback();
    final success = await auth.register(
      name:        _nameController.text.trim(),
      email:       _emailController.text.trim(),
      phone:       _phoneController.text.trim(),
      password:    _passwordController.text,
      flatHouseNo: _flatController.text.trim(),
      street:      _streetController.text.trim(),
      area:        _areaController.text.trim(),
      landmark:    _landmarkController.text.trim(),
      city:        _cityController.text.trim(),
      pinCode:     _pincodeController.text.trim(),
      latitude:    _detectedLat,
      longitude:   _detectedLng,
    );

    if (!mounted) return;

    if (success) {
      context.push('/verify-otp', extra: {
        'userId':      auth.pendingUserId      ?? '',
        'maskedEmail': auth.pendingMaskedEmail ?? '',
      });
    } else {
      ScaffoldMessenger.of(context)
        ..hideCurrentSnackBar()
        ..showSnackBar(_buildSnackBar(
          auth.errorMessage ?? 'Registration failed. Please try again.',
          color: Colors.red.shade600,
        ));
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isLoading = context.select<AuthProvider, bool>((a) => a.isLoading);

    final textDark = _isDark ? const Color(0xFFF1F5F9) : const Color(0xFF1A1A2E);

    return Scaffold(
      backgroundColor: _isDark ? const Color(0xFF0F0F1A) : Colors.white,
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [

                // ── Compact header ───────────────────────────────────────────
                Row(
                  children: [
                    GestureDetector(
                      onTap: () => context.go('/login'),
                      child: Container(
                        width: 40, height: 40,
                        decoration: BoxDecoration(
                          color: const Color(0xFFF26522)
                              .withValues(alpha: _isDark ? 0.20 : 0.10),
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(
                          Icons.arrow_back_ios_new,
                          color: Color(0xFFF26522),
                          size: 16,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Create Account',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                            color: textDark,
                          ),
                        ),
                        const Text(
                          'Join MealSetu today',
                          style: TextStyle(
                              fontSize: 12, color: Color(0xFF94A3B8)),
                        ),
                      ],
                    ),
                  ],
                ),

                const SizedBox(height: 20),

                // Orange accent bar
                Container(
                  height: 3,
                  width: 48,
                  decoration: BoxDecoration(
                    color: const Color(0xFFF26522),
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),

                const SizedBox(height: 24),

                // ── Personal info fields ─────────────────────────────────────
                _label('Full Name'),
                TextFormField(
                  controller: _nameController,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.words,
                  style: GoogleFonts.poppins(color: textDark),
                  decoration: _inputDeco(hint: 'Enter your full name'),
                  validator: (v) =>
                      (v?.trim() ?? '').isEmpty ? 'Full name is required' : null,
                ),
                const SizedBox(height: 16),

                _label('Email'),
                TextFormField(
                  controller: _emailController,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.next,
                  autocorrect: false,
                  style: GoogleFonts.poppins(color: textDark),
                  decoration: _inputDeco(hint: 'Enter your email address'),
                  validator: (value) {
                    final t = value?.trim() ?? '';
                    if (t.isEmpty) return 'Email is required';
                    if (!RegExp(
                            r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
                        .hasMatch(t)) {
                      return 'Enter a valid email address';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                _label('Phone Number'),
                TextFormField(
                  controller: _phoneController,
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.next,
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(10),
                  ],
                  style: GoogleFonts.poppins(color: textDark),
                  decoration: _inputDeco(hint: '10-digit mobile number'),
                  validator: (value) {
                    final t = value?.trim() ?? '';
                    if (t.isEmpty) return 'Phone number is required';
                    if (t.length != 10) {
                      return 'Phone number must be exactly 10 digits';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 16),

                _label('Password'),
                TextFormField(
                  controller: _passwordController,
                  obscureText: _obscurePassword,
                  textInputAction: TextInputAction.next,
                  style: GoogleFonts.poppins(color: textDark),
                  decoration: _inputDeco(
                    hint: 'Min 8 chars',
                    suffix: _eyeIcon(
                      obscure: _obscurePassword,
                      onTap: () =>
                          setState(() => _obscurePassword = !_obscurePassword),
                    ),
                  ),
                  validator: _passwordValidator,
                ),
                const SizedBox(height: 6),
                Padding(
                  padding: const EdgeInsets.only(left: 2),
                  child: Text(
                    'Min 8 chars · Uppercase · Lowercase · Number · Special (@#!%^&*()-_)',
                    style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: const Color(0xFF94A3B8),
                        height: 1.5),
                  ),
                ),
                const SizedBox(height: 14),

                _label('Confirm Password'),
                TextFormField(
                  controller: _confirmController,
                  obscureText: _obscureConfirm,
                  textInputAction: TextInputAction.next,
                  style: GoogleFonts.poppins(color: textDark),
                  decoration: _inputDeco(
                    hint: 'Re-enter your password',
                    suffix: _eyeIcon(
                      obscure: _obscureConfirm,
                      onTap: () =>
                          setState(() => _obscureConfirm = !_obscureConfirm),
                    ),
                  ),
                  validator: (value) {
                    if (value == null || value.isEmpty) {
                      return 'Please confirm your password';
                    }
                    if (value != _passwordController.text) {
                      return 'Passwords do not match';
                    }
                    return null;
                  },
                ),

                const SizedBox(height: 28),

                // ── Delivery address ─────────────────────────────────────────
                _addressSectionHeader(),
                const SizedBox(height: 16),
                _locationSearchField(textDark),

                _label('Flat / House No, Building Name *'),
                TextFormField(
                  controller: _flatController,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.sentences,
                  style: GoogleFonts.poppins(color: textDark),
                  decoration: _inputDeco(
                    hint: 'e.g. Flat 302, Sunshine Apartments',
                    prefix: Icon(Icons.home_outlined,
                        color: AppColors.primary, size: 20),
                  ),
                  validator: (v) => (v?.trim() ?? '').isEmpty
                      ? 'Flat / House No is required'
                      : null,
                ),
                const SizedBox(height: 14),

                _label('Street / Road *'),
                TextFormField(
                  controller: _streetController,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.sentences,
                  style: GoogleFonts.poppins(color: textDark),
                  decoration: _inputDeco(
                    hint: 'e.g. MG Road, SG Highway',
                    prefix: Icon(Icons.route_outlined,
                        color: AppColors.primary, size: 20),
                  ),
                  validator: (v) => (v?.trim() ?? '').isEmpty
                      ? 'Street / Road is required'
                      : null,
                ),
                const SizedBox(height: 14),

                // Area + Pincode row
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _label('Area / Locality *'),
                          TextFormField(
                            controller: _areaController,
                            textInputAction: TextInputAction.next,
                            textCapitalization: TextCapitalization.sentences,
                            style: GoogleFonts.poppins(
                                color: textDark, fontSize: 14),
                            decoration: _inputDeco(hint: 'e.g. Satellite'),
                            validator: (v) => (v?.trim() ?? '').isEmpty
                                ? 'Area is required'
                                : null,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _label('Pincode *'),
                          TextFormField(
                            controller: _pincodeController,
                            keyboardType: TextInputType.number,
                            textInputAction: TextInputAction.next,
                            inputFormatters: [
                              FilteringTextInputFormatter.digitsOnly,
                              LengthLimitingTextInputFormatter(6),
                            ],
                            style: GoogleFonts.poppins(
                                color: textDark, fontSize: 14),
                            decoration: _inputDeco(hint: '380015'),
                            validator: (v) {
                              final t = v?.trim() ?? '';
                              if (t.isEmpty) return 'Required';
                              if (t.length != 6) return 'Must be 6 digits';
                              return null;
                            },
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 14),

                _label('Landmark (Optional)'),
                TextFormField(
                  controller: _landmarkController,
                  textInputAction: TextInputAction.next,
                  textCapitalization: TextCapitalization.sentences,
                  style: GoogleFonts.poppins(color: textDark),
                  decoration: _inputDeco(
                    hint: 'e.g. Near Big Bazaar, Opp. Park',
                    prefix: Icon(Icons.place_outlined,
                        color: AppColors.primary, size: 20),
                  ),
                ),
                const SizedBox(height: 14),

                _label('City *'),
                TextFormField(
                  controller: _cityController,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  textCapitalization: TextCapitalization.words,
                  style: GoogleFonts.poppins(color: textDark),
                  decoration: _inputDeco(
                    hint: 'e.g. Ahmedabad',
                    prefix: Icon(Icons.location_city_outlined,
                        color: AppColors.primary, size: 20),
                  ),
                  validator: (v) =>
                      (v?.trim() ?? '').isEmpty ? 'City is required' : null,
                ),
                const SizedBox(height: 14),

                _gpsDetectRow(),
                const SizedBox(height: 28),

                // ── Register button ──────────────────────────────────────────
                Container(
                  height: 52,
                  decoration: BoxDecoration(
                    gradient: isLoading
                        ? null
                        : const LinearGradient(
                            colors: [Color(0xFFF26522), Color(0xFFFF8C42)],
                          ),
                    color: isLoading
                        ? const Color(0xFFF26522).withValues(alpha: 0.50)
                        : null,
                    borderRadius: BorderRadius.circular(14),
                    boxShadow: isLoading
                        ? []
                        : [
                            BoxShadow(
                              color: const Color(0xFFF26522).withValues(alpha: 0.35),
                              blurRadius: 16,
                              offset: const Offset(0, 6),
                            ),
                          ],
                  ),
                  child: ElevatedButton(
                    onPressed: isLoading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.transparent,
                      shadowColor: Colors.transparent,
                      disabledBackgroundColor: Colors.transparent,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14)),
                      elevation: 0,
                    ),
                    child: isLoading
                        ? const SizedBox(
                            width: 22, height: 22,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2.5),
                          )
                        : Text(
                            'Create Account',
                            style: GoogleFonts.poppins(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: Colors.white,
                            ),
                          ),
                  ),
                ),

                const SizedBox(height: 14),

                // ── Login link ───────────────────────────────────────────────
                Center(
                  child: TextButton(
                    onPressed: isLoading ? null : () => context.go('/login'),
                    child: RichText(
                      text: TextSpan(
                        style: GoogleFonts.poppins(fontSize: 14),
                        children: [
                          TextSpan(
                            text: 'Already have an account? ',
                            style: TextStyle(
                              color: _isDark
                                  ? const Color(0xFF94A3B8)
                                  : const Color(0xFF6B7280),
                            ),
                          ),
                          const TextSpan(
                            text: 'Login',
                            style: TextStyle(
                              color: Color(0xFFF26522),
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Address section header ────────────────────────────────────────────────

  Widget _addressSectionHeader() => Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: const Color(0xFFF26522).withValues(
              alpha: _isDark ? 0.15 : 0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: const Color(0xFFF26522).withValues(alpha: 0.20)),
        ),
        child: Row(
          children: [
            const Icon(Icons.home_work_outlined,
                color: Color(0xFFF26522), size: 20),
            const SizedBox(width: 10),
            Text(
              'Delivery Address',
              style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: _isDark
                    ? const Color(0xFFF1F5F9)
                    : const Color(0xFF1A1A2E),
              ),
            ),
            const Spacer(),
            const Text(
              'Where to deliver?',
              style: TextStyle(fontSize: 11, color: Color(0xFF94A3B8)),
            ),
          ],
        ),
      );

  // ── Location search field ─────────────────────────────────────────────────

  Widget _locationSearchField(Color textDark) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _label('Search Area / Locality'),
          TextFormField(
            controller: _locationSearchCtrl,
            onChanged:  _onLocationSearchChanged,
            style: GoogleFonts.poppins(color: textDark),
            decoration: _inputDeco(
              hint: 'Type area, e.g. Koramangala, Bengaluru…',
              prefix: const Icon(Icons.search,
                  color: Color(0xFFF26522), size: 20),
              suffix: _isSearchingLocation
                  ? const Padding(
                      padding: EdgeInsets.all(12),
                      child: SizedBox(
                        width: 16, height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Color(0xFFF26522)),
                      ),
                    )
                  : null,
            ),
          ),
          if (_locationSuggestions.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(top: 4),
              decoration: BoxDecoration(
                color: _isDark ? const Color(0xFF1A1A2E) : Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: _isDark
                      ? const Color(0xFF3D3D55)
                      : const Color(0xFFE2E8F0),
                ),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withAlpha(_isDark ? 50 : 18),
                    blurRadius: 14,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: ListView.separated(
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                itemCount: _locationSuggestions.length,
                separatorBuilder: (_, _) => Divider(
                  height: 1,
                  color: _isDark
                      ? const Color(0xFF2A2A3E)
                      : Colors.grey.shade100,
                ),
                itemBuilder: (_, i) {
                  final s  = _locationSuggestions[i] as Map<String, dynamic>;
                  final sf = (s['structured_formatting'] as Map?)?.cast<String, dynamic>() ?? {};
                  final title = (sf['main_text']      as String?) ?? (s['description'] as String? ?? '').split(',').first.trim();
                  final sub   = (sf['secondary_text'] as String?) ?? '';
                  return InkWell(
                    onTap: () => _selectLocationSuggestion(s),
                    borderRadius: BorderRadius.only(
                      topLeft:    Radius.circular(i == 0 ? 12 : 0),
                      topRight:   Radius.circular(i == 0 ? 12 : 0),
                      bottomLeft: Radius.circular(
                          i == _locationSuggestions.length - 1 ? 12 : 0),
                      bottomRight: Radius.circular(
                          i == _locationSuggestions.length - 1 ? 12 : 0),
                    ),
                    child: Container(
                      constraints: const BoxConstraints(minHeight: 48),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      child: Row(
                        children: [
                          Container(
                            width: 28, height: 28,
                            decoration: BoxDecoration(
                              color: const Color(0xFFF26522)
                                  .withValues(alpha: 0.10),
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: const Icon(Icons.location_on,
                                color: Color(0xFFF26522), size: 14),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  title,
                                  style: TextStyle(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: _isDark
                                        ? const Color(0xFFF1F5F9)
                                        : const Color(0xFF1A1A2E),
                                  ),
                                ),
                                if (sub.isNotEmpty)
                                  const SizedBox(height: 2),
                                if (sub.isNotEmpty)
                                  Text(
                                    sub,
                                    style: const TextStyle(
                                        fontSize: 11,
                                        color: Color(0xFF94A3B8)),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                              ],
                            ),
                          ),
                          const Icon(Icons.north_west,
                              color: Color(0xFF94A3B8), size: 14),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: 14),
        ],
      );

  // ── GPS detect row ────────────────────────────────────────────────────────

  Widget _gpsDetectRow() => Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFF26522).withValues(alpha: _isDark ? 0.12 : 0.06),
          border: Border.all(color: const Color(0xFFF26522).withValues(alpha: 0.25)),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFFF26522).withValues(alpha: 0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: const Icon(Icons.gps_fixed, color: Color(0xFFF26522), size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Auto-detect my location',
                    style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600, height: 1.2,
                      color: _isDark ? const Color(0xFFF1F5F9) : const Color(0xFF1A1A2E),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    _locationDetected ? '✅ Saved: $_detectedArea' : 'Fills address fields automatically',
                    style: TextStyle(
                      fontSize: 11, height: 1.2,
                      color: _locationDetected ? const Color(0xFF16A34A) : const Color(0xFF94A3B8),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 8),
            _isDetectingLocation
                ? const SizedBox(width: 20, height: 20,
                    child: CircularProgressIndicator(color: Color(0xFFF26522), strokeWidth: 2.5))
                : SizedBox(
                    height: 36,
                    child: ElevatedButton(
                      onPressed: _detectLocation,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFF26522),
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

  // ── Helpers ───────────────────────────────────────────────────────────────

  String? _passwordValidator(String? value) {
    if (value == null || value.isEmpty) return 'Password is required';
    if (value.length < 8) return 'Minimum 8 characters required';
    if (!RegExp(r'[A-Z]').hasMatch(value)) {
      return 'Must contain at least one uppercase letter';
    }
    if (!RegExp(r'[a-z]').hasMatch(value)) {
      return 'Must contain at least one lowercase letter';
    }
    if (!RegExp(r'\d').hasMatch(value)) {
      return 'Must contain at least one number';
    }
    if (!RegExp(r'[@#!%^&*()\-_]').hasMatch(value)) {
      return 'Must contain a special character (@#!%^&*()-_)';
    }
    return null;
  }

  Widget _label(String text) => Padding(
        padding: const EdgeInsets.only(bottom: 6),
        child: Text(
          text,
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w500,
            color: _isDark
                ? const Color(0xFFCBD5E1)
                : const Color(0xFF374151),
          ),
        ),
      );

  Widget _eyeIcon({required bool obscure, required VoidCallback onTap}) =>
      IconButton(
        icon: Icon(
          obscure
              ? Icons.visibility_off_outlined
              : Icons.visibility_outlined,
          color: const Color(0xFF94A3B8),
          size: 22,
        ),
        onPressed: onTap,
      );

  InputDecoration _inputDeco({
    required String hint,
    Widget? suffix,
    Widget? prefix,
  }) =>
      InputDecoration(
        filled:    true,
        fillColor: _isDark
            ? const Color(0xFF252535)
            : const Color(0xFFF8FAFC),
        hintText:  hint,
        hintStyle: GoogleFonts.poppins(
            color: const Color(0xFF94A3B8), fontSize: 14),
        suffixIcon: suffix,
        prefixIcon: prefix,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
              color: _isDark
                  ? const Color(0xFF3D3D55)
                  : const Color(0xFFE2E8F0)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
              color: _isDark
                  ? const Color(0xFF3D3D55)
                  : const Color(0xFFE2E8F0)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(
              color: Color(0xFFF26522), width: 1.8),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: Colors.red.shade400),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide:
              BorderSide(color: Colors.red.shade400, width: 1.8),
        ),
      );

  void _showSnack(String message, {required Color color}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(_buildSnackBar(message, color: color));
  }

  SnackBar _buildSnackBar(String message, {required Color color}) =>
      SnackBar(
        content: Text(message,
            style: const TextStyle(color: AppColors.white)),
        backgroundColor: color,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10)),
      );
}
