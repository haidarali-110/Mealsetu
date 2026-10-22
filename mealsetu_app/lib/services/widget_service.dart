// // import 'package:flutter/foundation.dart';
// // import 'package:home_widget/home_widget.dart';

// // import 'api_service.dart';

// // class WidgetService {
// //   static const _androidProvider = 'TiffinWidgetProvider';

// //   static Future<void> initialize() async {
// //     await HomeWidget.setAppGroupId(
// //       'group.com.mealsetu.mealsetu_app');
// //   }

// //   static Future<void> refresh() async {
// //     try {
// //       final api = ApiService();

// //       Map<String, dynamic>? subMap;

// //       try {
// //         final result = await api.get(
// //           '/users/orders/my-subscription');
// //         final sub = result.data;
// //         if (sub is Map) {
// //           subMap = Map<String, dynamic>.from(sub);
// //         }
// //       } catch (apiErr) {
// //         debugPrint('[WidgetService] API error: $apiErr');
// //       }

// //       if (subMap == null) {
// //         await _push(
// //           vendorName: 'No active tiffin',
// //           menu: 'Subscribe to a plan in MealSetu',
// //           status: '',
// //         );
// //         return;
// //       }

// //       final vendorName = 
// //         (subMap['vendorName'] as String?)
// //           ?.trim().isNotEmpty == true
// //             ? subMap['vendorName'] as String
// //             : (subMap['name'] as String?)
// //                 ?.trim().isNotEmpty == true
// //                   ? subMap['name'] as String
// //                   : 'Your Kitchen';

// //       final timings = 
// //         subMap['timings'] as String? ?? '';
// //       final status = 
// //         subMap['status'] as String? ?? 'Active';
      
// //       await _push(
// //         vendorName: vendorName,
// //         menu: 'Fresh homemade tiffin daily',
// //         timeSlot: timings,
// //         status: status,
// //       );

// //     } catch (e) {
// //       debugPrint('[WidgetService] refresh error: $e');
// //       await _push(
// //         vendorName: 'MealSetu',
// //         menu: 'Open app to see today\'s tiffin',
// //         status: '',
// //       );
// //     }
// //   }

// //   static Future<void> _push({
// //     required String vendorName,
// //     required String menu,
// //     String timeSlot = '',
// //     String status = '',
// //   }) async {
// //     final (label, color) = _resolveStatus(status);

// //     await HomeWidget.saveWidgetData<String>(
// //       'tw_vendor', vendorName);
// //     await HomeWidget.saveWidgetData<String>(
// //       'tw_menu', menu);
// //     await HomeWidget.saveWidgetData<String>(
// //       'tw_time', timeSlot);
// //     await HomeWidget.saveWidgetData<String>(
// //       'tw_status', label);
// //     await HomeWidget.saveWidgetData<String>(
// //       'tw_status_color', color);

// //     await HomeWidget.updateWidget(
// //       androidName: _androidProvider);

// //     debugPrint(
// //       '[WidgetService] pushed — '
// //       'vendor=$vendorName  status=$label');
// //   }

// //   static (String, String) _resolveStatus(
// //     String raw) {
// //     switch (raw.toLowerCase()
// //       .replaceAll(' ', '_')) {
// //       case 'active':
// //         return ('Active', '#22C55E');
// //       case 'preparing':
// //         return ('Preparing', '#F59E0B');
// //       case 'out_for_delivery':
// //         return ('Out for Delivery', '#3B82F6');
// //       case 'delivered':
// //         return ('Delivered', '#22C55E');
// //       case 'on_leave':
// //       case 'leave':
// //         return ('On Leave', '#9CA3AF');
// //       case 'cancelled':
// //         return ('Cancelled', '#EF4444');
// //       default:
// //         if (raw.isEmpty) 
// //           return ('Active', '#22C55E');
// //         return (raw, '#6B7280');
// //     }
// //   }
// // }

// import 'package:flutter/foundation.dart';
// import 'package:home_widget/home_widget.dart';

// import 'api_service.dart';

// class WidgetService {
//   static const _androidProvider = 'TiffinWidgetProvider';

//   static Future<void> initialize() async {
//     await HomeWidget.setAppGroupId('group.com.mealsetu.mealsetu_app');
//   }

//   /// Fetch the active subscription and push data into the home-screen widget.
//   /// Always writes SOMETHING — never leaves the widget blank.
//   static Future<void> refresh() async {
//     try {
//       final api = ApiService();

//       // Try subscription endpoint — if it fails we still write a fallback
//       Map<String, dynamic>? subMap;
//       List<Map<String, dynamic>> upList = [];

