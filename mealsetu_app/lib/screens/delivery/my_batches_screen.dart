import 'dart:async';

import 'package:dio/dio.dart' show DioException;
import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../providers/delivery_provider.dart';

const _kOrange   = Color(0xFFF26522);
const _kGreen    = Color(0xFF16A34A);
const _kBlue     = Color(0xFF2563EB);
const _kRed      = Color(0xFFDC2626);
const _kBg       = Color(0xFFF4F6F8);
const _kCard     = Colors.white;
const _kBorder   = Color(0xFFE8ECF0);
const _kTextDark = Color(0xFF1A1D23);
const _kTextMid  = Color(0xFF64748B);

// ── Timing helpers ─────────────────────────────────────────────────────────────

DateTime? _parseTime(dynamic raw) {
  if (raw == null) return null;
  return DateTime.tryParse(raw.toString())?.toLocal();
}

String _fmt12(DateTime? dt) {
  if (dt == null) return '--:--';
  final h      = dt.hour;
  final m      = dt.minute.toString().padLeft(2, '0');
  final period = h >= 12 ? 'PM' : 'AM';
  final h12    = h > 12 ? h - 12 : (h == 0 ? 12 : h);
  return '$h12:$m $period';
}

String _countdown(DateTime? dt) {
  if (dt == null) return '';
  final diff = dt.difference(DateTime.now());
  if (diff.isNegative) {
    final m = diff.abs().inMinutes;
    return m < 60
        ? '${m}m overdue'
        : '${diff.abs().inHours}h ${diff.abs().inMinutes % 60}m overdue';
  }
  if (diff.inHours >= 1)  return 'in ${diff.inHours}h ${diff.inMinutes % 60}m';
  if (diff.inMinutes >= 1) return 'in ${diff.inMinutes}m';
  return 'now!';
}

Color _countdownColor(DateTime? dt) {
  if (dt == null) return Colors.grey;
  final diff = dt.difference(DateTime.now());
  if (diff.isNegative)       return _kRed;
  if (diff.inMinutes <= 15)  return _kOrange;
  return _kGreen;
}

Uri _mapsDirectionsUri(dynamic address) {
  if (address is Map) {
    final lat = address['latitude'];
    final lng = address['longitude'];
    if (lat != null && lng != null) {
      return Uri.parse(
          'https://www.google.com/maps/dir/?api=1&destination=$lat,$lng');
    }
    final parts = <String>[
      if ((address['flatHouseNo'] as String?)?.isNotEmpty == true)
        address['flatHouseNo'] as String,
      if ((address['street']     as String?)?.isNotEmpty == true)
        address['street'] as String,
      if ((address['area']       as String?)?.isNotEmpty == true)
        address['area'] as String,
      if ((address['landmark']   as String?)?.isNotEmpty == true)
        address['landmark'] as String,
      if ((address['city']       as String?)?.isNotEmpty == true)
        address['city'] as String,
      if ((address['pincode']    as String?)?.isNotEmpty == true)
        address['pincode'] as String,
    ];
    final addrStr = parts.isNotEmpty
        ? parts.join(', ')
        : (address['fullAddress'] as String? ?? '');
    return Uri.parse(
        'https://www.google.com/maps/dir/?api=1&destination=${Uri.encodeComponent(addrStr)}');
  }
  final q = Uri.encodeComponent(address?.toString() ?? '');
  return Uri.parse('https://www.google.com/maps/dir/?api=1&destination=$q');
}

// ── Screen ─────────────────────────────────────────────────────────────────────

class MyBatchesScreen extends StatefulWidget {
  const MyBatchesScreen({super.key});

  @override
  State<MyBatchesScreen> createState() => _MyBatchesScreenState();
}

class _MyBatchesScreenState extends State<MyBatchesScreen> {
  String _selectedMealSlot = 'dinner';

  @override
  void initState() {
    super.initState();
    final hour = DateTime.now().hour;
    _selectedMealSlot = hour >= 15 ? 'dinner' : 'lunch';
  }

  String _formattedDate() =>
      DateFormat('EEE, d MMM yyyy').format(DateTime.now());

