import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:smooth_page_indicator/smooth_page_indicator.dart';

// ── Data model ────────────────────────────────────────────────────────────────

class OnboardingPage {
  final String badge;
  final String title;
  final String subtitle;
  final Color bgColor;
  final Color iconColor;
  final IconData icon;

  const OnboardingPage({
    required this.badge,
    required this.title,
    required this.subtitle,
    required this.bgColor,
    required this.iconColor,
    required this.icon,
  });
}

// ── Pages ─────────────────────────────────────────────────────────────────────

const _pages = [
  OnboardingPage(
    badge: '🏠 LOCAL KITCHENS',
    title: 'Fresh Home Meals',
    subtitle:
        'Discover verified home kitchens\nnear you. Authentic food made\nwith love every single day.',
    bgColor: Color(0xFFFFF5F0),
    iconColor: Color(0xFFF26522),
    icon: Icons.set_meal_rounded,
  ),
  OnboardingPage(
    badge: '📅 FLEXIBLE PLANS',
    title: 'Easy Subscription',
    subtitle:
        'Subscribe to Daily, Weekly or\nMonthly meal plans. Pause,\nextend or cancel anytime.',
    bgColor: Color(0xFFF0F9FF),
    iconColor: Color(0xFF0EA5E9),
    icon: Icons.calendar_month_rounded,
  ),
  OnboardingPage(
    badge: '🏅 EARN REWARDS',
    title: 'Track & Earn Points',
    subtitle:
        'Track your meals in real time.\nEarn loyalty points on every\nsubscription and redeem them!',
    bgColor: Color(0xFFF0FFF4),
    iconColor: Color(0xFF16A34A),
    icon: Icons.stars_rounded,
  ),
];

// ── Screen ────────────────────────────────────────────────────────────────────

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _pageController = PageController();
  int _currentPage = 0;

  // ── Actions ──────────────────────────────────────────────────────────────

  Future<void> _finishOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_complete', true);
    if (mounted) context.go('/login');
  }

  void _nextPage() => _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );

  void _prevPage() => _pageController.previousPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeInOut,
      );

  // ── Page builder ─────────────────────────────────────────────────────────

  Widget _buildPage(OnboardingPage page) {
    final isLast = _currentPage == _pages.length - 1;
    final isFirst = _currentPage == 0;

    return SafeArea(
      child: Column(
        children: [
          // Skip button row
          SizedBox(
            height: 48,
            child: Align(
              alignment: Alignment.centerRight,
              child: !isLast
                  ? TextButton(
                      onPressed: _finishOnboarding,
                      child: const Text(
                        'Skip',
                        style: TextStyle(
                          color: Color(0xFF9CA3AF),
                          fontSize: 15,
                        ),
                      ),
                    )
                  : const SizedBox.shrink(),
            ),
          ),

          // Illustration area (flex 3)
          Expanded(
            flex: 3,
            child: Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Badge chip
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 16, vertical: 8),
                    decoration: BoxDecoration(
                      color: page.iconColor.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Text(
                      page.badge,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: page.iconColor,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Double-circle illustration
                  Container(
                    width: 200,
                    height: 200,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: page.iconColor.withValues(alpha: 0.08),
                    ),
                    child: Center(
                      child: Container(
                        width: 140,
                        height: 140,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: page.iconColor.withValues(alpha: 0.15),
                        ),
                        child: Icon(
                          page.icon,
                          size: 72,
                          color: page.iconColor,
                        ),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Text area (flex 2)
          Expanded(
            flex: 2,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(
                    page.title,
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.w700,
                      color: Color(0xFF1A1A2E),
                      height: 1.2,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    page.subtitle,
                    style: const TextStyle(
                      fontSize: 16,
                      color: Color(0xFF64748B),
                      height: 1.6,
                    ),
                  ),
                ],
              ),
            ),
          ),

          // Bottom navigation
          Padding(
            padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
            child: Column(
              children: [
                // Page dots
                SmoothPageIndicator(
                  controller: _pageController,
                  count: _pages.length,
                  effect: WormEffect(
                    dotHeight: 10,
                    dotWidth: 10,
                    spacing: 8,
                    dotColor: Colors.grey.shade300,
                    activeDotColor: const Color(0xFFF26522),
                  ),
                ),
                const SizedBox(height: 28),

                // Buttons
                if (!isLast)
                  Row(
                    children: [
                      if (!isFirst) ...[
                        Expanded(
                          child: OutlinedButton(
                            onPressed: _prevPage,
                            style: OutlinedButton.styleFrom(
                              side: const BorderSide(
                                  color: Color(0xFF9CA3AF)),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(12),
                              ),
                              minimumSize: const Size.fromHeight(52),
                            ),
                            child: const Text(
                              '← Back',
                              style:
                                  TextStyle(color: Color(0xFF9CA3AF)),
                            ),
                          ),
                        ),
                        const SizedBox(width: 12),
                      ],
                      Expanded(
                        flex: 2,
                        child: ElevatedButton(
                          onPressed: _nextPage,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFFF26522),
                            foregroundColor: Colors.white,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                            minimumSize: const Size.fromHeight(52),
                            elevation: 0,
                          ),
                          child: const Text('Next →'),
                        ),
                      ),
                    ],
                  )
                else
                  SizedBox(
                    width: double.infinity,
                    height: 56,
                    child: ElevatedButton(
                      onPressed: _finishOnboarding,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFFF26522),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12),
                        ),
                        elevation: 0,
                      ),
                      child: const Text(
                        'Get Started 🍽️',
                        style: TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
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

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: PageView.builder(
        controller: _pageController,
        physics: const BouncingScrollPhysics(),
        onPageChanged: (index) => setState(() => _currentPage = index),
        itemCount: _pages.length,
        itemBuilder: (context, index) => Container(
          color: _pages[index].bgColor,
          child: _buildPage(_pages[index]),
        ),
      ),
    );
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }
}