//       try {
//         final results = await Future.wait([
//           api.get('/users/orders/my-subscription'),
//           api.get('/users/orders/upcoming'),
//         ]);
//         final sub      = results[0].data;
//         final upcoming = results[1].data;
//         if (sub is Map) {
//           subMap = Map<String, dynamic>.from(sub);
//         }
//         if (upcoming is List) {
//           upList = upcoming
//               .whereType<Map>()
//               .map((e) => Map<String, dynamic>.from(e))
//               .toList();
//         }
//       } catch (apiErr) {
//         debugPrint('[WidgetService] API error: $apiErr');
//       }

//       if (subMap == null) {
//         await _push(
//           vendorName: 'No active tiffin',
//           menu: 'Subscribe to a plan in MealSetu',
//           status: '',
//         );
//         return;
//       }

//       final vendorName = (subMap['vendorName'] as String?)?.trim().isNotEmpty == true
//           ? subMap['vendorName'] as String
//           : (subMap['name'] as String?)?.trim().isNotEmpty == true
//               ? subMap['name'] as String
//               : 'Your Kitchen';

//       final timings = subMap['timings'] as String? ?? '';

//       // Find today's delivery in upcoming list
//       final todayStr = _todayStr();
//       Map<String, dynamic>? todayOrder;
//       for (final o in upList) {
//         final raw = o['orderDate'] as String? ?? o['date'] as String? ?? '';
//         if (raw.startsWith(todayStr)) {
//           todayOrder = o;
//           break;
//         }
//       }

//       final menu   = _extractMenu(todayOrder);
//       final status = todayOrder != null
//           ? (todayOrder['status'] as String? ?? 'Active')
//           : (subMap['status']   as String? ?? 'Active');

//       await _push(
//         vendorName: vendorName,
//         menu: menu,
//         timeSlot: timings,
//         status: status,
//       );
//     } catch (e) {
//       debugPrint('[WidgetService] refresh error: $e');
//       // Last-resort fallback so widget doesn't stay blank
//       await _push(
//         vendorName: 'MealSetu',
//         menu: 'Open app to see today\'s tiffin',
//         status: '',
//       );
//     }
//   }

//   // ── Helpers ──────────────────────────────────────────────────────────────

//   static String _todayStr() {
//     final t = DateTime.now();
//     return '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
//   }

//   static String _extractMenu(Map<String, dynamic>? order) {
//     if (order == null) return 'Fresh homemade tiffin';
//     final items = order['menuItems'] as List<dynamic>?;
//     if (items != null && items.isNotEmpty) {
//       return items
//           .map((i) => i is Map ? (i['name'] ?? i.toString()) : i.toString())
//           .join(' · ');
//     }
//     final desc = order['menuDescription'] as String?;
//     if (desc != null && desc.isNotEmpty) return desc;
//     return 'Fresh homemade tiffin';
//   }

//   static Future<void> _push({
//     required String vendorName,
//     required String menu,
//     String timeSlot = '',
//     String status   = '',
//   }) async {
//     final (label, color) = _resolveStatus(status);

//     await HomeWidget.saveWidgetData<String>('tw_vendor', vendorName);
//     await HomeWidget.saveWidgetData<String>('tw_menu',   menu);
//     await HomeWidget.saveWidgetData<String>('tw_time',   timeSlot);
//     await HomeWidget.saveWidgetData<String>('tw_status', label);
//     await HomeWidget.saveWidgetData<String>('tw_status_color', color);

//     await HomeWidget.updateWidget(androidName: _androidProvider);
//     debugPrint('[WidgetService] pushed — vendor=$vendorName  status=$label');
//   }

//   static (String, String) _resolveStatus(String raw) {
//     switch (raw.toLowerCase().replaceAll(' ', '_')) {
//       case 'preparing':        return ('Preparing',        '#F59E0B');
//       case 'out_for_delivery': return ('Out for Delivery', '#3B82F6');
//       case 'delivered':        return ('Delivered',        '#22C55E');
//       case 'active':           return ('Active',           '#22C55E');
//       case 'on_leave':
//       case 'leave':            return ('On Leave',         '#9CA3AF');
//       case 'cancelled':        return ('Cancelled',        '#EF4444');
//       default:
//         if (raw.isEmpty)       return ('Active',           '#22C55E');
//         return (raw, '#6B7280');
//     }
//   }
// }

import 'package:flutter/foundation.dart';
import 'package:home_widget/home_widget.dart';

import 'api_service.dart';

class WidgetService {
  static const _androidProvider = 'TiffinWidgetProvider';

  static Future<void> initialize() async {
    await HomeWidget.setAppGroupId('group.com.mealsetu.mealsetu_app');
  }

