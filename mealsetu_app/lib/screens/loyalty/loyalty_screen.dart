import 'dart:ui' show ImageFilter;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../../constants/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/loyalty_provider.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Earn-method data  (Material icons — no blurry emojis)
// ─────────────────────────────────────────────────────────────────────────────

class _EarnMethod {
  const _EarnMethod(this.iconData, this.label, this.subtitle, this.pts, this.color);
  final IconData iconData;
  final String   label, subtitle, pts;
  final Color    color;
}

const _kEarn = [
  _EarnMethod(Icons.stars_rounded,                'First Subscription',  'One-time welcome bonus',            '+20',  Color(0xFFF59E0B)),
  _EarnMethod(Icons.local_dining_rounded,         'Trial Plan',          'Subscribe to a trial meal',         '+5',   Color(0xFF3B82F6)),
  _EarnMethod(Icons.date_range_rounded,           'Weekly Plan',         'Subscribe for a week',              '+25',  Color(0xFFF26522)),
  _EarnMethod(Icons.event_available_rounded,      'Monthly Plan',        'Subscribe for the full month',      '+100', Color(0xFF16A34A)),
  _EarnMethod(Icons.autorenew_rounded,            'Renew Your Plan',     'Stay loyal — renew before expiry',  '+15',  Color(0xFF0D9488)),
  _EarnMethod(Icons.local_fire_department_rounded,'3-Week Streak',       'Subscribe 3 consecutive weeks',     '+20',  Color(0xFFEA580C)),
  _EarnMethod(Icons.emoji_events_rounded,         '3 Subscriptions',     'Loyalty milestone bonus',           '+30',  Color(0xFFD97706)),
  _EarnMethod(Icons.emoji_events_rounded,         '5 Subscriptions',     'Loyalty milestone bonus',           '+50',  Color(0xFFD97706)),
  _EarnMethod(Icons.emoji_events_rounded,         '10 Subscriptions',    'Top loyal customer bonus',          '+100', Color(0xFFD97706)),
];

// ─────────────────────────────────────────────────────────────────────────────
// Level gradient
// ─────────────────────────────────────────────────────────────────────────────

