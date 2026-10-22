import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../constants/app_colors.dart';

/// Shown after a successful Razorpay payment or order placement.
/// Optional [extra] map (passed via GoRouter state.extra) may contain:
///   - 'title'   : String  — headline (defaults to "Payment Successful!")
///   - 'subtitle': String  — sub-message
///   - 'amount'  : String  — e.g. "₹560"
///   - 'plan'    : String  — e.g. "Weekly Plan"
///   - 'vendor'  : String  — kitchen name
class PaymentSuccessScreen extends StatefulWidget {
  const PaymentSuccessScreen({super.key});

  @override
  State<PaymentSuccessScreen> createState() => _PaymentSuccessScreenState();
}

class _PaymentSuccessScreenState extends State<PaymentSuccessScreen>
    with TickerProviderStateMixin {
  late final AnimationController _circleCtrl;
  late final AnimationController _checkCtrl;
  late final AnimationController _contentCtrl;

  late final Animation<double> _circleScale;
  late final Animation<double> _checkScale;
  late final Animation<double> _contentFade;
  late final Animation<Offset>  _contentSlide;

  @override
  void initState() {
    super.initState();

    _circleCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 450),
    );
    _checkCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
    );
    _contentCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 500),
    );

    _circleScale = CurvedAnimation(
      parent: _circleCtrl,
      curve: Curves.elasticOut,
    );
    _checkScale = CurvedAnimation(
      parent: _checkCtrl,
      curve: Curves.elasticOut,
    );
    _contentFade = CurvedAnimation(
      parent: _contentCtrl,
      curve: Curves.easeOut,
    );
    _contentSlide = Tween<Offset>(
      begin: const Offset(0, 0.2),
      end:   Offset.zero,
    ).animate(CurvedAnimation(parent: _contentCtrl, curve: Curves.easeOut));

    // Stagger the animations
    _circleCtrl.forward().then((_) {
      _checkCtrl.forward();
      Future.delayed(const Duration(milliseconds: 150), () {
        if (mounted) _contentCtrl.forward();
      });
    });
  }

  @override
  void dispose() {
    _circleCtrl.dispose();
    _checkCtrl.dispose();
    _contentCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Accept optional route extras for dynamic content
    final extra   = (ModalRoute.of(context)?.settings.arguments
                        ?? <String, dynamic>{}) as Map<String, dynamic>;
    final title   = extra['title']    as String? ?? 'Payment Successful!';
    final subtitle = extra['subtitle'] as String?
        ?? 'Your subscription has been activated.\nEnjoy your meals! 🎉';
    final amount  = extra['amount']   as String?;
    final plan    = extra['plan']     as String?;
    final vendor  = extra['vendor']   as String?;

    return Scaffold(
      backgroundColor: Colors.white,
      body: SafeArea(
        child: Column(
          children: [
            // ── Top illustration area ──────────────────────────────────────
            Expanded(
              child: Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // Animated success circle + check
                    ScaleTransition(
                      scale: _circleScale,
                      child: Stack(
                        alignment: Alignment.center,
                        children: [
                          // Outer glow ring
                          Container(
                            width: 140,
                            height: 140,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppColors.success.withAlpha(25),
                            ),
                          ),
                          // Inner solid circle
                          Container(
                            width: 100,
                            height: 100,
                            decoration: const BoxDecoration(
                              shape: BoxShape.circle,
                              color: AppColors.success,
                            ),
                          ),
                          // Checkmark
                          ScaleTransition(
                            scale: _checkScale,
                            child: const Icon(
                              Icons.check_rounded,
                              color: Colors.white,
                              size: 56,
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 32),

                    // Animated text content
                    FadeTransition(
                      opacity: _contentFade,
                      child: SlideTransition(
                        position: _contentSlide,
                        child: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 32),
                          child: Column(
                            children: [
                              Text(
                                title,
                                textAlign: TextAlign.center,
                                style: GoogleFonts.poppins(
                                  fontSize: 24,
                                  fontWeight: FontWeight.w800,
                                  color: AppColors.textDark,
                                ),
                              ),
                              const SizedBox(height: 10),
                              Text(
                                subtitle,
                                textAlign: TextAlign.center,
                                style: GoogleFonts.poppins(
                                  fontSize: 14,
                                  color: AppColors.textGrey,
                                  height: 1.5,
                                ),
                              ),

                              // Optional detail pill(s)
                              if (amount != null || plan != null || vendor != null) ...[
                                const SizedBox(height: 24),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(16),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF9FAFB),
                                    border: Border.all(
                                        color: const Color(0xFFE5E7EB)),
                                    borderRadius: BorderRadius.circular(12),
                                  ),
                                  child: Column(
                                    children: [
                                      if (vendor != null) ...[
                                        _detailRow(
                                          Icons.restaurant_rounded,
                                          'Kitchen',
                                          vendor,
                                        ),
                                        const SizedBox(height: 8),
                                      ],
                                      if (plan != null) ...[
                                        _detailRow(
                                          Icons.calendar_today_rounded,
                                          'Plan',
                                          plan,
                                        ),
                                        const SizedBox(height: 8),
                                      ],
                                      if (amount != null)
                                        _detailRow(
                                          Icons.payments_outlined,
                                          'Amount',
                                          amount,
                                          valueColor: AppColors.success,
                                        ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),

            // ── Bottom action buttons ──────────────────────────────────────
            FadeTransition(
              opacity: _contentFade,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 0, 24, 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton.icon(
                        onPressed: () => context.go('/subscription'),
                        icon: const Icon(Icons.receipt_long_outlined, size: 20),
                        label: Text(
                          'View My Subscription',
                          style: GoogleFonts.poppins(
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                          elevation: 0,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: TextButton(
                        onPressed: () => context.go('/home'),
                        child: Text(
                          'Back to Home',
                          style: GoogleFonts.poppins(
                            fontSize: 15,
                            fontWeight: FontWeight.w500,
                            color: AppColors.textGrey,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _detailRow(
    IconData icon,
    String label,
    String value, {
    Color? valueColor,
  }) {
    return Row(
      children: [
        Icon(icon, size: 16, color: AppColors.textGrey),
        const SizedBox(width: 8),
        Text(
          '$label: ',
          style: GoogleFonts.poppins(
            fontSize: 13,
            color: AppColors.textGrey,
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: GoogleFonts.poppins(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: valueColor ?? AppColors.textDark,
            ),
          ),
        ),
      ],
    );
  }
}
