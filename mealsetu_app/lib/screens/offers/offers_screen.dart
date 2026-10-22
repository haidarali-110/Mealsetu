import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart' show DioException;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';

import '../../constants/app_colors.dart';
import '../../services/api_service.dart';
import '../../services/razorpay_checkout.dart';

// ─────────────────────────────────────────────────────────────────────────────
// OffersScreen
// ─────────────────────────────────────────────────────────────────────────────

class OffersScreen extends StatefulWidget {
  const OffersScreen({super.key});

  @override
  State<OffersScreen> createState() => _OffersScreenState();
}

class _OffersScreenState extends State<OffersScreen> {
  // ── Services ──────────────────────────────────────────────────────────────
  final _api = ApiService();

  // ── Data ──────────────────────────────────────────────────────────────────
  List<Map<String, dynamic>> _offers = [];
  bool   _isLoading = true;
  String? _error;

  // ── Razorpay ──────────────────────────────────────────────────────────────
  Razorpay? _razorpay;

  // Pending payment context (needed in Razorpay callbacks)
  Map<String, dynamic>? _pendingOffer;
  String _pendingPlan      = '';
  bool   _isRedeeming      = false;

  // ── Base prices (mirrors backend PLAN_PRICES) ─────────────────────────────
  static const Map<String, int> _planPrices = {
    'One Day': 80,
    'Weekly':  560,
    'Monthly': 2000,
  };

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _loadOffers();
    if (!kIsWeb) {
      _razorpay = Razorpay();
      _razorpay!.on(Razorpay.EVENT_PAYMENT_SUCCESS, _handlePaymentSuccess);
      _razorpay!.on(Razorpay.EVENT_PAYMENT_ERROR,   _handlePaymentError);
      _razorpay!.on(Razorpay.EVENT_EXTERNAL_WALLET, _handleExternalWallet);
    }
  }

  @override
  void dispose() {
    _razorpay?.clear();
    super.dispose();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  Future<void> _loadOffers() async {
    setState(() { _isLoading = true; _error = null; });
    try {
      final res  = await _api.get('/users/active-offers');
      final data = res.data;
      final List<dynamic> raw = data is List ? data : [];
      setState(() {
        _offers = raw
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _isLoading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Failed to load offers. Pull down to retry.';
        _isLoading = false;
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  DateTime? _parseDate(dynamic raw) {
    if (raw == null) return null;
    try { return DateTime.parse(raw.toString()).toLocal(); } catch (_) { return null; }
  }

  String _fmt(DateTime? d) =>
      d == null ? '—' : DateFormat('d MMM yyyy').format(d);

  int _discountedPrice(String planName, int discPct) {
    final base = _planPrices[planName] ?? 80;
    return (base * (1 - discPct / 100)).round();
  }

  List<Map<String, dynamic>> _discountsFor(Map<String, dynamic> offer) {
    final raw = offer['planDiscounts'] as List? ?? [];
    return raw
        .map((e) => Map<String, dynamic>.from(e as Map))
        .where((e) => (e['discountPercentage'] as num? ?? 0) > 0)
        .toList();
  }

  // ── Razorpay callbacks ────────────────────────────────────────────────────

  void _handlePaymentSuccess(PaymentSuccessResponse response) {
    _completeOnlinePayment({
      'razorpay_payment_id': response.paymentId ?? '',
      'razorpay_order_id': response.orderId ?? '',
      'razorpay_signature': response.signature ?? '',
    });
  }

  void _completeOnlinePayment(Map<String, String> payment) {
    if (_pendingOffer == null || _pendingPlan.isEmpty) return;
    final offer = _pendingOffer!;
    final plan  = _pendingPlan;

    _pendingOffer = null;
    _pendingPlan  = '';

    _submitRedeem(
      offer: offer,
      planType: plan,
      paymentMethod: 'Online',
      razorpayData: payment,
    );
  }

  void _handlePaymentError(PaymentFailureResponse response) {
    setState(() => _isRedeeming = false);
    if (!mounted) return;
    _snack('Payment failed: ${response.message ?? "Unknown error"}',
        isError: true);
  }

  void _handleExternalWallet(ExternalWalletResponse _) {}

  // ── Snackbar helper ───────────────────────────────────────────────────────

  void _snack(String msg, {bool isError = false, bool isSuccess = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg, style: GoogleFonts.poppins(fontSize: 13)),
        backgroundColor: isError
            ? Colors.red.shade700
            : isSuccess
                ? AppColors.success
                : AppColors.textDark,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  // ── Redeem flow ───────────────────────────────────────────────────────────

  void _showRedeemSheet(Map<String, dynamic> offer) {
    final discounts = _discountsFor(offer);
    if (discounts.isEmpty) return;

    // Capture colorScheme from the outer context before the sheet is shown
    final cs = Theme.of(context).colorScheme;

    String selectedPlan  = discounts.first['planName'] as String;
    String paymentMethod = 'Cash';

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          final disc = discounts.firstWhere(
            (d) => d['planName'] == selectedPlan,
            orElse: () => discounts.first,
          );
          final discPct  = (disc['discountPercentage'] as num).toInt();
          final finalAmt = _discountedPrice(selectedPlan, discPct);

          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              top: 24,
              left: 20,
              right: 20,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Handle bar ──────────────────────────────────────────
                Center(
                  child: Container(
                    width: 40, height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: cs.outlineVariant,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),

                // ── Title ───────────────────────────────────────────────
                Text(
                  'Redeem Offer',
                  style: GoogleFonts.poppins(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: cs.onSurface,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  offer['kitchenName'] as String? ?? '',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    color: cs.onSurfaceVariant,
                  ),
                ),

                const SizedBox(height: 20),
                Divider(color: cs.outlineVariant),
                const SizedBox(height: 16),

                // ── Plan selector ────────────────────────────────────────
                Text(
                  'Choose Plan',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: cs.onSurface,
                  ),
                ),
                const SizedBox(height: 10),

                ...discounts.map((d) {
                  final planName = d['planName'] as String;
                  final pct      = (d['discountPercentage'] as num).toInt();
                  final origP    = _planPrices[planName] ?? 80;
                  final finalP   = _discountedPrice(planName, pct);
                  final selected = selectedPlan == planName;

                  return GestureDetector(
                    onTap: () => setSheet(() => selectedPlan = planName),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 150),
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 14, vertical: 12),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppColors.primary.withAlpha(15)
                            : cs.surfaceContainerHighest,
                        border: Border.all(
                          color: selected
                              ? AppColors.primary
                              : cs.outlineVariant,
                          width: selected ? 2 : 1,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        children: [
                          // Radio circle
                          Container(
                            width: 20, height: 20,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              border: Border.all(
                                color: selected
                                    ? AppColors.primary
                                    : cs.outlineVariant,
                                width: 2,
                              ),
                              color: selected
                                  ? AppColors.primary
                                  : Colors.transparent,
                            ),
                            child: selected
                                ? const Icon(Icons.check,
                                    size: 12, color: Colors.white)
                                : null,
                          ),
                          const SizedBox(width: 12),

                          // Plan name
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  planName,
                                  style: GoogleFonts.poppins(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w600,
                                    color: selected
                                        ? AppColors.primary
                                        : cs.onSurface,
                                  ),
                                ),
                                Text(
                                  '$pct% OFF',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    color: AppColors.success,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),

                          // Pricing
                          Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text(
                                '₹$origP',
                                style: GoogleFonts.poppins(
                                  fontSize: 12,
                                  color: cs.onSurfaceVariant,
                                  decoration: TextDecoration.lineThrough,
                                ),
                              ),
                              Text(
                                '₹$finalP',
                                style: GoogleFonts.poppins(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: selected
                                      ? AppColors.primary
                                      : cs.onSurface,
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  );
                }),

                const SizedBox(height: 16),

                // ── Payment method ───────────────────────────────────────
                Text(
                  'Payment Method',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: cs.onSurface,
                  ),
                ),
                const SizedBox(height: 10),

                Row(
                  children: [
                    _payMethodBtn(
                      label: 'Cash',
                      icon: Icons.payments_rounded,
                      selected: paymentMethod == 'Cash',
                      onTap: () => setSheet(() => paymentMethod = 'Cash'),
                    ),
                    const SizedBox(width: 10),
                    _payMethodBtn(
                      label: 'Online (UPI)',
                      icon: Icons.smartphone_rounded,
                      selected: paymentMethod == 'Online',
                      onTap: () => setSheet(() => paymentMethod = 'Online'),
                    ),
                  ],
                ),

                const SizedBox(height: 24),

                // ── Confirm button ───────────────────────────────────────
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12),
                      ),
                      elevation: 0,
                    ),
                    onPressed: _isRedeeming
                        ? null
                        : () {
                            Navigator.of(ctx).pop();
                            _handleRedeem(offer, selectedPlan, paymentMethod,
                                discPct, finalAmt);
                          },
                    child: Text(
                      'Redeem for ₹$finalAmt',
                      style: GoogleFonts.poppins(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Widget _payMethodBtn({
    required String label,
    required IconData icon,
    required bool selected,
    required VoidCallback? onTap,
  }) {
    final cs       = Theme.of(context).colorScheme;
    final disabled = onTap == null;
    return Expanded(
      child: GestureDetector(
        onTap: disabled ? null : onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 150),
          padding: const EdgeInsets.symmetric(vertical: 12),
          decoration: BoxDecoration(
            color: selected
                ? AppColors.primary.withAlpha(15)
                : cs.surfaceContainerHighest,
            border: Border.all(
              color: selected ? AppColors.primary : cs.outlineVariant,
              width: selected ? 2 : 1,
            ),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Column(
            children: [
              Icon(
                icon,
                color: disabled
                    ? cs.onSurfaceVariant.withValues(alpha: 0.38)
                    : selected
                        ? AppColors.primary
                        : cs.onSurfaceVariant,
                size: 22,
              ),
              const SizedBox(height: 4),
              Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: disabled
                      ? cs.onSurfaceVariant.withValues(alpha: 0.38)
                      : selected
                          ? AppColors.primary
                          : cs.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Redeem dispatch ────────────────────────────────────────────────────────

  Future<void> _handleRedeem(
    Map<String, dynamic> offer,
    String planType,
    String paymentMethod,
    int discPct,
    int finalAmt,
  ) async {
    if (_isRedeeming) return;
    setState(() => _isRedeeming = true);

    if (paymentMethod == 'Cash') {
      await _submitRedeem(
        offer: offer,
        planType: planType,
        paymentMethod: 'Cash',
      );
    } else {
      // Online — create Razorpay order first
      try {
        final offerId = offer['_id']?.toString() ?? '';
        final res = await _api.post('/users/offers/create-payment-order', {
          'offerId':  offerId,
          'planType': planType,
        });
        final data   = Map<String, dynamic>.from(res.data as Map);
        final rzpKey = data['keyId']  as String? ?? '';
        final rzpId  = data['orderId'] as String? ?? '';
        final amount = (data['amount'] as num?)?.toInt() ?? finalAmt * 100;

        if (rzpKey.isEmpty || rzpId.isEmpty || amount <= 0) {
          throw Exception('Payment setup failed. Please try again.');
        }

        _pendingOffer = offer;
        _pendingPlan  = planType;

        if (kIsWeb) {
          final payment = await openRazorpayCheckout(
            keyId: rzpKey,
            orderId: rzpId,
            amount: amount,
            description: '${offer['kitchenName']} — $planType offer',
            color: '#E8570C',
          );
          _completeOnlinePayment(payment);
        } else {
          _razorpay!.open({
            'key':         rzpKey,
            'order_id':    rzpId,
            'amount':      amount,
            'name':        'MealSetu',
            'description': '${offer['kitchenName']} — $planType offer',
            'prefill': {
              'contact': '',
              'email':   '',
            },
            'theme': {'color': '#E8570C'},
          });
        }
      } catch (e) {
        setState(() => _isRedeeming = false);
        if (!mounted) return;
        _snack('Failed to initiate payment: $e', isError: true);
      }
    }
  }

  Future<void> _submitRedeem({
    required Map<String, dynamic> offer,
    required String planType,
    required String paymentMethod,
    Map<String, dynamic> razorpayData = const {},
  }) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final res = await _api.post('/users/offers/redeem', {
        'offerId':      offer['_id']?.toString() ?? '',
        'planType':     planType,
        'paymentMethod': paymentMethod,
        if (paymentMethod == 'Online') 'razorpayData': razorpayData,
      });

      final data   = Map<String, dynamic>.from(res.data as Map);
      final status = data['status'] as String? ?? 'active';
      final msg    = status == 'pending'
          ? '🎉 Offer queued! Plan will start after your current subscription ends.'
          : '🎉 Offer activated! Enjoy your discounted meals.';

      // Mark as claimed in local list
      setState(() {
        _isRedeeming = false;
        final idx = _offers.indexWhere((o) => o['_id'] == offer['_id']);
        if (idx != -1) _offers[idx] = {..._offers[idx], 'isClaimedByUser': true};
      });

      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(
          content: Text(msg, style: GoogleFonts.poppins(fontSize: 13)),
          backgroundColor: AppColors.success,
          behavior: SnackBarBehavior.floating,
          duration: const Duration(seconds: 4),
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10)),
        ),
      );
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _isRedeeming = false);
      messenger.showSnackBar(
        SnackBar(
          content: Text(_api.handleError(e),
              style: GoogleFonts.poppins(fontSize: 13)),
          backgroundColor: Colors.red.shade700,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10)),
        ),
      );
    } catch (e) {
      if (!mounted) return;
      setState(() => _isRedeeming = false);
      messenger.showSnackBar(
        SnackBar(
          content: Text('Failed to redeem offer. Please try again.',
              style: GoogleFonts.poppins(fontSize: 13)),
          backgroundColor: Colors.red.shade700,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10)),
        ),
      );
    }
  }

  // ── UI: offer card ─────────────────────────────────────────────────────────

  Widget _offerCard(Map<String, dynamic> offer) {
    final kitchenName  = offer['kitchenName']   as String? ?? 'Kitchen';
    final address      = offer['vendorAddress'] as String? ?? '';
    final posterUrl    = offer['posterImage']   as String?;
    final startDate    = _parseDate(offer['startDate']);
    final endDate      = _parseDate(offer['endDate']);
    final status       = offer['offerStatus']   as String? ?? 'active';
    final isClaimed    = offer['isClaimedByUser'] as bool? ?? false;
    final isComingSoon = status == 'coming-soon';
    final discounts    = _discountsFor(offer);

    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: cs.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(10),
            blurRadius: 12,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      clipBehavior: Clip.hardEdge,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Poster image ─────────────────────────────────────────────
          Stack(
            children: [
              // Image
              SizedBox(
                height: 170,
                width: double.infinity,
                child: posterUrl != null && posterUrl.isNotEmpty
                    ? CachedNetworkImage(
                        imageUrl: posterUrl,
                        fit: BoxFit.cover,
                        placeholder: (_, _) => Container(
                          color: cs.surfaceContainerLowest,
                          child: const Center(
                            child: CircularProgressIndicator(
                              color: AppColors.primary,
                              strokeWidth: 2,
                            ),
                          ),
                        ),
                        errorWidget: (_, _, _) => Container(
                          color: cs.surfaceContainerLowest,
                          child: Icon(
                            Icons.local_offer_rounded,
                            size: 48,
                            color: cs.outlineVariant,
                          ),
                        ),
                      )
                    : Container(
                        color: AppColors.primary.withAlpha(15),
                        child: Icon(
                          Icons.local_offer_rounded,
                          size: 48,
                          color: AppColors.primary.withAlpha(80),
                        ),
                      ),
              ),

              // Bottom gradient overlay with kitchen name
              Positioned(
                left: 0, right: 0, bottom: 0,
                child: Container(
                  padding: const EdgeInsets.fromLTRB(14, 30, 14, 12),
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Colors.transparent, Color(0xCC000000)],
                    ),
                  ),
                  child: Text(
                    kitchenName,
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ),

              // Status badge
              Positioned(
                top: 12, right: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: isComingSoon
                        ? const Color(0xFF1E2A3A).withAlpha(210)
                        : AppColors.success.withAlpha(230),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Container(
                        width: 6, height: 6,
                        decoration: BoxDecoration(
                          color: isComingSoon
                              ? Colors.amber
                              : Colors.white,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 5),
                      Text(
                        isComingSoon ? 'Coming Soon' : 'Active',
                        style: GoogleFonts.poppins(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // ── Discount chips ────────────────────────────────────────────
          if (discounts.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
              child: Wrap(
                spacing: 8,
                runSpacing: 6,
                children: discounts.map((d) {
                  final planName = d['planName'] as String;
                  final pct      = (d['discountPercentage'] as num).toInt();
                  final finalP   = _discountedPrice(planName, pct);
                  final origP    = _planPrices[planName] ?? 80;
                  return Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 6),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withAlpha(12),
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(
                          color: AppColors.primary.withAlpha(40)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        Text(
                          planName,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: cs.onSurface,
                          ),
                        ),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '₹$origP',
                              style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: cs.onSurfaceVariant,
                                decoration: TextDecoration.lineThrough,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Text(
                              '₹$finalP',
                              style: GoogleFonts.poppins(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color: AppColors.primary,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 4, vertical: 1),
                              decoration: BoxDecoration(
                                color: AppColors.success,
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(
                                '$pct% OFF',
                                style: GoogleFonts.poppins(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),

          // ── Validity + address row ────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 0),
            child: Row(
              children: [
                Icon(Icons.calendar_today_rounded,
                    size: 13, color: cs.onSurfaceVariant),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    '${_fmt(startDate)} – ${_fmt(endDate)}',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: cs.onSurfaceVariant,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ),
          ),

          if (address.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 4, 14, 0),
              child: Row(
                children: [
                  Icon(Icons.location_on_outlined,
                      size: 13, color: cs.onSurfaceVariant),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      address,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: cs.onSurfaceVariant,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ],
              ),
            ),

          // ── Action button ─────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 16),
            child: SizedBox(
              width: double.infinity,
              child: isClaimed
                  ? Container(
                      padding: const EdgeInsets.symmetric(vertical: 13),
                      decoration: BoxDecoration(
                        color: const Color(0xFFDCFCE7),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.check_circle_rounded,
                              color: AppColors.success, size: 18),
                          const SizedBox(width: 6),
                          Text(
                            'Offer Claimed',
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              fontWeight: FontWeight.w600,
                              color: AppColors.success,
                            ),
                          ),
                        ],
                      ),
                    )
                  : isComingSoon
                      ? Container(
                          padding: const EdgeInsets.symmetric(vertical: 13),
                          decoration: BoxDecoration(
                            color: const Color(0xFFFEF3C7),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Icon(Icons.schedule_rounded,
                                  color: AppColors.warning, size: 18),
                              const SizedBox(width: 6),
                              Text(
                                'Available from ${_fmt(startDate)}',
                                style: GoogleFonts.poppins(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: AppColors.warning,
                                ),
                              ),
                            ],
                          ),
                        )
                      : ElevatedButton.icon(
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            padding:
                                const EdgeInsets.symmetric(vertical: 13),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12)),
                            elevation: 0,
                          ),
                          icon: _isRedeeming
                              ? const SizedBox(
                                  width: 16, height: 16,
                                  child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: Colors.white),
                                )
                              : const Icon(Icons.local_offer_rounded,
                                  size: 18),
                          label: Text(
                            _isRedeeming ? 'Processing…' : 'Redeem Offer',
                            style: GoogleFonts.poppins(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          onPressed: _isRedeeming
                              ? null
                              : () => _showRedeemSheet(offer),
                        ),
            ),
          ),
        ],
      ),
    );
  }

  // ── UI: empty / error ─────────────────────────────────────────────────────

  Widget _emptyState() {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.local_offer_outlined,
                size: 72, color: cs.outlineVariant),
            const SizedBox(height: 16),
            Text(
              'No offers right now',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: cs.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Check back soon — vendors post limited-time deals regularly.',
              style: GoogleFonts.poppins(
                  fontSize: 13, color: cs.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  Widget _errorState() {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off_rounded, size: 56, color: cs.outlineVariant),
            const SizedBox(height: 16),
            Text(
              'Something went wrong',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: cs.onSurface,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              _error!,
              style: GoogleFonts.poppins(
                  fontSize: 12, color: cs.onSurfaceVariant),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
              ),
              icon: const Icon(Icons.refresh_rounded, size: 18),
              label: Text('Retry',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
              onPressed: _loadOffers,
            ),
          ],
        ),
      ),
    );
  }

  // ── Section header ────────────────────────────────────────────────────────

  Widget _sectionHeader(String title, IconData icon, Color color) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 4),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 6),
          Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: cs.onSurface,
            ),
          ),
        ],
      ),
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final active     = _offers.where((o) => o['offerStatus'] == 'active').toList();
    final comingSoon = _offers.where((o) => o['offerStatus'] == 'coming-soon').toList();

    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        scrolledUnderElevation: 1,
        title: Text(
          'Offers',
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, color: AppColors.primary),
            tooltip: 'Refresh',
            onPressed: _isLoading ? null : _loadOffers,
          ),
        ],
      ),

      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary))
          : _error != null
              ? _errorState()
              : _offers.isEmpty
                  ? RefreshIndicator(
                      color: AppColors.primary,
                      onRefresh: _loadOffers,
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        children: [_emptyState()],
                      ),
                    )
                  : RefreshIndicator(
                      color: AppColors.primary,
                      onRefresh: _loadOffers,
                      child: ListView(
                        physics: const AlwaysScrollableScrollPhysics(),
                        padding: const EdgeInsets.only(bottom: 32),
                        children: [
                          // ── Active offers ──────────────────────────────
                          if (active.isNotEmpty) ...[
                            _sectionHeader(
                              '🔥 Active Offers',
                              Icons.local_fire_department_rounded,
                              AppColors.primary,
                            ),
                            ...active.map(_offerCard),
                          ],

                          // ── Coming soon ────────────────────────────────
                          if (comingSoon.isNotEmpty) ...[
                            _sectionHeader(
                              '🕐 Coming Soon',
                              Icons.schedule_rounded,
                              AppColors.warning,
                            ),
                            ...comingSoon.map(_offerCard),
                          ],
                        ],
                      ),
                    ),
    );
  }
}
