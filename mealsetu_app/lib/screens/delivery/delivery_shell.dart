import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../providers/auth_provider.dart';
import '../../providers/delivery_provider.dart';
import '../../services/socket_service.dart';
import 'my_batches_screen.dart';
import 'delivery_map_screen.dart';
import 'delivery_stats_screen.dart';
import 'delivery_profile_screen.dart';

class DeliveryShell extends StatefulWidget {
  const DeliveryShell({super.key});

  @override
  State<DeliveryShell> createState() => _DeliveryShellState();
}

class _DeliveryShellState extends State<DeliveryShell> {
  int _currentIndex = 0;

  static const _orange = Color(0xFFF26522);

  static const _tabs = [
    _TabItem(icon: Icons.delivery_dining_outlined, activeIcon: Icons.delivery_dining, label: 'Batches'),
    _TabItem(icon: Icons.map_outlined,             activeIcon: Icons.map,             label: 'Map'),
    _TabItem(icon: Icons.bar_chart_outlined,       activeIcon: Icons.bar_chart,       label: 'Stats'),
    _TabItem(icon: Icons.person_outline,           activeIcon: Icons.person,          label: 'Profile'),
  ];

  late final List<Widget> _pages;

  @override
  void initState() {
    super.initState();
    _pages = const [
      MyBatchesScreen(),
      DeliveryMapScreen(),
      DeliveryStatsScreen(),
      DeliveryProfileScreen(),
    ];

    WidgetsBinding.instance.addPostFrameCallback((_) {
      final user = context.read<AuthProvider>().user;
      if (user != null) {
        final userId = user['_id']?.toString() ?? user['id']?.toString() ?? '';
        if (userId.isNotEmpty) {
          SocketService().connect(userId, 'delivery');
        }
      }

      final provider = context.read<DeliveryProvider>();
      final hour = DateTime.now().hour;
      provider.fetchBatches(mealSlot: hour >= 15 ? 'dinner' : 'lunch');
      provider.fetchStats();

      SocketService().onNewBatchAssigned((data) {
        if (!mounted) return;
        provider.fetchBatches();
        final area = (data is Map ? data['area'] : null) as String? ?? '';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.delivery_dining, color: Colors.white),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '🛵 New delivery batch assigned! $area',
                    style: const TextStyle(color: Colors.white),
                  ),
                ),
              ],
            ),
            backgroundColor: _orange,
            duration: const Duration(seconds: 5),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
          ),
        );
      });

      SocketService().onSalaryPaid((data) {
        if (!mounted) return;
        provider.fetchStats();
        final amount = (data is Map ? data['amount'] : null)?.toString() ?? '';
        final month  = (data is Map ? data['month']  : null) as String? ?? '';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Row(
              children: [
                const Icon(Icons.currency_rupee, color: Colors.white),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    '💰 Salary ₹$amount for $month has been paid! Check Stats tab.',
                    style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
            backgroundColor: const Color(0xFF16A34A),
            duration: const Duration(seconds: 6),
            behavior: SnackBarBehavior.floating,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10)),
          ),
        );
      });
    });
  }

  @override
  void dispose() {
    SocketService().off('new_batch_assigned');
    SocketService().off('salary_paid');
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _currentIndex,
        children: _pages,
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        onTap: (i) => setState(() => _currentIndex = i),
        type: BottomNavigationBarType.fixed,
        selectedItemColor:    _orange,
        unselectedItemColor:  Colors.grey,
        backgroundColor:      Colors.white,
        elevation: 8,
        selectedLabelStyle:   const TextStyle(fontWeight: FontWeight.w600, fontSize: 12),
        unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.w400, fontSize: 12),
        items: _tabs
            .map((t) => BottomNavigationBarItem(
                  icon:       Icon(t.icon),
                  activeIcon: Icon(t.activeIcon),
                  label:      t.label,
                ))
            .toList(),
      ),
    );
  }
}

class _TabItem {
  const _TabItem({required this.icon, required this.activeIcon, required this.label});
  final IconData icon;
  final IconData activeIcon;
  final String   label;
}
