import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../../constants/app_colors.dart';
import '../../providers/auth_provider.dart';
import '../../providers/loyalty_provider.dart';
import '../../providers/theme_provider.dart';

class MoreScreen extends StatefulWidget {
  const MoreScreen({super.key});
  @override
  State<MoreScreen> createState() => _MoreScreenState();
}

class _MoreScreenState extends State<MoreScreen> {
  @override
  void initState() {
    super.initState();
    // Lazily load loyalty data so the banner shows live points
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final prov = context.read<LoyaltyProvider>();
      if (prov.loyaltyData == null && !prov.isLoading) {
        prov.fetchLoyalty();
      }
    });
  }

  void _showThemePicker(BuildContext ctx, ThemeProvider themeProv) {
    showModalBottomSheet<void>(
      context: ctx,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) {
        return Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Handle bar
              Container(
                width: 40,
                height: 4,
                margin: const EdgeInsets.only(bottom: 16),
                decoration: BoxDecoration(
                  color: Colors.grey.shade300,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
              const Align(
                alignment: Alignment.centerLeft,
                child: Padding(
                  padding: EdgeInsets.only(bottom: 8),
                  child: Text(
                    'Appearance',
                    style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
              _ThemeOption(
                icon: Icons.wb_sunny_rounded,
                label: 'Light',
                selected: themeProv.themeMode == ThemeMode.light,
                onTap: () {
                  themeProv.setTheme(ThemeMode.light);
                  Navigator.pop(ctx);
                },
              ),
              _ThemeOption(
                icon: Icons.nightlight_round,
                label: 'Dark',
                selected: themeProv.themeMode == ThemeMode.dark,
                onTap: () {
                  themeProv.setTheme(ThemeMode.dark);
                  Navigator.pop(ctx);
                },
              ),
              _ThemeOption(
                icon: Icons.brightness_auto_rounded,
                label: 'System default',
                selected: themeProv.themeMode == ThemeMode.system,
                onTap: () {
                  themeProv.setTheme(ThemeMode.system);
                  Navigator.pop(ctx);
                },
              ),
            ],
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('More')),
      body: ListView(
        children: [
          // ── Loyalty banner ───────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
            child: Consumer<LoyaltyProvider>(
              builder: (ctx, prov, child) {
                final data   = prov.loyaltyData;
                final pts    = data?.points ?? 0;
                final lvName = data?.level['name'] as String? ?? 'Starter';
                final lvIcon = data?.level['icon'] as String? ?? '🌱';

                return GestureDetector(
                  onTap: () => context.push('/loyalty'),
                  child: Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      gradient: const LinearGradient(
                        colors: [Color(0xFFF26522), Color(0xFFD9541A)],
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                      ),
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.primary.withValues(alpha: 0.35),
                          blurRadius: 14,
                          offset: const Offset(0, 6),
                        ),
                      ],
                    ),
                    child: Row(
                      children: [
                        // Left: text info
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text('🏅 Loyalty Rewards',
                                  style: GoogleFonts.poppins(
                                      fontSize: 16,
                                      fontWeight: FontWeight.w800,
                                      color: Colors.white)),
                              const SizedBox(height: 3),
                              Text('Earn points on every subscription',
                                  style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      color: Colors.white
                                          .withValues(alpha: 0.85))),
                              const SizedBox(height: 8),
                              prov.isLoading
                                  ? const SizedBox(
                                      width: 18,
                                      height: 18,
                                      child: CircularProgressIndicator(
                                          color: Colors.white,
                                          strokeWidth: 2))
                                  : Text('$pts pts',
                                      style: GoogleFonts.poppins(
                                          fontSize: 20,
                                          fontWeight: FontWeight.w800,
                                          color: Colors.white)),
                            ],
                          ),
                        ),
                        // Right: level badge + arrow
                        Column(
                          crossAxisAlignment: CrossAxisAlignment.end,
                          children: [
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 5),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(20),
                              ),
                              child: Text('$lvIcon $lvName',
                                  style: GoogleFonts.poppins(
                                      fontSize: 12,
                                      fontWeight: FontWeight.w700,
                                      color: Colors.white)),
                            ),
                            const SizedBox(height: 14),
                            const Icon(Icons.arrow_forward_rounded,
                                color: Colors.white, size: 22),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),

          const Divider(height: 20),

          // ── AI Features ──────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 6),
            child: Text(
              'AI Features',
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: 0.8,
              ),
            ),
          ),
          _MoreTile(
            icon: Icons.psychology_rounded,
            label: 'AI Assistant',
            subtitle: 'Ask anything about your meals',
            color: AppColors.primary,
            onTap: () => context.push('/ai-chat'),
          ),
          const Divider(height: 8),

          // ── General ──────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
            child: Text(
              'General',
              style: GoogleFonts.poppins(
                fontSize: 11,
                fontWeight: FontWeight.w700,
                color: Theme.of(context).colorScheme.onSurfaceVariant,
                letterSpacing: 0.8,
              ),
            ),
          ),
          _MoreTile(
            icon: Icons.local_offer_outlined,
            label: 'Offers',
            onTap: () => context.push('/offers'),
          ),
          _MoreTile(
            icon: Icons.verified_user_outlined,
            label: 'Safety',
            onTap: () => context.push('/safety'),
          ),
          _MoreTile(
            icon: Icons.person_outline,
            label: 'Edit Profile',
            onTap: () => context.push('/profile/edit'),
          ),
          _MoreTile(
            icon: Icons.contact_support_outlined,
            label: 'Contact Us',
            subtitle: 'Reach us or nearby kitchens',
            onTap: () => context.push('/contact'),
          ),
          _MoreTile(
            icon: Icons.info_outline_rounded,
            label: 'About',
            subtitle: 'App info & features',
            onTap: () => context.push('/about'),
          ),
          Consumer<ThemeProvider>(
            builder: (ctx, themeProv, _) => _MoreTile(
              icon: Icons.brightness_6_rounded,
              label: 'Appearance',
              subtitle: themeProv.label,
              onTap: () => _showThemePicker(ctx, themeProv),
            ),
          ),
          const Divider(),
          _MoreTile(
            icon: Icons.logout,
            label: 'Logout',
            color: Colors.red,
            onTap: () async {
              if (!context.mounted) return;
              final authProvider = context.read<AuthProvider>();
              final router       = GoRouter.of(context);
              await showDialog<void>(
                context: context,
                barrierDismissible: true,
                builder: (dialogContext) => AlertDialog(
                  title: const Text('Logout'),
                  content: const Text('Are you sure you want to logout?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.of(dialogContext).pop(),
                      child: const Text('Cancel'),
                    ),
                    TextButton(
                      onPressed: () async {
                        Navigator.of(dialogContext).pop();
                        await authProvider.logout();
                        router.go('/login');
                      },
                      child: const Text('Logout',
                          style: TextStyle(color: Colors.red)),
                    ),
                  ],
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.subtitle,
    this.color,
  });

  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    // When no explicit color is set, pass null so ListTileTheme (which is
    // correctly set per theme mode in main.dart) provides the right color.
    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(
        label,
        style: TextStyle(color: color ?? cs.onSurface),
      ),
      subtitle: subtitle != null
          ? Text(subtitle!,
              style: GoogleFonts.poppins(
                  fontSize: 12, color: cs.onSurfaceVariant))
          : null,
      trailing: Icon(Icons.chevron_right, color: cs.onSurfaceVariant),
      onTap: onTap,
    );
  }
}

// ── Theme picker option row ───────────────────────────────────────────────────

class _ThemeOption extends StatelessWidget {
  const _ThemeOption({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(
        icon,
        color: selected ? AppColors.primary : AppColors.textGrey,
      ),
      title: Text(
        label,
        style: TextStyle(
          fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
          color: selected ? AppColors.primary : null,
        ),
      ),
      trailing: selected
          ? const Icon(Icons.check_circle_rounded, color: AppColors.primary)
          : null,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      onTap: onTap,
    );
  }
}