  @override
  Widget build(BuildContext context) {
    final provider = context.watch<DeliveryProvider>();

    return Scaffold(
      backgroundColor: _kBg,
      body: Column(
        children: [
          // ── Gradient AppBar ───────────────────────────────────────────────
          Container(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFFF26522), Color(0xFFD94F0D)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              boxShadow: [
                BoxShadow(
                  color: Color(0x33F26522),
                  blurRadius: 12,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Row(
                  children: [
                    // Icon + title
                    Container(
                      width: 38,
                      height: 38,
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(Icons.delivery_dining,
                          color: Colors.white, size: 22),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('My Deliveries',
                              style: TextStyle(
                                  fontSize: 17,
                                  fontWeight: FontWeight.w800,
                                  color: Colors.white,
                                  letterSpacing: -0.2)),
                          Text(_formattedDate(),
                              style: TextStyle(
                                  fontSize: 12,
                                  color: Colors.white.withValues(alpha: 0.75))),
                        ],
                      ),
                    ),
                    // Refresh button
                    Material(
                      color: Colors.white.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(10),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(10),
                        onTap: () =>
                            provider.fetchBatches(mealSlot: _selectedMealSlot),
                        child: const Padding(
                          padding: EdgeInsets.all(8),
                          child: Icon(Icons.refresh_rounded,
                              color: Colors.white, size: 20),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),

          // ── Meal slot pills ───────────────────────────────────────────────
          Container(
            color: _kCard,
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 10),
            child: Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: const Color(0xFFF1F5F9),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                children: [
                  _SlotTab(
                    label: '☀️  Lunch',
                    value: 'lunch',
                    isActive: _selectedMealSlot == 'lunch',
                    onTap: () {
                      setState(() => _selectedMealSlot = 'lunch');
                      provider.fetchBatches(mealSlot: 'lunch');
                    },
                  ),
                  _SlotTab(
                    label: '🌙  Dinner',
                    value: 'dinner',
                    isActive: _selectedMealSlot == 'dinner',
                    onTap: () {
                      setState(() => _selectedMealSlot = 'dinner');
                      provider.fetchBatches(mealSlot: 'dinner');
                    },
                  ),
                ],
              ),
            ),
          ),

          // ── Stats row ─────────────────────────────────────────────────────
          Container(
            color: _kCard,
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 14),
            child: Row(
              children: [
                _StatCard(
                  icon:  Icons.local_shipping_outlined,
                  label: 'Total',
                  count: provider.totalOrdersToday,
                  color: _kBlue,
                ),
                const SizedBox(width: 10),
                _StatCard(
                  icon:  Icons.check_circle_outline,
                  label: 'Delivered',
                  count: provider.deliveredOrdersToday,
                  color: _kGreen,
                ),
                const SizedBox(width: 10),
                _StatCard(
                  icon:  Icons.pending_outlined,
                  label: 'Remaining',
                  count: provider.totalOrdersToday - provider.deliveredOrdersToday,
                  color: _kOrange,
                ),
              ],
            ),
          ),

          // ── Divider ───────────────────────────────────────────────────────
          const Divider(height: 1, thickness: 1, color: _kBorder),

          // ── Batch list ────────────────────────────────────────────────────
          if (provider.isLoading)
            const Expanded(
              child: Center(
                child: CircularProgressIndicator(color: _kOrange, strokeWidth: 2.5),
              ),
            )
          else if (provider.batches.isEmpty)
            Expanded(
              child: Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 80, height: 80,
                      decoration: BoxDecoration(
                        color: _kOrange.withValues(alpha: 0.08),
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(Icons.inventory_2_outlined,
                          size: 38, color: _kOrange),
                    ),
                    const SizedBox(height: 16),
                    Text(
                      'No ${_selectedMealSlot == 'lunch' ? 'lunch' : 'dinner'} batches today',
                      style: const TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w700,
                          color: _kTextDark),
                    ),
                    const SizedBox(height: 6),
                    const Text(
                      'Pull down to refresh',
                      style: TextStyle(fontSize: 13, color: _kTextMid),
                    ),
                  ],
                ),
              ),
            )
          else
            Expanded(
              child: RefreshIndicator(
                color: _kOrange,
                onRefresh: () =>
                    provider.fetchBatches(mealSlot: _selectedMealSlot),
                child: ListView.builder(
                  padding: const EdgeInsets.only(top: 10, bottom: 24),
                  itemCount: provider.batches.length,
                  itemBuilder: (_, i) => _BatchCard(
                    batch:    provider.batches[i],
                    provider: provider,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Slot pill tab ─────────────────────────────────────────────────────────────

class _SlotTab extends StatelessWidget {
  const _SlotTab({
    required this.label,
    required this.value,
    required this.isActive,
    required this.onTap,
  });

  final String       label;
  final String       value;
  final bool         isActive;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: GestureDetector(
        onTap: onTap,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 180),
          padding: const EdgeInsets.symmetric(vertical: 10),
          decoration: BoxDecoration(
            color: isActive ? _kOrange : Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            boxShadow: isActive
                ? [
                    BoxShadow(
                        color: _kOrange.withValues(alpha: 0.25),
                        blurRadius: 8,
                        offset: const Offset(0, 2)),
                  ]
                : null,
          ),
          child: Text(
            label,
            textAlign: TextAlign.center,
            style: TextStyle(
              fontSize: 14,
              fontWeight: FontWeight.w700,
              color: isActive ? Colors.white : _kTextMid,
            ),
          ),
        ),
      ),
    );
  }
}

// ── Stat card ─────────────────────────────────────────────────────────────────

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.icon,
    required this.label,
    required this.count,
    required this.color,
  });
  final IconData icon;
  final String   label;
  final int      count;
  final Color    color;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
        decoration: BoxDecoration(
          color:        color.withValues(alpha: 0.07),
          borderRadius: BorderRadius.circular(12),
          border:       Border.all(color: color.withValues(alpha: 0.18)),
        ),
        child: Row(
          children: [
            Icon(icon, size: 18, color: color),
            const SizedBox(width: 8),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$count',
                    style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: color,
                        height: 1.1)),
                Text(label,
                    style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: color.withValues(alpha: 0.75))),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ── Batch card ─────────────────────────────────────────────────────────────────

class _BatchCard extends StatefulWidget {
  const _BatchCard({required this.batch, required this.provider});
  final Map<String, dynamic> batch;
  final DeliveryProvider     provider;

  @override
  State<_BatchCard> createState() => _BatchCardState();
}

class _BatchCardState extends State<_BatchCard> {
  bool   _isExpanded = true;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _timer = Timer.periodic(
      const Duration(minutes: 1),
      (_) { if (mounted) setState(() {}); },
    );
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Color _headerColor(String status) {
    switch (status) {
      case 'in_progress': return _kOrange;
      case 'completed':   return _kGreen;
      case 'partial':     return Colors.amber.shade700;
      default:            return const Color(0xFF0EA5E9);
    }
  }