List<Color> _levelGradient(String name) {
  switch (name) {
    case 'Bronze':   return [const Color(0xFFCD7F32), const Color(0xFF8B4513)];
    case 'Silver':   return [const Color(0xFF9E9E9E), const Color(0xFF616161)];
    case 'Gold':     return [const Color(0xFFFFCA28), const Color(0xFFFF8F00)];
    case 'Platinum': return [const Color(0xFF78909C), const Color(0xFF37474F)];
    default:         return [const Color(0xFF78909C), const Color(0xFF455A64)]; // Starter
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

class LoyaltyScreen extends StatefulWidget {
  const LoyaltyScreen({super.key});
  @override
  State<LoyaltyScreen> createState() => _LoyaltyScreenState();
}

class _LoyaltyScreenState extends State<LoyaltyScreen> {
  int?  _selectedPts;
  bool  _showAllTx = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final prov = context.read<LoyaltyProvider>();
      prov.fetchLoyalty();
      prov.fetchLeaderboard();
    });
  }

  // ── Build ──────────────────────────────────────────────────────────────────
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFFF2F4F8),
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          color: AppColors.textDark,
          onPressed: () => context.pop(),
        ),
        title: Text('Loyalty & Rewards',
            style: GoogleFonts.poppins(
                fontWeight: FontWeight.w700,
                color: AppColors.textDark,
                fontSize: 18)),
        actions: [
          Consumer<LoyaltyProvider>(
            builder: (ctx, prov, child) => IconButton(
              icon: prov.isLoading
                  ? const SizedBox(
                      width: 20,
                      height: 20,
                      child: CircularProgressIndicator(
                          strokeWidth: 2, color: AppColors.primary))
                  : const Icon(Icons.refresh_rounded, color: AppColors.textDark),
              onPressed: prov.isLoading
                  ? null
                  : () {
                      prov.fetchLoyalty();
                      prov.fetchLeaderboard();
                    },
            ),
          ),
        ],
      ),
      body: Consumer<LoyaltyProvider>(
        builder: (context, prov, _) {
          if (prov.isLoading && prov.loyaltyData == null) {
            return const Center(
                child: CircularProgressIndicator(color: AppColors.primary));
          }
          if (prov.error != null && prov.loyaltyData == null) {
            return _ErrorView(onRetry: () {
              prov.fetchLoyalty();
              prov.fetchLeaderboard();
            });
          }

          final data   = prov.loyaltyData!;
          final wallet = prov.walletBalance;

          return RefreshIndicator(
            color: AppColors.primary,
            onRefresh: () async {
              await prov.fetchLoyalty();
              await prov.fetchLeaderboard();
            },
            child: SingleChildScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 40),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _buildLevelCard(data),
                  const SizedBox(height: 16),
                  _buildBalanceRow(wallet, data),
                  const SizedBox(height: 10),
                  _buildWalletUsageInfo(wallet),
                  // ── Vendor loyalty notice (shown when vendor has loyalty OFF) ──
                  if (data.vendorLoyaltyNotice != null) ...[
                    const SizedBox(height: 12),
                    _buildVendorLoyaltyNotice(data.vendorLoyaltyNotice!),
                  ],
                  const SizedBox(height: 16),
                  _buildRedeemCard(context, prov, data),
                  if (data.nextMilestone != null) ...[
                    const SizedBox(height: 16),
                    _buildMilestoneCard(data),
                  ],
                  const SizedBox(height: 24),
                  _buildHowToEarn(),
                  const SizedBox(height: 24),
                  _buildHistory(data),
                  const SizedBox(height: 24),
                  _buildLeaderboard(context, prov),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section 1 ── Premium Level Card
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildLevelCard(LoyaltyData d) {
    final name       = d.level['name'] as String? ?? 'Starter';
    final icon       = d.level['icon'] as String? ?? '🌱';
    final grads      = _levelGradient(name);
    // ptsInCycle = how many pts they've built up toward the next 100-pt redeem
    final ptsInCycle = 100 - d.pointsToNextRedeem;
    // ring fills as they collect pts; full when pointsToNextRedeem == 0
    final progress   = d.pointsToNextRedeem == 0
        ? 1.0
        : (ptsInCycle.clamp(0, 100)) / 100.0;

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: LinearGradient(
            colors: grads,
            begin: Alignment.topLeft,
            end: Alignment.bottomRight),
        boxShadow: [
          BoxShadow(
              color: grads.first.withValues(alpha: 0.50),
              blurRadius: 30,
              offset: const Offset(0, 14))
        ],
      ),
      child: Stack(
        children: [
          // ── Decorative background circles ────────────────────────────────
          Positioned(
              right: -28, top: -28,
              child: _BgCircle(130, 0.08)),
          Positioned(
              right: 55, bottom: -55,
              child: _BgCircle(190, 0.05)),
          Positioned(
              left: -35, bottom: 5,
              child: _BgCircle(110, 0.07)),
          // ── Content ───────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(22, 24, 22, 20),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Left column
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Level emoji in a frosted pill
                          ClipRRect(
                            borderRadius: BorderRadius.circular(16),
                            child: BackdropFilter(
                              filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 8),
                                decoration: BoxDecoration(
                                  color: Colors.white.withValues(alpha: 0.18),
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(
                                      color: Colors.white
                                          .withValues(alpha: 0.25)),
                                ),
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    Text(icon,
                                        style: const TextStyle(fontSize: 22)),
                                    const SizedBox(width: 8),
                                    Text(name,
                                        style: GoogleFonts.poppins(
                                            fontSize: 15,
                                            fontWeight: FontWeight.w800,
                                            color: Colors.white)),
                                  ],
                                ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 18),
                          Text('${d.points}',
                              style: GoogleFonts.poppins(
                                  fontSize: 48,
                                  fontWeight: FontWeight.w900,
                                  color: Colors.white,
                                  height: 1.0)),
                          Text('points earned',
                              style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w500,
                                  color: Colors.white
                                      .withValues(alpha: 0.75))),
                        ],
                      ),
                    ),
                    // Right: circular progress (pts needed to next redeem)
                    SizedBox(
                      width: 114,
                      height: 114,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          SizedBox(
                            width: 114,
                            height: 114,
                            child: CircularProgressIndicator(
                              value: progress.clamp(0.0, 1.0),
                              backgroundColor:
                                  Colors.white.withValues(alpha: 0.2),
                              color: Colors.white,
                              strokeWidth: 9,
                              strokeCap: StrokeCap.round,
                            ),
                          ),
                          // Inner frosted circle — sized to fit inside ring
                          Container(
                            width: 88,
                            height: 88,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: Colors.white.withValues(alpha: 0.13),
                              border: Border.all(
                                  color: Colors.white
                                      .withValues(alpha: 0.15),
                                  width: 1),
                            ),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Text(
                                  '${d.pointsToNextRedeem}',
                                  style: GoogleFonts.poppins(
                                      fontSize: 22,
                                      fontWeight: FontWeight.w900,
                                      color: Colors.white,
                                      height: 1.0),
                                ),
                                const SizedBox(height: 2),
                                Text('pts needed',
                                    style: GoogleFonts.poppins(
                                        fontSize: 8.5,
                                        fontWeight: FontWeight.w600,
                                        color: Colors.white
                                            .withValues(alpha: 0.75),
                                        height: 1.1)),
                                Text('to redeem',
                                    style: GoogleFonts.poppins(
                                        fontSize: 8.5,
                                        fontWeight: FontWeight.w600,
                                        color: Colors.white
                                            .withValues(alpha: 0.75),
                                        height: 1.1)),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                // Glassmorphism stats bar
                ClipRRect(
                  borderRadius: BorderRadius.circular(16),
                  child: BackdropFilter(
                    filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          vertical: 14, horizontal: 10),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                            color: Colors.white.withValues(alpha: 0.22)),
                      ),
                      child: Row(
                        mainAxisAlignment:
                            MainAxisAlignment.spaceAround,
                        children: [
                          _LevelStat('Total Earned',
                              '${d.totalEarned} pts'),
                          Container(
                              width: 1,
                              height: 30,
                              color: Colors.white
                                  .withValues(alpha: 0.25)),
                          _LevelStat(
                              'Redeemed', '${d.totalRedeemed} pts'),
                          Container(
                              width: 1,
                              height: 30,
                              color: Colors.white
                                  .withValues(alpha: 0.25)),
                          _LevelStat(
                              'Subscriptions', '${d.totalSubscriptions}'),
                        ],
                      ),
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

  // ─────────────────────────────────────────────────────────────────────────
  // Section 2a ── Balance row (two gradient cards)
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildBalanceRow(double wallet, LoyaltyData d) {
    return Row(
      children: [
        Expanded(
          child: _GradientBalanceCard(
            icon: Icons.account_balance_wallet_rounded,
            label: 'Wallet Balance',
            value: '₹${wallet.toStringAsFixed(0)}',
            colors: const [Color(0xFFF26522), Color(0xFFD9541A)],
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: _GradientBalanceCard(
            icon: Icons.stars_rounded,
            label: 'Points Balance',
            value: '${d.points}',
            valueSuffix: ' pts',
            colors: const [Color(0xFF1E2D5A), Color(0xFF2B3674)],
          ),
        ),
      ],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section 2a.2 ── Wallet usage tip card
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildWalletUsageInfo(double wallet) {
    final hasBalance = wallet > 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 13),
      decoration: BoxDecoration(
        color: hasBalance
            ? const Color(0xFFEFFAF0)
            : const Color(0xFFF0F4FF),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: hasBalance
              ? const Color(0xFF86EFAC)
              : const Color(0xFFBFCFFE),
          width: 1.2,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
              color: hasBalance
                  ? const Color(0xFF16A34A).withValues(alpha: 0.12)
                  : const Color(0xFF4F46E5).withValues(alpha: 0.10),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              hasBalance
                  ? Icons.account_balance_wallet_rounded
                  : Icons.lightbulb_outline_rounded,
              color: hasBalance
                  ? const Color(0xFF16A34A)
                  : const Color(0xFF4F46E5),
              size: 20,
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: hasBalance
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '₹${wallet.toStringAsFixed(0)} ready to use! 🎉',
                        style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: const Color(0xFF15803D)),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        'Auto-applied when you renew your current kitchen\'s plan. Reward for staying loyal! 🏠',
                        style: GoogleFonts.poppins(
                            fontSize: 11.5,
                            color: const Color(0xFF166534),
                            height: 1.4),
                      ),
                    ],
                  )
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'How does Wallet Credit work?',
                        style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w700,
                            color: const Color(0xFF3730A3)),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '🔄  Redeem 100 pts → ₹10 wallet credit',
                        style: GoogleFonts.poppins(
                            fontSize: 11.5,
                            color: const Color(0xFF4338CA),
                            height: 1.5),
                      ),
                      Text(
                        '🏠  Used only when RENEWING your current vendor\'s plan',
                        style: GoogleFonts.poppins(
                            fontSize: 11.5,
                            color: const Color(0xFF4338CA),
                            height: 1.5),
                      ),
                      Text(
                        '💡  Example: ₹549 weekly renewal − ₹10 = you pay ₹539',
                        style: GoogleFonts.poppins(
                            fontSize: 11.5,
                            color: const Color(0xFF4338CA),
                            height: 1.5),
                      ),
                      const SizedBox(height: 4),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: const Color(0xFFE0E7FF),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Text(
                          '⚠️  Credit applies only for your current kitchen — not for switching to a new one',
                          style: GoogleFonts.poppins(
                              fontSize: 11,
                              color: const Color(0xFF3730A3),
                              fontWeight: FontWeight.w600,
                              height: 1.4),
                        ),
                      ),
                    ],
                  ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section 2a.3 ── Vendor loyalty notice (shown when vendor has loyalty OFF)
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildVendorLoyaltyNotice(VendorLoyaltyNotice notice) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: notice.canUseWallet
            ? const Color(0xFFFFFBEB) // amber-50 — informational
            : const Color(0xFFFEF2F2), // red-50 — blocking
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: notice.canUseWallet
              ? const Color(0xFFF59E0B) // amber-400
              : const Color(0xFFF87171), // red-400
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            notice.canUseWallet ? 'ℹ️' : '⚠️',
            style: const TextStyle(fontSize: 20),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  notice.canUseWallet
                      ? '${notice.vendorName} — Loyalty Update'
                      : 'Wallet discounts not accepted',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: notice.canUseWallet
                        ? const Color(0xFF92400E) // amber-800
                        : const Color(0xFF991B1B), // red-800
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  notice.message,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: notice.canUseWallet
                        ? const Color(0xFF78350F) // amber-900
                        : const Color(0xFF7F1D1D), // red-900
                    height: 1.45,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section 2b ── Redeem card
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildRedeemCard(
      BuildContext context, LoyaltyProvider prov, LoyaltyData d) {
    const opts = [100, 200, 300, 500, 1000];

    return Container(
      decoration: BoxDecoration(
        color: AppColors.white,
        borderRadius: BorderRadius.circular(20),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withValues(alpha: 0.07),
              blurRadius: 20,
              offset: const Offset(0, 6))
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Redeem Points',
                      style: GoogleFonts.poppins(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                          color: AppColors.textDark)),
                  Text('100 pts = ₹10 wallet credit',
                      style: GoogleFonts.poppins(
                          fontSize: 12, color: AppColors.textGrey)),
                ],
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  color: AppColors.primary.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(20),
                ),
                child: Text('${d.points} pts available',
                    style: GoogleFonts.poppins(
                        fontSize: 11,
                        fontWeight: FontWeight.w700,
                        color: AppColors.primary)),
              ),
            ],
          ),
          const SizedBox(height: 16),

          // Option cards
          SizedBox(
            height: 88,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: opts.length,
              separatorBuilder: (ctx, i) => const SizedBox(width: 10),
              itemBuilder: (_, i) {
                final opt       = opts[i];
                final canAfford = d.points >= opt;
                final selected  = _selectedPts == opt;

                return GestureDetector(
                  onTap: canAfford
                      ? () => setState(
                          () => _selectedPts = selected ? null : opt)
                      : null,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    width: 88,
                    decoration: BoxDecoration(
                      gradient: selected
                          ? const LinearGradient(
                              colors: [
                                Color(0xFFF26522),
                                Color(0xFFD9541A)
                              ],
                              begin: Alignment.topLeft,
                              end: Alignment.bottomRight,
                            )
                          : null,
                      color: selected
                          ? null
                          : (canAfford
                              ? const Color(0xFFF8F9FB)
                              : const Color(0xFFF3F4F6)),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: selected
                            ? Colors.transparent
                            : (canAfford
                                ? AppColors.cardBorder
                                : const Color(0xFFE5E7EB)),
                        width: 1.5,
                      ),
                      boxShadow: selected
                          ? [
                              BoxShadow(
                                  color: AppColors.primary
                                      .withValues(alpha: 0.35),
                                  blurRadius: 14,
                                  offset: const Offset(0, 5))
                            ]
                          : null,
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('$opt',
                            style: GoogleFonts.poppins(
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                                color: selected
                                    ? Colors.white
                                    : (canAfford
                                        ? AppColors.textDark
                                        : Colors.grey.shade400))),
                        Text('pts',
                            style: GoogleFonts.poppins(
                                fontSize: 10,
                                color: selected
                                    ? Colors.white
                                        .withValues(alpha: 0.8)
                                    : AppColors.textGrey)),
                        const SizedBox(height: 4),
                        Container(
                          width: 44,
                          height: 1,
                          color: selected
                              ? Colors.white.withValues(alpha: 0.3)
                              : AppColors.cardBorder,
                        ),
                        const SizedBox(height: 4),
                        Text('₹${opt ~/ 10}',
                            style: GoogleFonts.poppins(
                                fontSize: 14,
                                fontWeight: FontWeight.w800,
                                color: selected
                                    ? Colors.white
                                    : (canAfford
                                        ? AppColors.primary
                                        : Colors.grey.shade300))),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          // Selected preview
          AnimatedSize(
            duration: const Duration(milliseconds: 200),
            child: _selectedPts == null
                ? const SizedBox(height: 0)
                : Column(
                    children: [
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 12),
                        decoration: BoxDecoration(
                          color:
                              AppColors.primary.withValues(alpha: 0.06),
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                              color: AppColors.primary
                                  .withValues(alpha: 0.2)),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.check_circle_rounded,
                                color: AppColors.primary, size: 18),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                '$_selectedPts pts  →  ₹${_selectedPts! ~/ 10} added to your wallet',
                                style: GoogleFonts.poppins(
                                    fontSize: 13,
                                    fontWeight: FontWeight.w600,
                                    color: AppColors.primary),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
          ),

          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: (_selectedPts == null || prov.isRedeeming)
                  ? null
                  : () => _confirmRedeem(context, prov),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                disabledBackgroundColor: const Color(0xFFF3F4F6),
                padding: const EdgeInsets.symmetric(vertical: 15),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                elevation: 0,
              ),
              child: prov.isRedeeming
                  ? const SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2.5))
                  : Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          Icons.account_balance_wallet_rounded,
                          color: _selectedPts == null
                              ? Colors.grey
                              : Colors.white,
                          size: 18,
                        ),
                        const SizedBox(width: 8),
                        Text('Redeem Now',
                            style: GoogleFonts.poppins(
                                fontSize: 15,
                                fontWeight: FontWeight.w700,
                                color: _selectedPts == null
                                    ? Colors.grey
                                    : Colors.white)),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _confirmRedeem(
      BuildContext context, LoyaltyProvider prov) async {
    final pts    = _selectedPts!;
    final rupees = pts ~/ 10;

    // Capture before any async gap
    final messenger = ScaffoldMessenger.of(context);

    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        title: Text('Confirm Redemption',
            style: GoogleFonts.poppins(fontWeight: FontWeight.w800)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.primary.withValues(alpha: 0.07),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  Column(children: [
                    Text('$pts',
                        style: GoogleFonts.poppins(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: AppColors.textDark)),
                    Text('points',
                        style: GoogleFonts.poppins(
                            fontSize: 12, color: AppColors.textGrey)),
                  ]),
                  Icon(Icons.arrow_forward_rounded,
                      color: AppColors.primary, size: 22),
                  Column(children: [
                    Text('₹$rupees',
                        style: GoogleFonts.poppins(
                            fontSize: 24,
                            fontWeight: FontWeight.w900,
                            color: AppColors.primary)),
                    Text('wallet credit',
                        style: GoogleFonts.poppins(
                            fontSize: 12, color: AppColors.textGrey)),
                  ]),
                ],
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text('Cancel',
                style: GoogleFonts.poppins(color: AppColors.textGrey)),
          ),
          ElevatedButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primary,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(10)),
              elevation: 0,
            ),
            child: Text('Confirm',
                style: GoogleFonts.poppins(
                    color: Colors.white, fontWeight: FontWeight.w700)),
          ),
        ],
      ),
    );

    if (confirmed != true || !mounted) return;

    final result = await prov.redeemPoints(pts);
    if (!mounted) return;

    if (result != null) {
      setState(() => _selectedPts = null);
      messenger.showSnackBar(SnackBar(
        content: Row(
          children: [
            const Icon(Icons.check_circle_rounded,
                color: Colors.white, size: 20),
            const SizedBox(width: 10),
            Text('₹${result['rupeesCredited']} added to your wallet!',
                style: GoogleFonts.poppins(
                    fontWeight: FontWeight.w600, color: Colors.white)),
          ],
        ),
        backgroundColor: AppColors.success,
        behavior: SnackBarBehavior.floating,
        shape:
            RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        margin: const EdgeInsets.all(12),
      ));
    } else if (prov.error != null) {
      messenger.showSnackBar(SnackBar(
        content: Text(prov.error!),
        backgroundColor: Colors.red.shade700,
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section 3 ── Milestone card
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildMilestoneCard(LoyaltyData d) {
    final ms        = d.nextMilestone!;
    final target    = (ms['target']    as num).toInt();
    final bonus     = (ms['bonus']     as num).toInt();
    final remaining = (ms['remaining'] as num).toInt();
    final msg       = ms['message']   as String? ?? '';
    final progress  = target > 0 ? (target - remaining) / target : 0.0;

    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFFFFBEB), Color(0xFFFFF3CD)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFFCD34D), width: 1.5),
        boxShadow: [
          BoxShadow(
              color: const Color(0xFFD97706).withValues(alpha: 0.15),
              blurRadius: 16,
              offset: const Offset(0, 6))
        ],
      ),
      padding: const EdgeInsets.all(20),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: const Color(0xFFFDE68A),
              borderRadius: BorderRadius.circular(14),
            ),
            child: const Icon(Icons.emoji_events_rounded,
                color: Color(0xFFD97706), size: 26),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Next Milestone',
                    style: GoogleFonts.poppins(
                        fontSize: 15,
                        fontWeight: FontWeight.w800,
                        color: const Color(0xFFB45309))),
                const SizedBox(height: 2),
                Text(msg,
                    style: GoogleFonts.poppins(
                        fontSize: 13,
                        color: const Color(0xFF92400E))),
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: LinearProgressIndicator(
                    value: progress.clamp(0.0, 1.0),
                    minHeight: 8,
                    backgroundColor: const Color(0xFFFDE68A),
                    valueColor: const AlwaysStoppedAnimation<Color>(
                        Color(0xFFD97706)),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${d.totalSubscriptions} / $target subs',
                        style: GoogleFonts.poppins(
                            fontSize: 11,
                            color: const Color(0xFF92400E))),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFCD34D),
                        borderRadius: BorderRadius.circular(20),
                      ),
                      child: Text('+$bonus pts bonus',
                          style: GoogleFonts.poppins(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: const Color(0xFF92400E))),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section 4 ── How to Earn (Material icons, premium cards)
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildHowToEarn() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: 'How to Earn Points',
          icon: Icons.lightbulb_rounded,
          iconColor: const Color(0xFFF59E0B),
        ),
        const SizedBox(height: 4),
        Padding(
          padding: const EdgeInsets.only(left: 42),
          child: Text(
            'Stay loyal to your vendor & keep earning!',
            style: GoogleFonts.poppins(
                fontSize: 12, color: AppColors.textGrey),
          ),
        ),
        const SizedBox(height: 12),
        ...List.generate(_kEarn.length, (i) {
          final m = _kEarn[i];
          return Container(
            margin: const EdgeInsets.only(bottom: 10),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.045),
                    blurRadius: 12,
                    offset: const Offset(0, 3))
              ],
            ),
            child: Material(
              color: Colors.transparent,
              borderRadius: BorderRadius.circular(14),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 13),
                child: Row(
                  children: [
                    // Colored icon container
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: m.color.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(13),
                      ),
                      child:
                          Icon(m.iconData, color: m.color, size: 22),
                    ),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(m.label,
                              style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.textDark)),
                          Text(m.subtitle,
                              style: GoogleFonts.poppins(
                                  fontSize: 11,
                                  color: AppColors.textGrey)),
                        ],
                      ),
                    ),
                    // Points badge with gradient border
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: m.color.withValues(alpha: 0.1),
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(
                            color: m.color.withValues(alpha: 0.25)),
                      ),
                      child: Text('${m.pts} pts',
                          style: GoogleFonts.poppins(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: m.color)),
                    ),
                  ],
                ),
              ),
            ),
          );
        }),
      ],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section 5 ── Transaction History
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildHistory(LoyaltyData d) {
    final txns  = d.transactions;
    final shown = _showAllTx ? txns : txns.take(5).toList();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            _SectionHeader(
              title: 'Points History',
              icon: Icons.receipt_long_rounded,
              iconColor: AppColors.primary,
            ),
            if (txns.length > 5)
              TextButton(
                onPressed: () =>
                    setState(() => _showAllTx = !_showAllTx),
                style: TextButton.styleFrom(
                    padding: EdgeInsets.zero,
                    minimumSize: Size.zero,
                    tapTargetSize: MaterialTapTargetSize.shrinkWrap),
                child: Row(
                  children: [
                    Text(_showAllTx ? 'Show Less' : 'View All',
                        style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primary)),
                    Icon(
                      _showAllTx
                          ? Icons.keyboard_arrow_up_rounded
                          : Icons.keyboard_arrow_down_rounded,
                      color: AppColors.primary,
                      size: 18,
                    ),
                  ],
                ),
              ),
          ],
        ),
        const SizedBox(height: 12),
        if (txns.isEmpty)
          Container(
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Center(
              child: Column(
                children: [
                  Icon(Icons.inbox_rounded,
                      size: 48,
                      color: AppColors.textGrey.withValues(alpha: 0.5)),
                  const SizedBox(height: 12),
                  Text(
                    'No transactions yet.\nStart subscribing to earn points!',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.poppins(
                        fontSize: 13, color: AppColors.textGrey),
                  ),
                ],
              ),
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.05),
                    blurRadius: 16,
                    offset: const Offset(0, 4))
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: List.generate(shown.length, (i) {
                return _TxTile(
                  tx:         shown[i],
                  isLast:     i == shown.length - 1,
                );
              }),
            ),
          ),
      ],
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Section 6 ── Leaderboard
  // ─────────────────────────────────────────────────────────────────────────
  Widget _buildLeaderboard(BuildContext context, LoyaltyProvider prov) {
    final lb       = prov.leaderboard;
    final yourRank = prov.yourRank;

    // Build a short display name for the current user (e.g. "Ravi K.")
    // Used to detect if they're already visible in the top-3 podium.
    final rawName   = (context.read<AuthProvider>().user?['name'] as String?) ?? '';
    final parts     = rawName.trim().split(RegExp(r'\s+'));
    final meDisplay = parts.length > 1
        ? '${parts.first} ${parts.last[0]}.'
        : parts.firstOrNull ?? '';

    // Is the current user already shown in the podium (top 3)?
    final meInPodium = lb.take(3).any(
      (e) => meDisplay.isNotEmpty && (e['name'] as String? ?? '') == meDisplay,
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _SectionHeader(
          title: 'Top Subscribers',
          icon: Icons.emoji_events_rounded,
          iconColor: const Color(0xFFFFCA28),
        ),
        const SizedBox(height: 4),
        Text('Most loyal MealSetu customers',
            style: GoogleFonts.poppins(
                fontSize: 12, color: AppColors.textGrey)),
        const SizedBox(height: 16),
        if (lb.isEmpty)
          Container(
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(20),
            ),
            child: Center(
              child: Text('Leaderboard coming soon…',
                  style: GoogleFonts.poppins(
                      fontSize: 13, color: AppColors.textGrey)),
            ),
          )
        else
          Container(
            decoration: BoxDecoration(
              color: AppColors.white,
              borderRadius: BorderRadius.circular(20),
              boxShadow: [
                BoxShadow(
                    color: Colors.black.withValues(alpha: 0.06),
                    blurRadius: 20,
                    offset: const Offset(0, 6))
              ],
            ),
            clipBehavior: Clip.antiAlias,
            child: Column(
              children: [
                // ── Podium: top 3 (dark navy background) ──────────────────
                if (lb.length >= 3)
                  Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFF1E2D5A), Color(0xFF0F172A)],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                      ),
                    ),
                    padding: const EdgeInsets.fromLTRB(16, 24, 16, 28),
                    child: _Podium(
                      entries:   lb.take(3).toList(),
                      meDisplay: meDisplay,
                    ),
                  ),

                // ── Your rank row — only shown if user is NOT in the podium ─
                if (yourRank != null && !meInPodium)
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.08),
                      border: const Border(
                        top: BorderSide(color: Color(0xFF2B3674), width: 1),
                      ),
                    ),
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 14),
                    child: Row(
                      children: [
                        // Rank badge
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: AppColors.primary.withValues(alpha: 0.18),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Center(
                            child: Text(
                              '#${yourRank['rank']}',
                              style: GoogleFonts.poppins(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w900,
                                  color: AppColors.primary),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'YOU',
                                style: GoogleFonts.poppins(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w800,
                                    color: AppColors.primary),
                              ),
                              Text(
                                'Your position',
                                style: GoogleFonts.poppins(
                                    fontSize: 10,
                                    color: AppColors.textGrey),
                              ),
                            ],
                          ),
                        ),
                        Text(
                          '${yourRank['level']?['icon'] ?? '🌱'}  ',
                          style: const TextStyle(fontSize: 16),
                        ),
                        Text(
                          '${yourRank['points']} pts',
                          style: GoogleFonts.poppins(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppColors.textDark),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper widgets
// ─────────────────────────────────────────────────────────────────────────────

/// Decorative blurred circle for the level card background
class _BgCircle extends StatelessWidget {
  const _BgCircle(this.size, this.opacity);
  final double size, opacity;
  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: opacity),
        ),
      );
}

