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
  throw UnsupportedError('Razorpay Checkout.js is only available on web.');
}
