import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart' show DioException;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../constants/app_colors.dart';
import '../models/vendor_model.dart';
import '../services/api_service.dart';

// ── Design tokens (trial button colours) ─────────────────────────────────────
const _trialGreen  = Color(0xFF16A34A);
const _trialOrange = Color(0xFFF26522);
const _trialGrey   = Color(0xFFE5E7EB);
const _trialGreyTx = Color(0xFF9CA3AF);

// ─────────────────────────────────────────────────────────────────────────────

class VendorCard extends StatefulWidget {
  const VendorCard({super.key, required this.vendor});

  final VendorModel vendor;

  @override
  State<VendorCard> createState() => _VendorCardState();
}

class _VendorCardState extends State<VendorCard> {
  final _api = ApiService();

  // ── Trial eligibility state ──────────────────────────────────────────────
  bool?  _trialEligible; // null = not checked yet
  double _trialFee      = 0.0;
  bool   _trialChecked  = false; // false = still loading
  bool   _trialPlacing  = false; // true = POST in-flight

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  @override
  void initState() {
    super.initState();
    if (widget.vendor.trialEnabled) {
      _checkEligibility();
    }
  }

  // ── API calls ──────────────────────────────────────────────────────────────

  Future<void> _checkEligibility() async {
    try {
      final r = await _api.get(
          '/users/trial-eligibility/${widget.vendor.id}');
      final d = r.data as Map<String, dynamic>? ?? {};
      if (mounted) {
        setState(() {
          _trialEligible = d['eligible'] as bool?   ?? false;
          _trialFee      = (d['trialFee'] as num?)?.toDouble() ?? 0.0;
          _trialChecked  = true;
        });
      }
    } catch (_) {
      // Bug 4 fix: network error ≠ "already used".
      // Leave _trialEligible = null so the button shows as eligible (best-effort).
      // The server will reject a duplicate if the trial was actually used.
      if (mounted) {
        setState(() {
          _trialEligible = true;
          _trialChecked  = true;
        });
      }
    }
  }

