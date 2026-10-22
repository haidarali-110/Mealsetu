import 'dart:convert';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:dio/dio.dart' show DioException;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shimmer/shimmer.dart';

import '../../models/vendor_model.dart';
import '../../services/api_service.dart';
import '../../services/razorpay_checkout.dart';

// ── Design tokens (scoped to this file) ──────────────────────────────────────

const _orange        = Color(0xFFF26522);
const _lightOrange   = Color(0xFFFFF5F0);
const _textPrimary   = Color(0xFF1A1A2E);
const _textSecondary = Color(0xFF64748B);
const _green         = Color(0xFF16A34A);
const _amber         = Color(0xFFF59E0B);
const _border        = Color(0xFFE5E7EB);
const _greyFill      = Color(0xFFE5E7EB);

// ── Private data models ───────────────────────────────────────────────────────

class _Tier {
  const _Tier({required this.type, required this.price});
  final String type;
  final double price;

  String get planCode {
    switch (type.toLowerCase()) {
      case 'daily':
      case 'oneday':
        return 'ONEDAY';
      case 'weekly':
        return 'WEEKLY';
      case 'monthly':
        return 'MONTHLY';
      default:
        return type.toUpperCase();
    }
  }

  String get shortLabel {
    switch (planCode) {
      case 'ONEDAY':  return '1 Day';
      case 'WEEKLY':  return 'Weekly';
      case 'MONTHLY': return 'Monthly';
      default:        return type;
    }
  }

  String get subLabel {
    switch (planCode) {
      case 'ONEDAY':  return '1 day';
      case 'WEEKLY':  return '7 days';
      case 'MONTHLY': return '30 days';
      default:        return '';
    }
  }
}

class _MealDay {
  const _MealDay(
      {this.mainCourse, this.altSabji, this.altSabji2, this.sides});
  final String? mainCourse;
  final String? altSabji;
  final String? altSabji2;
  final String? sides;

  factory _MealDay.fromJson(Map<String, dynamic> j) => _MealDay(
        mainCourse: j['mainCourse'] as String?,
        altSabji:   j['altSabji']   as String?,
        altSabji2:  j['altSabji2']  as String?,
        sides:      j['sides']      as String?,
      );
}

class _ReviewItem {
  const _ReviewItem({
    required this.id,
    required this.userName,
    required this.rating,
    required this.comment,
    required this.date,
  });
  final String id;
  final String userName;
  final double rating;
  final String comment;
  final String date;