/// Section header with icon + title
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({
    required this.title,
    required this.icon,
    required this.iconColor,
  });
  final String title;
  final IconData icon;
  final Color iconColor;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: iconColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(9),
            ),
            child: Icon(icon, color: iconColor, size: 18),
          ),
          const SizedBox(width: 10),
          Text(title,
              style: GoogleFonts.poppins(
                  fontSize: 17,
                  fontWeight: FontWeight.w800,
                  color: AppColors.textDark)),
        ],
      );
}

/// Stat inside level card glassmorphism bar
class _LevelStat extends StatelessWidget {
  const _LevelStat(this.label, this.value);
  final String label, value;
  @override
  Widget build(BuildContext context) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label,
              style: GoogleFonts.poppins(
                  fontSize: 9.5,
                  color: Colors.white.withValues(alpha: 0.7),
                  fontWeight: FontWeight.w500)),
          const SizedBox(height: 3),
          Text(value,
              style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: Colors.white)),
        ],
      );
}

/// Gradient balance mini-card
class _GradientBalanceCard extends StatelessWidget {
  const _GradientBalanceCard({
    required this.icon,
    required this.label,
    required this.value,
    required this.colors,
    this.valueSuffix = '',
  });
  final IconData icon;
  final String label, value, valueSuffix;
  final List<Color> colors;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.fromLTRB(16, 14, 16, 16),
        decoration: BoxDecoration(
          gradient: LinearGradient(
              colors: colors,
              begin: Alignment.topLeft,
              end: Alignment.bottomRight),
          borderRadius: BorderRadius.circular(18),
          boxShadow: [
            BoxShadow(
                color: colors.first.withValues(alpha: 0.35),
                blurRadius: 16,
                offset: const Offset(0, 7))
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon,
                    color: Colors.white.withValues(alpha: 0.8), size: 15),
                const SizedBox(width: 5),
                Text(label,
                    style: GoogleFonts.poppins(
                        fontSize: 11,
                        color: Colors.white.withValues(alpha: 0.8))),
              ],
            ),
            const SizedBox(height: 8),
            RichText(
              text: TextSpan(
                style: GoogleFonts.poppins(
                    fontSize: 26,
                    fontWeight: FontWeight.w900,
                    color: Colors.white),
                children: [
                  TextSpan(text: value),
                  if (valueSuffix.isNotEmpty)
                    TextSpan(
                        text: valueSuffix,
                        style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: Colors.white.withValues(alpha: 0.8))),
                ],
              ),
            ),
          ],
        ),
      );
}

