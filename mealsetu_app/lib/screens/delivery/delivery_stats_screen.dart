import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/delivery_provider.dart';

const _kOrange = Color(0xFFF26522);
const _kGreen  = Color(0xFF16A34A);
const _kBlue   = Color(0xFF2563EB);
const _kPurple = Color(0xFF7C3AED);
const _kTeal   = Color(0xFF0D9488);

class DeliveryStatsScreen extends StatelessWidget {
  const DeliveryStatsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<DeliveryProvider>(
      builder: (context, provider, _) {
        final stats         = provider.riderStats;
        final salary        = (stats?['monthlySalary'] as num?)?.toInt() ?? 0;
        final salaryStatus  = stats?['salaryStatus'] as String? ?? 'Pending';
        final monthDel      = (stats?['monthDeliveries'] as num?)?.toInt()    ?? 0;
        final totalDel      = (stats?['totalDeliveries']  as num?)?.toInt()    ?? 0;
        final rating        = (stats?['rating']           as num?)?.toDouble() ?? 5.0;

        return Scaffold(
          backgroundColor: const Color(0xFFF8F9FA),
          appBar: AppBar(
            backgroundColor: Colors.white,
            elevation: 0,
            title: const Text('My Stats & Salary',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w700,
                    color: Colors.black87)),
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh_rounded,
                    color: _kOrange),
                onPressed: provider.fetchStats,
                tooltip: 'Refresh',
              ),
            ],
          ),
          body: SingleChildScrollView(
            padding:
                const EdgeInsets.fromLTRB(16, 16, 16, 32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Salary card ────────────────────────────────────
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [
                        Color(0xFF1E2A3A),
                        Color(0xFF2D3F52)
                      ],
                      begin: Alignment.topLeft,
                      end:   Alignment.bottomRight,
                    ),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black
                            .withValues(alpha: 0.3),
                        blurRadius: 20,
                        offset: const Offset(0, 8),
                      ),
                    ],
                  ),
                  child: Column(
                    crossAxisAlignment:
                        CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment:
                            MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Monthly Salary',
                              style: TextStyle(
                                  fontSize: 13,
                                  color: Colors.white
                                      .withValues(
                                          alpha: 0.75))),
                          Container(
                            padding:
                                const EdgeInsets.symmetric(
                                    horizontal: 12,
                                    vertical: 4),
                            decoration: BoxDecoration(
                              color: salaryStatus == 'Paid'
                                  ? _kGreen
                                      .withValues(alpha: 0.25)
                                  : _kOrange
                                      .withValues(alpha: 0.25),
                              borderRadius:
                                  BorderRadius.circular(20),
                            ),
                            child: Text(
                              salaryStatus == 'Paid'
                                  ? '✅ Paid'
                                  : '⏳ Pending',
                              style: TextStyle(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                                color:
                                    salaryStatus == 'Paid'
                                        ? _kGreen
                                        : _kOrange,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text('₹$salary',
                          style: const TextStyle(
                              fontSize: 44,
                              fontWeight: FontWeight.w800,
                              color: Colors.white)),
                      Text(
                          'Fixed monthly salary from vendor',
                          style: TextStyle(
                              fontSize: 12,
                              color: Colors.white
                                  .withValues(alpha: 0.6))),
                      const SizedBox(height: 16),
                      Divider(
                          color: Colors.white
                              .withValues(alpha: 0.15)),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment:
                            MainAxisAlignment.spaceAround,
                        children: [
                          _SalaryInfo('This Month',
                              '$monthDel deliveries'),
                          _SalaryInfo('Total Ever',
                              '$totalDel deliveries'),
                          _SalaryInfo('Rating',
                              '$rating ⭐'),
                        ],
                      ),
                    ],
                  ),
                ),

                const SizedBox(height: 20),

                // ── Today's performance ────────────────────────
                const Text("Today's Performance",
                    style: TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                        color: Colors.black87)),
                const SizedBox(height: 12),

                GridView.count(
                  crossAxisCount: 2,
                  shrinkWrap: true,
                  physics:
                      const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 12,
                  mainAxisSpacing:  12,
                  childAspectRatio: 1.5,
                  children: [
                    _StatCard2(
                        'Total Orders',
                        provider.totalOrdersToday,
                        Icons.receipt_long_outlined,
                        _kBlue),
                    _StatCard2(
                        'Delivered',
                        provider.deliveredOrdersToday,
                        Icons.check_circle_outline,
                        _kGreen),
                    _StatCard2(
                        'Batches',
                        provider.totalBatches,
                        Icons.route_outlined,
                        _kPurple),
                    _StatCard2(
                        'Completed',
                        provider.completedBatches,
                        Icons.done_all_outlined,
                        _kTeal),
                  ],
                ),

                const SizedBox(height: 20),

                // ── Progress bar ───────────────────────────────
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
                  child: Column(
                    children: [
                      Row(
                        mainAxisAlignment:
                            MainAxisAlignment.spaceBetween,
                        children: [
                          const Text("Today's Progress",
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight:
                                      FontWeight.w700)),
                          Text(
                            '${provider.deliveredOrdersToday}'
                            '/${provider.totalOrdersToday}',
                            style: const TextStyle(
                                fontSize: 14,
                                fontWeight:
                                    FontWeight.w700,
                                color: _kOrange),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      ClipRRect(
                        borderRadius:
                            BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: provider
                                      .totalOrdersToday >
                                  0
                              ? provider
                                      .deliveredOrdersToday /
                                  provider.totalOrdersToday
                              : 0.0,
                          backgroundColor:
                              Colors.grey.shade200,
                          valueColor:
                              const AlwaysStoppedAnimation(
                                  _kOrange),
                          minHeight: 10,
                        ),
                      ),
                      const SizedBox(height: 8),
                      Align(
                        alignment: Alignment.centerLeft,
                        child: Text(
                          provider.deliveredOrdersToday ==
                                      provider
                                          .totalOrdersToday &&
                                  provider
                                          .totalOrdersToday >
                                      0
                              ? '🎉 All deliveries completed!'
                              : '${provider.totalOrdersToday - provider.deliveredOrdersToday} remaining',
                          style: const TextStyle(
                              fontSize: 12,
                              color: Colors.grey),
                        ),
                      ),
                    ],
                  ),
                ),

                // ── Month stats ────────────────────────────────
                if (stats != null) ...[
                  const SizedBox(height: 20),
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
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        const Text('This Month',
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight:
                                    FontWeight.w700)),
                        const SizedBox(height: 12),
                        Row(
                          mainAxisAlignment:
                              MainAxisAlignment.spaceAround,
                          children: [
                            _MonthStat('Deliveries',
                                '$monthDel'),
                            _MonthStat('Total Ever',
                                '$totalDel'),
                            _MonthStat(
                                'Rating', '$rating'),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
        );
      },
    );
  }
}

