import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../../constants/app_colors.dart';
import '../../providers/auth_provider.dart';

// ─────────────────────────────────────────────────────────────────────────────
// LoginScreen
// ─────────────────────────────────────────────────────────────────────────────

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey           = GlobalKey<FormState>();
  final _emailController    = TextEditingController();
  final _passwordController = TextEditingController();
  bool _obscurePassword = true;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  Future<void> _submit() async {
    FocusScope.of(context).unfocus();
    if (!_formKey.currentState!.validate()) return;

    final auth = context.read<AuthProvider>();
    final success = await auth.login(
      _emailController.text.trim(),
      _passwordController.text,
    );

    if (!mounted) return;
    if (success) { context.go('/home'); return; }

    final raw   = auth.errorMessage ?? '';
    final lower = raw.toLowerCase();

    if (lower.contains('no internet')        ||
        lower.contains('check your network') ||
        lower.contains('timed out')          ||
        lower.contains('connection error')   ||
        lower.contains('failed to connect')) {
      _showError(
        'Cannot connect to server. '
        'Make sure your backend is running on port 5000.',
      );
      return;
    }

    if (lower.contains('verify your email') ||
        lower.contains('email not verified') ||
        lower.contains('verify email')       ||
        lower.contains('not verified')) {
      _showError(
        'Please verify your email. Check your inbox for the OTP.',
      );
      context.push('/verify-otp', extra: {
        'userId':      '',
        'maskedEmail': _emailController.text.trim(),
      });
      return;
    }

    if (lower.contains('invalid email or password') ||
        lower.contains('invalid credentials')       ||
        lower.contains('incorrect password')        ||
        lower.contains('wrong password')) {
      _showError('Incorrect email or password. Please try again.');
      return;
    }

    _showError(raw.isNotEmpty ? raw : 'Login failed. Please try again.');
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(_snackBar(message, color: Colors.red.shade600));
  }

  // ── Forgot password ───────────────────────────────────────────────────────

  Future<void> _showForgotPasswordDialog() async {
    final auth      = context.read<AuthProvider>();
    final messenger = ScaffoldMessenger.of(context);

    final bool? success = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _ForgotPasswordDialog(authProvider: auth),
    );

    if (success == true) {
      messenger
        ..hideCurrentSnackBar()
        ..showSnackBar(_snackBar(
          'Password reset! Please login with your new password.',
          color: AppColors.success,
        ));
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isLoading = context.select<AuthProvider, bool>((a) => a.isLoading);
    final isDark    = Theme.of(context).brightness == Brightness.dark;

    // ── Adaptive colours ────────────────────────────────────────────────────
    final scaffoldBg  = isDark ? const Color(0xFF0D0D1A) : Colors.white;
    final cardBg      = isDark ? const Color(0xFF1A1A2E) : Colors.white;
    final fieldBg     = isDark ? const Color(0xFF252538) : const Color(0xFFF8FAFC);
    final fieldBorder = isDark ? const Color(0xFF3A3A5C) : const Color(0xFFD1D9E0);
    final headingClr  = isDark ? Colors.white            : const Color(0xFF1A1A2E);
    final labelClr    = isDark ? const Color(0xFFCBD5E1) : const Color(0xFF64748B);
    final hintClr     = isDark ? const Color(0xFF4A5568) : const Color(0xFFCBD5E1);
    final iconClr     = isDark ? const Color(0xFF64748B) : const Color(0xFF94A3B8);
    final inputClr    = isDark ? Colors.white            : const Color(0xFF1A1A2E);
    final subtitleClr = const Color(0xFF94A3B8);

    final gradientColors = isDark
        ? const [
            Color(0xFFF26522),
            Color(0xFFD44A0A),
            Color(0xFF1A0800),
            Color(0xFF0D0D1A),
          ]
        : const [
            Color(0xFFF26522),
            Color(0xFFFF8C42),
            Color(0xFFFFF7ED),
            Colors.white,
          ];

    return Scaffold(
      backgroundColor: scaffoldBg,
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: gradientColors,
            stops: const [0.0, 0.15, 0.40, 0.58],
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 48),

                  // ── Logo block ─────────────────────────────────────────────
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.0, end: 1.0),
                    duration: const Duration(milliseconds: 700),
                    curve: Curves.elasticOut,
                    builder: (context, value, child) =>
                        Transform.scale(scale: value, child: child),
                    child: Column(
                      children: [
                        Container(
                          width: 90,
                          height: 90,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            borderRadius: BorderRadius.circular(24),
                            boxShadow: [
                              BoxShadow(
                                color: Colors.black.withValues(alpha: 0.18),
                                blurRadius: 24,
                                offset: const Offset(0, 10),
                              ),
                            ],
                          ),
                          child: ClipRRect(
                            borderRadius: BorderRadius.circular(24),
                            child: Image.asset(
                              'assets/icon/app_icons.jpeg',
                              width: 90,
                              height: 90,
                              fit: BoxFit.cover,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'MealSetu',
                          style: GoogleFonts.poppins(
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            color: Colors.white,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          'Your daily meal, simplified',
                          style: GoogleFonts.poppins(
                            color: Colors.white.withValues(alpha: 0.88),
                            fontSize: 14,
                            fontWeight: FontWeight.w400,
                          ),
                        ),
                      ],
                    ),
                  ),

                  const SizedBox(height: 36),

                  // ── Card form ──────────────────────────────────────────────
                  TweenAnimationBuilder<double>(
                    tween: Tween(begin: 0.0, end: 1.0),
                    duration: const Duration(milliseconds: 550),
                    curve: Curves.easeOut,
                    builder: (context, value, child) => Opacity(
                      opacity: value,
                      child: Transform.translate(
                        offset: Offset(0, 28 * (1 - value)),
                        child: child,
                      ),
                    ),
                    child: Container(
                      width: double.infinity,
                      decoration: BoxDecoration(
                        color: cardBg,
                        borderRadius: BorderRadius.circular(24),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withValues(
                                alpha: isDark ? 0.35 : 0.08),
                            blurRadius: 32,
                            offset: const Offset(0, 8),
                          ),
                        ],
                      ),
                      padding: const EdgeInsets.fromLTRB(24, 24, 24, 28),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          // Card heading
                          Text(
                            'Welcome back ',
                            style: GoogleFonts.poppins(
                              fontSize: 20,
                              fontWeight: FontWeight.w700,
                              color: headingClr,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'Sign in to continue',
                            style: GoogleFonts.poppins(
                              color: subtitleClr,
                              fontSize: 13,
                            ),
                          ),
                          const SizedBox(height: 24),

                          // ── Email field ──────────────────────────────────
                          _fieldLabel('Email Address', labelClr),
                          const SizedBox(height: 6),
                          _fieldContainer(
                            fieldBg: fieldBg,
                            fieldBorder: fieldBorder,
                            child: TextFormField(
                              controller: _emailController,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                              autocorrect: false,
                              style: GoogleFonts.poppins(
                                  fontSize: 14, color: inputClr),
                              decoration: _cardInputDeco(
                                hint: 'your@email.com',
                                prefixIcon: Icons.email_outlined,
                                hintClr: hintClr,
                                iconClr: iconClr,
                              ),
                              validator: (value) {
                                final t = value?.trim() ?? '';
                                if (t.isEmpty) return 'Email is required';
                                if (!RegExp(
                                        r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
                                    .hasMatch(t)) {
                                  return 'Enter a valid email address';
                                }
                                return null;
                              },
                            ),
                          ),

                          const SizedBox(height: 16),

                          // ── Password field ───────────────────────────────
                          _fieldLabel('Password', labelClr),
                          const SizedBox(height: 6),
                          _fieldContainer(
                            fieldBg: fieldBg,
                            fieldBorder: fieldBorder,
                            child: TextFormField(
                              controller: _passwordController,
                              obscureText: _obscurePassword,
                              textInputAction: TextInputAction.done,
                              onFieldSubmitted: (_) => _submit(),
                              style: GoogleFonts.poppins(
                                  fontSize: 14, color: inputClr),
                              decoration: _cardInputDeco(
                                hint: 'Enter your password',
                                prefixIcon: Icons.lock_outline,
                                hintClr: hintClr,
                                iconClr: iconClr,
                                suffixIcon: IconButton(
                                  icon: Icon(
                                    _obscurePassword
                                        ? Icons.visibility_off_outlined
                                        : Icons.visibility_outlined,
                                    color: iconClr,
                                    size: 20,
                                  ),
                                  onPressed: () => setState(
                                    () => _obscurePassword = !_obscurePassword,
                                  ),
                                ),
                              ),
                              validator: (value) {
                                if (value == null || value.isEmpty) {
                                  return 'Password is required';
                                }
                                return null;
                              },
                            ),
                          ),

                          // ── Forgot password ──────────────────────────────
                          Align(
                            alignment: Alignment.centerRight,
                            child: TextButton(
                              onPressed:
                                  isLoading ? null : _showForgotPasswordDialog,
                              style: TextButton.styleFrom(
                                padding: const EdgeInsets.symmetric(
                                    vertical: 4, horizontal: 0),
                              ),
                              child: Text(
                                'Forgot Password?',
                                style: GoogleFonts.poppins(
                                  color: AppColors.primary,
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ),
                          ),

                          const SizedBox(height: 4),

                          // ── Login button ─────────────────────────────────
                          SizedBox(
                            width: double.infinity,
                            height: 52,
                            child: ElevatedButton(
                              onPressed: isLoading ? null : _submit,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: AppColors.primary,
                                foregroundColor: Colors.white,
                                disabledBackgroundColor:
                                    AppColors.primary.withValues(alpha: 0.6),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                elevation: 4,
                                shadowColor:
                                    AppColors.primary.withValues(alpha: 0.4),
                              ),
                              child: isLoading
                                  ? Row(
                                      mainAxisAlignment:
                                          MainAxisAlignment.center,
                                      children: [
                                        const SizedBox(
                                          width: 18,
                                          height: 18,
                                          child: CircularProgressIndicator(
                                            color: Colors.white,
                                            strokeWidth: 2.5,
                                          ),
                                        ),
                                        const SizedBox(width: 10),
                                        Text(
                                          'Signing in...',
                                          style: GoogleFonts.poppins(
                                            color: Colors.white,
                                            fontWeight: FontWeight.w600,
                                            fontSize: 15,
                                          ),
                                        ),
                                      ],
                                    )
                                  : Text(
                                      'Login',
                                      style: GoogleFonts.poppins(
                                        color: Colors.white,
                                        fontSize: 16,
                                        fontWeight: FontWeight.w700,
                                        letterSpacing: 0.5,
                                      ),
                                    ),
                            ),
                          ),

                          const SizedBox(height: 20),

                          // ── Register link ────────────────────────────────
                          Center(
                            child: Row(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  "Don't have an account? ",
                                  style: GoogleFonts.poppins(
                                    color: subtitleClr,
                                    fontSize: 13,
                                  ),
                                ),
                                GestureDetector(
                                  onTap: isLoading
                                      ? null
                                      : () => context.go('/register'),
                                  child: Text(
                                    'Register',
                                    style: GoogleFonts.poppins(
                                      color: AppColors.primary,
                                      fontWeight: FontWeight.w700,
                                      fontSize: 13,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),

                  const SizedBox(height: 40),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  Widget _fieldLabel(String text, Color color) => Text(
        text,
        style: GoogleFonts.poppins(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: color,
          letterSpacing: 0.3,
        ),
      );

  Widget _fieldContainer({
    required Widget child,
    required Color fieldBg,
    required Color fieldBorder,
  }) =>
      Container(
        decoration: BoxDecoration(
          color: fieldBg,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: fieldBorder),
        ),
        child: child,
      );

  InputDecoration _cardInputDeco({
    required String hint,
    required IconData prefixIcon,
    required Color hintClr,
    required Color iconClr,
    Widget? suffixIcon,
  }) =>
      InputDecoration(
        hintText: hint,
        hintStyle: GoogleFonts.poppins(color: hintClr, fontSize: 14),
        prefixIcon: Icon(prefixIcon, color: iconClr, size: 20),
        suffixIcon: suffixIcon,
        border: InputBorder.none,
        enabledBorder: InputBorder.none,
        focusedBorder: InputBorder.none,
        errorBorder: InputBorder.none,
        focusedErrorBorder: InputBorder.none,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      );

  SnackBar _snackBar(String message, {required Color color}) {
    return SnackBar(
      content:
          Text(message, style: const TextStyle(color: AppColors.white)),
      backgroundColor: color,
      behavior: SnackBarBehavior.floating,
      shape:
          RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _ForgotPasswordDialog — 3-step OTP flow
//
// Receives a pre-captured AuthProvider reference so it never needs
// context.read / context.watch — immune to Provider context issues in dialogs.
// ─────────────────────────────────────────────────────────────────────────────

class _ForgotPasswordDialog extends StatefulWidget {
  const _ForgotPasswordDialog({required this.authProvider});
  final AuthProvider authProvider;

  @override
  State<_ForgotPasswordDialog> createState() => _ForgotPasswordDialogState();
}

class _ForgotPasswordDialogState extends State<_ForgotPasswordDialog> {
  int  _step      = 1;
  bool _isLoading = false;
  String? _error;

  // Carried across steps
  String _email = '';

  // Controllers
  final _emailController     = TextEditingController();
  final _otpController       = TextEditingController();
  final _newPwController     = TextEditingController();
  final _confirmPwController = TextEditingController();
  final _formKey = GlobalKey<FormState>();

  bool _obscureNew     = true;
  bool _obscureConfirm = true;

  @override
  void dispose() {
    _emailController.dispose();
    _otpController.dispose();
    _newPwController.dispose();
    _confirmPwController.dispose();
    super.dispose();
  }

  // ── Step actions ──────────────────────────────────────────────────────────

  Future<void> _sendOtp() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _isLoading = true; _error = null; });
    try {
      await widget.authProvider.sendForgotOTP(_emailController.text.trim());
      _email = _emailController.text.trim();
      setState(() { _step = 2; _isLoading = false; });
    } on String catch (msg) {
      setState(() { _error = msg; _isLoading = false; });
    } catch (_) {
      setState(() { _error = 'Something went wrong. Please try again.'; _isLoading = false; });
    }
  }

  Future<void> _verifyOtp() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _isLoading = true; _error = null; });
    try {
      await widget.authProvider.verifyForgotOTP(
          _email, _otpController.text.trim());
      setState(() { _step = 3; _isLoading = false; });
    } on String catch (msg) {
      setState(() { _error = msg; _isLoading = false; });
    } catch (_) {
      setState(() { _error = 'Something went wrong. Please try again.'; _isLoading = false; });
    }
  }

  Future<void> _resetPassword() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() { _isLoading = true; _error = null; });
    try {
      await widget.authProvider.resetPassword(_email, _newPwController.text);
      if (mounted) Navigator.of(context).pop(true);
    } on String catch (msg) {
      setState(() { _error = msg; _isLoading = false; });
    } catch (_) {
      setState(() { _error = 'Something went wrong. Please try again.'; _isLoading = false; });
    }
  }

  void _onAction() {
    switch (_step) {
      case 1: _sendOtp();
      case 2: _verifyOtp();
      case 3: _resetPassword();
    }
  }

  void _onBack() {
    if (_step > 1) {
      setState(() { _step -= 1; _error = null; });
    } else {
      Navigator.of(context).pop(false);
    }
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      titlePadding:   const EdgeInsets.fromLTRB(24, 24, 24, 0),
      contentPadding: const EdgeInsets.fromLTRB(24, 12, 24, 0),
      actionsPadding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: List.generate(3, (i) {
              final filled = i + 1 <= _step;
              return Expanded(
                child: Container(
                  height: 4,
                  margin: EdgeInsets.only(right: i < 2 ? 6 : 0),
                  decoration: BoxDecoration(
                    color: filled ? AppColors.primary : AppColors.cardBorder,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              );
            }),
          ),
          const SizedBox(height: 12),
          Text(
            switch (_step) {
              1 => 'Forgot Password',
              2 => 'Enter OTP',
              _ => 'New Password',
            },
            style: GoogleFonts.poppins(
              fontWeight: FontWeight.w700,
              fontSize: 18,
              color: AppColors.textDark,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            switch (_step) {
              1 => "We'll send a 6-digit OTP to your email.",
              2 => 'OTP sent to $_email',
              _ => 'Choose a strong password for your account.',
            },
            style: GoogleFonts.poppins(fontSize: 12, color: AppColors.textGrey),
          ),
        ],
      ),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 4),
            _buildStepContent(),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.error_outline, color: Colors.red, size: 16),
                  const SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      _error!,
                      style: GoogleFonts.poppins(
                        fontSize: 12,
                        color: Colors.red.shade700,
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _isLoading ? null : _onBack,
          child: Text(
            _step == 1 ? 'Cancel' : 'Back',
            style: GoogleFonts.poppins(
              color: AppColors.textGrey,
              fontWeight: FontWeight.w500,
            ),
          ),
        ),
        ElevatedButton(
          onPressed: _isLoading ? null : _onAction,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: AppColors.white,
            disabledBackgroundColor: AppColors.primary.withAlpha(153),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(10),
            ),
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
          ),
          child: _isLoading
              ? const SizedBox(
                  width: 18,
                  height: 18,
                  child: CircularProgressIndicator(
                      color: AppColors.white, strokeWidth: 2),
                )
              : Text(
                  switch (_step) {
                    1 => 'Send OTP',
                    2 => 'Verify OTP',
                    _ => 'Reset Password',
                  },
                  style: GoogleFonts.poppins(
                      fontSize: 13, fontWeight: FontWeight.w600),
                ),
        ),
      ],
    );
  }

  // ── Step content ──────────────────────────────────────────────────────────

  Widget _buildStepContent() {
    return switch (_step) {
      1 => _buildStep1(),
      2 => _buildStep2(),
      _ => _buildStep3(),
    };
  }

  Widget _buildStep1() => TextFormField(
        controller: _emailController,
        keyboardType: TextInputType.emailAddress,
        textInputAction: TextInputAction.done,
        autofocus: true,
        onFieldSubmitted: (_) => _sendOtp(),
        style: GoogleFonts.poppins(color: AppColors.textDark, fontSize: 14),
        decoration: _dialogDeco(hint: 'Email address'),
        validator: (value) {
          final t = value?.trim() ?? '';
          if (t.isEmpty) return 'Email is required';
          if (!RegExp(r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$')
              .hasMatch(t)) {
            return 'Enter a valid email address';
          }
          return null;
        },
      );

  Widget _buildStep2() => TextFormField(
        controller: _otpController,
        keyboardType: TextInputType.number,
        textInputAction: TextInputAction.done,
        textAlign: TextAlign.center,
        autofocus: true,
        onFieldSubmitted: (_) => _verifyOtp(),
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(6),
        ],
        style: GoogleFonts.poppins(
          color: AppColors.textDark,
          fontSize: 24,
          fontWeight: FontWeight.w700,
          letterSpacing: 12,
        ),
        decoration: _dialogDeco(hint: '— — — — — —'),
        validator: (value) {
          final t = value?.trim() ?? '';
          if (t.isEmpty) return 'OTP is required';
          if (t.length != 6) return 'Enter the full 6-digit OTP';
          return null;
        },
      );

  Widget _buildStep3() {
    const hint =
        'Min 8 chars · Uppercase · Lowercase · Number · Special (@#!%^&*()-_)';
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        TextFormField(
          controller: _newPwController,
          obscureText: _obscureNew,
          textInputAction: TextInputAction.next,
          autofocus: true,
          style: GoogleFonts.poppins(color: AppColors.textDark, fontSize: 14),
          decoration: _dialogDeco(
            hint: 'New password',
            suffix: _eyeIcon(
              obscure: _obscureNew,
              onTap: () => setState(() => _obscureNew = !_obscureNew),
            ),
          ),
          validator: _passwordValidator,
        ),
        const SizedBox(height: 6),
        Text(
          hint,
          style: GoogleFonts.poppins(
            fontSize: 11,
            color: AppColors.textGrey,
            height: 1.5,
          ),
        ),
        const SizedBox(height: 12),
        TextFormField(
          controller: _confirmPwController,
          obscureText: _obscureConfirm,
          textInputAction: TextInputAction.done,
          onFieldSubmitted: (_) => _resetPassword(),
          style: GoogleFonts.poppins(color: AppColors.textDark, fontSize: 14),
          decoration: _dialogDeco(
            hint: 'Confirm new password',
            suffix: _eyeIcon(
              obscure: _obscureConfirm,
              onTap: () => setState(() => _obscureConfirm = !_obscureConfirm),
            ),
          ),
          validator: (value) {
            if (value == null || value.isEmpty) {
              return 'Please confirm your password';
            }
            if (value != _newPwController.text) return 'Passwords do not match';
            return null;
          },
        ),
      ],
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  String? _passwordValidator(String? value) {
    if (value == null || value.isEmpty) return 'Password is required';
    if (value.length < 8) return 'Minimum 8 characters required';
    if (!RegExp(r'[A-Z]').hasMatch(value)) {
      return 'Must contain at least one uppercase letter';
    }
    if (!RegExp(r'[a-z]').hasMatch(value)) {
      return 'Must contain at least one lowercase letter';
    }
    if (!RegExp(r'\d').hasMatch(value)) {
      return 'Must contain at least one number';
    }
    if (!RegExp(r'[@#!%^&*()\-_]').hasMatch(value)) {
      return 'Must contain a special character (@#!%^&*()-_)';
    }
    return null;
  }

  InputDecoration _dialogDeco({required String hint, Widget? suffix}) {
    return InputDecoration(
      hintText: hint,
      hintStyle: GoogleFonts.poppins(color: AppColors.textGrey, fontSize: 14),
      suffixIcon: suffix,
      isDense: true,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.cardBorder),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.cardBorder),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.primary, width: 1.8),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.red.shade400),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: BorderSide(color: Colors.red.shade400, width: 1.8),
      ),
    );
  }

  Widget _eyeIcon({required bool obscure, required VoidCallback onTap}) {
    return IconButton(
      icon: Icon(
        obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
        color: AppColors.textGrey,
        size: 20,
      ),
      onPressed: onTap,
    );
  }
}
