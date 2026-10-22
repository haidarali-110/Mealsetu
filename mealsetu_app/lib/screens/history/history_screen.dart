import 'dart:convert';
import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:open_filex/open_filex.dart';
import 'package:path_provider/path_provider.dart';

import '../../constants/app_colors.dart';
import '../../services/api_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// HistoryScreen  —  GET /api/users/orders
// ─────────────────────────────────────────────────────────────────────────────

class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});

  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen>
    with SingleTickerProviderStateMixin {
  // ── Services ──────────────────────────────────────────────────────────────
  final _api = ApiService();

  // ── Data ──────────────────────────────────────────────────────────────────
  List<Map<String, dynamic>> _orders = [];
  bool   _isLoading = true;
  String? _error;

  // ── Download state: orderId → true while downloading ──────────────────────
  final Map<String, bool> _downloading = {};

  // ── Tabs ──────────────────────────────────────────────────────────────────
  late TabController _tabController;

  static const _tabLabels = [
    'All',
    'Active',
    'Upcoming',
    'Completed',
    'Cancelled',
  ];

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: _tabLabels.length, vsync: this);
    _loadOrders();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // ── Data loading ──────────────────────────────────────────────────────────

  Future<void> _loadOrders() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });
    try {
      final res  = await _api.get('/users/orders');
      final data = res.data;
      final List<dynamic> raw = data is List
          ? data
          : (data is Map ? (data['orders'] as List? ?? []) : []);
      setState(() {
        _orders = raw
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList();
        _isLoading = false;
      });
    } catch (_) {
      setState(() {
        _error = 'Failed to load order history. Pull down to retry.';
        _isLoading = false;
      });
    }
  }

  // ── Invoice download ──────────────────────────────────────────────────────

  Future<void> _downloadInvoice(String orderId, String kitchenName) async {
    if (_downloading[orderId] == true) return;
    setState(() => _downloading[orderId] = true);

    try {
      final bytes = await _api.getBytes('/users/orders/$orderId/invoice');
      if (bytes.isEmpty) throw Exception('Empty response');

      final dir  = await getTemporaryDirectory();
      final safe = kitchenName.replaceAll(RegExp(r'[^a-zA-Z0-9]'), '_');
      final file = File('${dir.path}/Invoice_${safe}_${orderId.substring(orderId.length - 6)}.pdf');
      await file.writeAsBytes(bytes);

      final result = await OpenFilex.open(file.path);
      if (result.type != ResultType.done && mounted) {
        _showSnack('Could not open PDF. File saved to ${file.path}');
      }
    } catch (e) {
      var message = 'Download failed. Please try again.';
      if (e is DioException) {
        message = _api.handleError(e);
        final data = e.response?.data;
        if (data is List<int>) {
          try {
            final body = jsonDecode(utf8.decode(data, allowMalformed: true));
            if (body is Map && body['message'] != null) {
              message = body['message'].toString();
            }
          } catch (_) {
            // Preserve the readable Dio error when the response is not JSON.
          }
        }
      }
      if (mounted) _showSnack(message, isError: true);
    } finally {
      if (mounted) setState(() => _downloading.remove(orderId));
    }
  }

  void _showSnack(String msg, {bool isError = false}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(msg, style: GoogleFonts.poppins(fontSize: 13, color: Colors.white)),
        backgroundColor: isError ? Colors.red.shade600 : Colors.grey.shade800,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        duration: const Duration(seconds: 4),
      ));
  }

  // ── Filter helpers ────────────────────────────────────────────────────────

  List<Map<String, dynamic>> _filterFor(String tab) {
    if (tab == 'All') return _orders;
    return _orders.where((o) {
      final status = (o['status'] as String? ?? '').toLowerCase();
      switch (tab) {
        case 'Active':
          return status == 'active' || status == 'trial';
        case 'Upcoming':
          return status == 'pending';
        case 'Completed':
          return status == 'completed' || status == 'expired';
        case 'Cancelled':
          return status == 'cancelled' || status == 'on-hold';
        default:
          return true;
      }
    }).toList();
  }

  // ── Date helpers ──────────────────────────────────────────────────────────

  DateTime? _parseDate(dynamic raw) {
    if (raw == null) return null;
    try {
      return DateTime.parse(raw.toString()).toLocal();
    } catch (_) {
      return null;
    }
  }

  String _fmt(DateTime? d) {
    if (d == null) return '—';
    return DateFormat('d MMM yyyy').format(d);
  }

  String _fmtRange(Map<String, dynamic> order) {
    final status  = (order['status'] as String? ?? '').toLowerCase();
    DateTime? start, end;

    if (status == 'pending') {
      start = _parseDate(order['scheduledStartDate']);
      end   = _parseDate(order['scheduledEndDate']);
    } else {
      start = _parseDate(order['startDate']);
      end   = _parseDate(order['endDate']);
    }

    if (start == null && end == null) {
      final od = _parseDate(order['orderDate']);
      return od != null ? 'Ordered ${_fmt(od)}' : '—';
    }
    return '${_fmt(start)} – ${_fmt(end)}';
  }

  // ── Status badge ──────────────────────────────────────────────────────────

  Widget _statusBadge(BuildContext context, String status) {
    final cs = Theme.of(context).colorScheme;
    late Color bg;
    late Color fg;
    late String label;

    switch (status.toLowerCase()) {
      case 'active':
        bg = const Color(0xFFDCFCE7);
        fg = AppColors.success;
        label = 'Active';
        break;
      case 'trial':
        bg = const Color(0xFFDBEAFE);
        fg = const Color(0xFF2563EB);
        label = 'Trial';
        break;
      case 'pending':
        bg = const Color(0xFFFEF3C7);
        fg = AppColors.warning;
        label = 'Upcoming';
        break;
      case 'completed':
        bg = cs.surfaceContainerHighest;
        fg = cs.onSurfaceVariant;
        label = 'Completed';
        break;
      case 'expired':
        bg = cs.surfaceContainerHighest;
        fg = cs.onSurfaceVariant;
        label = 'Expired';
        break;
      case 'cancelled':
        bg = const Color(0xFFFEE2E2);
        fg = const Color(0xFFDC2626);
        label = 'Cancelled';
        break;
      case 'on-hold':
        bg = const Color(0xFFFEF3C7);
        fg = AppColors.warning;
        label = 'On Hold';
        break;
      default:
        bg = cs.surfaceContainerHighest;
        fg = cs.onSurfaceVariant;
        label = status;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        label,
        style: GoogleFonts.poppins(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: fg,
        ),
      ),
    );
  }

  // ── Plan type badge ───────────────────────────────────────────────────────

  Widget _planBadge(String planType) {
    late Color bg;
    late Color fg;

    switch (planType.toLowerCase()) {
      case 'weekly':
        bg = AppColors.primary.withAlpha(20);
        fg = AppColors.primary;
        break;
      case 'monthly':
        bg = const Color(0xFFFFF7ED);
        fg = const Color(0xFFEA580C);
        break;
      case 'trial':
        bg = const Color(0xFFEDE9FE);
        fg = const Color(0xFF7C3AED);
        break;
      default: // Tiffin
        bg = const Color(0xFFF0FDF4);
        fg = AppColors.success;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        planType,
        style: GoogleFonts.poppins(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: fg,
        ),
      ),
    );
  }

  // ── Payment status chip ───────────────────────────────────────────────────

  Widget _payChip(String payStatus) {
    final isPaid   = payStatus == 'Paid';
    final isFailed = payStatus == 'Failed';
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(
          isPaid
              ? Icons.check_circle_rounded
              : isFailed
                  ? Icons.cancel_rounded
                  : Icons.schedule_rounded,
          size: 13,
          color: isPaid
              ? AppColors.success
              : isFailed
                  ? const Color(0xFFDC2626)
                  : AppColors.warning,
        ),
        const SizedBox(width: 3),
        Text(
          payStatus,
          style: GoogleFonts.poppins(
            fontSize: 12,
            fontWeight: FontWeight.w500,
            color: isPaid
                ? AppColors.success
                : isFailed
                    ? const Color(0xFFDC2626)
                    : AppColors.warning,
          ),
        ),
      ],
    );
  }

  // ── Single order card ─────────────────────────────────────────────────────

  Widget _orderCard(BuildContext context, Map<String, dynamic> order) {
    final cs = Theme.of(context).colorScheme;

    final orderId      = order['_id'] as String? ?? '';
    final vendor       = order['vendorId'] as Map? ?? {};
    final kitchenName  = vendor['kitchenName'] as String? ?? 'Unknown Kitchen';
   final address      = _parseAddress(vendor['address']); 
    final deliveryStatus = order['deliveryStatus'] as String? ?? '';
    final isDelivering = deliveryStatus == 'assigned' ||
        deliveryStatus == 'preparing' ||
        deliveryStatus == 'picked_up' ||
        deliveryStatus == 'on_the_way';

    final planType    = order['planType']      as String? ?? 'Tiffin';
    final status      = order['status']        as String? ?? '';
    final amount      = (order['amount'] as num?)?.toInt() ?? 0;
    final payStatus   = order['paymentStatus'] as String? ?? 'Pending';
    final payMethod   = order['paymentMethod'] as String? ?? 'Cash';
    final mealPref    = order['mealPreference'] as String? ?? '';
    final slot        = order['deliverySlot']   as String? ?? '';
    final dateRange   = _fmtRange(order);
    final orderDate   = _parseDate(order['orderDate']);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cs.outlineVariant),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withAlpha(8),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header row ─────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Kitchen icon
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: AppColors.primary.withAlpha(20),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(
                    Icons.restaurant_rounded,
                    color: AppColors.primary,
                    size: 22,
                  ),
                ),
                const SizedBox(width: 10),
                // Name + address
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        kitchenName,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: cs.onSurface,
                        ),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (address.isNotEmpty) ...[
                        const SizedBox(height: 1),
                        Text(
                          address,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: cs.onSurfaceVariant,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                // Status badge
                _statusBadge(context, status),
              ],
            ),
          ),

          const SizedBox(height: 10),

          // ── Plan type + date range ───────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14),
            child: Row(
              children: [
                _planBadge(planType),
                const SizedBox(width: 8),
                Expanded(
                  child: Row(
                    children: [
                      Icon(Icons.calendar_today_rounded,
                          size: 12, color: cs.onSurfaceVariant),
                      const SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          dateRange,
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
              ],
            ),
          ),

          const SizedBox(height: 10),

          // ── Divider ──────────────────────────────────────────────────
          Divider(height: 1, color: cs.outlineVariant),

          // ── Bottom row: amount + payment + meal info ─────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                // Amount
                Text(
                  payMethod == 'Free' ? 'Free' : '₹$amount',
                  style: GoogleFonts.poppins(
                    fontSize: 15,
                    fontWeight: FontWeight.w700,
                    color: cs.onSurface,
                  ),
                ),
                if (payMethod != 'Free') ...[
                  _dot(cs),
                  // Payment method
                  Icon(
                    payMethod == 'UPI'
                        ? Icons.smartphone_rounded
                        : Icons.payments_rounded,
                    size: 13,
                    color: cs.onSurfaceVariant,
                  ),
                  const SizedBox(width: 3),
                  Text(
                    payMethod,
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: cs.onSurfaceVariant,
                    ),
                  ),
                  _dot(cs),
                  _payChip(payStatus),
                ],
                const Spacer(),
                // Meal pref + slot
                if (mealPref.isNotEmpty || slot.isNotEmpty)
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      if (mealPref.isNotEmpty) ...[
                        Icon(
                          mealPref == 'Jain'
                              ? Icons.eco_rounded
                              : Icons.restaurant_menu_rounded,
                          size: 12,
                          color: mealPref == 'Jain'
                              ? AppColors.success
                              : cs.onSurfaceVariant,
                        ),
                        const SizedBox(width: 3),
                        Text(
                          mealPref,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: mealPref == 'Jain'
                                ? AppColors.success
                                : cs.onSurfaceVariant,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                      if (mealPref.isNotEmpty && slot.isNotEmpty)
                        _dot(cs),
                      if (slot.isNotEmpty)
                        Text(
                          slot,
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: cs.onSurfaceVariant,
                          ),
                        ),
                    ],
                  ),
              ],
            ),
          ),

          // ── Footer: order date + download button ──────────────────────
          Container(
            width: double.infinity,
            padding: const EdgeInsets.fromLTRB(14, 8, 10, 8),
            decoration: BoxDecoration(
              color: cs.surfaceContainerLowest,
              borderRadius: const BorderRadius.vertical(
                bottom: Radius.circular(14),
              ),
            ),
            child: Row(
              children: [
                if (orderDate != null)
                  Expanded(
                    child: Text(
                      'Ordered on ${_fmt(orderDate)}',
                      style: GoogleFonts.poppins(
                        fontSize: 10,
                        color: cs.onSurfaceVariant,
                      ),
                    ),
                  )
                else
                  const Spacer(),
                // ── Track delivery button ────────────────────────────
                if (isDelivering) ...[
                  GestureDetector(
                    onTap: () => context.push('/track-order', extra: orderId),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: const Color(0xFF2563EB).withAlpha(20),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color: const Color(0xFF2563EB).withAlpha(60)),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.location_on_rounded,
                              size: 13, color: Color(0xFF2563EB)),
                          const SizedBox(width: 4),
                          Text(
                            'Track',
                            style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w600,
                              color: const Color(0xFF2563EB),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(width: 6),
                ],
                // ── Download invoice button ──────────────────────────
                if (orderId.isNotEmpty)
                  _downloading[orderId] == true
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: AppColors.primary,
                          ),
                        )
                      : GestureDetector(
                          onTap: () => _downloadInvoice(orderId, kitchenName),
                          child: Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 10, vertical: 5),
                            decoration: BoxDecoration(
                              color: AppColors.primary.withAlpha(15),
                              borderRadius: BorderRadius.circular(8),
                              border: Border.all(
                                  color: AppColors.primary.withAlpha(60)),
                            ),
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Icon(Icons.download_rounded,
                                    size: 13, color: AppColors.primary),
                                const SizedBox(width: 4),
                                Text(
                                  'Invoice',
                                  style: GoogleFonts.poppins(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.primary,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _dot(ColorScheme cs) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4),
        child: Text('·',
            style: GoogleFonts.poppins(
                fontSize: 12, color: cs.onSurfaceVariant)),
      );

  // ── Empty state ───────────────────────────────────────────────────────────

  Widget _emptyState(BuildContext context, String tab) {
    final cs = Theme.of(context).colorScheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 48),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              tab == 'Cancelled'
                  ? Icons.cancel_outlined
                  : tab == 'Upcoming'
                      ? Icons.schedule_rounded
                      : Icons.receipt_long_rounded,
              size: 64,
              color: cs.outlineVariant,
            ),
            const SizedBox(height: 16),
            Text(
              tab == 'All'
                  ? 'No orders yet'
                  : 'No $tab orders',
              style: GoogleFonts.poppins(
                fontSize: 16,
                fontWeight: FontWeight.w600,
                color: cs.onSurfaceVariant,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              tab == 'All'
                  ? 'Your order history will appear here once you subscribe to a meal plan.'
                  : 'Orders with "$tab" status will appear here.',
              style: GoogleFonts.poppins(
                fontSize: 12,
                color: cs.onSurfaceVariant,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }

  // ── Tab content ───────────────────────────────────────────────────────────

  Widget _tabContent(BuildContext context, String tab) {
    final items = _filterFor(tab);
    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _loadOrders,
      child: items.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [_emptyState(context, tab)],
            )
          : ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(top: 8, bottom: 24),
              itemCount: items.length,
              itemBuilder: (_, i) => _orderCard(context, items[i]),
            ),
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        scrolledUnderElevation: 1,
        title: Text(
          'Order History',
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          labelColor: AppColors.primary,
          unselectedLabelColor: cs.onSurfaceVariant,
          indicatorColor: AppColors.primary,
          indicatorWeight: 2.5,
          labelStyle: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w600,
          ),
          unselectedLabelStyle: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w500,
          ),
          tabs: _tabLabels.map((t) {
            // Show count badge on each tab
            final count = t == 'All' ? _orders.length : _filterFor(t).length;
            return Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(t),
                  if (!_isLoading && count > 0) ...[
                    const SizedBox(width: 5),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withAlpha(20),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '$count',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            );
          }).toList(),
        ),
      ),

      // ── Body ──────────────────────────────────────────────────────────────
      body: _isLoading
          ? const Center(
              child: CircularProgressIndicator(color: AppColors.primary),
            )
          : _error != null
              ? Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.wifi_off_rounded,
                            size: 56, color: cs.outlineVariant),
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
                            fontSize: 12,
                            color: cs.onSurfaceVariant,
                          ),
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
                              style: GoogleFonts.poppins(
                                  fontWeight: FontWeight.w600)),
                          onPressed: _loadOrders,
                        ),
                      ],
                    ),
                  ),
                )
              : TabBarView(
                  controller: _tabController,
                  children: _tabLabels
                      .map((tab) => _tabContent(context, tab))
                      .toList(),
                ),
    );
  }
  String _parseAddress(dynamic addressData) {
    if (addressData == null) return '';
    if (addressData is String) return addressData;

    if (addressData is Map) {
      if (addressData['fullAddress'] != null &&
          addressData['fullAddress'].toString().isNotEmpty) {
        return addressData['fullAddress'].toString();
      }

      final parts =
          [
                addressData['flatHouseNo'],
                addressData['shopNo'],
                addressData['street'],
                addressData['area'],
                addressData['city'],
                addressData['pincode'],
              ]
              .where(
                (part) => part != null && part.toString().trim().isNotEmpty,
              )
              .join(', ');

      return parts;
    }
    return '';
  }
}
