import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../providers/auth_provider.dart';
import '../../services/api_service.dart';
import '../../services/socket_service.dart';

const _kOrange = Color(0xFFF26522);
const _kGreen  = Color(0xFF16A34A);
const _kBlue   = Color(0xFF2563EB);

class DeliveryProfileScreen extends StatefulWidget {
  const DeliveryProfileScreen({super.key});

  @override
  State<DeliveryProfileScreen> createState() =>
      _DeliveryProfileScreenState();
}

class _DeliveryProfileScreenState
    extends State<DeliveryProfileScreen> {
  bool             _isAvailable = true;
  Map<String, dynamic>? _riderData;

  // Attendance clock state
  bool   _clockLoading   = false;
  bool   _isClockedIn    = false;
  bool   _isClockedOut   = false;
  String _clockInTime    = '';
  String _clockOutTime   = '';
  double _hoursWorked    = 0;

  @override
  void initState() {
    super.initState();
    _loadRiderData();
  }

  Future<void> _loadRiderData() async {
    final prefs      = await SharedPreferences.getInstance();
    final riderJson  = prefs.getString('mealsetu_rider');
    if (riderJson != null && mounted) {
      final data = jsonDecode(riderJson) as Map<String, dynamic>;
      setState(() {
        _riderData   = data;
        _isAvailable = data['isAvailable'] as bool? ?? true;
      });
    }
  }

  String _fmtTime(String iso) {
    try {
      final dt = DateTime.parse(iso).toLocal();
      final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
      final m = dt.minute.toString().padLeft(2, '0');
      final amPm = dt.hour >= 12 ? 'PM' : 'AM';
      return '$h:$m $amPm';
    } catch (_) {
      return iso;
    }
  }

  String _parseErrorMessage(Object e, String fallback) {
    if (e is DioException) {
      final data = e.response?.data;
      if (data is Map) return data['message']?.toString() ?? fallback;
    }
    return fallback;
  }

  Future<void> _clockIn() async {
    setState(() => _clockLoading = true);
    try {
      final res  = await ApiService().post('/delivery/attendance/clock-in', {});
      final body = res.data as Map<String, dynamic>? ?? {};
      final time = body['clockIn']?.toString() ?? '';
      setState(() {
        _isClockedIn = true;
        _clockInTime = time.isNotEmpty ? _fmtTime(time) : '';
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Clocked in successfully'), backgroundColor: _kGreen),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_parseErrorMessage(e, 'Clock-in failed')),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _clockLoading = false);
    }
  }

  Future<void> _clockOut() async {
    setState(() => _clockLoading = true);
    try {
      final res  = await ApiService().post('/delivery/attendance/clock-out', {});
      final body = res.data as Map<String, dynamic>? ?? {};
      final time  = body['clockOut']?.toString() ?? '';
      final hours = (body['hoursWorked'] as num?)?.toDouble() ?? 0;
      setState(() {
        _isClockedOut = true;
        _clockOutTime = time.isNotEmpty ? _fmtTime(time) : '';
        _hoursWorked  = hours;
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Clocked out — ${hours.toStringAsFixed(1)}h worked'),
            backgroundColor: _kOrange,
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(_parseErrorMessage(e, 'Clock-out failed')),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => _clockLoading = false);
    }
  }

  Future<void> _logout() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16)),
        title: const Text('Logout?',
            style: TextStyle(fontWeight: FontWeight.w700)),
        content: const Text('Are you sure?',
            style: TextStyle(fontSize: 14)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: Colors.red.shade600,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8)),
              elevation: 0,
            ),
            child: const Text('Logout',
                style: TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    SocketService().disconnect();
    await context.read<AuthProvider>().logout();
    if (mounted) context.go('/login');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final user = auth.user ?? {};

    final name    = user['name']  as String? ?? 'Delivery Partner';
    final email   = user['email'] as String? ?? '';
    final phone   = user['phone'] as String? ?? '';
    final initial = name.isNotEmpty ? name[0].toUpperCase() : 'D';

    final salary     = (_riderData?['monthlySalary'] as num?)?.toInt();
    final vendorId   = _riderData?['vendorId'];
    final serviceAreas = ((_riderData?['serviceArea']
                as Map<String, dynamic>?)?['areas'] as List<dynamic>?)
            ?.cast<String>() ??
        <String>[];

    return Scaffold(
      backgroundColor: const Color(0xFFF8F9FA),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('My Profile',
            style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: Colors.white)),
      ),
      extendBodyBehindAppBar: true,
      body: SingleChildScrollView(
        child: Column(
          children: [
            // ── Gradient header ─────────────────────────────────────
            Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [_kOrange, Color(0xFFFF8C42)],
                  begin: Alignment.topLeft,
                  end:   Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.only(
                  bottomLeft:  Radius.circular(32),
                  bottomRight: Radius.circular(32),
                ),
              ),
              padding: const EdgeInsets.fromLTRB(24, 96, 24, 32),
              child: Column(
                children: [
                  Stack(
                    children: [
                      CircleAvatar(
                        radius: 52,
                        backgroundColor:
                            Colors.white.withValues(alpha: 0.2),
                        child: Text(initial,
                            style: const TextStyle(
                                fontSize: 42,
                                fontWeight: FontWeight.w700,
                                color: Colors.white)),
                      ),
                      Positioned(
                        bottom: 2, right: 2,
                        child: Container(
                          width: 18, height: 18,
                          decoration: BoxDecoration(
                            color: _isAvailable
                                ? _kGreen
                                : Colors.grey,
                            shape: BoxShape.circle,
                            border: Border.all(
                                color: Colors.white, width: 2),
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Text(name,
                      style: const TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w700,
                          color: Colors.white)),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 8),
                    decoration: BoxDecoration(
                      color: Colors.white
                          .withValues(alpha: 0.2),
                      borderRadius:
                          BorderRadius.circular(20),
                    ),
                    child: const Text('🛵 Delivery Rider',
                        style: TextStyle(
                            fontSize: 13,
                            color: Colors.white)),
                  ),
                  if (vendorId != null) ...[
                    const SizedBox(height: 8),
                    Text(
                      'Working for: Vendor Kitchen',
                      style: TextStyle(
                          fontSize: 12,
                          color: Colors.white
                              .withValues(alpha: 0.7)),
                    ),
                  ],
                ],
              ),
            ),

            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                children: [
                  const SizedBox(height: 4),

                  // ── Contact info ──────────────────────────────
                  if (phone.isNotEmpty)
                    _ContactCard(
                        Icons.phone, 'Phone', phone, _kBlue),
                  if (phone.isNotEmpty)
                    const SizedBox(height: 10),
                  if (email.isNotEmpty)
                    _ContactCard(
                        Icons.email, 'Email', email, _kOrange),
                  if (email.isNotEmpty)
                    const SizedBox(height: 10),

                  // ── Salary card ───────────────────────────────
                  if (salary != null) ...[
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius:
                            BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black
                                .withValues(alpha: 0.05),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Row(
                        children: [
                          Container(
                            width: 44, height: 44,
                            decoration: BoxDecoration(
                              color: _kGreen
                                  .withValues(alpha: 0.1),
                              borderRadius:
                                  BorderRadius.circular(12),
                            ),
                            child: const Icon(
                                Icons.account_balance_wallet,
                                color: _kGreen,
                                size: 22),
                          ),
                          const SizedBox(width: 14),
                          Expanded(
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment.start,
                              children: [
                                const Text('Monthly Salary',
                                    style: TextStyle(
                                        fontSize: 12,
                                        color: Colors.grey)),
                                Text('₹$salary',
                                    style: const TextStyle(
                                        fontSize: 22,
                                        fontWeight:
                                            FontWeight.w800,
                                        color:
                                            Colors.black87)),
                              ],
                            ),
                          ),
                          Container(
                            padding:
                                const EdgeInsets.symmetric(
                                    horizontal: 14,
                                    vertical: 6),
                            decoration: BoxDecoration(
                              color: _kGreen
                                  .withValues(alpha: 0.1),
                              borderRadius:
                                  BorderRadius.circular(20),
                            ),
                            child: const Text('Fixed Salary',
                                style: TextStyle(
                                    fontSize: 12,
                                    fontWeight:
                                        FontWeight.w600,
                                    color: _kGreen)),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],

                  // ── Service areas ─────────────────────────────
                  if (serviceAreas.isNotEmpty) ...[
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius:
                            BorderRadius.circular(14),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black
                                .withValues(alpha: 0.05),
                            blurRadius: 8,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.start,
                        children: [
                          const Text('Service Area',
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight:
                                      FontWeight.w700,
                                  color: Colors.black87)),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 6,
                            children: serviceAreas
                                .map((area) => Container(
                                      padding:
                                          const EdgeInsets
                                              .symmetric(
                                              horizontal: 14,
                                              vertical: 6),
                                      decoration:
                                          BoxDecoration(
                                        color: _kOrange
                                            .withValues(
                                                alpha: 0.1),
                                        borderRadius:
                                            BorderRadius
                                                .circular(20),
                                        border: Border.all(
                                            color: _kOrange
                                                .withValues(
                                                    alpha:
                                                        0.4)),
                                      ),
                                      child: Text(area,
                                          style: const TextStyle(
                                              fontSize: 12,
                                              fontWeight:
                                                  FontWeight
                                                      .w600,
                                              color:
                                                  _kOrange)),
                                    ))
                                .toList(),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 10),
                  ],

                  // ── Attendance clock-in / clock-out ──────────
                  _AttendanceCard(
                    isClockedIn:  _isClockedIn,
                    isClockedOut: _isClockedOut,
                    clockInTime:  _clockInTime,
                    clockOutTime: _clockOutTime,
                    hoursWorked:  _hoursWorked,
                    loading:      _clockLoading,
                    onClockIn:    _clockIn,
                    onClockOut:   _clockOut,
                  ),
                  const SizedBox(height: 10),

                  // ── Availability toggle ───────────────────────
                  Container(
                    padding: const EdgeInsets.all(4),
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius:
                          BorderRadius.circular(14),
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black
                              .withValues(alpha: 0.05),
                          blurRadius: 8,
                          offset: const Offset(0, 2),
                        ),
                      ],
                    ),
                    child: SwitchListTile(
                      secondary: Container(
                        width: 44, height: 44,
                        decoration: BoxDecoration(
                          color: _kOrange
                              .withValues(alpha: 0.1),
                          borderRadius:
                              BorderRadius.circular(12),
                        ),
                        child: const Icon(
                            Icons.delivery_dining,
                            color: _kOrange),
                      ),
                      title: const Text(
                          'Available for Deliveries',
                          style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w600)),
                      subtitle: Text(
                        _isAvailable
                            ? '✅ Ready to receive batches'
                            : '⏸️ Not receiving assignments',
                        style: TextStyle(
                            fontSize: 12,
                            color: _isAvailable
                                ? _kGreen
                                : Colors.grey),
                      ),
                      value: _isAvailable,
                      activeThumbColor: _kOrange,
                      activeTrackColor:
                          _kOrange.withValues(alpha: 0.4),
                      onChanged: (val) async {
                        setState(() => _isAvailable = val);
                        final messenger = ScaffoldMessenger.of(context);
                        try {
                          await ApiService().patch(
                            '/delivery/availability',
                            {'isAvailable': val},
                          );
                        } catch (_) {
                          if (mounted) {
                            setState(() => _isAvailable = !val);
                            messenger.showSnackBar(
                              const SnackBar(
                                content: Text('Failed to update availability. Please try again.'),
                                backgroundColor: Colors.red,
                                behavior: SnackBarBehavior.floating,
                              ),
                            );
                          }
                        }
                      },
                      shape: RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius.circular(14)),
                    ),
                  ),

                  const SizedBox(height: 32),

                  // ── Logout ────────────────────────────────────
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton.icon(
                      onPressed: _logout,
                      icon: const Icon(Icons.logout,
                          color: Colors.white),
                      label: const Text('Logout',
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: Colors.white)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor:
                            Colors.red.shade600,
                        shape: RoundedRectangleBorder(
                            borderRadius:
                                BorderRadius.circular(12)),
                        elevation: 0,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Attendance card ───────────────────────────────────────────────────────────

class _AttendanceCard extends StatelessWidget {
  const _AttendanceCard({
    required this.isClockedIn,
    required this.isClockedOut,
    required this.clockInTime,
    required this.clockOutTime,
    required this.hoursWorked,
    required this.loading,
    required this.onClockIn,
    required this.onClockOut,
  });

  final bool   isClockedIn;
  final bool   isClockedOut;
  final String clockInTime;
  final String clockOutTime;
  final double hoursWorked;
  final bool   loading;
  final VoidCallback onClockIn;
  final VoidCallback onClockOut;

  @override
  Widget build(BuildContext context) {
    final color  = isClockedIn && !isClockedOut ? _kGreen : _kOrange;
    final label  = isClockedOut
        ? 'Clocked Out'
        : isClockedIn
            ? 'Clocked In'
            : 'Not Clocked In';

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                  color: color.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(Icons.access_time_rounded, color: color, size: 22),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Today\'s Attendance',
                        style: TextStyle(fontSize: 12, color: Colors.grey)),
                    Text(label,
                        style: TextStyle(
                            fontSize: 15,
                            fontWeight: FontWeight.w700,
                            color: color)),
                  ],
                ),
              ),
            ],
          ),
          if (isClockedIn) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                if (clockInTime.isNotEmpty)
                  _TimeChip(Icons.login, 'In', clockInTime, _kGreen),
                if (clockInTime.isNotEmpty && clockOutTime.isNotEmpty)
                  const SizedBox(width: 8),
                if (clockOutTime.isNotEmpty)
                  _TimeChip(Icons.logout, 'Out', clockOutTime, _kOrange),
                if (isClockedOut && hoursWorked > 0) ...[
                  const SizedBox(width: 8),
                  _TimeChip(Icons.timer_outlined, 'Hrs',
                      hoursWorked.toStringAsFixed(1), _kBlue),
                ],
              ],
            ),
          ],
          const SizedBox(height: 14),
          if (!isClockedIn)
            SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton.icon(
                onPressed: loading ? null : onClockIn,
                icon: loading
                    ? const SizedBox(
                        width: 16, height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.login, color: Colors.white, size: 18),
                label: Text(loading ? 'Clocking in…' : 'Clock In',
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kGreen,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
            )
          else if (!isClockedOut)
            SizedBox(
              width: double.infinity,
              height: 44,
              child: ElevatedButton.icon(
                onPressed: loading ? null : onClockOut,
                icon: loading
                    ? const SizedBox(
                        width: 16, height: 16,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.logout, color: Colors.white, size: 18),
                label: Text(loading ? 'Clocking out…' : 'Clock Out',
                    style: const TextStyle(
                        color: Colors.white, fontWeight: FontWeight.w600)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: _kOrange,
                  elevation: 0,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(10)),
                ),
              ),
            )
          else
            Container(
              padding: const EdgeInsets.symmetric(vertical: 10),
              alignment: Alignment.center,
              child: Text(
                '✅ Shift complete — ${hoursWorked.toStringAsFixed(1)}h worked today',
                style: const TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600, color: _kGreen),
              ),
            ),
        ],
      ),
    );
  }
}

class _TimeChip extends StatelessWidget {
  const _TimeChip(this.icon, this.label, this.value, this.color);
  final IconData icon;
  final String   label;
  final String   value;
  final Color    color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 4),
          Text('$label: $value',
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}

// ── Contact card ──────────────────────────────────────────────────────────────

class _ContactCard extends StatelessWidget {
  const _ContactCard(this.icon, this.label, this.value, this.color);
  final IconData icon;
  final String   label;
  final String   value;
  final Color    color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
          horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label,
                    style: const TextStyle(
                        fontSize: 11, color: Colors.grey)),
                const SizedBox(height: 2),
                Text(value,
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: Colors.black87)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
