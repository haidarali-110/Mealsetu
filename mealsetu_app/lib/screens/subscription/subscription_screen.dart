import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart' show DioException;
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:razorpay_flutter/razorpay_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../constants/app_colors.dart';
import '../../services/api_service.dart';
import '../../services/razorpay_checkout.dart';

// ─────────────────────────────────────────────────────────────────────────────
// SubscriptionScreen
// ─────────────────────────────────────────────────────────────────────────────

class SubscriptionScreen extends StatefulWidget {
  const SubscriptionScreen({super.key});

  @override
  State<SubscriptionScreen> createState() => _SubscriptionScreenState();
}

class _SubscriptionScreenState extends State<SubscriptionScreen> {
  // ── Services ──────────────────────────────────────────────────────────────
  final _api = ApiService();

  // ── Subscription data ─────────────────────────────────────────────────────
  Map<String, dynamic>? _sub;
  List<Map<String, dynamic>> _upcoming = [];
  bool _isLoading = true;
  String? _error;
  Timer? _pollTimer;

  // ── Leave section ─────────────────────────────────────────────────────────
  DateTime? _leaveStart;
  DateTime? _leaveEnd;
  String    _mealType     = 'both';
  String    _overlapErr   = '';
  bool      _isApplyingLeave = false;

  // ── Notification banners ──────────────────────────────────────────────────
  bool _dinnerBannerDismissed   = false;
  bool _tomorrowBannerDismissed = false;

