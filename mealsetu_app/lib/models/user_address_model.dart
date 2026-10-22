/// Represents a structured delivery address.
/// Handles both the new object format and the legacy string format from the backend.
class UserAddress {
  final String flatHouseNo;
  final String street;
  final String area;
  final String landmark;
  final String city;
  final String pincode;
  final double? latitude;
  final double? longitude;
  final String fullAddress;

  const UserAddress({
    this.flatHouseNo = '',
    this.street      = '',
    this.area        = '',
    this.landmark    = '',
    this.city        = '',
    this.pincode     = '',
    this.latitude,
    this.longitude,
    this.fullAddress = '',
  });

  /// Parses from either a JSON Map (new format) or a plain String (legacy).
  factory UserAddress.fromJson(dynamic json) {
    if (json == null) return const UserAddress();
    if (json is String) {
      return UserAddress(fullAddress: json, pincode: '');
    }
    if (json is Map) {
      final m = Map<String, dynamic>.from(json);
      return UserAddress(
        flatHouseNo: m['flatHouseNo'] as String? ?? '',
        street:      m['street']      as String? ?? '',
        area:        m['area']        as String? ?? '',
        landmark:    m['landmark']    as String? ?? '',
        city:        m['city']        as String? ?? '',
        pincode:     m['pincode']     as String? ?? '',
        latitude:    (m['latitude']  as num?)?.toDouble(),
        longitude:   (m['longitude'] as num?)?.toDouble(),
        fullAddress: m['fullAddress'] as String? ?? '',
      );
    }
    return const UserAddress();
  }

  Map<String, dynamic> toJson() => {
    'flatHouseNo': flatHouseNo,
    'street':      street,
    'area':        area,
    'landmark':    landmark,
    'city':        city,
    'pincode':     pincode,
    'latitude':    latitude,
    'longitude':   longitude,
    'fullAddress': fullAddress,
  };

  /// Human-readable display string. Uses `fullAddress` if available, else builds from parts.
  String get displayAddress {
    if (fullAddress.isNotEmpty) return fullAddress;
    return [flatHouseNo, street, area, city, pincode]
        .where((s) => s.isNotEmpty)
        .join(', ');
  }

  bool get isEmpty => flatHouseNo.isEmpty && street.isEmpty && area.isEmpty &&
      city.isEmpty && pincode.isEmpty && fullAddress.isEmpty;

  UserAddress copyWith({
    String? flatHouseNo,
    String? street,
    String? area,
    String? landmark,
    String? city,
    String? pincode,
    double? latitude,
    double? longitude,
    String? fullAddress,
  }) =>
      UserAddress(
        flatHouseNo: flatHouseNo ?? this.flatHouseNo,
        street:      street      ?? this.street,
        area:        area        ?? this.area,
        landmark:    landmark    ?? this.landmark,
        city:        city        ?? this.city,
        pincode:     pincode     ?? this.pincode,
        latitude:    latitude    ?? this.latitude,
        longitude:   longitude   ?? this.longitude,
        fullAddress: fullAddress ?? this.fullAddress,
      );
}