/// Single transaction row (inside a shared white card)
class _TxTile extends StatelessWidget {
  const _TxTile({required this.tx, required this.isLast});
  final Map<String, dynamic> tx;
  final bool isLast;

  Color _iconBg(String t) {
    if (t == 'redeemed')               return const Color(0xFFFEF2F2);
    if (t == 'earned_renewal_bonus')   return const Color(0xFFE0FDF4); // teal-50
    if (t.contains('milestone') || t == 'earned_first_sub') {
      return const Color(0xFFFEF9C3);
    }
    return const Color(0xFFF0FDF4);
  }

  Color _iconColor(String t) {
    if (t == 'redeemed')               return const Color(0xFFEF4444);
    if (t == 'earned_renewal_bonus')   return const Color(0xFF0D9488); // teal-600
    if (t.contains('milestone') || t == 'earned_first_sub') {
      return const Color(0xFFD97706);
    }
    return const Color(0xFF16A34A);
  }

  IconData _iconData(String t) {
    if (t == 'redeemed')               return Icons.arrow_downward_rounded;
    if (t == 'earned_renewal_bonus')   return Icons.autorenew_rounded;
    if (t.contains('milestone') || t == 'earned_first_sub') {
      return Icons.emoji_events_rounded;
    }
    return Icons.arrow_upward_rounded;
  }

