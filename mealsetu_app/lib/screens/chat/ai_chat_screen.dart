import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';

import '../../constants/app_colors.dart';
import '../../services/api_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Model
// ─────────────────────────────────────────────────────────────────────────────

class ChatMessage {
  final String text;
  final bool isUser;
  final DateTime timestamp;
  final bool isLoading;

  const ChatMessage({
    required this.text,
    required this.isUser,
    required this.timestamp,
    this.isLoading = false,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

class AiChatScreen extends StatefulWidget {
  const AiChatScreen({super.key});

  @override
  State<AiChatScreen> createState() => _AiChatScreenState();
}

class _AiChatScreenState extends State<AiChatScreen>
    with TickerProviderStateMixin {
  // ── Constants ──────────────────────────────────────────────────────────────

  static const _openRouterUrl =
      'https://openrouter.ai/api/v1/chat/completions';
  static const _apiKey = String.fromEnvironment('OPENROUTER_API_KEY');

  // Any model id from https://openrouter.ai/models works here.
  // This one is a close equivalent to what Groq was serving.
  static const _model = 'meta-llama/llama-3.3-70b-instruct';

  static const _aiLogo = 'assets/icon/ai_logo.png';

  static const _suggestions = [
    '📋 My subscription status',
    '🍃 How to pause my plan?',
    '🥗 Healthy meal tips',
    '📅 When does my plan end?',
    '💰 Extend subscription',
  ];

  // ── Services ───────────────────────────────────────────────────────────────

  final _api = ApiService();

  // ── Persistent session cache ───────────────────────────────────────────────

  static final List<ChatMessage> _chatHistory = [];
  static String _cachedSystemPrompt = '';
  static bool _dataLoaded = false;

  // ── State ──────────────────────────────────────────────────────────────────

  final List<ChatMessage> _messages = [];

  bool _isLoadingData = true;
  bool _isTyping = false;
  bool _showSuggestions = true;

  String _systemPrompt = '';
  String _dataError = '';

  // ── Controllers ────────────────────────────────────────────────────────────

  final _textCtrl = TextEditingController();
  final _scrollCtrl = ScrollController();

  late final AnimationController _dotCtrl;

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  @override
  void initState() {
    super.initState();

    _dotCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    )..repeat();

    if (_dataLoaded) {
      _messages.addAll(_chatHistory);

      _systemPrompt = _cachedSystemPrompt;
      _isLoadingData = false;
      _showSuggestions = false;
    } else {
      _fetchContextAndInit();
    }
  }

  @override
  void dispose() {
    _dotCtrl.dispose();
    _textCtrl.dispose();
    _scrollCtrl.dispose();
    super.dispose();
  }

  // ── Data fetching ──────────────────────────────────────────────────────────

  Future<void> _fetchContextAndInit() async {
    try {
      final results = await Future.wait([
        _api.get('/users/me'),
        _api.get('/users/orders/my-subscription'),
        _api.get('/users/orders/upcoming'),
      ]);

      final user = results[0].data as Map<String, dynamic>? ?? {};

      final sub = results[1].data as Map<String, dynamic>?;

      final upcoming = (results[2].data as List<dynamic>? ?? [])
          .map((e) => Map<String, dynamic>.from(e as Map))
          .toList();

      _systemPrompt = _buildSystemPrompt(user, sub, upcoming);
    } catch (_) {
      _systemPrompt = _buildSystemPrompt({}, null, []);

      _dataError =
          'Could not load your subscription data. '
          'I can still answer general questions!';
    }

    if (!mounted) return;

    setState(() {
      _isLoadingData = false;
    });

    _cachedSystemPrompt = _systemPrompt;
    _dataLoaded = true;

    _addAiMessage(
      _dataError.isNotEmpty
          ? 'Hi! I\'m MealSetu AI 🤖\n$_dataError'
          : 'Hi! I\'m MealSetu AI 🤖\n'
                'I\'ve loaded your subscription details. '
                'Ask me anything about your meals, nutrition, '
                'or how to manage your plan!',
    );
  }

  String _buildSystemPrompt(
    Map<String, dynamic> user,
    Map<String, dynamic>? sub,
    List<Map<String, dynamic>> upcoming,
  ) {
    final name = user['name'] as String? ?? 'User';

    final pincode = user['pincode'] as String? ?? 'Unknown';

    String subSection;

    if (sub != null) {
      final endRaw = sub['endDate'] as String?;

      final endFmt = endRaw != null
          ? DateFormat('d MMM yyyy').format(DateTime.parse(endRaw).toLocal())
          : 'N/A';

      subSection =
          '''
- Plan: ${sub['planType'] ?? 'N/A'}
- Kitchen: ${sub['vendorName'] ?? 'N/A'}
- Valid Until: $endFmt
- Status: Active
- Leaves Used: ${sub['leavesUsed'] ?? 0}/${sub['leavesAllowed'] ?? 2}''';
    } else {
      subSection = '- No active subscription';
    }

    final upcomingLines = upcoming.isEmpty
        ? '- No upcoming plans'
        : upcoming
              .map((p) {
                final startRaw = p['scheduledStartDate'] as String?;

                final startFmt = startRaw != null
                    ? DateFormat(
                        'd MMM yyyy',
                      ).format(DateTime.parse(startRaw).toLocal())
                    : 'N/A';

                return '- ${p['planType'] ?? ''} from '
                    '${p['vendorName'] ?? ''} starting $startFmt';
              })
              .join('\n');

    return '''
You are MealSetu AI Assistant, a helpful chatbot for the MealSetu meal subscription app.
You help users with their meal subscriptions, food queries, and nutrition advice.

USER INFORMATION:
- Name: $name
- Location Pincode: $pincode

CURRENT SUBSCRIPTION:
$subSection

UPCOMING PLANS:
$upcomingLines

You can answer questions about:
1. Their current meal plan and subscription details
2. How to pause/extend their subscription
3. Nutrition and healthy eating advice
4. Meal recommendations based on their preferences
5. How MealSetu works
6. General food and cooking questions

Keep responses concise (2-3 sentences max unless a detailed explanation is needed).
Be friendly and helpful. Use ₹ for Indian rupees.
If asked about something outside your knowledge, say so politely.
Do NOT make up subscription details that aren't provided above.
''';
  }

  // ── Messaging ──────────────────────────────────────────────────────────────

  void _addAiMessage(String text) {
    if (!mounted) return;

    setState(() {
      _messages.add(
        ChatMessage(text: text, isUser: false, timestamp: DateTime.now()),
      );

      _chatHistory
        ..clear()
        ..addAll(_messages);
    });

    _scrollToBottom();
  }

  Future<void> _handleSend([String? overrideText]) async {
    final text = (overrideText ?? _textCtrl.text).trim();

    if (text.isEmpty || _isTyping) return;

    _textCtrl.clear();

    setState(() {
      _showSuggestions = false;
      _isTyping = true;

      _messages.add(
        ChatMessage(text: text, isUser: true, timestamp: DateTime.now()),
      );

      _chatHistory
        ..clear()
        ..addAll(_messages);

      _messages.add(
        ChatMessage(
          text: '',
          isUser: false,
          timestamp: DateTime.now(),
          isLoading: true,
        ),
      );
    });

    _scrollToBottom();

    String reply;

    try {
      reply = await _callOpenRouter(text);
    } catch (e) {
      reply =
          'Sorry, I couldn\'t get a response. '
          'Error: ${e.toString().replaceFirst('Exception: ', '')}';
    }

    if (!mounted) return;

    setState(() {
      _messages.removeWhere((m) => m.isLoading);

      _messages.add(
        ChatMessage(text: reply, isUser: false, timestamp: DateTime.now()),
      );

      _isTyping = false;

      _chatHistory
        ..clear()
        ..addAll(_messages);
    });

    _scrollToBottom();
  }

  Future<String> _callOpenRouter(String userMessage) async {
    if (_apiKey.isEmpty) {
      throw Exception(
        'OpenRouter API key is not configured. '
        'Run Flutter with --dart-define=OPENROUTER_API_KEY=your_key.',
      );
    }

    final history = _messages.where((m) => !m.isLoading).toList();

    final recent = history.length > 10
        ? history.sublist(history.length - 10)
        : history;

    final messages = [
      {'role': 'system', 'content': _systemPrompt},
      ...recent.map(
        (m) => {'role': m.isUser ? 'user' : 'assistant', 'content': m.text},
      ),
      {'role': 'user', 'content': userMessage},
    ];

    final body = jsonEncode({
      'model': _model,
      'messages': messages,
      'max_tokens': 500,
      'temperature': 0.7,
    });

    final response = await http
        .post(
          Uri.parse(_openRouterUrl),
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer $_apiKey',
            // OpenRouter recommends these two so your app shows up
            // correctly on their dashboard/rankings — safe to leave as-is.
            'HTTP-Referer': 'https://mealsetu.app',
            'X-Title': 'MealSetu AI',
          },
          body: body,
        )
        .timeout(const Duration(seconds: 20));

    if (response.statusCode == 200) {
      final data = jsonDecode(response.body) as Map<String, dynamic>;

      return (data['choices'] as List)[0]['message']['content'] as String;
    }

    String errMsg;

    try {
      final errData = jsonDecode(response.body) as Map<String, dynamic>;

      errMsg =
          (errData['error'] as Map?)?['message'] as String? ?? response.body;
    } catch (_) {
      errMsg = response.body;
    }

    throw Exception('${response.statusCode} – $errMsg');
  }

  // ── Scroll ─────────────────────────────────────────────────────────────────

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollCtrl.hasClients) {
        _scrollCtrl.animateTo(
          _scrollCtrl.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  // ── Main build ─────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: _buildAppBar(),
      body: _isLoadingData ? _buildDataLoader() : _buildChat(),
    );
  }

