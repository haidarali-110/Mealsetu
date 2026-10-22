const fcmService = require('../fcmService');

const backendNotificationExports = [
  'notifyAllUsers',
  'notifyCashPaymentConfirmed',
  'notifyCommissionPaid',
  'notifyDelivered',
  'notifyDeliveryAssigned',
  'notifyDeliveryFailed',
  'notifyFreeMealAdded',
  'notifyLeaveApplied',
  'notifyMealPickedUp',
  'notifyOfferRedeemed',
  'notifyOrderConfirmed',
  'notifyOrderFlagged',
  'notifyOutForDelivery',
  'notifyPlanExpiring',
  'notifyPointsEarned',
  'notifyRiderNewBatch',
  'notifyRiderSalaryPaid',
  'notifySubscriptionExtended',
  'notifyTrialConfirmed',
  'notifyVendorNewOrder',
  'notifyVendorNewReview',
  'notifyVendorPayment',
  'notifyVendorRejected'
];

test.each(backendNotificationExports)('%s is exported as a function', (name) => {
  expect(typeof fcmService[name]).toBe('function');
});