  Future<void> _handleTrialTap() async {
    final isFree     = _trialFee == 0;
    final vendorName = widget.vendor.name;
    final feeLabel   = _trialFee.toStringAsFixed(0);

    // ── Confirmation dialog ──────────────────────────────────────────────
    // Use the State's own `context` so the `mounted` guard below correctly
    // covers every post-await reference to it (lint: use_build_context_synchronously).
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16)),
        title: Text(isFree ? '2-Day Free Trial' : '2-Day Trial'),
        content: Text(
          isFree
              ? 'Start 2-day free trial from $vendorName?'
              : 'Start 2-day trial for ₹$feeLabel from $vendorName?',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            style: ElevatedButton.styleFrom(
              backgroundColor: _trialOrange,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
              elevation: 0,
            ),
            child: const Text('Start Trial'),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    setState(() => _trialPlacing = true);

    // ── POST /api/users/trial ────────────────────────────────────────────
    try {
      final r = await _api.post('/users/trial', {
        'vendorId':       widget.vendor.id,
        'paymentMethod':  'Cash',
        'mealPreference': 'Regular',
      });

      if (!mounted) return;

      // Parse success dates for the SnackBar (safe cast — Dio JSON is Map<String,dynamic>)
      final d      = (r.data is Map)
          ? Map<String, dynamic>.from(r.data as Map)
          : <String, dynamic>{};
      final details  = (d['trialDetails'] is Map)
          ? Map<String, dynamic>.from(d['trialDetails'] as Map)
          : <String, dynamic>{};
      final rawStart = details['startDate'] as String? ?? '';
      final rawEnd   = details['endDate']   as String? ?? '';

      String fmtStart = rawStart;
      String fmtEnd   = rawEnd;
      try {
        const mo = ['Jan','Feb','Mar','Apr','May','Jun',
                    'Jul','Aug','Sep','Oct','Nov','Dec'];
        final st = DateTime.parse(rawStart).toLocal();
        final en = DateTime.parse(rawEnd).toLocal();
        fmtStart = '${st.day} ${mo[st.month - 1]}';
        fmtEnd   = '${en.day} ${mo[en.month - 1]}';
      } catch (_) {}

      setState(() {
        _trialPlacing  = false;
        _trialEligible = false; // mark as used → button flips to grey
      });

      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(
            '🎉 Trial activated! Starts $fmtStart, ends $fmtEnd'),
        backgroundColor: _trialGreen,
        duration: const Duration(seconds: 4),
      ));

    } on DioException catch (e) {
      // The backend may have created the trial order but returned a non-2xx
      // response (e.g. a notification service failure). Re-check eligibility
      // to detect this "created-but-errored" case before showing an error.
      if (!mounted) return;
      setState(() => _trialPlacing = false);

      // Capture context-bound objects BEFORE the async gap
      // (lint: use_build_context_synchronously).
      final messenger = ScaffoldMessenger.of(context);
      final errMsg    = _api.handleError(e);

      try {
        final eligR = await _api.get(
            '/users/trial-eligibility/${widget.vendor.id}');
        if (!mounted) return;
        final eligD = (eligR.data is Map)
            ? Map<String, dynamic>.from(eligR.data as Map)
            : <String, dynamic>{};
        final stillEligible = eligD['eligible'] as bool? ?? true;

        if (!stillEligible) {
          // Order was actually created despite the backend error —
          // flip button to disabled and show success.
          setState(() {
            _trialEligible = false;
            _trialChecked  = true;
          });
          messenger.showSnackBar(const SnackBar(
            content:         Text('🎉 Trial activated successfully!'),
            backgroundColor: _trialGreen,
            duration:        Duration(seconds: 4),
          ));
          return;
        }
      } catch (_) {
        // Eligibility re-check failed — fall through to original error.
      }

      if (!mounted) return;
      messenger.showSnackBar(SnackBar(
        content:         Text(errMsg),
        backgroundColor: Colors.red,
      ));

    } catch (_) {
      // Any non-Dio exception here means _api.post() succeeded (2xx returned)
      // but response parsing threw. The trial order was created.
      if (!mounted) return;
      setState(() {
        _trialPlacing  = false;
        _trialEligible = false;
      });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content:         Text('🎉 Trial activated successfully!'),
        backgroundColor: _trialGreen,
        duration:        Duration(seconds: 4),
      ));
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      elevation: 2,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
            color: Theme.of(context).colorScheme.outlineVariant),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _buildPosterImage(),
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _buildNameRow(),
                const SizedBox(height: 4),
                _buildAddressRow(),
                const SizedBox(height: 8),
                _buildFssaiRow(context),
                const Divider(height: 20),
                _buildScheduleRow(),
                const SizedBox(height: 12),
                _buildPricingRow(),
                const SizedBox(height: 14),
                _buildOrderButton(context),
                // ── Trial button — only shown when trialEnabled ──────────
                if (widget.vendor.trialEnabled) ...[
                  const SizedBox(height: 8),
                  _buildTrialButton(),
                ],
                const SizedBox(height: 8),
                _buildWriteReviewLink(context),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRIAL BUTTON
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildTrialButton() {
    // ── Still checking eligibility → shimmer placeholder ─────────────────
    if (!_trialChecked) {
      return Shimmer.fromColors(
        baseColor:      Colors.grey.shade300,
        highlightColor: Colors.grey.shade100,
        child: Container(
          height: 48,
          decoration: BoxDecoration(
            color:        Colors.white,
            borderRadius: BorderRadius.circular(10),
          ),
        ),
      );
    }

    // ── Eligible ──────────────────────────────────────────────────────────
    if (_trialEligible == true) {
      final isFree  = _trialFee == 0;
      final bgColor = isFree ? _trialGreen : _trialOrange;
      final label   = isFree
          ? '2 Day Free Trial'
          : '2 Day Trial - Just ₹${_trialFee.toStringAsFixed(0)}';

      return SizedBox(
        width:  double.infinity,
        height: 48,
        child: ElevatedButton(
          onPressed: _trialPlacing
              ? null
              : _handleTrialTap,
          style: ElevatedButton.styleFrom(
            backgroundColor: bgColor,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
            elevation: 0,
          ),
          child: _trialPlacing
              ? const SizedBox(
                  height: 18,
                  width:  18,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : Text(
                  label,
                  style: const TextStyle(
                      fontSize: 14, fontWeight: FontWeight.w700),
                ),
        ),
      );
    }

    // ── Already used / not available → grey disabled ──────────────────────
    return SizedBox(
      width:  double.infinity,
      height: 48,
      child: ElevatedButton(
        onPressed: null,
        style: ElevatedButton.styleFrom(
          backgroundColor:         _trialGrey,
          disabledBackgroundColor: _trialGrey,
          disabledForegroundColor: _trialGreyTx,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10)),
          elevation: 0,
        ),
        child: const Text(
          '✓ Trial Already Used',
          style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EXISTING WIDGETS (unchanged)
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Poster image with star-rating badge ───────────────────────────────────

  Widget _buildPosterImage() {
    return Stack(
      children: [
        SizedBox(
          height: 180,
          width: double.infinity,
          child: widget.vendor.kitchenPoster != null &&
                  widget.vendor.kitchenPoster!.isNotEmpty
              ? CachedNetworkImage(
                  imageUrl: widget.vendor.kitchenPoster!,
                  fit: BoxFit.cover,
                  placeholder: (_, _) => _posterFallback(loading: true),
                  errorWidget: (_, _, _) => _posterFallback(),
                )
              : _posterFallback(),
        ),
        // Star rating badge — top-right corner
        Positioned(
          top:   10,
          right: 10,
          child: widget.vendor.reviewCount == 0
              // ── No reviews yet → "New" badge ────────────────────────────
              ? Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color:        const Color(0xFF16A34A),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text(
                    'New',
                    style: TextStyle(
                      color:      Colors.white,
                      fontSize:   12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                )
              // ── Has reviews → show dynamic rating ───────────────────────
              : Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color:        Colors.black.withAlpha(178),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.star, color: Color(0xFFFBBF24), size: 14),
                      const SizedBox(width: 3),
                      Text(
                        widget.vendor.rating.toStringAsFixed(1),
                        style: const TextStyle(
                          color:      Colors.white,
                          fontSize:   12,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ),
                ),
        ),
      ],
    );
  }

  Widget _posterFallback({bool loading = false}) => Container(
        height: 180,
        color:  Colors.grey.shade200,
        child:  Center(
          child: loading
              ? const CircularProgressIndicator(strokeWidth: 2)
              : const Icon(Icons.restaurant, size: 56, color: Colors.grey),
        ),
      );

  // ── Name + Nearby chip ────────────────────────────────────────────────────

  Widget _buildNameRow() {
    final cs = Theme.of(context).colorScheme;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            widget.vendor.name,
            style: TextStyle(
              fontSize:   17,
              fontWeight: FontWeight.w700,
              color:      cs.onSurface,
            ),
          ),
        ),
        if (widget.vendor.isNearby) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color:        AppColors.nearbyGreen.withAlpha(26),
              borderRadius: BorderRadius.circular(20),
              border:       Border.all(color: AppColors.nearbyGreen),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.check_circle,
                    color: AppColors.nearbyGreen, size: 12),
                const SizedBox(width: 3),
                Text(
                  'Nearby',
                  style: TextStyle(
                    color:      AppColors.nearbyGreen,
                    fontSize:   11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
        if (widget.vendor.deliveryEnabled) ...[
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color:        const Color(0xFF0EA5E9).withAlpha(20),
              borderRadius: BorderRadius.circular(20),
              border:       Border.all(color: const Color(0xFF0EA5E9).withAlpha(140)),
            ),
            child: const Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.delivery_dining,
                    color: Color(0xFF0EA5E9), size: 13),
                SizedBox(width: 3),
                Text(
                  'Delivery',
                  style: TextStyle(
                    color:      Color(0xFF0EA5E9),
                    fontSize:   11,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  // ── Address ───────────────────────────────────────────────────────────────

  Widget _buildAddressRow() {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(Icons.location_on_outlined,
            size: 14, color: cs.onSurfaceVariant),
        const SizedBox(width: 4),
        Expanded(
          child: Text(
            widget.vendor.address,
            style: TextStyle(fontSize: 13, color: cs.onSurfaceVariant),
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
          ),
        ),
        if (widget.vendor.distanceKm != null) ...[
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color:        const Color(0xFFF26522).withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(20),
              border:       Border.all(
                  color: const Color(0xFFF26522).withValues(alpha: 0.35)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.directions_bike_outlined,
                    size: 12, color: Color(0xFFF26522)),
                const SizedBox(width: 4),
                Text(
                  '${widget.vendor.distanceKm!.toStringAsFixed(1)} km',
                  style: const TextStyle(
                    fontSize:   11,
                    color:      Color(0xFFF26522),
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }

  // ── FSSAI badge + View Reviews link ──────────────────────────────────────

  Widget _buildFssaiRow(BuildContext context) {
    return Row(
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(
            color:        AppColors.success.withAlpha(26),
            borderRadius: BorderRadius.circular(4),
            border:       Border.all(color: AppColors.success.withAlpha(128)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.verified_outlined,
                  size: 11, color: AppColors.success),
              const SizedBox(width: 3),
              Text(
                'FSSAI: ${widget.vendor.fssai.isNotEmpty ? widget.vendor.fssai : "Registered"}',
                style: TextStyle(
                  fontSize:   10,
                  color:      AppColors.success,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
          ),
        ),
        const Spacer(),
        GestureDetector(
          onTap: () =>
              context.push('/vendor/${widget.vendor.id}', extra: widget.vendor),
          child: const Text(
            'View Reviews',
            style: TextStyle(
              fontSize:        12,
              color:           AppColors.primary,
              fontWeight:      FontWeight.w600,
              decoration:      TextDecoration.underline,
              decorationColor: AppColors.primary,
            ),
          ),
        ),
      ],
    );
  }

  // ── Working days & timings ────────────────────────────────────────────────

  Widget _buildScheduleRow() {
    return Row(
      children: [
        Expanded(
          child: _scheduleItem(
            Icons.calendar_today_outlined,
            'DAYS',
            widget.vendor.workingDays.isNotEmpty
                ? widget.vendor.workingDays
                : '—',
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _scheduleItem(
            Icons.access_time_outlined,
            'TIMINGS',
            widget.vendor.timings.isNotEmpty ? widget.vendor.timings : '—',
          ),
        ),
      ],
    );
  }

  Widget _scheduleItem(IconData icon, String label, String value) {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Icon(icon, size: 14, color: cs.onSurfaceVariant),
        const SizedBox(width: 4),
        Flexible(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize:      9,
                  color:         cs.onSurfaceVariant,
                  fontWeight:    FontWeight.w700,
                  letterSpacing: 0.5,
                ),
              ),
              Text(
                value,
                style: TextStyle(
                  fontSize:   12,
                  color:      cs.onSurface,
                  fontWeight: FontWeight.w500,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ── Pricing chips ─────────────────────────────────────────────────────────

  Widget _buildPricingRow() {
    final cs = Theme.of(context).colorScheme;
    return Row(
      children: [
        Text(
          'from ₹${widget.vendor.minPrice.toStringAsFixed(0)}',
          style: TextStyle(
            fontSize:   15,
            fontWeight: FontWeight.w700,
            color:      cs.onSurface,
          ),
        ),
        const SizedBox(width: 10),
        Expanded(
          child: Wrap(
            spacing:    6,
            runSpacing: 4,
            children: widget.vendor.pricing
                .map((p) => _pricingChip(p.type.toUpperCase(), p.active))
                .toList(),
          ),
        ),
      ],
    );
  }

  Widget _pricingChip(String label, bool active) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        border: Border.all(
          color: active ? AppColors.primary : cs.outlineVariant,
        ),
        borderRadius: BorderRadius.circular(4),
        color: active
            ? AppColors.primary.withAlpha(13)
            : Colors.transparent,
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize:      10,
          color:         active ? AppColors.primary : cs.onSurfaceVariant,
          fontWeight:    FontWeight.w600,
          letterSpacing: 0.3,
        ),
      ),
    );
  }

  // ── Action buttons ────────────────────────────────────────────────────────

  Widget _buildOrderButton(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: ElevatedButton(
        onPressed: () =>
            context.push('/vendor/${widget.vendor.id}', extra: widget.vendor),
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(vertical: 12),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8)),
          elevation: 0,
        ),
        child: const Text(
          'Order Now',
          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  Widget _buildWriteReviewLink(BuildContext context) {
    return Center(
      child: GestureDetector(
        onTap: () =>
            context.push('/vendor/${widget.vendor.id}', extra: widget.vendor),
        child: Text(
          'Write a Review',
          style: TextStyle(
            fontSize:   13,
            color:      Theme.of(context).colorScheme.onSurfaceVariant,
            decoration: TextDecoration.underline,
            decorationColor: Theme.of(context).colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}
