import 'package:dio/dio.dart' show DioException;
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';

import '../../constants/app_colors.dart';
import '../../services/api_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// SafetyScreen
// ─────────────────────────────────────────────────────────────────────────────

class SafetyScreen extends StatefulWidget {
  const SafetyScreen({super.key});

  @override
  State<SafetyScreen> createState() => _SafetyScreenState();
}

class _SafetyScreenState extends State<SafetyScreen>
    with SingleTickerProviderStateMixin {
  final _api = ApiService();

  late TabController _tabController;

  // ── Complaints data ───────────────────────────────────────────────────────
  List<Map<String, dynamic>> _complaints = [];
  bool   _loadingComplaints = true;
  String? _complaintsError;

  // ── Orders (for vendor picker in form) ───────────────────────────────────
  List<Map<String, dynamic>> _orders  = [];

  // ── Form state ────────────────────────────────────────────────────────────
  bool _isSubmitting = false;

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadComplaints();
    _loadOrders();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // ── Data ──────────────────────────────────────────────────────────────────

  Future<void> _loadComplaints() async {
    setState(() { _loadingComplaints = true; _complaintsError = null; });
    try {
      final res = await _api.get('/users/my-complaints');
      final raw = res.data is List ? res.data as List : [];
      setState(() {
        _complaints = raw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _loadingComplaints = false;
      });
    } catch (_) {
      setState(() {
        _complaintsError = 'Failed to load complaints.';
        _loadingComplaints = false;
      });
    }
  }

  Future<void> _loadOrders() async {
    try {
      final res  = await _api.get('/users/orders');
      final raw  = res.data is List ? res.data as List : [];
      final list = raw.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      // Only keep orders that have a populated vendorId
      setState(() {
        _orders = list.where((o) => o['vendorId'] is Map).toList();
      });
    } catch (_) {
      // non-fatal — vendor list simply stays empty
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  DateTime? _parseDate(dynamic raw) {
    if (raw == null) return null;
    try { return DateTime.parse(raw.toString()).toLocal(); } catch (_) { return null; }
  }

  String _fmt(DateTime? d) =>
      d == null ? '—' : DateFormat('d MMM yyyy').format(d);

  void _snack(String msg, {bool isError = false, bool isSuccess = false}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(msg, style: GoogleFonts.poppins(fontSize: 13)),
        backgroundColor: isError
            ? Colors.red.shade700
            : isSuccess
                ? AppColors.success
                : AppColors.textDark,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    );
  }

  // ── Distinct vendors from orders ──────────────────────────────────────────

  List<Map<String, dynamic>> get _vendorOptions {
    final seen = <String>{};
    final result = <Map<String, dynamic>>[];
    for (final o in _orders) {
      final v   = o['vendorId'] as Map;
      final vid = v['_id']?.toString() ?? '';
      if (vid.isNotEmpty && seen.add(vid)) {
        result.add({
          '_id':  vid,
          'name': v['kitchenName'] as String? ?? 'Kitchen',
        });
      }
    }
    return result;
  }

  // ── Submit complaint sheet ─────────────────────────────────────────────────

  void _showComplaintSheet() {
    final vendors = _vendorOptions;
    Map<String, dynamic>? selectedVendor = vendors.isNotEmpty ? vendors.first : null;
    Map<String, dynamic>? selectedOrder;
    final msgController = TextEditingController();
    final formKey = GlobalKey<FormState>();

    // Capture colorScheme before showing sheet
    final cs = Theme.of(context).colorScheme;

    // Orders belonging to a specific vendor
    List<Map<String, dynamic>> ordersForVendor(String vendorId) =>
        _orders.where((o) {
          final v = o['vendorId'] as Map;
          return v['_id']?.toString() == vendorId;
        }).toList();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => StatefulBuilder(
        builder: (ctx2, setSheet) {
          final vendorOrders = selectedVendor != null
              ? ordersForVendor(selectedVendor!['_id'] as String)
              : <Map<String, dynamic>>[];

          return Padding(
            padding: EdgeInsets.only(
              bottom: MediaQuery.of(ctx).viewInsets.bottom + 24,
              top: 20,
              left: 20,
              right: 20,
            ),
            child: Form(
              key: formKey,
              child: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    // Handle bar
                    Center(
                      child: Container(
                        width: 40, height: 4,
                        margin: const EdgeInsets.only(bottom: 16),
                        decoration: BoxDecoration(
                          color: cs.outlineVariant,
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),

                    Text(
                      'Report an Issue',
                      style: GoogleFonts.poppins(
                        fontSize: 18,
                        fontWeight: FontWeight.w700,
                        color: cs.onSurface,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      'We take food safety seriously. Your report helps us maintain quality.',
                      style: GoogleFonts.poppins(
                          fontSize: 12, color: cs.onSurfaceVariant),
                    ),

                    const SizedBox(height: 20),
                    Divider(color: cs.outlineVariant),
                    const SizedBox(height: 16),

                    // ── Vendor picker ──────────────────────────────────
                    _label('Kitchen *'),
                    const SizedBox(height: 6),
                    vendors.isEmpty
                        ? Container(
                            padding: const EdgeInsets.all(12),
                            decoration: BoxDecoration(
                              color: cs.surfaceContainerLowest,
                              borderRadius: BorderRadius.circular(10),
                              border: Border.all(color: cs.outlineVariant),
                            ),
                            child: Text(
                              'No orders found. Please place an order first.',
                              style: GoogleFonts.poppins(
                                  fontSize: 13, color: cs.onSurfaceVariant),
                            ),
                          )
                        : InputDecorator(
                            decoration: _inputDeco('Select kitchen'),
                            child: DropdownButton<Map<String, dynamic>>(
                              value: selectedVendor,
                              isExpanded: true,
                              underline: const SizedBox(),
                              style: GoogleFonts.poppins(
                                  fontSize: 13, color: cs.onSurface),
                              items: vendors
                                  .map((v) => DropdownMenuItem(
                                        value: v,
                                        child: Text(v['name'] as String),
                                      ))
                                  .toList(),
                              onChanged: (v) => setSheet(() {
                                selectedVendor = v;
                                selectedOrder  = null;
                              }),
                            ),
                          ),

                    const SizedBox(height: 14),

                    // ── Order picker ───────────────────────────────────
                    _label('Order (optional)'),
                    const SizedBox(height: 6),
                    InputDecorator(
                      decoration: _inputDeco('Select order (optional)'),
                      child: DropdownButton<Map<String, dynamic>?>(
                        value: selectedOrder,
                        isExpanded: true,
                        underline: const SizedBox(),
                        style: GoogleFonts.poppins(
                            fontSize: 13, color: cs.onSurface),
                        items: [
                          const DropdownMenuItem(
                              value: null, child: Text('None')),
                          ...vendorOrders.map((o) {
                            final planType = o['planType'] as String? ?? '';
                            final date     = _parseDate(o['orderDate']);
                            return DropdownMenuItem(
                              value: o,
                              child: Text(
                                '$planType · ${_fmt(date)}',
                                overflow: TextOverflow.ellipsis,
                              ),
                            );
                          }),
                        ],
                        onChanged: (o) => setSheet(() => selectedOrder = o),
                      ),
                    ),

                    const SizedBox(height: 14),

                    // ── Message ────────────────────────────────────────
                    _label('Describe the issue *'),
                    const SizedBox(height: 6),
                    TextFormField(
                      controller: msgController,
                      maxLines: 4,
                      maxLength: 500,
                      style: GoogleFonts.poppins(
                          fontSize: 13, color: cs.onSurface),
                      decoration: _inputDeco(
                        'Describe the food quality, hygiene, or service issue...',
                      ),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) {
                          return 'Please describe the issue';
                        }
                        if (v.trim().length < 10) {
                          return 'Please provide more detail (min 10 chars)';
                        }
                        return null;
                      },
                    ),

                    const SizedBox(height: 20),

                    // ── Submit ─────────────────────────────────────────
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.primary,
                          foregroundColor: Colors.white,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                          elevation: 0,
                        ),
                        icon: _isSubmitting
                            ? const SizedBox(
                                width: 16, height: 16,
                                child: CircularProgressIndicator(
                                    strokeWidth: 2,
                                    color: Colors.white),
                              )
                            : const Icon(Icons.send_rounded, size: 18),
                        label: Text(
                          _isSubmitting ? 'Submitting…' : 'Submit Complaint',
                          style: GoogleFonts.poppins(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                        onPressed: vendors.isEmpty || _isSubmitting
                            ? null
                            : () async {
                                if (!formKey.currentState!.validate()) return;
                                Navigator.of(ctx).pop();
                                await _submitComplaint(
                                  vendorId: selectedVendor!['_id'] as String,
                                  orderId: selectedOrder?['_id']?.toString(),
                                  message: msgController.text.trim(),
                                );
                              },
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  Future<void> _submitComplaint({
    required String vendorId,
    String? orderId,
    required String message,
  }) async {
    setState(() => _isSubmitting = true);
    try {
      await _api.post('/users/complaint', {
        'vendorId': vendorId,
        'orderId': ?orderId,
        'message': message,
      });
      setState(() => _isSubmitting = false);
      _snack('Complaint submitted successfully ✓', isSuccess: true);
      await _loadComplaints();
      // Switch to complaints tab
      _tabController.animateTo(1);
    } on DioException catch (e) {
      setState(() => _isSubmitting = false);
      _snack(_api.handleError(e), isError: true);
    } catch (_) {
      setState(() => _isSubmitting = false);
      _snack('Failed to submit complaint. Please try again.', isError: true);
    }
  }

  // ── Input decoration helper ───────────────────────────────────────────────

  InputDecoration _inputDeco(String hint) {
    final cs = Theme.of(context).colorScheme;
    return InputDecoration(
      hintText: hint,
      hintStyle: GoogleFonts.poppins(fontSize: 13, color: cs.onSurfaceVariant),
      filled: true,
      fillColor: cs.surfaceContainerLowest,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: cs.outlineVariant),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: cs.outlineVariant),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: AppColors.primary, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Colors.red),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: Colors.red, width: 1.5),
      ),
    );
  }

  Widget _label(String text) {
    final cs = Theme.of(context).colorScheme;
    return Text(
      text,
      style: GoogleFonts.poppins(
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: cs.onSurface,
      ),
    );
  }

  // ── Tab 1: Safety guidelines ──────────────────────────────────────────────

  Widget _safetyTab() {
    final cs = Theme.of(context).colorScheme;
    return ListView(
      padding: const EdgeInsets.only(bottom: 32),
      children: [
        // Hero banner
        Container(
          margin: const EdgeInsets.all(16),
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [Color(0xFFE8570C), Color(0xFFFF8C00)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.verified_user_rounded,
                      color: Colors.white, size: 28),
                  const SizedBox(width: 10),
                  Text(
                    'Your Safety is Our Priority',
                    style: GoogleFonts.poppins(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                      color: Colors.white,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              Text(
                'MealSetu ensures every vendor on our platform meets strict '
                'food safety and hygiene standards before serving you.',
                style: GoogleFonts.poppins(
                  fontSize: 13,
                  color: Colors.white.withAlpha(220),
                  height: 1.5,
                ),
              ),
            ],
          ),
        ),

        // Safety features grid — 2 rows × 2 cols, auto-height
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Column(
            children: [
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: _safetyCard(
                        icon: Icons.fact_check_rounded,
                        iconColor: const Color(0xFF2563EB),
                        iconBg: const Color(0xFFDBEAFE),
                        title: 'FSSAI Certified',
                        desc: 'All vendors must hold a valid FSSAI license',
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _safetyCard(
                        icon: Icons.cleaning_services_rounded,
                        iconColor: AppColors.success,
                        iconBg: const Color(0xFFDCFCE7),
                        title: 'Hygiene Checks',
                        desc: 'Kitchens are verified for cleanliness & standards',
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              IntrinsicHeight(
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Expanded(
                      child: _safetyCard(
                        icon: Icons.gpp_good_rounded,
                        iconColor: const Color(0xFF7C3AED),
                        iconBg: const Color(0xFFEDE9FE),
                        title: 'Verified Vendors',
                        desc: 'Every vendor is reviewed & approved by our team',
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _safetyCard(
                        icon: Icons.lock_rounded,
                        iconColor: AppColors.warning,
                        iconBg: const Color(0xFFFEF3C7),
                        title: 'Secure Payments',
                        desc: 'All transactions are encrypted & protected',
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 20),

        // Standards section
        _sectionHeader('Food Safety Standards'),
        ...[
          _standardItem(
            Icons.thermostat_rounded,
            'Temperature Control',
            'Food is prepared and stored at safe temperatures to prevent contamination.',
          ),
          _standardItem(
            Icons.water_drop_rounded,
            'Fresh Ingredients',
            'Vendors commit to using fresh, quality ingredients for every meal.',
          ),
          _standardItem(
            Icons.soap_rounded,
            'Personal Hygiene',
            'Kitchen staff maintain strict personal hygiene and food-handling practices.',
          ),
          _standardItem(
            Icons.inventory_2_rounded,
            'No Adulteration',
            'Zero tolerance for adulterated or substandard food materials.',
          ),
          _standardItem(
            Icons.report_problem_rounded,
            'Complaint Resolution',
            'Every reported issue is reviewed within 48 hours with vendor accountability.',
          ),
        ],

        const SizedBox(height: 20),

        // Report CTA
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            color: cs.surfaceContainerLowest,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.primary.withAlpha(60)),
          ),
          child: Row(
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: AppColors.primary.withAlpha(20),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.report_rounded,
                    color: AppColors.primary, size: 24),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Have an Issue?',
                      style: GoogleFonts.poppins(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: cs.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Tap "Report" to file a complaint. We act within 48 hours.',
                      style: GoogleFonts.poppins(
                          fontSize: 12, color: cs.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              TextButton(
                style: TextButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 8),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: () {
                  _tabController.animateTo(1);
                  _showComplaintSheet();
                },
                child: Text(
                  'Report',
                  style: GoogleFonts.poppins(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            ],
          ),
        ),

        const SizedBox(height: 16),
      ],
    );
  }

  Widget _safetyCard({
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    required String desc,
  }) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cs.outlineVariant),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withAlpha(6),
              blurRadius: 8,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
                color: iconBg, borderRadius: BorderRadius.circular(10)),
            child: Icon(icon, color: iconColor, size: 22),
          ),
          const SizedBox(height: 10),
          Text(
            title,
            style: GoogleFonts.poppins(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: cs.onSurface,
            ),
          ),
          const SizedBox(height: 3),
          Text(
            desc,
            style: GoogleFonts.poppins(
                fontSize: 11, color: cs.onSurfaceVariant, height: 1.5),
          ),
        ],
      ),
    );
  }

  Widget _sectionHeader(String title) {
    final cs = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 10),
      child: Text(
        title,
        style: GoogleFonts.poppins(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          color: cs.onSurface,
        ),
      ),
    );
  }

  Widget _standardItem(IconData icon, String title, String desc) {
    final cs = Theme.of(context).colorScheme;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: cs.outlineVariant),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppColors.primary, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: GoogleFonts.poppins(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: cs.onSurface,
                  ),
                ),
                const SizedBox(height: 3),
                Text(
                  desc,
                  style: GoogleFonts.poppins(
                      fontSize: 12,
                      color: cs.onSurfaceVariant,
                      height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // ── Tab 2: My complaints ───────────────────────────────────────────────────

  Widget _complaintsTab() {
    final cs = Theme.of(context).colorScheme;

    if (_loadingComplaints) {
      return const Center(
          child: CircularProgressIndicator(color: AppColors.primary));
    }
    if (_complaintsError != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.wifi_off_rounded, size: 48, color: cs.outlineVariant),
            const SizedBox(height: 12),
            Text(_complaintsError!,
                style: GoogleFonts.poppins(
                    fontSize: 13, color: cs.onSurfaceVariant)),
            const SizedBox(height: 16),
            TextButton.icon(
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
              onPressed: _loadComplaints,
              style: TextButton.styleFrom(
                  foregroundColor: AppColors.primary),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      color: AppColors.primary,
      onRefresh: _loadComplaints,
      child: _complaints.isEmpty
          ? ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 32, vertical: 60),
                  child: Column(
                    children: [
                      Icon(Icons.inbox_rounded,
                          size: 64, color: cs.outlineVariant),
                      const SizedBox(height: 16),
                      Text(
                        'No complaints yet',
                        style: GoogleFonts.poppins(
                          fontSize: 16,
                          fontWeight: FontWeight.w600,
                          color: cs.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'If you face any issue with food quality or service, tap the + button to report it.',
                        style: GoogleFonts.poppins(
                            fontSize: 12, color: cs.onSurfaceVariant),
                        textAlign: TextAlign.center,
                      ),
                    ],
                  ),
                ),
              ],
            )
          : ListView.builder(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.only(top: 8, bottom: 100),
              itemCount: _complaints.length,
              itemBuilder: (_, i) => _complaintCard(_complaints[i]),
            ),
    );
  }

  Widget _complaintCard(Map<String, dynamic> c) {
    final cs        = Theme.of(context).colorScheme;
    final vendor    = c['vendorId'] as Map? ?? {};
    final kitchen   = vendor['kitchenName'] as String? ?? 'Unknown Kitchen';
    final message   = c['message']  as String? ?? '';
    final status    = c['status']   as String? ?? 'Open';
    final response  = c['response'] as String?;
    final createdAt = _parseDate(c['createdAt']);
    final order     = c['orderId'] as Map?;

    late Color statusBg, statusFg;
    switch (status) {
      case 'Resolved':
        statusBg = const Color(0xFFDCFCE7);
        statusFg = AppColors.success;
        break;
      case 'Rejected':
        statusBg = const Color(0xFFFEE2E2);
        statusFg = const Color(0xFFDC2626);
        break;
      default: // Open
        statusBg = const Color(0xFFFEF3C7);
        statusFg = AppColors.warning;
    }

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 12),
      decoration: BoxDecoration(
        color: cs.surface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: cs.outlineVariant),
        boxShadow: [
          BoxShadow(
              color: Colors.black.withAlpha(7),
              blurRadius: 8,
              offset: const Offset(0, 2)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 14, 14, 0),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: const Color(0xFFFEE2E2),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.restaurant_rounded,
                      size: 18, color: Color(0xFFDC2626)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        kitchen,
                        style: GoogleFonts.poppins(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: cs.onSurface,
                        ),
                      ),
                      if (order != null)
                        Text(
                          '${order['planType'] ?? ''} · ${_fmt(_parseDate(order['orderDate']))}',
                          style: GoogleFonts.poppins(
                              fontSize: 11, color: cs.onSurfaceVariant),
                        ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: statusBg,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Text(
                    status,
                    style: GoogleFonts.poppins(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: statusFg,
                    ),
                  ),
                ),
              ],
            ),
          ),

          // Message
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
            child: Text(
              message,
              style: GoogleFonts.poppins(
                  fontSize: 13, color: cs.onSurface, height: 1.5),
            ),
          ),

          // Date
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 6, 14, 0),
            child: Text(
              'Submitted ${_fmt(createdAt)}',
              style: GoogleFonts.poppins(
                  fontSize: 11, color: cs.onSurfaceVariant),
            ),
          ),

          // Vendor response
          if (response != null && response.isNotEmpty) ...[
            Divider(
                height: 20,
                color: cs.outlineVariant,
                indent: 14,
                endIndent: 14),
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(Icons.reply_rounded,
                      size: 16, color: AppColors.success),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Vendor Response',
                          style: GoogleFonts.poppins(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: AppColors.success,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          response,
                          style: GoogleFonts.poppins(
                              fontSize: 12,
                              color: cs.onSurface,
                              height: 1.4),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ] else
            const SizedBox(height: 14),
        ],
      ),
    );
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        elevation: 0,
        scrolledUnderElevation: 1,
        title: Text(
          'Safety',
          style: GoogleFonts.poppins(
            fontSize: 18,
            fontWeight: FontWeight.w700,
          ),
        ),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: Theme.of(context).colorScheme.onSurfaceVariant,
          indicatorColor: AppColors.primary,
          indicatorWeight: 2.5,
          labelStyle: GoogleFonts.poppins(
              fontSize: 13, fontWeight: FontWeight.w600),
          unselectedLabelStyle: GoogleFonts.poppins(
              fontSize: 13, fontWeight: FontWeight.w500),
          tabs: [
            const Tab(text: 'Safety Info'),
            Tab(
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('My Complaints'),
                  if (!_loadingComplaints &&
                      _complaints.any((c) => c['status'] == 'Open')) ...[
                    const SizedBox(width: 5),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 1),
                      decoration: BoxDecoration(
                        color: AppColors.warning.withAlpha(30),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        '${_complaints.where((c) => c['status'] == 'Open').length}',
                        style: GoogleFonts.poppins(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: AppColors.warning,
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: AnimatedBuilder(
        animation: _tabController,
        builder: (_, _) => _tabController.index == 1
            ? FloatingActionButton.extended(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                onPressed: _showComplaintSheet,
                icon: const Icon(Icons.add_rounded),
                label: Text(
                  'Report Issue',
                  style: GoogleFonts.poppins(fontWeight: FontWeight.w600),
                ),
              )
            : const SizedBox.shrink(),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _safetyTab(),
          _complaintsTab(),
        ],
      ),
    );
  }
}