  Future<void> _acceptBatch(
      String batchId, int orderCount,
      DateTime? pickupTime, DateTime? deadline) async {
    final pickupStr    = _fmt12(pickupTime);
    final deadlineStr  = _fmt12(deadline);
    final countdownStr = pickupTime != null ? _countdown(pickupTime) : '';

    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(20)),
        title: const Row(
          children: [
            Text('🛵', style: TextStyle(fontSize: 22)),
            SizedBox(width: 8),
            Text('Departure Checklist',
                style: TextStyle(
                    fontSize: 17, fontWeight: FontWeight.w800)),
          ],
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _CheckItem('All $orderCount tiffin${orderCount == 1 ? '' : 's'} loaded'),
            _CheckItem('Delivery route reviewed ($orderCount stop${orderCount == 1 ? '' : 's'})'),
            _CheckItem('Phone charged & GPS on'),
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color:        const Color(0xFFFFF3EC),
                borderRadius: BorderRadius.circular(10),
                border:       Border.all(color: _kOrange.withValues(alpha: 0.4)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    const Icon(Icons.schedule, size: 14, color: _kOrange),
                    const SizedBox(width: 6),
                    Text('Pickup: $pickupStr',
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: _kOrange)),
                    if (countdownStr.isNotEmpty) ...[
                      const SizedBox(width: 6),
                      Text('($countdownStr)',
                          style: TextStyle(
                              fontSize: 11,
                              color: _countdownColor(pickupTime))),
                    ],
                  ]),
                  const SizedBox(height: 4),
                  Row(children: [
                    const Icon(Icons.flag_outlined, size: 14, color: _kRed),
                    const SizedBox(width: 6),
                    Text('Deliver by: $deadlineStr',
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: _kRed)),
                  ]),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Not Yet',
                style: TextStyle(color: _kTextMid)),
          ),
          ElevatedButton.icon(
            onPressed: () => Navigator.pop(ctx, true),
            icon:  const Icon(Icons.play_circle_filled,
                color: Colors.white, size: 18),
            label: const Text('All Set — Start!',
                style: TextStyle(
                    color: Colors.white, fontWeight: FontWeight.w700)),
            style: ElevatedButton.styleFrom(
              backgroundColor: _kOrange,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
              elevation: 0,
            ),
          ),
        ],
      ),
    );

    if (ok != true || !mounted) return;

    try {
      await widget.provider.acceptBatch(batchId);
      await widget.provider.startLocationSharing(batchId);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('✅ Batch accepted! Location sharing started.'),
            backgroundColor: _kGreen,
            behavior:        SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
          ),
        );
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content:         const Text('Failed to accept batch. Try again.'),
            backgroundColor: _kRed,
            behavior:        SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final batch       = widget.batch;
    final batchId     = batch['_id']?.toString() ?? '';
    final batchStatus = batch['batchStatus'] as String? ?? 'pending';
    final area        = batch['area']         as String? ?? 'Area';
    final mealSlot    = batch['mealSlot']     as String? ?? '';
    final orders      = (batch['orders'] as List? ?? [])
        .map((o) => o as Map<String, dynamic>)
        .toList();

    final pickupTime = _parseTime(batch['scheduledPickupTime']);
    final deadline   = _parseTime(batch['deliveryDeadline']);

    final delivered  = orders.where((o) => o['status'] == 'delivered').length;
    final total      = orders.length;
    final headerBg   = _headerColor(batchStatus);
    final isActive   = batchStatus == 'in_progress';
    final isAssigned = batchStatus == 'assigned';
    final isDone     = batchStatus == 'completed' || batchStatus == 'partial';

    final isSharing = widget.provider.isLocationSharing &&
        widget.provider.activeBatchId == batchId;

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
      decoration: BoxDecoration(
        color:        _kCard,
        borderRadius: BorderRadius.circular(16),
        border:       isActive
            ? Border.all(color: _kOrange, width: 2)
            : Border.all(color: _kBorder),
        boxShadow: [
          BoxShadow(
            color:      Colors.black.withValues(alpha: isActive ? 0.10 : 0.05),
            blurRadius: isActive ? 16 : 8,
            offset:     const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        children: [
          // ── Colored header ───────────────────────────────────────────────
          GestureDetector(
            onTap: () => setState(() => _isExpanded = !_isExpanded),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              decoration: BoxDecoration(
                gradient: LinearGradient(
                  colors: [headerBg, headerBg.withValues(alpha: 0.82)],
                  begin: Alignment.topLeft,
                  end:   Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.only(
                  topLeft:     const Radius.circular(14),
                  topRight:    const Radius.circular(14),
                  bottomLeft:  _isExpanded ? Radius.zero : const Radius.circular(14),
                  bottomRight: _isExpanded ? Radius.zero : const Radius.circular(14),
                ),
              ),
              child: Column(
                children: [
                  Row(
                    children: [
                      // Area pill
                      Flexible(
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color:        Colors.white.withValues(alpha: 0.22),
                            borderRadius: BorderRadius.circular(20),
                          ),
                          child: Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              const Icon(Icons.location_on,
                                  size: 12, color: Colors.white),
                              const SizedBox(width: 4),
                              Flexible(
                                child: Text(
                                  area,
                                  style: const TextStyle(
                                      fontSize: 13,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                      const Spacer(),
                      // Order count badge
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black.withValues(alpha: 0.18),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Text('$total stop${total == 1 ? '' : 's'}',
                            style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w600,
                                color: Colors.white)),
                      ),
                      const SizedBox(width: 8),
                      _BatchStatusChip(batchStatus),
                      const SizedBox(width: 8),
                      if (isSharing) ...[
                        const _PulsingDot(),
                        const SizedBox(width: 6),
                      ],
                      Icon(
                        _isExpanded
                            ? Icons.keyboard_arrow_up_rounded
                            : Icons.keyboard_arrow_down_rounded,
                        color: Colors.white,
                        size: 22,
                      ),
                    ],
                  ),
                  // ── Timing row ─────────────────────────────────────────
                  if (pickupTime != null || deadline != null) ...[
                    const SizedBox(height: 9),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 6),
                      decoration: BoxDecoration(
                        color:        Colors.black.withValues(alpha: 0.18),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.schedule,
                              size: 13, color: Colors.white70),
                          const SizedBox(width: 5),
                          Text(
                            '${mealSlot == 'lunch' ? '☀️' : '🌙'} '
                            'Pickup ${_fmt12(pickupTime)}  ·  '
                            'By ${_fmt12(deadline)}',
                            style: const TextStyle(
                                fontSize: 11,
                                color: Colors.white,
                                fontWeight: FontWeight.w600),
                          ),
                        ],
                      ),
                    ),
                    if (!isDone) ...[
                      const SizedBox(height: 5),
                      _CountdownChip(
                          pickupTime:  pickupTime,
                          deadline:    deadline,
                          batchStatus: batchStatus),
                    ],
                  ],
                ],
              ),
            ),
          ),

          // ── Progress bar ──────────────────────────────────────────────────
          if (total > 0)
            ClipRRect(
              child: LinearProgressIndicator(
                value:           total > 0 ? delivered / total : 0,
                backgroundColor: const Color(0xFFE5E7EB),
                color:           _kGreen,
                minHeight:       5,
              ),
            ),

          // ── Accept button ─────────────────────────────────────────────────
          if (isAssigned)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
              child: SizedBox(
                width:  double.infinity,
                height: 48,
                child: ElevatedButton.icon(
                  onPressed: () =>
                      _acceptBatch(batchId, total, pickupTime, deadline),
                  icon:  const Icon(Icons.play_circle_filled,
                      color: Colors.white, size: 20),
                  label: const Text('Accept & Start Delivery',
                      style: TextStyle(
                          color:      Colors.white,
                          fontWeight: FontWeight.w700,
                          fontSize:   15)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _kOrange,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                    elevation:   2,
                    shadowColor: _kOrange.withValues(alpha: 0.4),
                  ),
                ),
              ),
            ),

          // ── Progress label ────────────────────────────────────────────────
          if (total > 0 && _isExpanded)
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
              child: Row(
                children: [
                  Icon(Icons.check_circle_outline,
                      size: 13,
                      color: delivered == total ? _kGreen : _kTextMid),
                  const SizedBox(width: 5),
                  Text(
                    '$delivered of $total delivered',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: delivered == total ? _kGreen : _kTextMid),
                  ),
                  const Spacer(),
                  if (total > 0)
                    Text(
                      '${(delivered / total * 100).round()}% complete',
                      style: TextStyle(
                          fontSize: 11,
                          color: _kTextMid.withValues(alpha: 0.7)),
                    ),
                ],
              ),
            ),

          // ── Orders list (hide finally-failed orders) ──────────────────────
          if (_isExpanded)
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 8),
              child: Column(
                children: orders
                    .asMap()
                    .entries
                    .where((e) => e.value['status'] != 'failed')
                    .map((e) => _OrderDeliveryTile(
                          order:             e.value,
                          index:             e.key + 1,
                          batchId:           batchId,
                          batchStatus:       batchStatus,
                          provider:          widget.provider,
                          isLocationSharing: isSharing,
                        ))
                    .toList(),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Countdown chip ────────────────────────────────────────────────────────────

class _CountdownChip extends StatelessWidget {
  const _CountdownChip({
    required this.pickupTime,
    required this.deadline,
    required this.batchStatus,
  });
  final DateTime? pickupTime;
  final DateTime? deadline;
  final String    batchStatus;

  @override
  Widget build(BuildContext context) {
    final ref   = batchStatus == 'in_progress' ? deadline : pickupTime;
    if (ref == null) return const SizedBox.shrink();

    final label = batchStatus == 'in_progress'
        ? 'Deadline: ${_countdown(ref)}'
        : 'Pickup: ${_countdown(ref)}';
    final color = _countdownColor(ref);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color:        color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(6),
        border:       Border.all(color: color.withValues(alpha: 0.55)),
      ),
      child: Text(
        label,
        style: TextStyle(
            fontSize: 11, fontWeight: FontWeight.w700, color: color),
      ),
    );
  }
}