// ── Salary info sub-widget ────────────────────────────────────────────────────

class _SalaryInfo extends StatelessWidget {
  const _SalaryInfo(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w700,
                color: Colors.white)),
        const SizedBox(height: 2),
        Text(label,
            style: TextStyle(
                fontSize: 11,
                color: Colors.white.withValues(alpha: 0.65))),
      ],
    );
  }
}

// ── Stat card ─────────────────────────────────────────────────────────────────

class _StatCard2 extends StatelessWidget {
  const _StatCard2(this.label, this.value, this.icon, this.color);
  final String  label;
  final int     value;
  final IconData icon;
  final Color   color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.grey.shade100),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.04),
              blurRadius: 6,
              offset: const Offset(0, 2)),
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
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Text('$value',
                  style: const TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: Colors.black87)),
              Text(label,
                  style: const TextStyle(
                      fontSize: 11, color: Colors.grey)),
            ],
          ),
        ],
      ),
    );
  }
}

// ── Month stat ────────────────────────────────────────────────────────────────

class _MonthStat extends StatelessWidget {
  const _MonthStat(this.label, this.value);
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value,
            style: const TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: Colors.black87)),
        const SizedBox(height: 2),
        Text(label,
            style: const TextStyle(
                fontSize: 11, color: Colors.grey)),
      ],
    );
  }
}
