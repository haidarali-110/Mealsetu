import { createRazorpayOrder, verifyUserPayment } from '../../utils/api';

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export { loadRazorpayScript };

export const initiateRazorpayPayment = async ({
  amount,
  vendorId,
  plan,
  mealPreference,
  deliverySlot,
  userName,
  userEmail,
  userPhone,
  onSuccess,
  onFailure
}) => {
  try {
    const loaded = await loadRazorpayScript();
    if (!loaded) {
      onFailure('Could not load payment gateway. Check internet connection.');
      return;
    }

    const orderData = await createRazorpayOrder({ amount, vendorId, plan, mealPreference });

    const options = {
      key:         orderData.keyId,
      amount:      orderData.amount,
      currency:    orderData.currency,
      name:        'MealSetu',
      description: `${plan} Tiffin Subscription`,
      order_id:    orderData.orderId,
    prefill: {
  name: userName || '',
  email: userEmail || '',
  contact: userPhone?.replace(/\D/g, '').slice(-10) || '9999999999'
},

theme: { color: '#f26522' },


      modal: {
        ondismiss: () => onFailure('Payment cancelled by user.')
      },
      handler: async (response) => {
        let result;
        try {
          result = await verifyUserPayment({
            razorpay_order_id:   response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature:  response.razorpay_signature,
            vendorId,
            plan,
            amount,
            mealPreference,
            deliverySlot
          });
        } catch (err) {
          onFailure(
            err.message || 'Payment verification failed. Contact support with ID: ' +
            response.razorpay_payment_id
          );
          return;
        }

        try {
          await onSuccess(result);
        } catch (uiError) {
          console.error('Payment succeeded but success UI callback failed:', uiError);
          window.alert('Payment succeeded and your order was saved, but the page could not update. Refresh to see your order.');
        }
      }
    };

    const rzp = new window.Razorpay(options);
    rzp.on('payment.failed', (response) => {
      onFailure(`Payment failed: ${response.error.description}`);
    });
    rzp.open();

  } catch (error) {
    onFailure(error.message || 'Payment initiation failed');
  }
};