  factory _ReviewItem.fromJson(Map<String, dynamic> j) {
    // Backend sends "user" as a plain String (customerName) on new reviews,
    // or as a nested Map {name: ...} on older ones — handle both.
    final u = j['user'];
    final String name;
    if (u is String && u.trim().isNotEmpty) {
      name = u.trim();
    } else if (u is Map) {
      final n = (u['name'] as String?)?.trim() ?? '';
      name = n.isNotEmpty ? n : 'Anonymous';
    } else {
      name = 'Anonymous';
    }
    String date = '';
    try {
      final dt = DateTime.parse(j['date'].toString()).toLocal();
      const m  = ['Jan','Feb','Mar','Apr','May','Jun',
                   'Jul','Aug','Sep','Oct','Nov','Dec'];
      date = '${dt.day} ${m[dt.month - 1]} ${dt.year}';
    } catch (_) {
      date = j['date']?.toString() ?? '';
    }
    return _ReviewItem(
      id:       j['_id']     as String? ?? '',
      userName: name,
      rating:   (j['rating'] as num?)?.toDouble() ?? 0,
      comment:  j['comment'] as String? ?? '',
      date:     date,
    );
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

class VendorDetailScreen extends StatefulWidget {
  const VendorDetailScreen(
      {required this.vendorId, this.vendor, super.key});

  final String       vendorId;
  final VendorModel? vendor;

  @override
  State<VendorDetailScreen> createState() => _State();
}

class _State extends State<VendorDetailScreen> {
  final _api = ApiService();

  // ── Remote data ──────────────────────────────────────────────────────
  bool   _isOpen         = true;
  bool   _loadingStatus  = true;
  bool   _loadingPricing = true;
  bool   _loadingMenu    = true;
  bool   _loadingReviews = true;
  String? _pricingError;

  List<_Tier>              _tiers      = [];
  Map<String, _MealDay>    _weeklyPlan = {};
  List<_ReviewItem>        _reviews    = [];
  bool?  _canReview; // null = still fetching

  // ── Order flow ────────────────────────────────────────────────────────
  int      _step      = 0;
  _Tier?   _plan;
  DateTime _startDate = DateTime.now();
  String   _selDay    = _dayName(DateTime.now().weekday);
  bool     _menuDayManuallySelected = false;
  String   _mealPref  = 'Regular';
  String   _altChoice = 'default';
  String   _payMethod = 'Cash';
  bool     _placing   = false;
  bool?    _canPurchase;
  String   _canPurchaseMsg = '';

  // ── Razorpay ──────────────────────────────────────────────────────────
  Razorpay? _razorpay;

  // ── Helpers ───────────────────────────────────────────────────────────
  static String _dayName(int weekday) {
    const d = ['Monday','Tuesday','Wednesday',
                'Thursday','Friday','Saturday','Sunday'];
    return d[(weekday - 1) % 7];
  }

  static String _fmtDate(DateTime dt) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${dt.day} ${m[dt.month - 1]} ${dt.year}';
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────
  @override
  void initState() {
    super.initState();
    _fetchStatus();
    _fetchPricing();
    _fetchMenu();
    _fetchReviews();
    _fetchEligibility();
    // razorpay_flutter is mobile-only; skip on web
    if (!kIsWeb) {
      _razorpay = Razorpay();
      _razorpay!.on(Razorpay.EVENT_PAYMENT_SUCCESS, _handlePaymentSuccess);
      _razorpay!.on(Razorpay.EVENT_PAYMENT_ERROR,   _handlePaymentError);
      _razorpay!.on(Razorpay.EVENT_EXTERNAL_WALLET, _handleExternalWallet);
    }
  }

  @override
  void dispose() {
    _razorpay?.clear(); // removes all Razorpay event listeners
    super.dispose();
  }

  // ── Fetchers ──────────────────────────────────────────────────────────
  Future<void> _fetchStatus() async {
    try {
      final r = await _api.get('/users/vendor-status/${widget.vendorId}');
      final d = r.data as Map<String, dynamic>? ?? {};
      if (mounted) {
        setState(() {
          _isOpen        = d['isOpen'] as bool? ?? true;
          _loadingStatus = false;
        });
      }
    } catch (_) {
      if (mounted) { setState(() => _loadingStatus = false); }
    }
  }

  Future<void> _fetchPricing() async {
    try {
      final r = await _api.get('/users/vendor-pricing/${widget.vendorId}');
      final d = r.data as Map<String, dynamic>? ?? {};
      final list = (d['pricing'] as List<dynamic>? ?? [])
          .map((p) => _Tier(
                type:  p['type']  as String? ?? '',
                price: (p['price'] as num?)?.toDouble() ?? 0,
              ))
          .toList();
      if (mounted) {
        setState(() {
          _tiers         = list;
          _loadingPricing = false;
          _pricingError  = list.isEmpty ? 'No pricing available.' : null;
        });
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() {
          _loadingPricing = false;
          _pricingError   = _api.handleError(e);
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _loadingPricing = false;
          _pricingError   = 'Failed to load pricing.';
        });
      }
    }
  }

  Future<void> _fetchMenu() async {
    try {
      final r   = await _api.get('/vendor-profile/${widget.vendorId}');
      final d   = r.data as Map<String, dynamic>? ?? {};
      final raw = d['weeklyPlan'] as Map<String, dynamic>? ?? {};
      final plan = raw.map((day, val) =>
          MapEntry(day, _MealDay.fromJson(val as Map<String, dynamic>)));
      if (mounted) {
        setState(() {
          _weeklyPlan  = plan;
          if (!_menuDayManuallySelected) {
            final today = _dayName(DateTime.now().weekday);
            final availableDays = const [
              'Monday', 'Tuesday', 'Wednesday', 'Thursday',
              'Friday', 'Saturday', 'Sunday'
            ].where((day) => plan.containsKey(day));
            _selDay = plan.containsKey(today)
                ? today
                : (availableDays.isNotEmpty ? availableDays.first : today);
          }
          _loadingMenu = false;
        });
      }
    } catch (_) {
      if (mounted) { setState(() => _loadingMenu = false); }
    }
  }

  Future<void> _fetchReviews() async {
    try {
      final r = await _api.get('/users/vendor-reviews/${widget.vendorId}');
      // API returns { analytics: {...}, reviews: [...], pagination: {...} }
      final body = r.data;
      final List<dynamic> rawList;
      if (body is Map) {
        rawList = (body['reviews'] as List<dynamic>?) ?? [];
      } else if (body is List) {
        rawList = body; // legacy flat-list fallback
      } else {
        rawList = [];
      }
      final list = rawList
          .map((v) => _ReviewItem.fromJson(v as Map<String, dynamic>))
          .toList();
      if (mounted) {
        setState(() {
          _reviews        = list;
          _loadingReviews = false;
        });
      }
    } catch (_) {
      if (mounted) { setState(() => _loadingReviews = false); }
    }
  }

  Future<void> _fetchEligibility() async {
    try {
      final r = await _api.get(
          '/users/review-eligibility/${widget.vendorId}');
      final d = r.data as Map<String, dynamic>? ?? {};
      if (mounted) {
        setState(() => _canReview = d['canReview'] as bool? ?? false);
      }
    } catch (_) {
      if (mounted) { setState(() => _canReview = false); }
    }
  }

  Future<void> _refreshAll() => Future.wait([
        _fetchStatus(),
        _fetchPricing(),
        _fetchMenu(),
        _fetchReviews(),
        _fetchEligibility(),
      ]);

  Future<void> _preCheckCanPurchase() async {
    try {
      final r = await _api.get('/users/check-can-add-plan');
      final d = r.data as Map<String, dynamic>? ?? {};
      if (mounted) {
        setState(() {
          _canPurchase    = d['canPurchase'] as bool? ?? true;
          _canPurchaseMsg = d['message']     as String? ?? '';
        });
      }
    } catch (_) {}
  }

  // ── Order submission ──────────────────────────────────────────────────
  Future<void> _submitCashOrder() async {
    setState(() => _placing = true);
    try {
      final cr = await _api.get('/users/check-can-add-plan');
      final cd = cr.data as Map<String, dynamic>? ?? {};
      final ok  = cd['canPurchase'] as bool?   ?? false;
      final msg = cd['message']     as String? ?? '';

      if (!ok) {
        if (mounted) {
          setState(() => _placing = false);
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(msg.isNotEmpty
                ? msg
                : 'Cannot place order right now.'),
            backgroundColor: Colors.red,
          ));
        }
        return;
      }

      await _api.post('/users/order', {
        'vendorId':       widget.vendorId,
        'amount':         _plan!.price,
        'deliverySlot':   'Lunch',
        'mealPreference': _mealPref,
        'plan':           _plan!.planCode,
        'paymentMethod':  'Cash',
      });

      if (!mounted) return;
      setState(() => _placing = false);

      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16)),
          title: const Row(children: [
            Icon(Icons.check_circle, color: _green, size: 26),
            SizedBox(width: 8),
            Text('Order Confirmed!'),
          ]),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _summaryLine('Plan',    _plan!.shortLabel),
              _summaryLine('Amount',  '₹${_plan!.price.toStringAsFixed(0)}'),
              _summaryLine('Start',   _fmtDate(_startDate)),
              _summaryLine('Meal',    _mealPref),
              _summaryLine('Payment', 'Cash'),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                context.go('/subscription');
              },
              child: const Text('Go to Subscriptions'),
            ),
            ElevatedButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                context.go('/home');
              },
              style: ElevatedButton.styleFrom(
                  backgroundColor: _orange,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8))),
              child: const Text('Back to Home'),
            ),
          ],
        ),
      );
    } on DioException catch (e) {
      if (mounted) {
        setState(() => _placing = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(_api.handleError(e)),
            backgroundColor: Colors.red));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _placing = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
            content: Text(e.toString()),
            backgroundColor: Colors.red));
      }
    }
  }

  // ── Razorpay online payment ───────────────────────────────────────────
  Future<void> _handleOnlinePayment() async {
    setState(() => _placing = true);

    try {
      // Step 1 — create Razorpay order on the backend
      final cr = await _api.post('/users/payment/create-order', {
        'amount':         _plan!.price,
        'vendorId':       widget.vendorId,
        'plan':           _plan!.planCode,
        'mealPreference': _mealPref,
      });

      final cd       = cr.data as Map<String, dynamic>? ?? {};
      final orderId  = cd['orderId']  as String? ?? '';
      // Razorpay requires amount as int (paise). Explicit cast prevents
      // double values (e.g. 56000.0) from being rejected by the SDK.
      final int amount = (cd['amount'] as num?)?.toInt() ?? 0;
      final currency   = cd['currency'] as String? ?? 'INR';
      final keyId      = cd['keyId']    as String? ?? '';

      // Step 2 — validate that the backend returned all required fields
      if (keyId.isEmpty) {
        if (mounted) {
          setState(() => _placing = false);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:         Text('Payment setup failed: missing Razorpay key. '
                'Please contact support.'),
            backgroundColor: Colors.red,
          ));
        }
        return;
      }
      if (orderId.isEmpty) {
        if (mounted) {
          setState(() => _placing = false);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:         Text('Payment setup failed: missing order ID. '
                'Please try again.'),
            backgroundColor: Colors.red,
          ));
        }
        return;
      }
      if (amount <= 0) {
        if (mounted) {
          setState(() => _placing = false);
          ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content:         Text('Payment setup failed: invalid amount. '
                'Please try again.'),
            backgroundColor: Colors.red,
          ));
        }
        return;
      }

      // Step 3 — read logged-in user details for Razorpay prefill
      String userEmail = '';
      String userPhone = '';
      try {
        final prefs = await SharedPreferences.getInstance();
        final raw   = prefs.getString('mealsetu_user');
        if (raw != null) {
          final u  = jsonDecode(raw) as Map<String, dynamic>;
          userEmail = u['email'] as String? ?? '';
          userPhone = u['phone'] as String? ?? '';
        }
      } catch (_) {}

      if (!mounted) return;

      if (kIsWeb) {
        final payment = await openRazorpayCheckout(
          keyId: keyId,
          orderId: orderId,
          amount: amount,
          currency: currency,
          description: '${_plan!.shortLabel} Meal Plan',
          email: userEmail,
          contact: userPhone,
        );
        await _confirmOnlinePayment(
          orderId: payment['razorpay_order_id'],
          paymentId: payment['razorpay_payment_id'],
          signature: payment['razorpay_signature'],
        );
      } else {
        setState(() => _placing = false);
        _razorpay!.open({
          'key':         keyId,
          'amount':      amount,   // paise int — correct for Razorpay
          'currency':    currency,
          'order_id':    orderId,
          'name':        'MealSetu',
          'description': '${_plan!.shortLabel} Meal Plan',
          'prefill': {
            'contact': userPhone,
            'email':   userEmail,
          },
          'theme': {'color': '#F26522'},
        });
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() => _placing = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content:         Text(_api.handleError(e)),
          backgroundColor: Colors.red,
        ));
      }
    } catch (e) {
      if (mounted) {
        setState(() => _placing = false);
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content:         Text(e.toString()),
          backgroundColor: Colors.red,
        ));
      }
    }
  }

  // ── Razorpay callbacks ────────────────────────────────────────────────

  /// Called by Razorpay SDK on successful payment.
  /// Verifies the payment signature with the backend, then shows a
  /// success dialog that routes to /subscription.
  Future<void> _handlePaymentSuccess(PaymentSuccessResponse response) async {
    await _confirmOnlinePayment(
      orderId: response.orderId,
      paymentId: response.paymentId,
      signature: response.signature,
    );
  }

  Future<void> _confirmOnlinePayment({
    required String? orderId,
    required String? paymentId,
    required String? signature,
  }) async {
    if (mounted) setState(() => _placing = true);
    try {
      await _api.post('/users/payment/verify', {
        'razorpay_order_id':   orderId,
        'razorpay_payment_id': paymentId,
        'razorpay_signature':  signature,
        'vendorId':            widget.vendorId,
        'plan':                _plan?.planCode  ?? '',
        'amount':              _plan?.price     ?? 0,
        'mealPreference':      _mealPref,
        'deliverySlot':        'Lunch',
      });
    } on DioException catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content:         Text(_api.handleError(e)),
          backgroundColor: Colors.red,
        ));
      }
      return;
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content:         Text(e.toString()),
          backgroundColor: Colors.red,
        ));
      }
      return;
    } finally {
      if (mounted) setState(() => _placing = false);
    }

    if (!mounted) return;
    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: false,
        builder: (ctx) => AlertDialog(
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16)),
          title: const Row(children: [
            Icon(Icons.check_circle, color: _green, size: 26),
            SizedBox(width: 8),
            Flexible(child: Text('Payment Successful!')),
          ]),
          content: Text(
              'Your ${_plan?.shortLabel ?? ''} plan is now active.'),
          actions: [
            ElevatedButton(
              onPressed: () {
                Navigator.of(ctx).pop();
                context.go('/subscription');
              },
              style: ElevatedButton.styleFrom(
                backgroundColor: _orange,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
                elevation: 0,
              ),
              child: const Text('View Subscription'),
            ),
          ],
        ),
      );
    } catch (uiError) {
      debugPrint('Payment succeeded but success UI failed: $uiError');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Payment succeeded and the order was saved, but this screen could not update. Refresh your orders.'),
          backgroundColor: Colors.orange,
        ));
      }
    }
  }

  /// Called by Razorpay SDK when payment fails or is cancelled.
  void _handlePaymentError(PaymentFailureResponse response) {
    if (mounted) {
      final code    = response.code?.toString() ?? 'unknown';
      final message = (response.message?.isNotEmpty == true)
          ? response.message!
          : 'Payment failed. Please try again.';
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content:         Text('Payment failed [$code]: $message'),
        backgroundColor: Colors.red,
        duration:        const Duration(seconds: 6),
      ));
    }
  }

  /// Called when the user selects an external wallet (e.g. Paytm).
  /// No extra action needed — Razorpay handles the rest.
  void _handleExternalWallet(ExternalWalletResponse response) {}

  // ── Review sheet ──────────────────────────────────────────────────────
  void _showReviewSheet() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => _ReviewSheet(
        vendorId:    widget.vendorId,
        vendorName:  widget.vendor?.name ?? '',
        onSubmitted: () {
          _fetchReviews();
          _fetchEligibility();
        },
      ),
    );
  }

  // ── Static helpers ────────────────────────────────────────────────────
  static Widget _summaryLine(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(children: [
          Text('$label: ',
              style: const TextStyle(fontWeight: FontWeight.w600)),
          Expanded(child: Text(value)),
        ]),
      );

  // ── Root build ────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        elevation: 1,
        title: Text(
          widget.vendor?.name ?? 'Vendor Detail',
          style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700),
        ),
        leading: BackButton(onPressed: () => context.pop()),
      ),
      body: RefreshIndicator(
        color: _orange,
        onRefresh: _refreshAll,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 12),
              _buildHeader(),
              if (!_loadingStatus && !_isOpen) _buildClosedBanner(),
              const SizedBox(height: 12),
              _buildStepIndicator(),
              const SizedBox(height: 12),
              AnimatedSwitcher(
                duration: const Duration(milliseconds: 220),
                child: KeyedSubtree(
                  key: ValueKey(_step),
                  child: _step == 0
                      ? _buildStep1()
                      : _step == 1
                          ? _buildStep2()
                          : _buildStep3(),
                ),
              ),
              const SizedBox(height: 16),
              const Divider(height: 1, color: _border),
              const SizedBox(height: 16),
              _buildReviewsSection(),
              const SizedBox(height: 40),
            ],
          ),
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════
  Widget _buildHeader() {
    final v = widget.vendor;
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      clipBehavior: Clip.antiAlias,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Banner
          SizedBox(
            height: 200,
            width: double.infinity,
            child: v?.kitchenPoster != null && v!.kitchenPoster!.isNotEmpty
                ? CachedNetworkImage(
                    imageUrl: v.kitchenPoster!,
                    fit: BoxFit.cover,
                    placeholder: (_, _) =>
                        _bannerFallback(loading: true),
                    errorWidget: (_, _, _) => _bannerFallback(),
                  )
                : _bannerFallback(),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Name
                Text(
                  v?.name ?? '…',
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w700,
                      color: Theme.of(context).colorScheme.onSurface),
                ),
                const SizedBox(height: 6),
                // Address
                if (v?.address.isNotEmpty == true)
                  Row(children: [
                    Icon(Icons.location_on_outlined,
                        size: 14,
                        color: Theme.of(context).colorScheme.onSurfaceVariant),
                    const SizedBox(width: 4),
                    Expanded(
                      child: Text(v!.address,
                          style: TextStyle(
                              fontSize: 13,
                              color: Theme.of(context).colorScheme.onSurfaceVariant)),
                    ),
                  ]),
                const SizedBox(height: 6),
                // FSSAI + rating
                Wrap(spacing: 10, crossAxisAlignment: WrapCrossAlignment.center,
                    children: [
                  if (v?.fssai.isNotEmpty == true)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: _green.withAlpha(26),
                        borderRadius: BorderRadius.circular(4),
                        border:
                            Border.all(color: _green.withAlpha(128)),
                      ),
                      child: Text('FSSAI: ${v!.fssai}',
                          style: const TextStyle(
                              fontSize: 10,
                              color: _green,
                              fontWeight: FontWeight.w600)),
                    ),
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      ...List.generate(
                          5,
                          (i) => Icon(
                                i < (v?.rating ?? 0).round()
                                    ? Icons.star
                                    : Icons.star_border,
                                color: _amber,
                                size: 16,
                              )),
                      const SizedBox(width: 4),
                      Text(
                        '(${_reviews.length} reviews)',
                        style: const TextStyle(
                            fontSize: 12, color: _textSecondary),
                      ),
                    ],
                  ),
                ]),
                const SizedBox(height: 6),
                // Days + Timings
                if (v != null)
                  Row(children: [
                    const Icon(Icons.calendar_today_outlined,
                        size: 13, color: _textSecondary),
                    const SizedBox(width: 3),
                    Text(v.workingDays,
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _textPrimary)),
                    const SizedBox(width: 14),
                    const Icon(Icons.access_time_outlined,
                        size: 13, color: _textSecondary),
                    const SizedBox(width: 3),
                    Text(v.timings,
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: _textPrimary)),
                  ]),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _bannerFallback({bool loading = false}) => Container(
        height: 200,
        color: Colors.grey.shade200,
        child: Center(
          child: loading
              ? const CircularProgressIndicator(strokeWidth: 2)
              : const Icon(Icons.restaurant,
                  size: 64, color: Colors.grey),
        ),
      );

  Widget _buildClosedBanner() => Container(
        margin: const EdgeInsets.only(top: 8),
        width: double.infinity,
        padding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: Colors.red.shade200),
        ),
        child: Row(children: [
          Icon(Icons.cancel_outlined,
              color: Colors.red.shade700, size: 16),
          const SizedBox(width: 8),
          Text('Kitchen is currently closed',
              style: TextStyle(
                  color: Colors.red.shade700,
                  fontWeight: FontWeight.w600,
                  fontSize: 13)),
        ]),
      );

  // ═══════════════════════════════════════════════════════════════════════
  // STEP INDICATOR
  // ═══════════════════════════════════════════════════════════════════════
  Widget _buildStepIndicator() {
    const labels = ['Plan', 'Menu', 'Payment'];
    final cs = Theme.of(context).colorScheme;
    return Card(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            for (int i = 0; i < 3; i++) ...[
              Expanded(
                child: GestureDetector(
                  onTap: i < _step ? () => setState(() => _step = i) : null,
                  child: Container(
                    padding: const EdgeInsets.symmetric(vertical: 9),
                    decoration: BoxDecoration(
                      color: i == _step
                          ? _orange
                          : i < _step
                              ? Colors.transparent
                              : cs.surfaceContainerHighest,
                      border: i < _step
                          ? Border.all(color: _orange, width: 1.5)
                          : null,
                      borderRadius: BorderRadius.circular(20),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '${i + 1}. ${labels[i]}',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: i == _step
                            ? Colors.white
                            : i < _step
                                ? _orange
                                : cs.onSurfaceVariant,
                      ),
                    ),
                  ),
                ),
              ),
              if (i < 2)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Text('›',
                      style: TextStyle(
                          fontSize: 20,
                          color: _step > i ? _orange : cs.outlineVariant)),
                ),
            ],
          ],
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 1 — SELECT PLAN
  // ═══════════════════════════════════════════════════════════════════════
  Widget _buildStep1() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 4),
        Text('Select Your Plan',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.onSurface)),
        const SizedBox(height: 12),
        // Kitchen closed notice
        if (!_loadingStatus && !_isOpen)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.red.shade200),
            ),
            child: Text(
              'Kitchen is currently closed. You can still place an '
              'order for when they reopen.',
              style: TextStyle(
                  color: Colors.red.shade700, fontSize: 12),
            ),
          ),
        // Plan cards
        _loadingPricing
            ? const Center(
                child: Padding(
                  padding: EdgeInsets.all(24),
                  child: CircularProgressIndicator(color: _orange),
                ))
            : _pricingError != null
                ? _errorBox(_pricingError!)
                : _buildPlanCards(),
        const SizedBox(height: 20),
        // Start date
        _buildStartDateRow(),
        const SizedBox(height: 24),
        SizedBox(
          width: double.infinity,
          height: 52,
          child: ElevatedButton(
            onPressed: _plan == null
                ? null
                : () => setState(() => _step = 1),
            style: ElevatedButton.styleFrom(
              backgroundColor: _orange,
              foregroundColor: Colors.white,
              disabledBackgroundColor: _greyFill,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
              elevation: 0,
            ),
            child: const Text('Next: View Menu →',
                style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w700)),
          ),
        ),
      ],
    );
  }

  Widget _buildPlanCards() {
    final cs = Theme.of(context).colorScheme;
    if (_tiers.isEmpty) {
      return Center(
          child: Text('No pricing available.',
              style: TextStyle(color: cs.onSurfaceVariant)));
    }
    return Row(
      children: List.generate(_tiers.length, (i) {
        final t   = _tiers[i];
        final sel = _plan?.planCode == t.planCode;
        return Expanded(
          child: GestureDetector(
            onTap: () => setState(() => _plan = t),
            child: Container(
              margin: EdgeInsets.only(right: i < _tiers.length - 1 ? 8 : 0),
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: sel ? _lightOrange : cs.surface,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(
                  color: sel ? _orange : cs.outlineVariant,
                  width: 1.5,
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(t.shortLabel,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: sel ? _orange : cs.onSurface)),
                  Text(t.subLabel,
                      style: TextStyle(
                          fontSize: 11, color: cs.onSurfaceVariant)),
                  const SizedBox(height: 8),
                  Text('₹${t.price.toStringAsFixed(0)}',
                      style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: sel ? _orange : cs.onSurface)),
                ],
              ),
            ),
          ),
        );
      }),
    );
  }

  Widget _buildStartDateRow() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('START DATE',
            style: TextStyle(
                fontSize: 11,
                color: _textSecondary,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5)),
        const SizedBox(height: 6),
        GestureDetector(
          onTap: () async {
            final picked = await showDatePicker(
              context: context,
              initialDate: _startDate,
              firstDate: DateTime.now(),
              lastDate: DateTime.now().add(const Duration(days: 365)),
              builder: (ctx, child) => Theme(
                data: Theme.of(ctx).copyWith(
                  colorScheme: const ColorScheme.light(
                      primary: _orange),
                ),
                child: child!,
              ),
            );
            if (picked != null && mounted) {
              setState(() => _startDate = picked);
            }
          },
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 14, vertical: 13),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(children: [
              const Icon(Icons.calendar_today_outlined,
                  size: 16, color: _orange),
              const SizedBox(width: 10),
              Text(_fmtDate(_startDate),
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w600,
                      color: Theme.of(context).colorScheme.onSurface)),
              const Spacer(),
              Icon(Icons.edit_outlined,
                  size: 15,
                  color: Theme.of(context).colorScheme.onSurfaceVariant),
            ]),
          ),
        ),
      ],
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 2 — MENU & PREFERENCE
  // ═══════════════════════════════════════════════════════════════════════
  Widget _buildStep2() {
    const days  = ['Monday','Tuesday','Wednesday','Thursday',
                   'Friday','Saturday','Sunday'];
    const short = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    final meal  = _weeklyPlan[_selDay];
    final offersJain = widget.vendor?.offersJainMenu ?? false;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 4),
        Text('Select Menu Day',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.onSurface)),
        const SizedBox(height: 12),
        // Day chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: List.generate(days.length, (i) {
              final sel = _selDay == days[i];
              return GestureDetector(
                onTap: () => setState(() {
                  _menuDayManuallySelected = true;
                  _selDay    = days[i];
                  _altChoice = 'default';
                }),
                child: Container(
                  height: 36,
                  margin: const EdgeInsets.only(right: 8),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: sel ? _orange : Colors.transparent,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(
                        color: sel
                            ? _orange
                            : Theme.of(context).colorScheme.outlineVariant,
                        width: 1.5),
                  ),
                  child: Text(short[i],
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: sel
                              ? Colors.white
                              : Theme.of(context).colorScheme.onSurfaceVariant)),
                ),
              );
            }),
          ),
        ),
        const SizedBox(height: 14),
        // Menu card with left orange border
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: _lightOrange,
            borderRadius: BorderRadius.circular(12),
            border: const Border(
              left: BorderSide(color: _orange, width: 3),
            ),
          ),
          child: _loadingMenu
              ? const Center(
                  child: CircularProgressIndicator(color: _orange))
              : Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('📅  Menu for $_selDay',
                        style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: _orange)),
                    const SizedBox(height: 10),
                    _menuRow('Main',    meal?.mainCourse),
                    const SizedBox(height: 6),
                    _menuRow('Alt',     meal?.altSabji),
                    const SizedBox(height: 6),
                    _menuRow('2nd Alt', meal?.altSabji2),
                    const SizedBox(height: 6),
                    _menuRow('Sides',   meal?.sides),
                  ],
                ),
        ),
        const SizedBox(height: 14),
        // Alter main subji dropdown
        if (meal != null &&
            (meal.altSabji != null || meal.altSabji2 != null)) ...[
          Text('ALTER MAIN SUBJI',
              style: TextStyle(
                  fontSize: 11,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5)),
          const SizedBox(height: 6),
          Container(
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,
              border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant),
              borderRadius: BorderRadius.circular(8),
            ),
            padding:
                const EdgeInsets.symmetric(horizontal: 12),
            child: DropdownButton<String>(
              value: _altChoice,
              isExpanded: true,
              underline: const SizedBox(),
              items: [
                const DropdownMenuItem(
                    value: 'default',
                    child: Text('Use Default Menu')),
                if (meal.altSabji != null)
                  DropdownMenuItem(
                      value: 'alt1',
                      child: Text('Alt: ${meal.altSabji}')),
                if (meal.altSabji2 != null)
                  DropdownMenuItem(
                      value: 'alt2',
                      child: Text('2nd Alt: ${meal.altSabji2}')),
              ],
              onChanged: (v) =>
                  setState(() => _altChoice = v ?? 'default'),
            ),
          ),
          const SizedBox(height: 14),
        ],
        // Meal preference
        const Text('MEAL PREFERENCE',
            style: TextStyle(
                fontSize: 11,
                color: _textSecondary,
                fontWeight: FontWeight.w700,
                letterSpacing: 0.5)),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
              child: _prefBtn(
                  '🍛 Regular', 'Regular', _orange)),
          if (offersJain) ...[
            const SizedBox(width: 10),
            Expanded(
                child: _prefBtn(
                    '☘️ Jain', 'Jain', _green)),
          ],
        ]),
        const SizedBox(height: 24),
        Row(children: [
          Expanded(
            child: SizedBox(
              height: 48,
              child: OutlinedButton(
                onPressed: () => setState(() => _step = 0),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _textSecondary,
                  side: const BorderSide(color: _border),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('← Back'),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: SizedBox(
              height: 48,
              child: ElevatedButton(
                onPressed: () {
                    setState(() {
                      _step = 2;
                    });
                    _preCheckCanPurchase();
                  },
                style: ElevatedButton.styleFrom(
                  backgroundColor: _orange,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
                child: const Text('Next: Payment →',
                    style: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        ]),
      ],
    );
  }

  Widget _menuRow(String label, String? value) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 68,
            child: Text('$label:',
                style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: _textPrimary)),
          ),
          Expanded(
            child: Text(
              value ?? 'Not set',
              style: TextStyle(
                  fontSize: 12,
                  color: value != null ? _textPrimary : _textSecondary,
                  fontStyle: value == null
                      ? FontStyle.italic
                      : FontStyle.normal),
            ),
          ),
        ],
      );

  Widget _prefBtn(String label, String value, Color active) {
    final sel = _mealPref == value;
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: () => setState(() => _mealPref = value),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: sel ? active.withAlpha(26) : cs.surface,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
              color: sel ? active : cs.outlineVariant, width: 1.5),
        ),
        child: Center(
          child: Text(label,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: sel ? active : cs.onSurfaceVariant)),
        ),
      ),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // STEP 3 — PAYMENT
  // ═══════════════════════════════════════════════════════════════════════
  Widget _buildStep3() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SizedBox(height: 4),
        Text('Payment Method',
            style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.onSurface)),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: _payCard('Cash', '💵', 'Cash')),
            const SizedBox(width: 10),
            Expanded(child: _payCard('Online', '💳', 'Online\nUPI/Card')),
          ],
        ),
        const SizedBox(height: 14),
        // canPurchase warning
        if (_canPurchase == false)
          Container(
            margin: const EdgeInsets.only(bottom: 12),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: Colors.red.shade50,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: Colors.red.shade200),
            ),
            child: Text(
              _canPurchaseMsg.isNotEmpty
                  ? _canPurchaseMsg
                  : 'Cannot place order at this time.',
              style: TextStyle(
                  color: Colors.red.shade700, fontSize: 12),
            ),
          ),
        // Order summary
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: _lightOrange,
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text('Order Summary',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w700,
                      color: _orange)),
              const Divider(height: 16, color: _border),
              _orderRow('Plan',       _plan?.shortLabel ?? ''),
              _orderRow('Menu Day',   _selDay),
              _orderRow('Start Date', _fmtDate(_startDate)),
              _orderRow('Meal Type',  _mealPref),
              _orderRow('Payment',    _payMethod),
              const Divider(height: 16, color: _border),
              Center(
                child: Text(
                  'Total: ₹${_plan?.price.toStringAsFixed(0) ?? '0'}',
                  style: const TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: _orange),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        Row(children: [
          Expanded(
            child: SizedBox(
              height: 48,
              child: OutlinedButton(
                onPressed:
                    _placing ? null : () => setState(() => _step = 1),
                style: OutlinedButton.styleFrom(
                  foregroundColor: _textSecondary,
                  side: const BorderSide(color: _border),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
                child: const Text('← Back'),
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            flex: 2,
            child: SizedBox(
              height: 52,
              child: ElevatedButton(
                onPressed: _placing
                    ? null
                    : () => _payMethod == 'Cash'
                        ? _submitCashOrder()
                        : _handleOnlinePayment(),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _orange,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
                child: _placing
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white))
                    : Text(
                        _payMethod == 'Cash'
                            ? 'Place Order'
                            : '💳 Pay Online',
                        style: const TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
              ),
            ),
          ),
        ]),
      ],
    );
  }

  Widget _payCard(String value, String emoji, String label) {
    final sel = _payMethod == value;
    final cs = Theme.of(context).colorScheme;
    return GestureDetector(
      onTap: () => setState(() => _payMethod = value),
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 18),
        decoration: BoxDecoration(
          color: sel ? _lightOrange : cs.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
              color: sel ? _orange : cs.outlineVariant,
              width: sel ? 2 : 1),
        ),
        child: Column(children: [
          Text(emoji,
              style: const TextStyle(fontSize: 28)),
          const SizedBox(height: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: sel ? _orange : cs.onSurface),
              textAlign: TextAlign.center),
        ]),
      ),
    );
  }

  Widget _orderRow(String label, String value) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: Row(children: [
          Text(label,
              style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: _textPrimary)),
          const Spacer(),
          Text(value,
              style: const TextStyle(
                  fontSize: 13, color: _textSecondary)),
        ]),
      );

  // ═══════════════════════════════════════════════════════════════════════
  // REVIEWS
  // ═══════════════════════════════════════════════════════════════════════
  Widget _buildReviewsSection() {
    final avg = _reviews.isEmpty
        ? 0.0
        : _reviews.map((r) => r.rating).reduce((a, b) => a + b) /
            _reviews.length;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(children: [
          Text('Reviews',
              style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.onSurface)),
          const SizedBox(width: 6),
          Text('(${_reviews.length})',
              style: TextStyle(
                  fontSize: 14,
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
        ]),
        const SizedBox(height: 12),
        // Rating summary card
        if (!_loadingReviews && _reviews.isNotEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surfaceContainerLowest,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(avg.toStringAsFixed(1),
                        style: const TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.w800,
                            color: _orange)),
                    Row(
                      children: List.generate(
                          5,
                          (i) => Icon(
                                i < avg.round()
                                    ? Icons.star
                                    : Icons.star_border,
                                color: _amber,
                                size: 18)),
                    ),
                    Text(
                        '${_reviews.length} review${_reviews.length == 1 ? '' : 's'}',
                        style: const TextStyle(
                            fontSize: 12,
                            color: _textSecondary)),
                  ],
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: _green.withAlpha(20),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.verified,
                          color: _green, size: 14),
                      SizedBox(width: 4),
                      Text('Verified Reviews',
                          style: TextStyle(
                              fontSize: 11,
                              color: _green,
                              fontWeight: FontWeight.w600)),
                    ],
                  ),
                ),
              ],
            ),
          ),
        const SizedBox(height: 12),
        // Reviews list / shimmer / empty
        if (_loadingReviews)
          _buildReviewShimmer()
        else if (_reviews.isEmpty)
          const Center(
            child: Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Column(children: [
                Text('📝', style: TextStyle(fontSize: 36)),
                SizedBox(height: 8),
                Text('No reviews yet',
                    style: TextStyle(
                        fontSize: 15,
                        fontWeight: FontWeight.w600,
                        color: _textPrimary)),
                SizedBox(height: 4),
                Text('Be the first to share your experience!',
                    style: TextStyle(
                        fontSize: 13, color: _textSecondary)),
              ]),
            ),
          )
        else
          Column(
            children: _reviews
                .map((r) => _ReviewCard(review: r))
                .toList()),
        const SizedBox(height: 14),
        // Write a Review button — gated on canReview
        SizedBox(
          width: double.infinity,
          height: 50,
          child: _canReview == true
              ? OutlinedButton(
                  onPressed: _showReviewSheet,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _orange,
                    side: const BorderSide(color: _orange, width: 1.5),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  child: const Text('Write a Review',
                      style: TextStyle(
                          fontSize: 14, fontWeight: FontWeight.w600)),
                )
              : OutlinedButton(
                  onPressed: null,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _textSecondary,
                    side: const BorderSide(color: _border),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    disabledForegroundColor: _textSecondary,
                  ),
                  child: Text(
                    _canReview == null
                        ? 'Checking eligibility…'
                        : 'You must order first to write a review',
                    style: const TextStyle(fontSize: 13),
                  ),
                ),
        ),
      ],
    );
  }

  Widget _buildReviewShimmer() {
    return Shimmer.fromColors(
      baseColor: Colors.grey.shade300,
      highlightColor: Colors.grey.shade100,
      child: Column(
        children: List.generate(
          2,
          (_) => Container(
            margin: const EdgeInsets.only(bottom: 10),
            height: 90,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(10),
            ),
          ),
        ),
      ),
    );
  }

  Widget _errorBox(String msg) => Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.red.shade50,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: Colors.red.shade200),
        ),
        child: Text(msg,
            style: TextStyle(
                color: Colors.red.shade700, fontSize: 13)),
      );
}

