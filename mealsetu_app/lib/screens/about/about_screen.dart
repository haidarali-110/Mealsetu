import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import '../../constants/app_colors.dart';

// ─────────────────────────────────────────────────────────────────────────────
// AboutScreen
// ─────────────────────────────────────────────────────────────────────────────

class AboutScreen extends StatelessWidget {
  const AboutScreen({super.key});

  static const _features = [
    (Icons.restaurant_menu_rounded,   'Daily Meal Subscriptions',  'Subscribe to home-style meals from verified local kitchens'),
    (Icons.location_on_rounded,       'Nearby Kitchens',           'Discover FSSAI-verified kitchens in your area'),
    (Icons.calendar_month_rounded,    'Flexible Plans',            'Choose One Day, Weekly, or Monthly plans that fit your lifestyle'),
    (Icons.star_rounded,              'Loyalty Rewards',           'Earn points on every subscription and redeem for discounts'),
    (Icons.local_offer_rounded,       'Exclusive Offers',          'Grab limited-time discounts from your favourite kitchens'),
    (Icons.verified_user_rounded,     'Food Safety',               'All vendors are FSSAI-certified and quality-verified'),
    (Icons.psychology_rounded,        'AI Assistant',              'Get personalised meal suggestions and instant help anytime'),
    (Icons.payments_rounded,          'Secure Payments',           'Pay cash or online via UPI — fully encrypted & protected'),
  ];

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;

    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        scrolledUnderElevation: 1,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          onPressed: () => context.canPop() ? context.pop() : context.go('/more'),
        ),
        title: Text(
          'About',
          style: GoogleFonts.poppins(fontSize: 18, fontWeight: FontWeight.w700),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 40),
        children: [
          // ── Hero banner ─────────────────────────────────────────────
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 40),
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                colors: [Color(0xFFE8570C), Color(0xFFFF8C00)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
            ),
            child: Column(
              children: [
                Container(
                  width: 84, height: 84,
                  decoration: BoxDecoration(
                    color: Colors.white.withAlpha(30),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.restaurant_rounded,
                    size: 46,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  'MealSetu',
                  style: GoogleFonts.poppins(
                    fontSize: 30,
                    fontWeight: FontWeight.w800,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'v1.0.0',
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    color: Colors.white.withAlpha(200),
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Your Daily Meal Subscription Partner',
                  style: GoogleFonts.poppins(
                    fontSize: 14,
                    color: Colors.white.withAlpha(230),
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),

          // ── About MealSetu ───────────────────────────────────────────
          _Section(
            title: 'About MealSetu',
            child: Text(
              'MealSetu connects you with trusted local home kitchens for '
              'fresh, nutritious, and affordable daily meals. We help working '
              'professionals, students, and families enjoy home-style food '
              'without the hassle of cooking — delivered on your schedule.',
              style: GoogleFonts.poppins(
                fontSize: 13,
                color: cs.onSurfaceVariant,
                height: 1.65,
              ),
            ),
          ),

          // ── Features ─────────────────────────────────────────────────
          _Section(
            title: 'Key Features',
            child: Column(
              children: _features
                  .map((f) => _FeatureTile(icon: f.$1, title: f.$2, desc: f.$3))
                  .toList(),
            ),
          ),

          // ── Developed By ──────────────────────────────────────────────
          _Section(
            title: 'Developed By',
            child: Container(
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(
                color: cs.surfaceContainerLowest,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: cs.outlineVariant),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── College ──────────────────────────────────────────
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                     Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: cs.outlineVariant),
                        ),
                        child: Padding(
                          padding: const EdgeInsets.all(4),
                          child: Image.asset(
                            'assets/icon/UTU.png',
                            fit: BoxFit.contain,
                          ),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Shrimad Rajchandra Institute of Management and Computer Application (UTU)',
                              style: GoogleFonts.poppins(
                                fontSize: 13,
                                fontWeight: FontWeight.w700,
                                color: cs.onSurface,
                                height: 1.35,
                              ),
                            ),
                            const SizedBox(height: 3),
                            Text(
                              'Master of Computer Application (MCA) Student',
                              style: GoogleFonts.poppins(
                                fontSize: 11,
                                color: cs.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),
                  Divider(height: 1, color: cs.outlineVariant),
                  const SizedBox(height: 14),
Text(
                    'Project Guide',
                    style: GoogleFonts.poppins(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: AppColors.primary,
                    ),
                  ),
                  const SizedBox(height: 8),

                  Row(
                    children: [
                      Container(
                        width: 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Mr. ',
                          style: GoogleFonts.poppins(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: cs.onSurface,
                          ),
                        ),
                      ),
                    ],
                  ),

                  const SizedBox(height: 16),
                  Divider(height: 1, color: cs.outlineVariant),
                  const SizedBox(height: 14),
                  // ── Team label ───────────────────────────────────────
                  Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 12, vertical: 4),
                        decoration: BoxDecoration(
                          color: AppColors.primary,
                          borderRadius: BorderRadius.circular(20),
                        ),
                        child: Text(
                          'Team 05',
                          style: GoogleFonts.poppins(
                            fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),

                  // ── Team members ─────────────────────────────────────
                  _TeamMember(name: 'Mosinali Manasiya', cs: cs),
                  const SizedBox(height: 10),
                  _TeamMember(name: 'Toufik Shaikh', cs: cs),
                  const SizedBox(height: 10),
                  _TeamMember(name: 'Haidaral Sunsara',      cs: cs),
                ],
              ),
            ),
          ),

          // ── Legal ─────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
            child: Column(
              children: [
                Divider(color: cs.outlineVariant),
                const SizedBox(height: 4),
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    TextButton(
                      onPressed: () {},
                      child: Text(
                        'Terms of Service',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                    Text('·',
                        style: GoogleFonts.poppins(
                            color: cs.onSurfaceVariant)),
                    TextButton(
                      onPressed: () {},
                      child: Text(
                        'Privacy Policy',
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: AppColors.primary,
                        ),
                      ),
                    ),
                  ],
                ),
                Text(
                  '© 2025 MealSetu. All rights reserved.',
                  style: GoogleFonts.poppins(
                    fontSize: 11,
                    color: cs.onSurfaceVariant,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 6),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Section wrapper ────────────────────────────────────────────────────────────

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});

  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: cs.onSurface,
            ),
          ),
          const SizedBox(height: 12),
          child,
        ],
      ),
    );
  }
}

// ── Feature row ───────────────────────────────────────────────────────────────

class _FeatureTile extends StatelessWidget {
  const _FeatureTile({
    required this.icon,
    required this.title,
    required this.desc,
  });

  final IconData icon;
  final String   title;
  final String   desc;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.primary.withAlpha(15),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: AppColors.primary, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 2),
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: cs.onSurface,
                  ),
                ),
                Text(
                  desc,
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    color: cs.onSurfaceVariant,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Team member row ───────────────────────────────────────────────────────────

class _TeamMember extends StatelessWidget {
  const _TeamMember({
    required this.name,
    required this.cs,
  });

  final String      name;
  final ColorScheme cs;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        // Dot indicator
        Container(
          width: 8, height: 8,
          decoration: BoxDecoration(
            color: AppColors.primary,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 12),
        // Name
        Text(
          name,
          style: GoogleFonts.poppins(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: cs.onSurface,
          ),
        ),
      ],
    );
  }
}
