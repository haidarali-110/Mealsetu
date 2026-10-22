# mealsetu_app

A new Flutter project.

## Getting Started

This project is a starting point for a Flutter application.

A few resources to get you started if this is your first Flutter project:

- [Learn Flutter](https://docs.flutter.dev/get-started/learn-flutter)
- [Write your first Flutter app](https://docs.flutter.dev/get-started/codelab)
- [Flutter learning resources](https://docs.flutter.dev/reference/learning-resources)

## AI chat configuration

The AI chat uses an OpenRouter API key supplied at build/run time:

```powershell
flutter run -d chrome --dart-define=OPENROUTER_API_KEY=your_key
```

Do not commit the key. Values embedded in a Flutter web build are visible to
users, so production deployments should call OpenRouter through a secured
backend instead of bundling the key in the web app.

## Payments

Cash and online payment options are available for subscription plans on both
mobile and web. Web checkout uses Razorpay Checkout.js from Razorpay's CDN;
the backend must be configured with valid Razorpay credentials.

For help getting started with Flutter development, view the
[online documentation](https://docs.flutter.dev/), which offers tutorials,
samples, guidance on mobile development, and a full API reference.
