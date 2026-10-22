window.mealsetuOpenRazorpay = function (
  key,
  orderId,
  amount,
  currency,
  name,
  description,
  email,
  contact,
  color,
  onSuccess,
  onFailure
) {
  if (typeof window.Razorpay !== 'function') {
    onFailure('Razorpay Checkout failed to load. Please try again.');
    return;
  }

  let completed = false;
  const fail = (message) => {
    if (completed) return;
    completed = true;
    onFailure(message);
  };

  const checkout = new window.Razorpay({
    key,
    order_id: orderId,
    amount,
    currency,
    name,
    description,
    prefill: { email, contact },
    theme: { color },
    handler: (response) => {
      if (completed) return;
      completed = true;
      onSuccess(JSON.stringify(response));
    },
    modal: {
      ondismiss: () => fail('Payment was cancelled.'),
    },
  });

  checkout.on('payment.failed', (response) => {
    fail(response?.error?.description || 'Payment failed. Please try again.');
  });

  checkout.open();
};