// ── Review card ───────────────────────────────────────────────────────────────

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({required this.review});
  final _ReviewItem review;

  @override
  Widget build(BuildContext context) {
    final r      = review.rating.round().clamp(1, 5);
    final isAnon = review.userName == 'Anonymous';

    // Badge colour: green ≥ 4 stars, amber = 3, red ≤ 2
    final Color badgeColor;
    if (r >= 4) {
      badgeColor = _green;
    } else if (r == 3) {
      badgeColor = _amber;
    } else {
      badgeColor = Colors.red;
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color:        Colors.white,
        borderRadius: BorderRadius.circular(10),
        border:       Border.all(color: _border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Name + date ────────────────────────────────────────────────
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: Text(
                  review.userName,
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize:   14,
                    // "Anonymous" is dimmed to distinguish from real names
                    color: isAnon ? _textSecondary : _textPrimary,
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                review.date,
                style: const TextStyle(
                    fontSize: 12, color: _textSecondary),
              ),
            ],
          ),
          const SizedBox(height: 8),
          // ── Stars + badge ──────────────────────────────────────────────
          Row(
            children: [
              // 5 star icons — filled amber / empty grey
              ...List.generate(
                5,
                (i) => Icon(
                  i < r ? Icons.star : Icons.star_border,
                  color: i < r ? _amber : _greyFill,
                  size: 15,
                ),
              ),
              const SizedBox(width: 8),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color:        badgeColor.withAlpha(26),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(
                  '$r/5',
                  style: TextStyle(
                    fontSize:   11,
                    color:      badgeColor,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
          // ── Comment ────────────────────────────────────────────────────
          if (review.comment.isNotEmpty) ...[
            const SizedBox(height: 8),
            Text(
              review.comment,
              style: const TextStyle(
                fontSize: 13,
                color:    _textSecondary,
                height:   1.5, // line-height 1.5 for readability
              ),
            ),
          ],
        ],
      ),
    );
  }
}