  // ── App Bar ────────────────────────────────────────────────────────────────

  AppBar _buildAppBar() {
    final cs = Theme.of(context).colorScheme;

    return AppBar(
      elevation: 0,

      leading: IconButton(
        icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
        onPressed: () => Navigator.of(context).pop(),
      ),

      title: Row(
        children: [
          // AI LOGO — no extra orange box
          Image.asset(_aiLogo, width: 36, height: 36, fit: BoxFit.contain),

          const SizedBox(width: 10),

          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'MealSetu AI',
                style: GoogleFonts.poppins(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: cs.onSurface,
                ),
              ),

              Text(
                'Powered by OpenRouter · Llama 3.3',
                style: GoogleFonts.poppins(
                  fontSize: 11,
                  color: cs.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Data loader ────────────────────────────────────────────────────────────

  Widget _buildDataLoader() {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: AppColors.primary),

          const SizedBox(height: 16),

          Text(
            'Loading your subscription data…',
            style: GoogleFonts.poppins(
              fontSize: 13,
              color: Theme.of(context).colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  Widget _buildChat() {
    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            controller: _scrollCtrl,
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
            itemCount: _messages.length,
            itemBuilder: (_, i) => _buildBubble(_messages[i]),
          ),
        ),

        if (_showSuggestions) _buildSuggestions(),

        _buildInput(),
      ],
    );
  }

  // ── Message bubble ─────────────────────────────────────────────────────────

  Widget _buildBubble(ChatMessage msg) {
    if (msg.isLoading) {
      return _buildTypingIndicator();
    }

    final isUser = msg.isUser;

    return Padding(
      padding: const EdgeInsets.only(bottom: 12),

      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,

        mainAxisAlignment: isUser
            ? MainAxisAlignment.end
            : MainAxisAlignment.start,

        children: [
          // ─────────────────────────────────────
          // AI LOGO
          // ─────────────────────────────────────
          if (!isUser)
            Container(
              width: 32,
              height: 32,
              margin: const EdgeInsets.only(right: 8),
              child: Image.asset(
                _aiLogo,
                width: 32,
                height: 32,
                fit: BoxFit.contain,
              ),
            ),

          // ─────────────────────────────────────
          // MESSAGE BUBBLE
          // ─────────────────────────────────────
          Flexible(
            child: Column(
              crossAxisAlignment: isUser
                  ? CrossAxisAlignment.end
                  : CrossAxisAlignment.start,

              children: [
                Container(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 14,
                    vertical: 10,
                  ),

                  decoration: BoxDecoration(
                    color: isUser
                        ? AppColors.primary
                        : Theme.of(context).colorScheme.surface,

                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(18),
                      topRight: const Radius.circular(18),
                      bottomLeft: Radius.circular(isUser ? 18 : 4),
                      bottomRight: Radius.circular(isUser ? 4 : 18),
                    ),

                    border: isUser
                        ? null
                        : Border.all(
                            color: Theme.of(context).colorScheme.outlineVariant,
                          ),

                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withAlpha(8),
                        blurRadius: 6,
                        offset: const Offset(0, 2),
                      ),
                    ],
                  ),

                  child: Text(
                    msg.text,
                    style: GoogleFonts.poppins(
                      fontSize: 13.5,
                      height: 1.45,
                      color: isUser
                          ? Colors.white
                          : Theme.of(context).colorScheme.onSurface,
                    ),
                  ),
                ),

                const SizedBox(height: 4),

                Text(
                  DateFormat('HH:mm').format(msg.timestamp),

                  style: GoogleFonts.poppins(
                    fontSize: 10,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),

          if (isUser) const SizedBox(width: 4),
        ],
      ),
    );
  }

  // ── Typing indicator ───────────────────────────────────────────────────────

  Widget _buildTypingIndicator() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),

      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,

        children: [
          // AI LOGO
          Container(
            width: 32,
            height: 32,
            margin: const EdgeInsets.only(right: 8),
            child: Image.asset(
              _aiLogo,
              width: 32,
              height: 32,
              fit: BoxFit.contain,
            ),
          ),

          // Typing dots
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),

            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.surface,

              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(18),
                topRight: Radius.circular(18),
                bottomRight: Radius.circular(18),
                bottomLeft: Radius.circular(4),
              ),