  String _fmt(dynamic d) {
    if (d == null) return '';
    try {
      final dt = DateTime.parse(d.toString()).toLocal();
      const m = [
        'Jan','Feb','Mar','Apr','May','Jun',
        'Jul','Aug','Sep','Oct','Nov','Dec'
      ];
      return '${dt.day} ${m[dt.month - 1]} ${dt.year}';
    } catch (_) {
      return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final type = tx['type']        as String? ?? '';
    final pts  = (tx['points']     as num? ?? 0).toInt();
    final desc = tx['description'] as String? ?? '';
    final earn = pts > 0;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(
                bottom: BorderSide(color: Color(0xFFF1F5F9))),
      ),
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
                color: _iconBg(type),
                borderRadius: BorderRadius.circular(13)),
            child:
                Icon(_iconData(type), color: _iconColor(type), size: 21),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(desc,
                    style: GoogleFonts.poppins(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: AppColors.textDark)),
                const SizedBox(height: 2),
                Text(_fmt(tx['createdAt']),
                    style: GoogleFonts.poppins(
                        fontSize: 11, color: AppColors.textGrey)),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: earn
                  ? const Color(0xFFF0FDF4)
                  : const Color(0xFFFEF2F2),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              earn ? '+$pts pts' : '$pts pts',
              style: GoogleFonts.poppins(
                  fontSize: 13,
                  fontWeight: FontWeight.w800,
                  color: earn
                      ? const Color(0xFF16A34A)
                      : const Color(0xFFEF4444)),
            ),
          ),
        ],
      ),
    );
  }
}

