import 'dart:async';
import 'dart:convert';
import 'dart:js_interop';

@JS('mealsetuOpenRazorpay')
external void _openRazorpay(
  JSString keyId,
  JSString orderId,
  JSNumber amount,
  JSString currency,
  JSString name,
  JSString description,
  JSString email,
  JSString contact,
  JSString color,
  JSFunction onSuccess,
  JSFunction onFailure,
);

Future<Map<String, String>> openRazorpayCheckout({
  required String keyId,
  required String orderId,
  required int amount,
  required String description,
  String currency = 'INR',
  String name = 'MealSetu',
  String email = '',
  String contact = '',
  String color = '#F26522',
}) {
  final completer = Completer<Map<String, String>>();

  final onSuccess = (JSString responseJson) {
    if (completer.isCompleted) return;
    try {
      final response = jsonDecode(responseJson.toDart) as Map<String, dynamic>;
      completer.complete({
        'razorpay_payment_id': response['razorpay_payment_id']?.toString() ?? '',
        'razorpay_order_id': response['razorpay_order_id']?.toString() ?? '',
        'razorpay_signature': response['razorpay_signature']?.toString() ?? '',
      });
    } catch (error) {
      completer.completeError(
        FormatException('Invalid Razorpay payment response: $error'),
      );
    }
  }.toJS;

  final onFailure = (JSString message) {
    if (!completer.isCompleted) {
      completer.completeError(Exception(message.toDart));
    }
  }.toJS;

  _openRazorpay(
    keyId.toJS,
    orderId.toJS,
    amount.toJS,
    currency.toJS,
    name.toJS,
    description.toJS,
    email.toJS,
    contact.toJS,
    color.toJS,
    onSuccess,
    onFailure,
  );

  return completer.future;
}
