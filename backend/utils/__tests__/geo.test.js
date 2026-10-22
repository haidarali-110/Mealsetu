const { haversineDistanceMeters, isValidCoordinate } = require('../geo');

describe('delivery geofence coordinates', () => {
  test('accepts finite coordinates within latitude and longitude ranges', () => {
    expect(isValidCoordinate(0, 0)).toBe(true);
    expect(isValidCoordinate(-90, 180)).toBe(true);
    expect(isValidCoordinate(90.1, 0)).toBe(false);
    expect(isValidCoordinate(0, -180.1)).toBe(false);
    expect(isValidCoordinate(NaN, 0)).toBe(false);
  });

  test('calculates distance in meters at the 50-meter boundary', () => {
    const longitudeAtEquatorFor50Meters = 50 / 111194.9;
    const distance = haversineDistanceMeters(0, 0, 0, longitudeAtEquatorFor50Meters);

    expect(distance).toBeCloseTo(50, 1);
    expect(haversineDistanceMeters(0, 0, 0, (50.1 / 111194.9))).toBeGreaterThan(50);
  });

  test('rejects invalid coordinates rather than calculating a distance', () => {
    expect(() => haversineDistanceMeters(91, 0, 0, 0)).toThrow(TypeError);
    expect(() => haversineDistanceMeters(0, 0, 0, Infinity)).toThrow(TypeError);
  });
});