/// Podium for top 3
class _Podium extends StatelessWidget {
  const _Podium({required this.entries, required this.meDisplay});
  final List<Map<String, dynamic>> entries;
  final String meDisplay; // current user's display name — shown as "YOU"

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _PodiumItem(
            entry:     entries[1],
            medal:     '🥈',
            medalBg:   const Color(0xFF37474F),
            avatarR:   26,
            ringColor: const Color(0xFF9E9E9E),
            meDisplay: meDisplay,
          ),
          _PodiumItem(
            entry:     entries[0],
            medal:     '🥇',
            medalBg:   const Color(0xFF4E3400),
            avatarR:   34,
            ringColor: const Color(0xFFFFCA28),
            isFirst:   true,
            meDisplay: meDisplay,
          ),
          _PodiumItem(
            entry:     entries[2],
            medal:     '🥉',
            medalBg:   const Color(0xFF3E1A00),
            avatarR:   24,
            ringColor: const Color(0xFFCD7F32),
            meDisplay: meDisplay,
          ),
        ],
      );
}

class _PodiumItem extends StatelessWidget {
  const _PodiumItem({
    required this.entry,
    required this.medal,
    required this.medalBg,
    required this.avatarR,
    required this.ringColor,
    required this.meDisplay,
    this.isFirst = false,
  });
  final Map<String, dynamic> entry;
  final String  medal;
  final Color   medalBg, ringColor;
  final double  avatarR;
  final bool    isFirst;
  final String  meDisplay; // current user's display name

