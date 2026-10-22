import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../constants/app_colors.dart';
import '../../services/api_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// ContactScreen
// ─────────────────────────────────────────────────────────────────────────────

class ContactScreen extends StatefulWidget {
  const ContactScreen({super.key});

  @override
  State<ContactScreen> createState() => _ContactScreenState();
}

class _ContactScreenState extends State<ContactScreen> {
  final _api = ApiService();

  // ── Admin contact (fetched dynamically) ──────────────────────────────────
  String? _adminEmail;
  String? _adminPhone;
  bool    _adminLoading = true;

  // ── Nearby vendors ────────────────────────────────────────────────────────
  List<Map<String, dynamic>> _vendors = [];
  bool    _loading = true;
  String? _error;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _loadAdminContact();
    _loadVendors();
  }

  // ── Fetch admin contact from backend ─────────────────────────────────────

  Future<void> _loadAdminContact() async {
    try {
      final res  = await _api.get('/admin/public-contact');
      final data = res.data as Map<String, dynamic>?;
      if (data != null && mounted) {
        setState(() {
          _adminEmail   = data['email'] as String?;
          _adminPhone   = data['phone'] as String?;
          _adminLoading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _adminLoading = false);
    }
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  Future<void> _loadVendors() async {
    setState(() { _loading = true; _error = null; });
    try {
      final prefs   = await SharedPreferences.getInstance();
      final userRaw = prefs.getString('mealsetu_user');
      String pincode = '';
      if (userRaw != null) {
        final user = jsonDecode(userRaw) as Map<String, dynamic>;
        pincode = user['pincode'] as String? ?? '';
      }

      if (pincode.isEmpty) {
        setState(() {
          _error   = 'No pincode in your profile.\nUpdate your profile to see nearby kitchens.';
          _loading = false;
        });
        return;
      }

      final res = await _api.get(
        '/users/vendor-contacts',
        queryParameters: {'pincode': pincode},
      );
      final data = res.data as Map<String, dynamic>;
      final raw  = (data['vendors'] as List? ?? []);
      setState(() {
        _vendors = raw
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _loading = false;
      });
    } catch (_) {
      setState(() {
        _error   = 'Failed to load nearby kitchens. Pull down to retry.';
        _loading = false;
      });
    }
  }

  // ── URL helpers ───────────────────────────────────────────────────────────

  Future<void> _callPhone(String phone) async {
    final clean = phone.replaceAll(RegExp(r'[\s\-()]'), '');
    final uri   = Uri(scheme: 'tel', path: clean);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  Future<void> _sendEmail(String email) async {
    final uri = Uri(scheme: 'mailto', path: email);
    if (await canLaunchUrl(uri)) await launchUrl(uri);
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        scrolledUnderElevation: 1,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => context.canPop() ? context.pop() : context.go('/more'),
        ),
        title: Text(
          'Contact Us',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w700),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.primary),
            tooltip: 'Refresh',
            onPressed: _loading ? null : _loadVendors,
          ),
        ],
      ),
      body: RefreshIndicator(
        color: AppColors.primary,
        onRefresh: _loadVendors,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            // ── Hero banner ─────────────────────────────────────────────
            Container(
              margin: const EdgeInsets.all(16),
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFFE8570C), Color(0xFFFF8C00)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Row(
                children: [
                  const Icon(Icons.support_agent_rounded,
                      color: Colors.white, size: 36),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'We\'re here to help!',
                          style: GoogleFonts.poppins(
                            fontSize: 16,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 3),
                        Text(
                          'Reach out to us or your nearby kitchen directly.',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            color: Colors.white.withAlpha(220),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            // ═══════════════════════════════════════════════════════════
            // SECTION 1 — Admin/Support
            // ═══════════════════════════════════════════════════════════
            _sectionTitle('🛡️ MealSetu Support', cs),

            // Contact info card
            if (_adminLoading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 24),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else
              Column(
                children: [
                  Container(
                    margin: const EdgeInsets.symmetric(horizontal: 16),
                    decoration: BoxDecoration(
                      color: cs.surface,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: cs.outlineVariant),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withAlpha(7),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: Column(
                      children: [
                        if (_adminEmail != null) ...[
                          _infoRow(
                            icon: Icons.email_outlined,
                            label: 'Email',
                            value: _adminEmail!,
                            cs: cs,
                          ),
                          if (_adminPhone != null)
                            Divider(height: 1, color: cs.outlineVariant, indent: 56, endIndent: 16),
                        ],
                        if (_adminPhone != null)
                          _infoRow(
                            icon: Icons.phone_outlined,
                            label: 'Phone',
                            value: _adminPhone!,
                            cs: cs,
                          ),
                        if (_adminEmail == null && _adminPhone == null)
                          Padding(
                            padding: const EdgeInsets.all(16),
                            child: Text(
                              'Contact details unavailable',
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                color: cs.onSurfaceVariant,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 12),

                  // Action buttons
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: Row(
                      children: [
                        if (_adminEmail != null)
                          Expanded(
                            child: OutlinedButton.icon(
                              onPressed: () => _sendEmail(_adminEmail!),
                              icon: const Icon(Icons.email_rounded, size: 18),
                              label: Text(
                                'Email Us',
                                style: GoogleFonts.poppins(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              style: OutlinedButton.styleFrom(
                                foregroundColor: AppColors.primary,
                                side: const BorderSide(color: AppColors.primary),
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10)),
                              ),
                            ),
                          ),
                        if (_adminEmail != null && _adminPhone != null)
                          const SizedBox(width: 10),
                        if (_adminPhone != null)
                          Expanded(
                            child: ElevatedButton.icon(
                              onPressed: () => _callPhone(_adminPhone!),
                              icon: const Icon(Icons.phone_rounded, size: 18),
                              label: Text(
                                'Call Us',
                                style: GoogleFonts.poppins(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                foregroundColor: Colors.white,
                                padding: const EdgeInsets.symmetric(vertical: 12),
                                shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(10)),
                                elevation: 0,
                              ),
                            ),
                          ),
                      ],
                    ),
                  ),
                ],
              ),

            // ═══════════════════════════════════════════════════════════
            // SECTION 2 — Nearby Kitchens
            // ═══════════════════════════════════════════════════════════
            const SizedBox(height: 28),
            _sectionTitle('🍽️ Nearby Kitchens', cs),

            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 40),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.primary),
                ),
              )
            else if (_error != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                child: Column(
                  children: [
                    Icon(Icons.location_off_rounded,
                        size: 52, color: cs.outlineVariant),
                    const SizedBox(height: 12),
                    Text(
                      _error!,
                      style: GoogleFonts.poppins(
                        fontSize: 13,
                        color: cs.onSurfaceVariant,
                      ),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              )
            else if (_vendors.isEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
                child: Column(
                  children: [
                    Icon(Icons.store_outlined,
                        size: 52, color: cs.outlineVariant),
                    const SizedBox(height: 12),
                    Text(
                      'No kitchens found near you',
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: cs.onSurfaceVariant,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'Check back soon as more kitchens join your area.',
                      style: GoogleFonts.poppins(
                          fontSize: 12, color: cs.onSurfaceVariant),
                      textAlign: TextAlign.center,
                    ),
                  ],
                ),
              )
            else
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Column(
                  children: _vendors
                      .map((v) => _vendorCard(v, cs))
                      .toList(),
                ),
              ),
          ],
        ),
      ),
    );
  }

  // ── Section title ─────────────────────────────────────────────────────────

  Widget _sectionTitle(String title, ColorScheme cs) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
        child: Text(
          title,
          style: GoogleFonts.poppins(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: cs.onSurface,
          ),
        ),
      );

  // ── Admin info row ────────────────────────────────────────────────────────

  Widget _infoRow({
    required IconData icon,
    required String   label,
    required String   value,
    required ColorScheme cs,
    bool crossAxisAlignStart = false,
  }) =>
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          crossAxisAlignment: crossAxisAlignStart
              ? CrossAxisAlignment.start
              : CrossAxisAlignment.center,
          children: [
            Icon(icon, size: 20, color: AppColors.primary),
            const SizedBox(width: 20),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    label,
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: cs.onSurfaceVariant,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    value,
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: cs.onSurface,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      );

  // ── Vendor contact card ───────────────────────────────────────────────────

  Widget _vendorCard(Map<String, dynamic> vendor, ColorScheme cs) {
    final name    = vendor['kitchenName']  as String? ?? 'Kitchen';
    final address = vendor['address']      as String? ?? '';
    final phone   = vendor['phone']        as String?;
    final email   = vendor['email']        as String?;
    final dist    = vendor['distanceKm']   as num?;
    final imgUrl  = vendor['profileImage'] as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cs.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(7),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Header: avatar + name + distance badge ────────────────
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                // Avatar
                ClipRRect(
                  borderRadius: BorderRadius.circular(10),
                  child: SizedBox(
                    width: 52, height: 52,
                    child: imgUrl != null && imgUrl.isNotEmpty
                        ? CachedNetworkImage(
                            imageUrl: imgUrl,
                            fit: BoxFit.cover,
                            placeholder: (_, _) => Container(
                              color: cs.surfaceContainerHighest,
                              child: Icon(Icons.restaurant_rounded,
                                  color: cs.outlineVariant, size: 24),
                            ),
                            errorWidget: (_, _, _) => Container(
                              color: cs.surfaceContainerHighest,
                              child: Icon(Icons.restaurant_rounded,
                                  color: cs.outlineVariant, size: 24),
                            ),
                          )
                        : Container(
                            color: AppColors.primary.withAlpha(15),
                            child: Icon(Icons.restaurant_rounded,
                                color: AppColors.primary, size: 24),
                          ),
                  ),
                ),
                const SizedBox(width: 12),

                // Name
                Expanded(
                  child: Text(
                    name,
                    style: GoogleFonts.poppins(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: cs.onSurface,
                    ),
                  ),
                ),

                // Distance badge
                if (dist != null) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withAlpha(15),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      '$dist km',
                      style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                ],
              ],
            ),

            // ── Divider ───────────────────────────────────────────────
            const SizedBox(height: 12),
            Divider(height: 1, color: cs.outlineVariant),
            const SizedBox(height: 10),

            // ── Address (full, no truncation) ─────────────────────────
            if (address.isNotEmpty)
              _contactInfoRow(
                icon: Icons.location_on_outlined,
                text: address,
                cs: cs,
              ),

            // ── Phone (tappable) ──────────────────────────────────────
            if (phone != null)
              _contactInfoRow(
                icon: Icons.phone_rounded,
                text: phone,
                cs: cs,
                isAction: true,
                onTap: () => _callPhone(phone),
              ),

            // ── Email (tappable) ──────────────────────────────────────
            if (email != null)
              _contactInfoRow(
                icon: Icons.email_rounded,
                text: email,
                cs: cs,
                isAction: true,
                onTap: () => _sendEmail(email),
              ),
          ],
        ),
      ),
    );
  }

  // ── Single contact info row inside vendor card ────────────────────────────

  Widget _contactInfoRow({
    required IconData    icon,
    required String      text,
    required ColorScheme cs,
    bool        isAction = false,
    VoidCallback? onTap,
  }) {
    final color = isAction ? AppColors.primary : cs.onSurfaceVariant;
    final row = Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, size: 15, color: color),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              text,
              style: GoogleFonts.poppins(
                fontSize: 13,
                color: color,
                fontWeight:
                    isAction ? FontWeight.w600 : FontWeight.w400,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
    if (isAction && onTap != null) {
      return GestureDetector(onTap: onTap, child: row);
    }
    return row;
  }
}