// ── Review bottom sheet ───────────────────────────────────────────────────────

class _ReviewSheet extends StatefulWidget {
  const _ReviewSheet({
    required this.vendorId,
    required this.vendorName,
    required this.onSubmitted,
  });
  final String       vendorId;
  final String       vendorName;
  final VoidCallback onSubmitted;

  @override
  State<_ReviewSheet> createState() => _ReviewSheetState();
}

class _ReviewSheetState extends State<_ReviewSheet> {
  final _api  = ApiService();
  final _ctrl = TextEditingController();

  int    _rating     = 5; // default: Excellent
  bool   _submitting = false;
  String? _error;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error      = null;
    });
    try {
      await _api.post('/users/review', {
        'vendorId': widget.vendorId,
        'rating':   _rating,
        'comment':  _ctrl.text.trim(),
      });
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Review submitted! ✅')));
      widget.onSubmitted();
    } on DioException catch (e) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error      = ApiService().handleError(e);
        });
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          _submitting = false;
          _error      = 'Failed to submit review.';
        });
      }
    }
  }

  // ── Label for current star selection ─────────────────────────────────────
  static const _ratingLabels = {
    1: 'Terrible',
    2: 'Poor',
    3: 'Average',
    4: 'Good',
    5: 'Excellent',
  };
  static const _ratingColors = {
    1: Color(0xFFDC2626),
    2: Color(0xFFEA580C),
    3: Color(0xFFCA8A04),
    4: Color(0xFF16A34A),
    5: Color(0xFF15803D),
  };

  @override
  Widget build(BuildContext context) {
    final labelColor = _ratingColors[_rating] ?? _orange;
    final labelText  = _ratingLabels[_rating]  ?? '';

    return Padding(
      padding: EdgeInsets.only(
        left:   20,
        right:  20,
        top:    20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 28,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle bar
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 16),
          Text('Review ${widget.vendorName}',
              style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: _textPrimary)),
          const SizedBox(height: 24),

          // ── Interactive star rating ──────────────────────────────────
          Center(
            child: Column(
              children: [
                // 5 tappable stars
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: List.generate(5, (i) {
                    final starIndex = i + 1;
                    final filled   = starIndex <= _rating;
                    return GestureDetector(
                      onTap: () => setState(() => _rating = starIndex),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 6),
                        child: Icon(
                          filled ? Icons.star_rounded : Icons.star_outline_rounded,
                          size:  44,
                          color: filled ? _amber : Colors.grey.shade300,
                        ),
                      ),
                    );
                  }),
                ),
                const SizedBox(height: 8),
                // Label below stars
                AnimatedSwitcher(
                  duration: const Duration(milliseconds: 180),
                  child: Text(
                    labelText,
                    key: ValueKey(_rating),
                    style: TextStyle(
                      fontSize:   16,
                      fontWeight: FontWeight.w700,
                      color:      labelColor,
                    ),
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),
          // Comment
          const Text('COMMENT (OPTIONAL)',
              style: TextStyle(
                  fontSize: 11,
                  color: _textSecondary,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.5)),
          const SizedBox(height: 6),
          TextField(
            controller: _ctrl,
            maxLines:   4,
            decoration: InputDecoration(
              hintText: 'Share your experience…',
              hintStyle:
                  const TextStyle(color: _textSecondary),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: _border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: const BorderSide(color: _border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(8),
                borderSide: BorderSide(color: labelColor, width: 1.5),
              ),
              contentPadding: const EdgeInsets.all(12),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 8),
            Text(_error!,
                style: const TextStyle(
                    color: Colors.red, fontSize: 12)),
          ],
          const SizedBox(height: 20),
          Row(children: [
            // Submit
            Expanded(
              flex: 2,
              child: SizedBox(
                height: 50,
                child: ElevatedButton(
                  onPressed: _submitting ? null : _submit,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _orange,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    elevation: 0,
                  ),
                  child: _submitting
                      ? const SizedBox(
                          height: 18,
                          width: 18,
                          child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: Colors.white))
                      : const Text('Submit',
                          style: TextStyle(
                              fontWeight: FontWeight.w700,
                              fontSize: 15)),
                ),
              ),
            ),
            const SizedBox(width: 10),
            // Cancel
            Expanded(
              child: SizedBox(
                height: 50,
                child: OutlinedButton(
                  onPressed: _submitting
                      ? null
                      : () => Navigator.of(context).pop(),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: _textSecondary,
                    side: const BorderSide(color: _border),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  child: const Text('Cancel'),
                ),
              ),
            ),
          ]),
        ],
      ),
    );
  }
}