// ── Checklist item ────────────────────────────────────────────────────────────

class _CheckItem extends StatelessWidget {
  const _CheckItem(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Container(
            width: 20, height: 20,
            decoration: BoxDecoration(
              color:  _kGreen.withValues(alpha: 0.12),
              shape:  BoxShape.circle,
              border: Border.all(color: _kGreen, width: 1.5),
            ),
            child: const Icon(Icons.check, size: 12, color: _kGreen),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text,
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}

// ── Order delivery tile ───────────────────────────────────────────────────────

class _OrderDeliveryTile extends StatelessWidget {
  const _OrderDeliveryTile({
    required this.order,
    required this.index,
    required this.batchId,
    required this.batchStatus,
    required this.provider,
    required this.isLocationSharing,
  });

  final Map<String, dynamic> order;
  final int                  index;
  final String               batchId;
  final String               batchStatus;
  final DeliveryProvider     provider;
  final bool                 isLocationSharing;

  Color _seqColor(String? status) {
    switch (status) {
      case 'delivered':  return _kGreen;
      case 'near_you':   return const Color(0xFF7C3AED);
      case 'on_the_way': return _kOrange;
      case 'picked_up':  return _kBlue;
      default:           return const Color(0xFF94A3B8);
    }
  }

  Future<void> _callPhone(String phone) async {
    final uri = Uri(scheme: 'tel', path: phone);
    if (await canLaunchUrl(uri)) launchUrl(uri);
  }

  Future<void> _navigate(dynamic address) async {
    final uri = _mapsDirectionsUri(address);
    launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  Future<void> _deliverOrder(
      BuildContext context, String orderId, String? name,
      Map<String, dynamic> order) async {
    final isCash = (order['paymentMethod'] as String? ?? '').toLowerCase() == 'cash';
    final expectedAmount = (order['amount'] as num?)?.toDouble() ?? 0;
    final amountController = TextEditingController(
      text: expectedAmount > 0 ? expectedAmount.toStringAsFixed(2) : '',
    );
    var cashCollected = false;
    var submitting = false;
    String? errorMessage;

    final delivered = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (dialogContext) => StatefulBuilder(
        builder: (dialogContext, setDialogState) {
          final amount = double.tryParse(amountController.text);
          final cashValid = !isCash || (cashCollected && amount != null && amount > 0);
          return AlertDialog(
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16)),
            title: const Text('Confirm Delivery',
                style: TextStyle(fontWeight: FontWeight.w700)),
            content: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Mark the meal delivered to ${name ?? 'the customer'}?'),
                if (isCash) ...[
                  const SizedBox(height: 12),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    title: const Text('Cash collected'),
                    value: cashCollected,
                    onChanged: submitting
                        ? null
                        : (value) => setDialogState(() => cashCollected = value ?? false),
                  ),
                  TextField(
                    controller: amountController,
                    enabled: !submitting,
                    keyboardType: const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: 'Cash amount',
                      prefixText: '₹ ',
                    ),
                    onChanged: (_) => setDialogState(() {}),
                  ),
                ],
                if (errorMessage != null) ...[
                  const SizedBox(height: 10),
                  Text(errorMessage!, style: const TextStyle(color: _kRed)),
                ],
              ],
            ),
            actions: [
              TextButton(
                onPressed: submitting ? null : () => Navigator.pop(dialogContext, false),
                child: const Text('Cancel'),
              ),
              ElevatedButton(
                onPressed: !cashValid || submitting
                    ? null
                    : () async {
                        setDialogState(() {
                          submitting = true;
                          errorMessage = null;
                        });
                        try {
                          if (!await Geolocator.isLocationServiceEnabled()) {
                            throw Exception('Enable location services and try again.');
                          }
                          var permission = await Geolocator.checkPermission();
                          if (permission == LocationPermission.denied) {
                            permission = await Geolocator.requestPermission();
                          }
                          if (permission == LocationPermission.denied ||
                              permission == LocationPermission.deniedForever) {
                            throw Exception('Location permission is required to confirm delivery.');
                          }
                          final position = await Geolocator.getCurrentPosition(
                            desiredAccuracy: LocationAccuracy.bestForNavigation,
                            timeLimit: const Duration(seconds: 25),
                          );
                          if (position.isMocked) {
                            throw Exception('Mocked location is not allowed. Use your device GPS and retry.');
                          }
                          await provider.updateOrderStatus(
                            orderId,
                            'delivered',
                            batchId,
                            latitude: position.latitude,
                            longitude: position.longitude,
                            accuracy: position.accuracy,
                            isMocked: position.isMocked,
                            cashCollected: isCash ? cashCollected : null,
                            cashAmount: isCash ? amount : null,
                          );
                          if (dialogContext.mounted) {
                            Navigator.pop(dialogContext, true);
                          }
                        } catch (error) {
                          var message = error.toString().replaceFirst('Exception: ', '');
                          if (error is DioException) {
                            final data = error.response?.data;
                            if (data is Map && data['message'] != null) {
                              message = data['message'].toString();
                            }
                          }
                          setDialogState(() {
                            submitting = false;
                            errorMessage = message;
                          });
                        }
                      },
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kGreen,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: Colors.grey.shade300,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                  elevation: 0,
                ),
                child: Text(submitting ? 'Marking…' : 'Mark Delivered',
                    style: const TextStyle(fontWeight: FontWeight.w600)),
              ),
            ],
          );
        },
      ),
    );
    amountController.dispose();
    if (delivered == true && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Delivered to ${name ?? 'customer'}!'),
          backgroundColor: _kGreen,
          behavior: SnackBarBehavior.floating,
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10)),
        ),
      );
    }
  }

  Future<void> _markFailed(
      BuildContext context, String orderId, String? custName,
      {int retryCount = 0}) async {
    const reasons = [
      'Customer not home',
      'Address not found',
      'Customer refused delivery',
      'Other',
    ];
    String? chosen;
    final canRetry = retryCount < 2;

    final result = await showDialog<Map<String, dynamic>>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setS) => AlertDialog(
          shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16)),
          title: Row(
            children: [
              Icon(Icons.warning_amber_rounded,
                  color: canRetry ? _kOrange : _kRed, size: 20),
              const SizedBox(width: 8),
              Text(
                canRetry ? "Couldn't Deliver?" : 'Final Failure',
                style: const TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 16),
              ),
            ],
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                "Why couldn't you deliver to ${custName ?? 'customer'}?",
                style: const TextStyle(fontSize: 14),
              ),
              const SizedBox(height: 10),
              RadioGroup<String>(
                groupValue: chosen,
                onChanged:  (v) => setS(() => chosen = v),
                child: Column(
                  children: reasons.map((r) => RadioListTile<String>(
                    title:         Text(r, style: const TextStyle(fontSize: 13)),
                    value:         r,
                    dense:         true,
                    visualDensity: VisualDensity.compact,
                    activeColor:   _kOrange,
                  )).toList(),
                ),
              ),
              if (canRetry) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(10),
                  decoration: BoxDecoration(
                    color:        const Color(0xFFFFF7ED),
                    borderRadius: BorderRadius.circular(8),
                    border:       Border.all(
                        color: _kOrange.withValues(alpha: 0.4)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.refresh_rounded,
                          size: 14, color: _kOrange),
                      const SizedBox(width: 6),
                      Expanded(
                        child: Text(
                          'Attempt ${retryCount + 1}/2 — marked for re-attempt.',
                          style: const TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: _kOrange),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            ElevatedButton(
              onPressed: chosen == null
                  ? null
                  : () => Navigator.pop(
                      ctx, {'reason': chosen, 'retry': canRetry}),
              style: ElevatedButton.styleFrom(
                backgroundColor:          canRetry ? _kOrange : _kRed,
                foregroundColor:          Colors.white,
                disabledBackgroundColor:  Colors.grey.shade300,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
                elevation: 0,
              ),
              child: Text(
                canRetry ? 'Request Re-attempt' : 'Mark Final Failure',
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
            ),
          ],
        ),
      ),
    );

    if (result == null || !context.mounted) return;

    final reason    = result['reason'] as String;
    final doRetry   = result['retry'] as bool;
    final newStatus = doRetry ? 'retry_pending' : 'failed';

    try {
      await provider.updateOrderStatus(
        orderId, newStatus, batchId,
        failReason: reason,
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(doRetry
                ? 'Re-attempt scheduled: $reason'
                : 'Order marked as final failure: $reason'),
            backgroundColor: doRetry ? _kOrange : _kRed,
            behavior:        SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
          ),
        );
      }
    } on DioException catch (e) {
      if (!context.mounted) return;
      final msg = (e.response?.data is Map)
          ? e.response!.data['message'] ?? 'Failed to update status.'
          : 'Failed to update status. Try again.';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content:         Text(msg),
          backgroundColor: _kRed,
          behavior:        SnackBarBehavior.floating,
        ),
      );
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content:         Text('Failed to update status. Try again.'),
            backgroundColor: _kRed,
            behavior:        SnackBarBehavior.floating,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final status   = order['status']       as String? ?? 'pending';
    final name     = order['customerName'] as String? ?? 'Customer';
    final phone    = order['phone']        as String? ?? '';
    final address  = order['address'];
    final etaTime  = _parseTime(order['estimatedArrivalTime']);

    String addressText = '';
    if (address is Map) {
      final parts = <String>[
        if ((address['flatHouseNo'] as String?)?.isNotEmpty == true)
          address['flatHouseNo'] as String,
        if ((address['street']     as String?)?.isNotEmpty == true)
          address['street'] as String,
        if ((address['area']       as String?)?.isNotEmpty == true)
          address['area'] as String,
        if ((address['landmark']   as String?)?.isNotEmpty == true)
          address['landmark'] as String,
        if ((address['city']       as String?)?.isNotEmpty == true)
          address['city'] as String,
        if ((address['pincode']    as String?)?.isNotEmpty == true)
          address['pincode'] as String,
      ];
      addressText = parts.isNotEmpty
          ? parts.join(', ')
          : (address['fullAddress'] as String? ?? '');
    } else {
      addressText = address?.toString() ?? '';
    }

    final isDelivered = status == 'delivered';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: isDelivered
            ? _kGreen.withValues(alpha: 0.04)
            : _kCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: isDelivered
              ? _kGreen.withValues(alpha: 0.25)
              : _kBorder,
          width: isDelivered ? 1.5 : 1,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ── Sequence circle ───────────────────────────────────────────
            Container(
              width: 34, height: 34,
              decoration: BoxDecoration(
                color:      _seqColor(status),
                shape:      BoxShape.circle,
                boxShadow: [
                  BoxShadow(
                    color:     _seqColor(status).withValues(alpha: 0.3),
                    blurRadius: 6,
                    offset:    const Offset(0, 2),
                  ),
                ],
              ),
              child: Center(
                child: isDelivered
                    ? const Icon(Icons.check,
                        size: 17, color: Colors.white)
                    : Text('$index',
                        style: const TextStyle(
                            color:      Colors.white,
                            fontWeight: FontWeight.w800,
                            fontSize:   13)),
              ),
            ),
            const SizedBox(width: 12),

            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Name + status badge
                  Row(
                    children: [
                      Expanded(
                        child: Text(name,
                            style: TextStyle(
                                fontSize:   14,
                                fontWeight: FontWeight.w700,
                                color:      isDelivered
                                    ? _kGreen
                                    : _kTextDark)),
                      ),
                      _OrderStatusChip(status),
                    ],
                  ),

                  // Address
                  if (addressText.isNotEmpty) ...[
                    const SizedBox(height: 3),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.location_on_outlined,
                            size: 12, color: _kTextMid),
                        const SizedBox(width: 3),
                        Expanded(
                          child: Text(
                            addressText,
                            style: const TextStyle(
                                fontSize: 12, color: _kTextMid),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ],
                    ),
                  ],

                  // Delivery preference
                  Builder(builder: (_) {
                    const prefLabels = {
                      'hand_to_me':        'Hand to me',
                      'leave_at_door':     'Leave at door',
                      'leave_at_security': 'Leave at security',
                      'leave_at_reception':'Leave at reception',
                    };
                    final pref = order['deliveryPreference'] as String?;
                    if (pref == null || pref == 'hand_to_me') {
                      return const SizedBox.shrink();
                    }
                    return Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 3),
                        decoration: BoxDecoration(
                          color:        _kOrange.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(6),
                          border:       Border.all(
                              color: _kOrange.withValues(alpha: 0.25)),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.info_outline,
                                size: 11, color: _kOrange),
                            const SizedBox(width: 4),
                            Text(
                              prefLabels[pref] ?? pref,
                              style: const TextStyle(
                                  fontSize:   11,
                                  fontWeight: FontWeight.w600,
                                  color:      _kOrange),
                            ),
                          ],
                        ),
                      ),
                    );
                  }),

                  // ETA
                  if (etaTime != null && status != 'delivered') ...[
                    const SizedBox(height: 5),
                    Row(
                      children: [
                        const Icon(Icons.access_time_filled,
                            size: 12, color: _kOrange),
                        const SizedBox(width: 4),
                        Text(
                          'ETA ${_fmt12(etaTime)}',
                          style: const TextStyle(
                              fontSize:   12,
                              fontWeight: FontWeight.w600,
                              color:      _kOrange),
                        ),
                      ],
                    ),
                  ],

                  // Call + Navigate buttons
                  if (!isDelivered) ...[
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        if (phone.isNotEmpty)
                          _CallBtn(phone: phone, onTap: () => _callPhone(phone)),
                        if (phone.isNotEmpty) const SizedBox(width: 8),
                        _NavBtn(onTap: () => _navigate(address)),
                      ],
                    ),
                  ],

                  // Action button
                  if ((batchStatus == 'in_progress' ||
                          batchStatus == 'assigned' ||
                          status == 'retry_pending') &&
                      status != 'delivered' &&
                      status != 'failed') ...[
                    const SizedBox(height: 10),
                    _OrderActionButton(
                      order:    order,
                      batchId:  batchId,
                      provider: provider,
                      onConfirmDelivered: (oid, n) =>
                          _deliverOrder(context, oid, n, order),
                      onMarkFailed: (oid, n) =>
                          _markFailed(context, oid, n,
                              retryCount:
                                  (order['retryCount'] as int?) ?? 0),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Call button ───────────────────────────────────────────────────────────────

class _CallBtn extends StatelessWidget {
  const _CallBtn({required this.phone, required this.onTap});
  final String       phone;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color:        _kBlue.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(20),
          border:       Border.all(color: _kBlue.withValues(alpha: 0.25)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.call, size: 14, color: _kBlue),
            const SizedBox(width: 5),
            Text(phone,
                style: const TextStyle(
                    fontSize:   12,
                    fontWeight: FontWeight.w600,
                    color:      _kBlue)),
          ],
        ),
      ),
    );
  }
}

