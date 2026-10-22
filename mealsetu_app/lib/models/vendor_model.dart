// Data models for the vendor list returned by
// GET /api/users/vendors-by-pincode?pincode={pincode}

// ── PricingModel ──────────────────────────────────────────────────────────────

class PricingModel {
  const PricingModel({
    required this.type,
    required this.price,
    required this.active,
  });

  /// "daily" | "weekly" | "monthly"
  final String type;
  final double price;
  final bool active;

  factory PricingModel.fromJson(Map<String, dynamic> json) => PricingModel(
    type: json['type'] as String? ?? '',
    price: (json['price'] as num?)?.toDouble() ?? 0.0,
    active: json['active'] as bool? ?? false,
  );
}

// ── VendorModel ───────────────────────────────────────────────────────────────

class VendorModel {
  const VendorModel({
    required this.id,
    required this.vendorId,
    required this.name,
    required this.address,
    required this.pincode,
    required this.price,
    required this.rating,
    required this.reviewCount,
    required this.type,
    required this.fssai,
    required this.workingDays,
    required this.timings,
    required this.pricing,
    required this.trialEnabled,
    this.kitchenPoster,
    this.profileImage,
    this.trialFee,
    this.distanceKm,
    this.offersJainMenu = false,
    this.deliveryEnabled = false,
    this.vendorLat,
    this.vendorLon,
  });

  final String id; // from _id (MongoDB ObjectId)
  final String vendorId; // from vendorId (used in review/rating endpoints)
  final String name; // kitchen name — API key is "name"
  final String address;
  final String pincode;
  final double price; // top-level price (fallback when no pricing tiers)
  final double rating;
  final int reviewCount; // 0 = no reviews yet → show "New" badge
  final String type; // e.g. "Regular"
  final String fssai;
  final String workingDays;
  final String timings;
  final String? kitchenPoster; // full image URL
  final String? profileImage;
  final List<PricingModel> pricing;
  final bool trialEnabled;
  final double? trialFee;
  final double? distanceKm;
  final bool offersJainMenu;
  final bool deliveryEnabled;
  final double? vendorLat; // vendor's geocoded latitude (from backend)
  final double? vendorLon; // vendor's geocoded longitude (from backend)

  factory VendorModel.fromJson(Map<String, dynamic> json) => VendorModel(
    id: json['_id'] as String? ?? '',
    vendorId: json['vendorId'] as String? ?? '',
    name: json['name'] as String? ?? '',

    // Updated to safely parse the address object
    address: _parseAddress(json['address']),

    pincode: json['pincode'] as String? ?? '',
    price: (json['price'] as num?)?.toDouble() ?? 0.0,
    rating: (json['rating'] as num?)?.toDouble() ?? 0.0,
    reviewCount: (json['reviewCount'] as num?)?.toInt() ?? 0,
    type: json['type'] as String? ?? '',
    fssai: json['fssai'] as String? ?? '',
    workingDays: json['workingDays'] as String? ?? '',
    timings: json['timings'] as String? ?? '',
    kitchenPoster: json['kitchenPoster'] as String?,
    profileImage: json['profileImage'] as String?,
    pricing: (json['pricing'] as List<dynamic>? ?? [])
        .map((p) => PricingModel.fromJson(p as Map<String, dynamic>))
        .toList(),
    trialEnabled: json['trialEnabled'] as bool? ?? false,
    trialFee: (json['trialFee'] as num?)?.toDouble(),
    distanceKm: (json['distanceKm'] as num?)?.toDouble(),
    offersJainMenu: json['offersJainMenu'] as bool? ?? false,
    deliveryEnabled: json['deliveryEnabled'] as bool? ?? false,
    vendorLat: (json['latitude'] as num?)?.toDouble(),
    vendorLon: (json['longitude'] as num?)?.toDouble(),
  );

  // ── Computed helpers ─────────────────────────────────────────────────────

  /// Lowest price among active pricing tiers; falls back to [price].
  double get minPrice {
    final activePrices = pricing
        .where((p) => p.active)
        .map((p) => p.price)
        .toList();
    if (activePrices.isEmpty) return price;
    return activePrices.reduce((a, b) => a < b ? a : b);
  }

  /// True when the vendor is within 5 km.
  bool get isNearby => distanceKm != null && distanceKm! < 5.0;

  /// Returns a copy with a client-side recalculated distance.
  VendorModel copyWithDistance(double? newDistanceKm) => VendorModel(
    id: id,
    vendorId: vendorId,
    name: name,
    address: address,
    pincode: pincode,
    price: price,
    rating: rating,
    reviewCount: reviewCount,
    type: type,
    fssai: fssai,
    workingDays: workingDays,
    timings: timings,
    pricing: pricing,
    trialEnabled: trialEnabled,
    kitchenPoster: kitchenPoster,
    profileImage: profileImage,
    trialFee: trialFee,
    offersJainMenu: offersJainMenu,
    deliveryEnabled: deliveryEnabled,
    vendorLat: vendorLat,
    vendorLon: vendorLon,
    distanceKm: newDistanceKm,
  );

  // ── Address Parser ───────────────────────────────────────────────────────

  static String _parseAddress(dynamic addressData) {
    if (addressData == null) return '';

    // If backend sends a string, use it directly
    if (addressData is String) return addressData;

    // If backend sends the new address object, format it into a string
    if (addressData is Map<String, dynamic>) {
      if (addressData['fullAddress'] != null &&
          addressData['fullAddress'].toString().isNotEmpty) {
        return addressData['fullAddress'].toString();
      }

      // Fallback to joining available parts
      final parts = [
        addressData['flatHouseNo'],
        addressData['shopNo'],
        addressData['street'],
        addressData['area'],
        addressData['city'],
        addressData['pincode'],
      ].where((part) => part != null && part.toString().isNotEmpty).join(', ');

      return parts.isNotEmpty ? parts : '';
    }

    return '';
  }
}
