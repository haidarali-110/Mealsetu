import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';

import '../../constants/app_colors.dart';
import '../../providers/auth_provider.dart';

class VerifyOtpScreen extends StatefulWidget {
  const VerifyOtpScreen({
    required this.userId,
    required this.maskedEmail,
    super.key,
  });

  final String userId;
  final String maskedEmail;

  @override
  State<VerifyOtpScreen> createState() => _VerifyOtpScreenState();
}

class _VerifyOtpScreenState extends State<VerifyOtpScreen> {
  // ── OTP box state ─────────────────────────────────────────────────────────

  static const int _otpLength = 6;

  final List<TextEditingController> _controllers =
      List.generate(_otpLength, (_) => TextEditingController());
  final List<FocusNode> _focusNodes =
      List.generate(_otpLength, (_) => FocusNode());

  bool _isVerifying  = false;
  bool _isResending  = false;
  String? _errorMessage;

  String get _otp => _controllers.map((c) => c.text).join();

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();
    // Detect backspace on an already-empty box and move focus back.
    for (int i = 0; i < _otpLength; i++) {
      _focusNodes[i].onKeyEvent = (_, event) {
        if (event is KeyDownEvent &&
            event.logicalKey == LogicalKeyboardKey.backspace &&
            _controllers[i].text.isEmpty &&
            i > 0) {
          _focusNodes[i - 1].requestFocus();
          return KeyEventResult.handled;
        }
        return KeyEventResult.ignored;
      };
    }
  }

  @override
  void dispose() {
    for (final c in _controllers) { c.dispose(); }
    for (final f in _focusNodes)  { f.dispose(); }
    super.dispose();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  Future<void> _verify() async {
    final otp = _otp;
    if (otp.length != _otpLength) {
      setState(() => _errorMessage = 'Please enter all 6 digits.');
      return;
    }

    setState(() { _isVerifying = true; _errorMessage = null; });

    final auth    = context.read<AuthProvider>();
    final success = await auth.verifyRegisterOTP(otp);

    if (!mounted) return;

    if (success) {
      context.go('/home');
    } else {
      setState(() {
        _isVerifying  = false;
        _errorMessage = auth.errorMessage ?? 'Invalid OTP. Please try again.';
      });
      // Clear boxes so user can re-enter cleanly.
      for (final c in _controllers) { c.clear(); }
      _focusNodes[0].requestFocus();
    }
  }

  Future<void> _resend() async {
    setState(() { _isResending = true; _errorMessage = null; });

    final auth    = context.read<AuthProvider>();
    final success = await auth.resendRegisterOTP();

    if (!mounted) return;

    setState(() => _isResending = false);

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(
        content: Text(
          success
              ? 'OTP resent! Check your email.'
              : (auth.errorMessage ?? 'Failed to resend OTP.'),
          style: const TextStyle(color: AppColors.white),
        ),
        backgroundColor: success ? AppColors.success : Colors.red.shade600,
        behavior: SnackBarBehavior.floating,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ));
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.white,
      appBar: AppBar(
        backgroundColor: AppColors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios_new_rounded,
              color: AppColors.textDark, size: 20),
          onPressed: () => context.pop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 16),

              // ── Icon ────────────────────────────────────────────────────
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.primary.withAlpha(26), // ~10 %
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.mark_email_read_outlined,
                  color: AppColors.primary,
                  size: 36,
                ),
              ),
              const SizedBox(height: 24),

              // ── Title ───────────────────────────────────────────────────
              Text(
                'Verify Your Email',
                style: GoogleFonts.poppins(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  color: AppColors.textDark,
                ),
              ),
              const SizedBox(height: 8),

              // ── Subtitle ────────────────────────────────────────────────
              RichText(
                text: TextSpan(
                  style: GoogleFonts.poppins(
                      fontSize: 14, color: AppColors.textGrey),
                  children: [
                    const TextSpan(text: 'OTP sent to '),
                    TextSpan(
                      text: widget.maskedEmail,
                      style: GoogleFonts.poppins(
                        fontWeight: FontWeight.w600,
                        color: AppColors.textDark,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 40),

              // ── OTP boxes ───────────────────────────────────────────────
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: List.generate(
                  _otpLength,
                  (i) => _OtpBox(
                    controller: _controllers[i],
                    focusNode: _focusNodes[i],
                    hasError: _errorMessage != null,
                    onChanged: (value) {
                      setState(() => _errorMessage = null);
                      if (value.isNotEmpty && i < _otpLength - 1) {
                        _focusNodes[i + 1].requestFocus();
                      } else if (value.isEmpty && i > 0) {
                        _focusNodes[i - 1].requestFocus();
                      }
                      // Auto-submit when last box is filled.
                      if (i == _otpLength - 1 && value.isNotEmpty) {
                        _verify();
                      }
                    },
                  ),
                ),
              ),

              // ── Inline error ─────────────────────────────────────────────
              if (_errorMessage != null) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Icon(Icons.error_outline,
                        color: Colors.red, size: 16),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(
                        _errorMessage!,
                        style: GoogleFonts.poppins(
                          fontSize: 12,
                          color: Colors.red.shade700,
                        ),
                      ),
                    ),
                  ],
                ),
              ],

              const SizedBox(height: 36),

              // ── Verify button ────────────────────────────────────────────
              SizedBox(
                height: 50,
                child: ElevatedButton(
                  onPressed: _isVerifying ? null : _verify,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    foregroundColor: AppColors.white,
                    disabledBackgroundColor: AppColors.primary.withAlpha(153),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(12),
                    ),
                    elevation: 0,
                  ),
                  child: _isVerifying
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            color: AppColors.white,
                            strokeWidth: 2.5,
                          ),
                        )
                      : Text(
                          'Verify',
                          style: GoogleFonts.poppins(
                            fontSize: 16,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                ),
              ),
              const SizedBox(height: 20),

              // ── Resend OTP ───────────────────────────────────────────────
              Center(
                child: TextButton(
                  onPressed: (_isVerifying || _isResending) ? null : _resend,
                  child: _isResending
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            color: AppColors.primary,
                            strokeWidth: 2,
                          ),
                        )
                      : Text.rich(
                          TextSpan(
                            style: GoogleFonts.poppins(fontSize: 14),
                            children: [
                              TextSpan(
                                text: "Didn't receive OTP? ",
                                style: TextStyle(color: AppColors.textGrey),
                              ),
                              TextSpan(
                                text: 'Resend OTP',
                                style: TextStyle(
                                  color: AppColors.primary,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            ],
                          ),
                        ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _OtpBox — single digit input cell
// ─────────────────────────────────────────────────────────────────────────────

class _OtpBox extends StatelessWidget {
  const _OtpBox({
    required this.controller,
    required this.focusNode,
    required this.onChanged,
    required this.hasError,
  });

  final TextEditingController controller;
  final FocusNode             focusNode;
  final ValueChanged<String>  onChanged;
  final bool                  hasError;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 46,
      height: 56,
      child: TextField(
        controller: controller,
        focusNode: focusNode,
        textAlign: TextAlign.center,
        keyboardType: TextInputType.number,
        inputFormatters: [
          FilteringTextInputFormatter.digitsOnly,
          LengthLimitingTextInputFormatter(1),
        ],
        style: GoogleFonts.poppins(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          color: AppColors.textDark,
        ),
        decoration: InputDecoration(
          counterText: '',
          contentPadding: EdgeInsets.zero,
          filled: true,
          fillColor: hasError
              ? Colors.red.shade50
              : AppColors.background,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.cardBorder),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(
              color: hasError ? Colors.red.shade300 : AppColors.cardBorder,
            ),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(
              color: hasError ? Colors.red.shade400 : AppColors.primary,
              width: 2,
            ),
          ),
        ),
        onChanged: onChanged,
      ),
    );
  }
}