  @override
  Widget build(BuildContext context) {
    final rawName = entry['name'] as String? ?? '?';
    final isMe    = meDisplay.isNotEmpty && rawName == meDisplay;
    final name    = isMe ? 'YOU' : rawName;
    final pts     = (entry['points'] as num? ?? 0).toInt();
    final initial = rawName.isNotEmpty ? rawName[0].toUpperCase() : '?';

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        if (isFirst)
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 10, vertical: 4),
            margin: const EdgeInsets.only(bottom: 8),
            decoration: BoxDecoration(
              color: const Color(0xFFFFCA28),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text('🏆 #1',
                style: GoogleFonts.poppins(
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    color: const Color(0xFF4E3400))),
          ),
        Stack(
          clipBehavior: Clip.none,
          alignment: Alignment.center,
          children: [
            Container(
              width: avatarR * 2 + 8,
              height: avatarR * 2 + 8,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                border: Border.all(color: ringColor, width: 2.5),
              ),
            ),
            CircleAvatar(
              radius: avatarR,
              backgroundColor: ringColor.withValues(alpha: 0.25),
              child: Text(initial,
                  style: GoogleFonts.poppins(
                      fontSize: avatarR * 0.72,
                      fontWeight: FontWeight.w900,
                      color: ringColor)),
            ),
            Positioned(
              bottom: -6,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 7, vertical: 2),
                decoration: BoxDecoration(
                  color: medalBg,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(medal,
                    style: TextStyle(
                        fontSize: isFirst ? 14 : 12)),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SizedBox(
          width: 80,
          child: Text(name,
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: GoogleFonts.poppins(
                  fontSize: isFirst ? 13 : 11,
                  fontWeight: FontWeight.w700,
                  color: Colors.white)),
        ),
        const SizedBox(height: 2),
        Text('$pts pts',
            style: GoogleFonts.poppins(
                fontSize: 11,
                color: Colors.white.withValues(alpha: 0.6))),
      ],
    );
  }
}

/// Error view
class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('😕', style: TextStyle(fontSize: 52)),
            const SizedBox(height: 12),
            Text('Failed to load loyalty data',
                style: GoogleFonts.poppins(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: AppColors.textDark)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: onRetry,
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
              style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12))),
            ),
          ],
        ),
      );
}