// ── Navigate button ───────────────────────────────────────────────────────────

class _NavBtn extends StatelessWidget {
  const _NavBtn({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color:        _kGreen,
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color:     _kGreen.withValues(alpha: 0.3),
              blurRadius: 6,
              offset:    const Offset(0, 2),
            ),
          ],
        ),
        child: const Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.navigation_rounded, size: 14, color: Colors.white),
            SizedBox(width: 5),
            Text('Navigate',
                style: TextStyle(
                    fontSize:   12,
                    fontWeight: FontWeight.w700,
                    color:      Colors.white)),
          ],
        ),
      ),
    );
  }
}

// ── Order action button ───────────────────────────────────────────────────────

class _OrderActionButton extends StatelessWidget {
  const _OrderActionButton({
    required this.order,
    required this.batchId,
    required this.provider,
    required this.onConfirmDelivered,
    required this.onMarkFailed,
  });

  final Map<String, dynamic>                   order;
  final String                                 batchId;
  final DeliveryProvider                       provider;
  final Future<void> Function(String, String?) onConfirmDelivered;
  final Future<void> Function(String, String?) onMarkFailed;

  @override
  Widget build(BuildContext context) {
    final status   = order['status']       as String? ?? 'pending';
    final orderId  = order['orderId']?.toString() ?? '';
    final custName = order['customerName'] as String? ?? 'Customer';

    switch (status) {
      case 'pending':
      case 'assigned':
        return SizedBox(
          width: double.infinity,
          height: 40,
          child: OutlinedButton.icon(
            onPressed: () =>
                provider.updateOrderStatus(orderId, 'picked_up', batchId),
            icon:  const Icon(Icons.inventory_2_outlined,
                size: 16, color: _kOrange),
            label: const Text('Mark Picked Up',
                style: TextStyle(
                    fontSize: 13, color: _kOrange,
                    fontWeight: FontWeight.w700)),
            style: OutlinedButton.styleFrom(
              side:  const BorderSide(color: _kOrange, width: 1.5),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
          ),
        );

      case 'picked_up':
        return SizedBox(
          width: double.infinity,
          height: 44,
          child: ElevatedButton.icon(
            onPressed: () =>
                provider.updateOrderStatus(orderId, 'on_the_way', batchId),
            icon:  const Icon(Icons.two_wheeler,
                size: 17, color: Colors.white),
            label: const Text('On the Way 🛵',
                style: TextStyle(
                    fontSize: 14, fontWeight: FontWeight.w700,
                    color: Colors.white)),
            style: ElevatedButton.styleFrom(
              backgroundColor: _kOrange,
              elevation:       2,
              shadowColor:     _kOrange.withValues(alpha: 0.4),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
            ),
          ),
        );

      case 'on_the_way':
      case 'near_you':
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (status == 'near_you')
              Container(
                margin: const EdgeInsets.only(bottom: 8),
                padding: const EdgeInsets.symmetric(vertical: 7),
                decoration: BoxDecoration(
                  color: const Color(0xFF7C3AED).withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                      color: const Color(0xFF7C3AED).withValues(alpha: 0.35)),
                ),
                child: const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.near_me, size: 14,
                        color: Color(0xFF7C3AED)),
                    SizedBox(width: 6),
                    Text('Rider is nearby — ready to deliver!',
                        style: TextStyle(
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                            color: Color(0xFF7C3AED))),
                  ],
                ),
              ),
            SizedBox(
              height: 46,
              child: ElevatedButton.icon(
                onPressed: () => onConfirmDelivered(orderId, custName),
                icon:  const Icon(Icons.check_circle,
                    size: 18, color: Colors.white),
                label: const Text('Mark Delivered ✅',
                    style: TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w700,
                        color: Colors.white)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kGreen,
                  elevation:       2,
                  shadowColor:     _kGreen.withValues(alpha: 0.4),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
            const SizedBox(height: 7),
            SizedBox(
              height: 36,
              child: OutlinedButton.icon(
                onPressed: () => onMarkFailed(orderId, custName),
                icon:  const Icon(Icons.cancel_outlined,
                    size: 15, color: _kRed),
                label: const Text("Can't Deliver",
                    style: TextStyle(
                        fontSize: 12, color: _kRed,
                        fontWeight: FontWeight.w600)),
                style: OutlinedButton.styleFrom(
                  side:  const BorderSide(color: _kRed),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ],
        );

      case 'retry_pending':
        final retryCount = (order['retryCount'] as int?) ?? 0;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color:        const Color(0xFFFFF7ED),
                borderRadius: BorderRadius.circular(8),
                border:       Border.all(
                    color: _kOrange.withValues(alpha: 0.4)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const Icon(Icons.refresh_rounded,
                      size: 14, color: _kOrange),
                  const SizedBox(width: 6),
                  Text(
                    'Re-attempt Pending (attempt $retryCount/2)',
                    style: const TextStyle(
                        fontSize:   12,
                        fontWeight: FontWeight.w600,
                        color:      _kOrange),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            SizedBox(
              height: 40,
              child: ElevatedButton.icon(
                onPressed: () =>
                    provider.updateOrderStatus(orderId, 'on_the_way', batchId),
                icon:  const Icon(Icons.two_wheeler,
                    size: 15, color: Colors.white),
                label: const Text('Start Re-attempt',
                    style: TextStyle(
                        fontSize: 13, color: Colors.white,
                        fontWeight: FontWeight.w700)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kOrange,
                  elevation:       1,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
            if (retryCount >= 2) ...[
              const SizedBox(height: 7),
              SizedBox(
                height: 36,
                child: OutlinedButton.icon(
                  onPressed: () => onMarkFailed(orderId, custName),
                  icon:  const Icon(Icons.cancel_outlined,
                      size: 15, color: _kRed),
                  label: const Text('Mark Final Failure',
                      style: TextStyle(
                          fontSize: 12, color: _kRed,
                          fontWeight: FontWeight.w600)),
                  style: OutlinedButton.styleFrom(
                    side:  const BorderSide(color: _kRed),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                ),
              ),
            ],
          ],
        );

      case 'failed':
        return Container(
          padding: const EdgeInsets.symmetric(vertical: 8),
          decoration: BoxDecoration(
            color:        _kRed.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(8),
            border:       Border.all(color: _kRed.withValues(alpha: 0.3)),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.cancel, size: 15, color: _kRed),
              SizedBox(width: 6),
              Text('Delivery Failed',
                  style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600,
                      color: _kRed)),
            ],
          ),
        );

      case 'delivered':
        return Container(
          width: double.infinity,
          padding: const EdgeInsets.symmetric(vertical: 9),
          decoration: BoxDecoration(
            color:        _kGreen.withValues(alpha: 0.07),
            borderRadius: BorderRadius.circular(8),
            border:       Border.all(color: _kGreen.withValues(alpha: 0.3)),
          ),
          child: const Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.check_circle, size: 16, color: _kGreen),
              SizedBox(width: 6),
              Text('Delivered ✓',
                  style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700,
                      color: _kGreen)),
            ],
          ),
        );

      default:
        return const SizedBox.shrink();
    }
  }
}