  // ── Extend / Razorpay ─────────────────────────────────────────────────────
  bool   _isExtending              = false;
  String _pendingExtendPlan        = '';
  String _pendingExtendVendorId    = '';
  int    _pendingWalletDeduction   = 0;   // wallet ₹ applied to current payment
  Razorpay? _razorpay;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _loadData();
    _pollTimer = Timer.periodic(
      const Duration(seconds: 30),
      (_) => _loadData(),
    );
    if (!kIsWeb) {
      _razorpay = Razorpay();
      _razorpay!.on(Razorpay.EVENT_PAYMENT_SUCCESS, _handlePaymentSuccess);
      _razorpay!.on(Razorpay.EVENT_PAYMENT_ERROR,   _handlePaymentError);
      _razorpay!.on(Razorpay.EVENT_EXTERNAL_WALLET, _handleExternalWallet);
    }
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    _razorpay?.clear();
    super.dispose();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  Future<void> _loadData() async {
    if (mounted) setState(() => _error = null);
    try {
      final results = await Future.wait([
        _api.get('/users/orders/my-subscription'),
        _api.get('/users/orders/upcoming'),
      ]);
      if (!mounted) return;

      final rawSub      = results[0].data;
      final rawUpcoming = results[1].data;

      setState(() {
        _sub = (rawSub is Map)
            ? Map<String, dynamic>.from(rawSub)
            : null;
        _upcoming = ((rawUpcoming as List<dynamic>?) ?? [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _isLoading = false;
      });
    } on DioException catch (e) {
      if (mounted) setState(() { _isLoading = false; _error = _api.handleError(e); });
    } catch (_) {
      if (mounted) setState(() { _isLoading = false; _error = 'Failed to load. Pull to refresh.'; });
    }
  }

  // ── Leave helpers ─────────────────────────────────────────────────────────

  bool _hasLeaveOverlap(DateTime start, DateTime end) {
    final leaves = (_sub?['leaveDates'] as List<dynamic>?) ?? [];
    for (final leave in leaves) {
      final ls = _parseDate(leave['startDate']);
      final le = _parseDate(leave['endDate']);
      if (start.isBefore(le.add(const Duration(days: 1))) &&
          end.isAfter(ls.subtract(const Duration(days: 1)))) {
        return true;
      }
    }
    return false;
  }

  void _onLeaveStartChanged(DateTime d) {
    setState(() {
      _leaveStart = d;
      if (_leaveEnd != null) {
        _overlapErr = _hasLeaveOverlap(d, _leaveEnd!)
            ? 'These dates overlap with a leave you already took. Please choose different dates.'
            : '';
      }
    });
  }

  void _onLeaveEndChanged(DateTime d) {
    setState(() {
      _leaveEnd = d;
      if (_leaveStart != null) {
        _overlapErr = _hasLeaveOverlap(_leaveStart!, d)
            ? 'These dates overlap with a leave you already took. Please choose different dates.'
            : '';
      }
    });
  }

  Future<void> _pickLeaveStart() async {
    final endRaw = _sub?['endDate'];
    if (endRaw == null) return;
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate:   DateTime.now(),
      lastDate:    _parseDate(endRaw),
      builder: _datePickerTheme,
    );
    if (picked != null) _onLeaveStartChanged(picked);
  }

  Future<void> _pickLeaveEnd() async {
    final endRaw = _sub?['endDate'];
    if (endRaw == null || _leaveStart == null) return;
    final picked = await showDatePicker(
      context: context,
      initialDate: _leaveStart!,
      firstDate:   _leaveStart!,
      lastDate:    _parseDate(endRaw),
      builder: _datePickerTheme,
    );
    if (picked != null) _onLeaveEndChanged(picked);
  }

  Widget _datePickerTheme(BuildContext ctx, Widget? child) => Theme(
    data: ThemeData.light().copyWith(
      colorScheme: const ColorScheme.light(primary: Color(0xFFF26522)),
    ),
    child: child!,
  );

  Future<void> _applyLeave() async {
    if (_leaveStart == null || _leaveEnd == null) return;
    if (_overlapErr.isNotEmpty) return;

    final startStr = DateFormat('yyyy-MM-dd').format(_leaveStart!);
    final endStr   = DateFormat('yyyy-MM-dd').format(_leaveEnd!);

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Confirm Leave',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w700)),
        content: Text(
          'Apply leave from ${_fmt(_leaveStart!)} to ${_fmt(_leaveEnd!)}?\n\n'
          'Your plan end date will be extended by the leave days.',
          style: GoogleFonts.poppins(fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(true),
            child: Text('Confirm', style: TextStyle(color: AppColors.primary)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;

    setState(() => _isApplyingLeave = true);
    try {
      final resp = await _api.post('/users/apply-leave', {
        'leaveDate':    startStr,
        'leaveEndDate': endStr,
        'mealType':     _mealType,
      });
      final data = resp.data as Map<String, dynamic>? ?? {};
      if (mounted) {
        _snack(
          'Leave applied! Plan extended by ${data["leaveDays"] ?? "?"} day(s) ✓',
          isSuccess: true,
        );
        setState(() { _leaveStart = null; _leaveEnd = null; _overlapErr = ''; });
        await _loadData();
      }
    } on DioException catch (e) {
      if (mounted) _snack(_api.handleError(e), isError: true);
    } catch (_) {
      if (mounted) _snack('Failed to apply leave. Try again.', isError: true);
    } finally {
      if (mounted) setState(() => _isApplyingLeave = false);
    }
  }

  // ── Extend + Razorpay ─────────────────────────────────────────────────────

  Future<void> _showExtendSheet() async {
    if (_sub == null) return;
    final vendorId   = _sub!['vendorId']?.toString() ?? '';
    final vendorName = _sub!['vendorName']  as String? ?? 'Your Kitchen';
    final endDate    = _parseDate(_sub!['endDate']);
    final planType   = _sub!['planType']    as String? ?? '';

    // Load vendor pricing AND wallet balance in parallel
    Map<String, dynamic> pricingData = {};
    bool pricingLoaded = false;
    int  walletBalance = 0;
    try {
      final results = await Future.wait([
        _api.get('/users/vendor-pricing/$vendorId'),
        _api.get('/users/me'),
      ]);
      pricingData    = (results[0].data as Map<String, dynamic>?) ?? {};
      pricingLoaded  = true;
      walletBalance  = ((results[1].data as Map<String, dynamic>?)?['wallet'] as num?)?.toInt() ?? 0;
    } catch (_) {
      // pricing load failure is non-fatal; wallet defaults to 0
      try {
        final pr = await _api.get('/users/vendor-pricing/$vendorId');
        pricingData   = (pr.data as Map<String, dynamic>?) ?? {};
        pricingLoaded = true;
      } catch (_) {}
    }

    final pricing = ((pricingData['pricing'] as List<dynamic>?) ?? [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList();

    int priceFor(String key) => ((pricing.firstWhere(
      (p) => (p['type'] as String).toLowerCase() == key.toLowerCase(),
      orElse: () => {'price': 0},
    )['price'] as num?)?.toInt()) ?? 0;

    final weeklyPrice  = priceFor('weekly');
    final monthlyPrice = priceFor('monthly');

    if (!mounted) return;

    String localPlan    = 'MONTHLY';
    String localPayment = 'Cash';
    bool   localBusy    = false;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Theme.of(context).colorScheme.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          final price = localPlan == 'WEEKLY' ? weeklyPrice : monthlyPrice;
          final days  = localPlan == 'WEEKLY' ? 7 : 30;

          // How much wallet credit applies to the currently selected plan
          final walletApplied = walletBalance > price ? price : walletBalance;
          final finalPrice    = price - walletApplied;

          Widget planChip(String key, String label, int p) {
            final selected = localPlan == key;
            final isPopular = key == 'MONTHLY';
            return Expanded(
              child: GestureDetector(
                onTap: () => setSheet(() => localPlan = key),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),
                  padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 10),
                  decoration: BoxDecoration(
                    color: selected
                        ? AppColors.primary.withAlpha(20)
                        : Theme.of(ctx).colorScheme.surfaceContainerHighest,
                    border: Border.all(
                      color: selected
                          ? AppColors.primary
                          : Theme.of(ctx).colorScheme.outlineVariant,
                      width: selected ? 2 : 1,
                    ),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      if (isPopular)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Text('⭐ Popular',
                              style: GoogleFonts.poppins(
                                  fontSize: 10, color: Colors.white,
                                  fontWeight: FontWeight.w600)),
                        ),
                      if (isPopular) const SizedBox(height: 4),
                      Text(label,
                          style: GoogleFonts.poppins(
                              fontSize: 14, fontWeight: FontWeight.w700,
                              color: selected
                                  ? AppColors.primary
                                  : Theme.of(ctx).colorScheme.onSurface)),
                      const SizedBox(height: 4),
                      Text(p > 0 ? '₹$p' : '—',
                          style: GoogleFonts.poppins(
                              fontSize: 16, fontWeight: FontWeight.w800,
                              color: selected
                                  ? AppColors.primary
                                  : Theme.of(ctx).colorScheme.onSurface)),
                      Text(p > 0 ? '$days Days' : 'N/A',
                          style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: Theme.of(ctx).colorScheme.onSurfaceVariant)),
                    ],
                  ),
                ),
              ),
            );
          }

          Widget payBtn(String method, String label, IconData icon) {
            final sel = localPayment == method;
            return Expanded(
              child: GestureDetector(
                onTap: () => setSheet(() => localPayment = method),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 150),
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: sel
                        ? AppColors.primary
                        : Theme.of(ctx).colorScheme.surface,
                    border: Border.all(
                      color: sel
                          ? AppColors.primary
                          : Theme.of(ctx).colorScheme.outlineVariant,
                    ),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(icon, size: 18,
                          color: sel
                              ? Colors.white
                              : Theme.of(ctx).colorScheme.onSurfaceVariant),
                      const SizedBox(width: 6),
                      Text(label,
                          style: GoogleFonts.poppins(
                              fontSize: 13, fontWeight: FontWeight.w600,
                              color: sel
                                  ? Colors.white
                                  : Theme.of(ctx).colorScheme.onSurface)),
                    ],
                  ),
                ),
              ),
            );
          }

          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom,
            ),
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Drag handle
                  Center(
                    child: Container(
                      width: 40, height: 4,
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.grey.shade300,
                        borderRadius: BorderRadius.circular(2),
                      ),
                    ),
                  ),
                  // Title row
                  Row(
                    children: [
                      Expanded(
                        child: Text('Extend Plan',
                            style: GoogleFonts.poppins(
                                fontSize: 18, fontWeight: FontWeight.w700,
                                color: Theme.of(ctx).colorScheme.onSurface)),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close),
                        onPressed: () => Navigator.of(ctx).pop(),
                        padding: EdgeInsets.zero,
                        constraints: const BoxConstraints(),
                      ),
                    ],
                  ),
                  const SizedBox(height: 2),
                  Text('Kitchen: $vendorName',
                      style: GoogleFonts.poppins(
                          fontSize: 13, color: AppColors.primary,
                          fontWeight: FontWeight.w600)),
                  Text(
                    'Current: $planType · Last meal: ${_fmt(endDate)}',
                    style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Theme.of(ctx).colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 6),
                  Text('Choose a plan to add after current ends',
                      style: GoogleFonts.poppins(
                          fontSize: 13,
                          color: Theme.of(ctx).colorScheme.onSurfaceVariant)),
                  const SizedBox(height: 14),

                  // Plan chips
                  if (!pricingLoaded)
                    const Center(
                      child: Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: CircularProgressIndicator(),
                      ),
                    )
                  else
                    Row(
                      children: [
                        planChip('WEEKLY',  'Weekly',  weeklyPrice),
                        const SizedBox(width: 10),
                        planChip('MONTHLY', 'Monthly', monthlyPrice),
                      ],
                    ),
                  const SizedBox(height: 18),

                  // Payment method
                  Text('Payment Method',
                      style: GoogleFonts.poppins(
                          fontSize: 13, fontWeight: FontWeight.w600,
                          color: Theme.of(ctx).colorScheme.onSurface)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      payBtn('Online', 'Online', Icons.credit_card),
                      const SizedBox(width: 10),
                      payBtn('Cash', 'Cash', Icons.payments_outlined),
                    ],
                  ),
                  const SizedBox(height: 16),

                  // Summary
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: Theme.of(ctx).colorScheme.surfaceContainerLowest,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: Theme.of(ctx).colorScheme.outlineVariant),
                    ),
                    child: Column(
                      children: [
                        // Plan row
                        Row(
                          children: [
                            Icon(Icons.receipt_long_outlined,
                                size: 17,
                                color: Theme.of(ctx).colorScheme.onSurfaceVariant),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                '${localPlan == "WEEKLY" ? "Weekly" : "Monthly"} Plan  ·  $days days',
                                style: GoogleFonts.poppins(
                                    fontSize: 13,
                                    color: Theme.of(ctx).colorScheme.onSurface,
                                    fontWeight: FontWeight.w500),
                              ),
                            ),
                            Text(
                              price > 0 ? '₹$price' : 'N/A',
                              style: GoogleFonts.poppins(
                                  fontSize: 13,
                                  color: Theme.of(ctx).colorScheme.onSurface,
                                  fontWeight: FontWeight.w600),
                            ),
                          ],
                        ),
                        // Wallet deduction row — only shown when wallet > 0
                        if (walletApplied > 0) ...[
                          const SizedBox(height: 8),
                          Container(
                            height: 1,
                            color: Theme.of(ctx).colorScheme.outlineVariant,
                          ),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Icon(Icons.account_balance_wallet_rounded,
                                  size: 17, color: Color(0xFF16A34A)),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text('Wallet Credit Applied',
                                    style: GoogleFonts.poppins(
                                        fontSize: 13,
                                        color: const Color(0xFF16A34A),
                                        fontWeight: FontWeight.w500)),
                              ),
                              Text('− ₹$walletApplied',
                                  style: GoogleFonts.poppins(
                                      fontSize: 13,
                                      color: const Color(0xFF16A34A),
                                      fontWeight: FontWeight.w700)),
                            ],
                          ),
                          const SizedBox(height: 8),
                          Container(
                              height: 1,
                              color: Theme.of(ctx).colorScheme.outlineVariant),
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              const Icon(Icons.payments_outlined,
                                  size: 17, color: AppColors.primary),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text('You Pay',
                                    style: GoogleFonts.poppins(
                                        fontSize: 13,
                                        fontWeight: FontWeight.w700,
                                        color: Theme.of(ctx).colorScheme.onSurface)),
                              ),
                              Text('₹$finalPrice',
                                  style: GoogleFonts.poppins(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.primary)),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Action buttons
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => Navigator.of(ctx).pop(),
                          style: OutlinedButton.styleFrom(
                            foregroundColor: AppColors.textGrey,
                            side: const BorderSide(color: Color(0xFFE5E7EB)),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10)),
                            padding: const EdgeInsets.symmetric(vertical: 14),
                          ),
                          child: Text('Cancel',
                              style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600)),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        flex: 2,
                        child: ElevatedButton(
                          onPressed: (localBusy || price <= 0)
                              ? null
                              : () async {
                                  if (localPayment == 'Cash') {
                                    // ── Cash flow ─────────────────────────
                                    setSheet(() => localBusy = true);
                                    try {
                                      await _api.post(
                                          '/users/orders/extend', {
                                        'plan':          localPlan,
                                        'vendorId':      vendorId,
                                        'paymentMethod': 'Cash',
                                      });
                                      if (ctx.mounted) {
                                        Navigator.of(ctx).pop();
                                      }
                                      if (mounted) {
                                        _snack('Plan queued successfully ✓',
                                            isSuccess: true);
                                        await _loadData();
                                      }
                                    } on DioException catch (e) {
                                      if (mounted) {
                                        _snack(_api.handleError(e),
                                            isError: true);
                                      }
                                    } catch (_) {
                                      if (mounted) {
                                        _snack('Failed to extend. Try again.',
                                            isError: true);
                                      }
                                    } finally {
                                      if (ctx2.mounted) {
                                        setSheet(() => localBusy = false);
                                      }
                                    }
                                  } else {
                                    // ── Online flow: close sheet → Razorpay
                                    Navigator.of(ctx).pop();
                                    _startOnlineExtend(
                                        localPlan, vendorId, price, walletApplied);
                                  }
                                },
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                            disabledBackgroundColor:
                                AppColors.primary.withAlpha(100),
                            shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10)),
                            elevation: 0,
                            padding:
                                const EdgeInsets.symmetric(vertical: 14),
                          ),
                          child: localBusy
                              ? const SizedBox(
                                  width: 20, height: 20,
                                  child: CircularProgressIndicator(
                                      color: Colors.white, strokeWidth: 2))
                              : Text('Confirm & Subscribe',
                                  style: GoogleFonts.poppins(
                                      fontWeight: FontWeight.w600)),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _startOnlineExtend(
      String plan, String vendorId, int price, int walletApplied) async {
    setState(() {
      _isExtending = true;
      _pendingWalletDeduction = walletApplied;
    });
    try {
      final cr = await _api.post('/users/payment/create-order', {
        'amount':          price,
        'vendorId':        vendorId,
        'plan':            plan,
        'mealPreference':  'both',
        'walletDeduction': walletApplied,
      });
      final cd       = cr.data as Map<String, dynamic>? ?? {};
      final orderId  = cd['orderId']  as String? ?? '';
      final amount   = (cd['amount']  as num?)?.toInt() ?? 0;
      final keyId    = cd['keyId']    as String? ?? '';
      final currency = cd['currency'] as String? ?? 'INR';

      if (keyId.isEmpty || orderId.isEmpty || amount <= 0) {
        if (mounted) _snack('Payment setup failed. Try again.', isError: true);
        setState(() => _isExtending = false);
        return;
      }

      _pendingExtendPlan     = plan;
      _pendingExtendVendorId = vendorId;

      String userEmail = '', userPhone = '';
      try {
        final prefs = await SharedPreferences.getInstance();
        final raw   = prefs.getString('mealsetu_user');
        if (raw != null) {
          final u = jsonDecode(raw) as Map<String, dynamic>;
          userEmail = u['email'] as String? ?? '';
          userPhone = u['phone'] as String? ?? '';
        }
      } catch (_) {}

      if (!mounted) return;

      if (kIsWeb) {
        await openRazorpayCheckout(
          keyId: keyId,
          orderId: orderId,
          amount: amount,
          currency: currency,
          description:
              '${plan == "WEEKLY" ? "Weekly" : "Monthly"} Plan Extension',
          email: userEmail,
          contact: userPhone,
        );
        await _completeOnlineExtend();
      } else {
        setState(() => _isExtending = false);
        _razorpay!.open({
          'key':         keyId,
          'amount':      amount,
          'currency':    currency,
          'order_id':    orderId,
          'name':        'MealSetu',
          'description': '${plan == "WEEKLY" ? "Weekly" : "Monthly"} Plan Extension',
          'prefill':     {'contact': userPhone, 'email': userEmail},
          'theme':       {'color': '#F26522'},
        });
      }
    } on DioException catch (e) {
      if (mounted) {
        setState(() => _isExtending = false);
        _snack(_api.handleError(e), isError: true);
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isExtending = false);
        _snack('Payment could not be completed: $e', isError: true);
      }
    }
  }

  // ── Razorpay callbacks ────────────────────────────────────────────────────

  void _handlePaymentSuccess(PaymentSuccessResponse response) async {
    await _completeOnlineExtend();
  }

  Future<void> _completeOnlineExtend() async {
    if (_pendingExtendPlan.isEmpty) return;
    setState(() => _isExtending = true);
    try {
      await _api.post('/users/orders/extend', {
        'plan':            _pendingExtendPlan,
        'vendorId':        _pendingExtendVendorId,
        'paymentMethod':   'UPI',
        'walletDeduction': _pendingWalletDeduction,
      });
      if (mounted) {
        _snack('Plan queued successfully ✓', isSuccess: true);
        await _loadData();
      }
    } on DioException catch (e) {
      if (mounted) _snack(_api.handleError(e), isError: true);
    } catch (_) {
      if (mounted) {
        _snack(
          'Payment received but plan extension failed. Contact support.',
          isError: true,
        );
      }
    } finally {
      if (mounted) {
        setState(() {
          _isExtending             = false;
          _pendingExtendPlan       = '';
          _pendingExtendVendorId   = '';
          _pendingWalletDeduction  = 0;
        });
      }
    }
  }

  void _handlePaymentError(PaymentFailureResponse response) {
    final code = response.code?.toString() ?? '?';
    final msg  = (response.message?.isNotEmpty == true)
        ? response.message!
        : 'Payment failed. Please try again.';
    if (mounted) {
      _snack('Payment failed [$code]: $msg', isError: true);
      setState(() {
        _isExtending             = false;
        _pendingExtendPlan       = '';
        _pendingExtendVendorId   = '';
        _pendingWalletDeduction  = 0;
      });
    }
  }

  void _handleExternalWallet(ExternalWalletResponse response) {}

  // ── Builders: Section 1 — Current Plan ───────────────────────────────────

  Widget _buildCurrentPlanCard() {
    final hasPlan = _sub != null;

    return _card(
      child: Column(
        children: [
          Text('Current Plan',
              style: GoogleFonts.poppins(
                  fontSize: 12,
                  color: Theme.of(context).colorScheme.onSurfaceVariant,
                  letterSpacing: 0.3)),
          const SizedBox(height: 6),
          if (!hasPlan) ...[
            const SizedBox(height: 8),
            Text('No Active Plan',
                style: GoogleFonts.poppins(
                    fontSize: 18,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              height: 46,
              child: ElevatedButton.icon(
                onPressed: () => context.go('/home'),
                icon: const Icon(Icons.search, size: 18),
                label: Text('Browse & Subscribe',
                    style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
              ),
            ),
          ] else ...[
            // Plan type badge
            Text(_sub!['planType'] as String? ?? '',
                style: GoogleFonts.poppins(
                    fontSize: 26, fontWeight: FontWeight.w800,
                    color: AppColors.success)),
            const SizedBox(height: 14),

            // Vendor name
            Text('Kitchen',
                style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 2),
            Text(_sub!['vendorName'] as String? ?? '',
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                    fontSize: 15, fontWeight: FontWeight.w700,
                    color: const Color(0xFFF97316))),
            const SizedBox(height: 14),

            // Valid until
            Text('Valid Until',
                style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),
            const SizedBox(height: 4),
            Text(_fmt(_parseDate(_sub!['endDate'])),
                style: GoogleFonts.poppins(
                    fontSize: 22, fontWeight: FontWeight.w800,
                    color: AppColors.primary)),
            const SizedBox(height: 2),
            Text(
              (_sub!['lastDayMealSlot'] as String? ?? 'both') == 'lunch'
                  ? 'last meal: lunch only'
                  : 'last meal day',
              style: GoogleFonts.poppins(
                  fontSize: 11, fontStyle: FontStyle.italic,
                  color: Theme.of(context).colorScheme.onSurfaceVariant),
            ),
            const SizedBox(height: 10),

            // Active status
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.check_circle,
                    color: AppColors.success, size: 16),
                const SizedBox(width: 4),
                Text('Active',
                    style: GoogleFonts.poppins(
                        fontSize: 13, fontWeight: FontWeight.w600,
                        color: AppColors.success)),
              ],
            ),
            const SizedBox(height: 4),
            Text('Started: ${_fmt(_parseDate(_sub!['startDate']))}',
                style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: Theme.of(context).colorScheme.onSurfaceVariant)),

            // Track My Delivery button (shown when delivery is in-progress)
            if (_isDeliveryInProgress()) ...[
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                height: 42,
                child: ElevatedButton.icon(
                  onPressed: () {
                    final orderId = _sub!['_id'] as String? ?? '';
                    if (orderId.isNotEmpty) context.push('/track-order', extra: orderId);
                  },
                  icon: const Icon(Icons.location_on_rounded, size: 18),
                  label: Text('Track My Delivery',
                      style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFF2563EB),
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                    elevation: 0,
                  ),
                ),
              ),
            ],

            // Report Not Received button (45-min window after delivery)
            if (_canReportNotReceived()) ...[
              const SizedBox(height: 10),
              SizedBox(
                width: double.infinity,
                height: 42,
                child: OutlinedButton.icon(
                  onPressed: _reportNotReceived,
                  icon: const Icon(Icons.report_problem_outlined,
                      size: 18, color: Color(0xFFDC2626)),
                  label: Text('Report Not Received',
                      style: GoogleFonts.poppins(
                          fontWeight: FontWeight.w600,
                          color: const Color(0xFFDC2626))),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Color(0xFFDC2626)),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
            ],

            // Cash pending banner
            if ((_sub!['paymentMethod'] as String?) == 'Cash' &&
                (_sub!['paymentStatus'] as String?) == 'Pending') ...[
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFFF7ED),
                  border: Border.all(color: const Color(0xFFFED7AA)),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.payments_outlined,
                        color: Color(0xFFF97316), size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        'Please pay ₹${_sub!['amount'] ?? ''} to '
                        'vendor in cash',
                        style: GoogleFonts.poppins(
                            fontSize: 13,
                            color: const Color(0xFF92400E)),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 18),

            // Extend button
            SizedBox(
              width: double.infinity,
              height: 46,
              child: ElevatedButton(
                onPressed: (_upcoming.length >= 3 || _isExtending)
                    ? null
                    : _showExtendSheet,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF1E293B),
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: Colors.grey.shade300,
                  disabledForegroundColor: Colors.grey.shade500,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
                child: _isExtending
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : Text(
                        _upcoming.length >= 3
                            ? 'Max 3 Upcoming Plans Reached'
                            : 'Extend Subscription',
                        style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ── Builders: Section 2 — Upcoming Plans ─────────────────────────────────

  Widget _buildUpcomingCard() {
    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Upcoming Plans',
              style: GoogleFonts.poppins(
                  fontSize: 16, fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.onSurface)),
          const SizedBox(height: 12),
          if (_upcoming.isEmpty)
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 8),
                child: Text('No upcoming plans yet',
                    style: GoogleFonts.poppins(
                        fontSize: 14,
                        color: Theme.of(context).colorScheme.onSurfaceVariant)),
              ),
            )
          else
            ..._upcoming.map(_buildUpcomingItem),
        ],
      ),
    );
  }

  Widget _buildUpcomingItem(Map<String, dynamic> plan) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cs.surfaceContainerLowest,
        border: Border.all(color: cs.outlineVariant),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(plan['planType'] as String? ?? '',
                    style: GoogleFonts.poppins(
                        fontSize: 14, fontWeight: FontWeight.w700,
                        color: const Color(0xFFF59E0B))),
                const SizedBox(height: 4),
                _row2('Kitchen',
                    plan['vendorName'] as String? ?? ''),
                _row2('Starts',
                    _fmt(_parseDate(plan['scheduledStartDate']))),
                _row2('Ends',
                    _fmt(_parseDate(plan['scheduledEndDate']))),
                _row2('Amount',
                    '₹${plan['amount'] ?? ''}'),
              ],
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: const Color(0xFFFEF3C7),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text('Pending',
                style: GoogleFonts.poppins(
                    fontSize: 11, fontWeight: FontWeight.w600,
                    color: const Color(0xFFF59E0B))),
          ),
        ],
      ),
    );
  }

  // ── Builders: Section 3 — Leave ──────────────────────────────────────────

  Widget _buildLeaveCard() {
    final leavesUsed    = (_sub?['leavesUsed']    as num?)?.toInt() ?? 0;
    final leavesAllowed = (_sub?['leavesAllowed'] as num?)?.toInt() ?? 2;
    final leaveDates    = (_sub?['leaveDates']    as List<dynamic>?) ?? [];
    final exhausted     = _sub != null && leavesUsed >= leavesAllowed;

    return _card(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header ──────────────────────────────────────────────────────
          Row(
            children: [
              Expanded(
                child: Text('Schedule Leave / Pause',
                    style: GoogleFonts.poppins(
                        fontSize: 16, fontWeight: FontWeight.w700,
                        color: Theme.of(context).colorScheme.onSurface)),
              ),
              if (_sub != null)
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: exhausted
                        ? const Color(0xFFFEE2E2)
                        : const Color(0xFFFEF3C7),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    'Leaves: $leavesUsed / $leavesAllowed',
                    style: GoogleFonts.poppins(
                      fontSize: 11, fontWeight: FontWeight.w600,
                      color: exhausted
                          ? const Color(0xFFDC2626)
                          : const Color(0xFF92400E),
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 14),

          // ── State A: no subscription ────────────────────────────────────
          if (_sub == null)
            _alertBox(
              icon: Icons.warning_amber_rounded,
              text: 'You do not have an active subscription.\n'
                    'Please subscribe first to apply a leave.',
              bg:        const Color(0xFFFEF3C7),
              border:    const Color(0xFFFCD34D),
              textColor: const Color(0xFF92400E),
            )

          // ── State B: leaves exhausted ────────────────────────────────────
          else if (exhausted)
            _alertBox(
              icon: Icons.block_rounded,
              text: 'You have used all $leavesAllowed leaves for this '
                    'subscription. Allowance resets when you start a new plan.',
              bg:        const Color(0xFFFEE2E2),
              border:    const Color(0xFFFCA5A5),
              textColor: const Color(0xFFDC2626),
            )

          // ── State C: form ────────────────────────────────────────────────
          else ...[
            // Date pickers
            Row(
              children: [
                Expanded(
                  child: _datePicker(
                    label:   'START DATE',
                    value:   _leaveStart,
                    enabled: true,
                    onTap:   _pickLeaveStart,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _datePicker(
                    label:   'END DATE',
                    value:   _leaveEnd,
                    enabled: _leaveStart != null,
                    onTap:   _leaveStart != null ? _pickLeaveEnd : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),

            // Existing leave pills
            if (leaveDates.isNotEmpty) ...[
              Text('Already on leave:',
                  style: GoogleFonts.poppins(
                      fontSize: 12, color: AppColors.textGrey)),
              const SizedBox(height: 6),
              Wrap(
                spacing: 8,
                runSpacing: 6,
                children: leaveDates.map<Widget>((l) {
                  final ls = _parseDate(l['startDate']);
                  final le = _parseDate(l['endDate']);
                  return Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 5),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFEE2E2),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(Icons.block,
                            size: 12, color: Color(0xFFB91C1C)),
                        const SizedBox(width: 4),
                        Text('${_fmtShort(ls)} — ${_fmtShort(le)}',
                            style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: const Color(0xFFB91C1C))),
                      ],
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 12),
            ],

            // Overlap error box
            if (_overlapErr.isNotEmpty) ...[
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: const Color(0xFFFEF2F2),
                  border: Border.all(color: const Color(0xFFFCA5A5)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.warning_amber_rounded,
                        color: Colors.red, size: 18),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(_overlapErr,
                          style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: Colors.red.shade700)),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
            ],

            // Meal type dropdown
            DropdownButtonFormField<String>(
              initialValue: _mealType,
              style: GoogleFonts.poppins(
                  fontSize: 14, color: AppColors.textDark),
              decoration: InputDecoration(
                labelText: 'Which meal to skip?',
                labelStyle: GoogleFonts.poppins(
                    fontSize: 13, color: AppColors.textGrey),
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide:
                        const BorderSide(color: Color(0xFFE8E8E8))),
                enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide:
                        const BorderSide(color: Color(0xFFE8E8E8))),
                focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8),
                    borderSide: const BorderSide(
                        color: AppColors.primary, width: 1.5)),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 14),
              ),
              items: [
                DropdownMenuItem(
                  value: 'both',
                  child: Text('Both (Lunch & Dinner)',
                      style: GoogleFonts.poppins(fontSize: 14)),
                ),
                DropdownMenuItem(
                  value: 'lunch',
                  child: Text('Lunch Only',
                      style: GoogleFonts.poppins(fontSize: 14)),
                ),
                DropdownMenuItem(
                  value: 'dinner',
                  child: Text('Dinner Only',
                      style: GoogleFonts.poppins(fontSize: 14)),
                ),
              ],
              onChanged: (v) => setState(() => _mealType = v!),
            ),
            const SizedBox(height: 8),
            Text(
              'Leaves remaining: ${leavesAllowed - leavesUsed}. '
              'Your plan will be extended by the number of leave days.',
              style: GoogleFonts.poppins(
                  fontSize: 12, color: AppColors.textGrey),
            ),
            const SizedBox(height: 14),

            // Apply leave button
            SizedBox(
              width: double.infinity,
              height: 46,
              child: ElevatedButton(
                onPressed: (_leaveStart == null ||
                        _leaveEnd == null ||
                        _overlapErr.isNotEmpty ||
                        _isApplyingLeave)
                    ? null
                    : _applyLeave,
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor:
                      AppColors.primary.withAlpha(128),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                  elevation: 0,
                ),
                child: _isApplyingLeave
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : Text('Pause & Extend Plan',
                        style: GoogleFonts.poppins(
                            fontWeight: FontWeight.w600)),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ── Notification banners ─────────────────────────────────────────────────

  /// Returns a dismissible info banner, or null if no banner should show.
  ///
  /// Cutoffs are taken directly from the backend's mealTimingUtils.js:
  ///   LUNCH_CUTOFF  = UTC 04:30  (10:00 AM IST)
  ///   DINNER_CUTOFF = UTC 11:30  (05:00 PM IST)
  ///
  /// "Dinner Only Today" — order was placed between the two cutoffs
  ///   (mealSlotToday == 'dinner'). Plan starts today; lunch was missed;
  ///   one extra day was added automatically.
  ///
  /// "Plan Active Tomorrow" — order was placed after the dinner cutoff
  ///   (mealSlotToday == 'none'). startsTomorrow == true in the API.
  Widget? _buildNotificationBanner() {
    if (_sub == null) return null;

    // ── "Plan Active Tomorrow" ─────────────────────────────────────────────
    // Use the backend-computed flag directly — most reliable.
    final startsTomorrow = _sub!['startsTomorrow'] as bool? ?? false;
    if (!_tomorrowBannerDismissed && startsTomorrow) {
      final startDate = _parseDate(_sub!['startDate']);
      return _infoBanner(
        emoji:       '📅',
        title:       'Plan Active Tomorrow',
        body:        'Your meal plan starts tomorrow (${_fmt(startDate)}). '
                     'Get ready for your first delivery!',
        bgColor:     const Color(0xFFEFF6FF),
        borderColor: const Color(0xFFBFDBFE),
        textColor:   const Color(0xFF1E40AF),
        onDismiss:   () => setState(() => _tomorrowBannerDismissed = true),
      );
    }

    // ── "Dinner Only Today" ────────────────────────────────────────────────
    // Backend sets mealSlotToday='dinner' when the order was placed between
    // LUNCH_CUTOFF (UTC 04:30 / 10 AM IST) and DINNER_CUTOFF (UTC 11:30 /
    // 5 PM IST). We reproduce that check from the stored orderDate so the
    // banner appears correctly regardless of what time the user opens the app.
    if (!_dinnerBannerDismissed && !startsTomorrow) {
      final orderRaw = _sub!['orderDate'];
      if (orderRaw != null) {
        final orderUtc    = _parseDate(orderRaw).toUtc();
        final utcHour     = orderUtc.hour + orderUtc.minute / 60.0;
        // 4.5 = 04:30 UTC (lunch cutoff); 11.5 = 11:30 UTC (dinner cutoff)
        final isDinnerOnly = utcHour >= 4.5 && utcHour < 11.5;

        // Only show on the same calendar day as the order (UTC).
        final nowUtc       = DateTime.now().toUtc();
        final sameDay      = orderUtc.year  == nowUtc.year  &&
                             orderUtc.month == nowUtc.month &&
                             orderUtc.day   == nowUtc.day;

        if (isDinnerOnly && sameDay) {
          return _infoBanner(
            emoji:       '🌙',
            title:       'Dinner Only Today',
            body:        'Lunch time has passed. You will receive Dinner today. '
                         'From tomorrow both Lunch and Dinner will be served. '
                         'One extra day has been added to your plan.',
            bgColor:     const Color(0xFFFFFBEB),
            borderColor: const Color(0xFFFDE68A),
            textColor:   const Color(0xFF92400E),
            onDismiss:   () => setState(() => _dinnerBannerDismissed = true),
          );
        }
      }
    }

    return null;
  }

  Widget _infoBanner({
    required String       emoji,
    required String       title,
    required String       body,
    required Color        bgColor,
    required Color        borderColor,
    required Color        textColor,
    required VoidCallback onDismiss,
  }) {
    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      padding: const EdgeInsets.fromLTRB(14, 12, 4, 12),
      decoration: BoxDecoration(
        color:        bgColor,
        border:       Border.all(color: borderColor),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 22)),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title,
                    style: GoogleFonts.poppins(
                        fontSize: 13, fontWeight: FontWeight.w700,
                        color: textColor)),
                const SizedBox(height: 2),
                Text(body,
                    style: GoogleFonts.poppins(
                        fontSize: 12, color: textColor, height: 1.4)),
              ],
            ),
          ),
          IconButton(
            icon: Icon(Icons.close_rounded, size: 16, color: textColor),
            onPressed: onDismiss,
            padding:     EdgeInsets.zero,
            constraints: const BoxConstraints(),
            visualDensity: VisualDensity.compact,
          ),
        ],
      ),
    );
  }

  // ── Helper widgets ────────────────────────────────────────────────────────

  /// Card used for each section — adapts to light/dark theme.
  Widget _card({required Widget child}) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(13),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }

  /// Amber / red info box used in leave section states A & B.
  Widget _alertBox({
    required IconData icon,
    required String text,
    required Color bg,
    required Color border,
    required Color textColor,
  }) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: textColor, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: GoogleFonts.poppins(
                    fontSize: 13, color: textColor, height: 1.4)),
          ),
        ],
      ),
    );
  }

  /// Date-picker tap target used in the leave form.
  Widget _datePicker({
    required String label,
    required DateTime? value,
    required bool enabled,
    required VoidCallback? onTap,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: GoogleFonts.poppins(
                fontSize: 10, fontWeight: FontWeight.w600,
                color: AppColors.textGrey, letterSpacing: 0.5)),
        const SizedBox(height: 6),
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 12, vertical: 12),
            decoration: BoxDecoration(
              color: enabled
                  ? Theme.of(context).colorScheme.surface
                  : Theme.of(context).colorScheme.surfaceContainerHighest,
              border: Border.all(
                color: enabled
                    ? Theme.of(context).colorScheme.outline.withValues(alpha: 0.4)
                    : Theme.of(context).colorScheme.outlineVariant,
              ),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    value != null
                        ? DateFormat('dd-MM-yyyy').format(value)
                        : 'Select date',
                    style: GoogleFonts.poppins(
                      fontSize: 13,
                      color: value != null
                          ? Theme.of(context).colorScheme.onSurface
                          : Theme.of(context).colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                Icon(Icons.calendar_today,
                    size: 16,
                    color: enabled
                        ? AppColors.primary
                        : Colors.grey.shade400),
              ],
            ),
          ),
        ),
      ],
    );
  }

  /// Small label + value row used inside upcoming plan items.
  Widget _row2(String label, String value) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: RichText(
        text: TextSpan(
          style: GoogleFonts.poppins(fontSize: 12),
          children: [
            TextSpan(
              text: '$label: ',
              style: TextStyle(color: cs.onSurfaceVariant),
            ),
            TextSpan(
              text: value,
              style: TextStyle(
                  color: cs.onSurface,
                  fontWeight: FontWeight.w500),
            ),
          ],
        ),
      ),
    );
  }

  // ── Utility ───────────────────────────────────────────────────────────────

  bool _isDeliveryInProgress() {
    final ds = _sub?['deliveryStatus'] as String?;
    return ds == 'assigned'    ||
           ds == 'preparing'   ||
           ds == 'picked_up'   ||
           ds == 'out_for_delivery' ||
           ds == 'on_the_way';   // legacy compat
  }

  bool _canReportNotReceived() {
    if (_sub == null) return false;
    if ((_sub!['deliveryStatus'] as String?) != 'delivered') return false;
    if (_sub!['reportedNotReceived'] == true) return false;
    final deliveredAt = DateTime.tryParse(
        (_sub!['deliveredAt'] ?? '').toString());
    if (deliveredAt == null) return false;
    final minutesSince =
        DateTime.now().difference(deliveredAt).inMinutes;
    return minutesSince <= 45;
  }

  Future<void> _reportNotReceived() async {
    final orderId = _sub?['_id'] as String? ?? '';
    if (orderId.isEmpty) return;

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16)),
        title: const Text('Report Not Received',
            style: TextStyle(fontWeight: FontWeight.w700)),
        content: const Text(
            "Are you sure you didn't receive today's tiffin? This will notify your vendor.",
            style: TextStyle(fontSize: 14)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFFDC2626),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
              elevation: 0,
            ),
            child: const Text('Yes, Report',
                style: TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;

    try {
      final api = ApiService();
      await api.post(
          '/users/orders/$orderId/report-not-received', {});
      if (!mounted) return;
      setState(() {
        if (_sub != null) _sub!['reportedNotReceived'] = true;
      });
      _snack('Reported. Your vendor has been notified.',
          isSuccess: true);
    } catch (_) {
      if (mounted) _snack('Failed to report. Try again.', isError: true);
    }
  }

  DateTime _parseDate(dynamic raw) {
    if (raw == null) return DateTime.now();
    try { return DateTime.parse(raw.toString()).toLocal(); }
    catch (_) { return DateTime.now(); }
  }

  /// "3 Jun 2026"
  String _fmt(DateTime d) => DateFormat('d MMM yyyy').format(d);

  /// "25 May" (leave pill — no year)
  String _fmtShort(DateTime d) => DateFormat('d MMM').format(d);

  void _snack(String msg, {bool isError = false, bool isSuccess = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg,
            style: GoogleFonts.poppins(
                color: Colors.white, fontSize: 13)),
        backgroundColor: isError
            ? Colors.red.shade600
            : isSuccess
                ? AppColors.success
                : Colors.grey.shade800,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 4),
      ));
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        title: Text('My Subscription',
            style: GoogleFonts.poppins(
                fontSize: 18, fontWeight: FontWeight.w700)),
        actions: [
          // Manual refresh button
          IconButton(
            icon: _isLoading
                ? const SizedBox(
                    width: 18, height: 18,
                    child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.primary))
                : const Icon(Icons.refresh_rounded,
                    color: AppColors.primary),
            onPressed: _isLoading ? null : _loadData,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: _error != null && _sub == null
          ? _buildErrorState()
          : RefreshIndicator(
              color: AppColors.primary,
              onRefresh: _loadData,
              child: Builder(
                builder: (ctx) {
                  final banner = _buildNotificationBanner();
                  return ListView(
                    padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
                    children: [
                      ?banner,
                      _buildCurrentPlanCard(),
                      const SizedBox(height: 14),
                      _buildUpcomingCard(),
                      const SizedBox(height: 14),
                      _buildLeaveCard(),
                    ],
                  );
                },
              ),
            ),
    );
  }

  Widget _buildErrorState() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.cloud_off_rounded,
                size: 64, color: Colors.grey.shade400),
            const SizedBox(height: 16),
            Text(_error ?? 'Something went wrong.',
                textAlign: TextAlign.center,
                style: GoogleFonts.poppins(
                    fontSize: 14, color: AppColors.textGrey)),
            const SizedBox(height: 20),
            ElevatedButton.icon(
              onPressed: _loadData,
              icon: const Icon(Icons.refresh),
              label: Text('Retry',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                elevation: 0,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