  /// Fetch the active subscription and push data into the home-screen widget.
  /// Always writes SOMETHING — never leaves the widget blank.
  static Future<void> refresh() async {
    try {
      final api = ApiService();

      // Try subscription endpoint — if it fails we still write a fallback
      Map<String, dynamic>? subMap;
      List<Map<String, dynamic>> upList = [];

      try {
        final results = await Future.wait([
          api.get('/users/orders/my-subscription'),
          api.get('/users/orders/upcoming'),
        ]);
        final sub = results[0].data;
        final upcoming = results[1].data;
        if (sub is Map) {
          subMap = Map<String, dynamic>.from(sub);
        }
        if (upcoming is List) {
          upList = upcoming
              .whereType<Map>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      } catch (apiErr) {
        debugPrint('[WidgetService] API error: $apiErr');
      }

      if (subMap == null) {
        await _push(
          vendorName: 'No active tiffin',
          menu: 'Subscribe to a plan in MealSetu',
          status: '',
        );
        return;
      }

     final vendorName =
          (subMap['vendorName'] as String?)?.trim().isNotEmpty == true
          ? subMap['vendorName'] as String
          : (subMap['kitchenName'] as String?)?.trim().isNotEmpty == true
          ? subMap['kitchenName'] as String
          : (subMap['name'] as String?)?.trim().isNotEmpty == true
          ? subMap['name'] as String
          : 'Your Kitchen';

      // Plan info
      final planType =
          subMap['planType'] as String? ??
          subMap['plan'] as String? ??
          'Active Plan';

      // Dates
      final endDate =
          subMap['endDate'] as String? ?? subMap['end_date'] as String?;
      final daysLeft = endDate != null
          ? DateTime.tryParse(endDate)?.difference(DateTime.now()).inDays
          : null;

      // Status
      final status =
          subMap['status'] as String? ??
          subMap['orderStatus'] as String? ??
          'Active';

      // Menu line — use plan info since
      // menu details not in subscription API
      final menuLine = [
        planType,
        if (daysLeft != null && daysLeft >= 0) '$daysLeft days left',
        if (daysLeft != null && daysLeft < 0) 'Plan expired',
      ].join(' · ');

      // Time slot from vendor or order
      final timings =
          subMap['timings'] as String? ??
          subMap['workingHours'] as String? ??
          subMap['mealSlot'] as String? ??
          subMap['slot'] as String? ??
          '';

      await _push(
        vendorName: vendorName,
        menu: menuLine,
        timeSlot: timings,
        status: status,
      );
    } catch (e) {
      debugPrint('[WidgetService] refresh error: $e');
      // Last-resort fallback so widget doesn't stay blank
      await _push(
        vendorName: 'MealSetu',
        menu: 'Open app to see today\'s tiffin',
        status: '',
      );
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  static String _todayStr() {
    final t = DateTime.now();
    return '${t.year}-${t.month.toString().padLeft(2, '0')}-${t.day.toString().padLeft(2, '0')}';
  }

  static String _extractMenu(Map<String, dynamic>? order) {
    if (order == null) return 'Fresh homemade tiffin';
    final items = order['menuItems'] as List<dynamic>?;
    if (items != null && items.isNotEmpty) {
      return items
          .map((i) => i is Map ? (i['name'] ?? i.toString()) : i.toString())
          .join(' · ');
    }
    final desc = order['menuDescription'] as String?;
    if (desc != null && desc.isNotEmpty) return desc;
    return 'Fresh homemade tiffin';
  }

  static Future<void> _push({
    required String vendorName,
    required String menu,
    String timeSlot = '',
    String status = '',
  }) async {
    final (label, color) = _resolveStatus(status);

    await HomeWidget.saveWidgetData<String>('tw_vendor', vendorName);
    await HomeWidget.saveWidgetData<String>('tw_menu', menu);
    await HomeWidget.saveWidgetData<String>('tw_time', timeSlot);
    await HomeWidget.saveWidgetData<String>('tw_status', label);
    await HomeWidget.saveWidgetData<String>('tw_status_color', color);

    await HomeWidget.updateWidget(androidName: _androidProvider);
    debugPrint('[WidgetService] pushed — vendor=$vendorName  status=$label');
  }

  static (String, String) _resolveStatus(String raw) {
    switch (raw.toLowerCase().replaceAll(' ', '_')) {
      case 'preparing':
        return ('Preparing', '#F59E0B');
      case 'out_for_delivery':
        return ('Out for Delivery', '#3B82F6');
      case 'delivered':
        return ('Delivered', '#22C55E');
      case 'active':
        return ('Active', '#22C55E');
      case 'on_leave':
      case 'leave':
        return ('On Leave', '#9CA3AF');
      case 'cancelled':
        return ('Cancelled', '#EF4444');
      default:
        if (raw.isEmpty) return ('Active', '#22C55E');
        return (raw, '#6B7280');
    }
  }
}