// ── Status chips ──────────────────────────────────────────────────────────────

class _BatchStatusChip extends StatelessWidget {
  const _BatchStatusChip(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    String label; Color color;
    switch (status) {
      case 'pending':
        label = 'Pending';     color = Colors.grey;           break;
      case 'assigned':
        label = 'Assigned';    color = _kBlue;                break;
      case 'in_progress':
        label = 'Active 🚀';   color = Colors.white;          break;
      case 'completed':
        label = 'Done ✓';      color = Colors.white;          break;
      case 'partial':
        label = 'Partial ⚠';   color = Colors.amber.shade700; break;
      default:
        label = status;        color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color:        color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(20),
        border:       Border.all(color: color.withValues(alpha: 0.55)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize:   11,
              fontWeight: FontWeight.w700,
              color:      color)),
    );
  }
}

class _OrderStatusChip extends StatelessWidget {
  const _OrderStatusChip(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    String label; Color color;
    switch (status) {
      case 'pending':
      case 'assigned':
        label = 'Pending';          color = Colors.grey;               break;
      case 'picked_up':
        label = 'Picked Up';        color = _kBlue;                    break;
      case 'on_the_way':
        label = 'On Way 🛵';        color = _kOrange;                  break;
      case 'near_you':
        label = 'Near You 📍';      color = const Color(0xFF7C3AED);   break;
      case 'delivered':
        label = 'Delivered ✓';      color = _kGreen;                   break;
      case 'failed':
        label = 'Failed';           color = _kRed;                     break;
      case 'retry_pending':
        label = 'Retry 🔄';         color = _kOrange;                  break;
      default:
        label = status;             color = Colors.grey;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 4),
      decoration: BoxDecoration(
        color:        color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(20),
        border:       Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize:   10,
              fontWeight: FontWeight.w700,
              color:      color)),
    );
  }
}

// ── Pulsing live-location dot ─────────────────────────────────────────────────

class _PulsingDot extends StatefulWidget {
  const _PulsingDot();
  @override
  State<_PulsingDot> createState() => _PulsingDotState();
}

class _PulsingDotState extends State<_PulsingDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double>   _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 800))
      ..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.4, end: 1.0).animate(_ctrl);
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _anim,
      child: Container(
        width: 8, height: 8,
        decoration: const BoxDecoration(
            color: Colors.white, shape: BoxShape.circle),
      ),
    );
  }
}