              border: Border.all(
                color: Theme.of(context).colorScheme.outlineVariant,
              ),
            ),

            child: Row(
              mainAxisSize: MainAxisSize.min,

              children: List.generate(3, (i) {
                return AnimatedBuilder(
                  animation: _dotCtrl,

                  builder: (_, _) {
                    final offset = i * 0.25;

                    final progress = ((_dotCtrl.value + offset) % 1.0);

                    final dy = progress < 0.5
                        ? -4.0 * (progress / 0.5)
                        : -4.0 * (1.0 - (progress - 0.5) / 0.5);

                    return Transform.translate(
                      offset: Offset(0, dy),

                      child: Container(
                        width: 7,
                        height: 7,

                        margin: EdgeInsets.only(right: i < 2 ? 5.0 : 0.0),

                        decoration: BoxDecoration(
                          color: AppColors.primary.withAlpha(180),

                          shape: BoxShape.circle,
                        ),
                      ),
                    );
                  },
                );
              }),
            ),
          ),
        ],
      ),
    );
  }

  // ── Suggestions ────────────────────────────────────────────────────────────

  Widget _buildSuggestions() {
    return Container(
      height: 44,
      color: Colors.transparent,
      margin: const EdgeInsets.only(bottom: 4),

      child: ListView.separated(
        scrollDirection: Axis.horizontal,

        padding: const EdgeInsets.symmetric(horizontal: 16),

        itemCount: _suggestions.length,

        separatorBuilder: (_, _) => const SizedBox(width: 8),

        itemBuilder: (_, i) {
          final label = _suggestions[i];

          return GestureDetector(
            onTap: () => _handleSend(label.replaceAll(RegExp(r'^[^\s]+ '), '')),

            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),

              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surface,

                borderRadius: BorderRadius.circular(22),

                border: Border.all(color: AppColors.primary.withAlpha(150)),
              ),

              child: Text(
                label,
                style: GoogleFonts.poppins(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  color: AppColors.primary,
                ),
              ),
            ),
          );
        },
      ),
    );
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  Widget _buildInput() {
    return Container(
      padding: EdgeInsets.only(
        left: 12,
        right: 12,
        top: 10,
        bottom: MediaQuery.of(context).padding.bottom + 12,
      ),

      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surface,

        border: Border(
          top: BorderSide(color: Theme.of(context).colorScheme.outlineVariant),
        ),
      ),

      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,

        children: [
          Expanded(
            child: Container(
              decoration: BoxDecoration(
                color: Theme.of(context).colorScheme.surfaceContainerHighest,

                borderRadius: BorderRadius.circular(24),

                border: Border.all(
                  color: Theme.of(context).colorScheme.outlineVariant,
                ),
              ),

              child: TextField(
                controller: _textCtrl,

                minLines: 1,
                maxLines: 4,

                textCapitalization: TextCapitalization.sentences,

                style: GoogleFonts.poppins(
                  fontSize: 13.5,
                  color: Theme.of(context).colorScheme.onSurface,
                ),

                decoration: InputDecoration(
                  hintText: 'Ask me anything about your meals…',

                  hintStyle: GoogleFonts.poppins(
                    fontSize: 13,
                    color: Theme.of(context).colorScheme.onSurfaceVariant,
                  ),

                  contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16,
                    vertical: 10,
                  ),

                  border: InputBorder.none,

                  enabledBorder: InputBorder.none,

                  focusedBorder: InputBorder.none,
                ),

                onSubmitted: (_) => _handleSend(),
              ),
            ),
          ),

          const SizedBox(width: 10),

          ValueListenableBuilder<TextEditingValue>(
            valueListenable: _textCtrl,

            builder: (_, value, _) {
              final canSend = value.text.trim().isNotEmpty && !_isTyping;

              return GestureDetector(
                onTap: canSend ? _handleSend : null,

                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 180),

                  width: 46,
                  height: 46,

                  decoration: BoxDecoration(
                    color: canSend
                        ? AppColors.primary
                        : Theme.of(context).colorScheme.surfaceContainerHighest,

                    shape: BoxShape.circle,
                  ),

                  child: Icon(
                    Icons.arrow_upward_rounded,

                    color: canSend
                        ? Colors.white
                        : Theme.of(context).colorScheme.onSurfaceVariant,

                    size: 22,
                  ),
                ),
              );
            },
          ),
        ],
      ),
    );
  }
}
