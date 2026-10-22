'use strict';

const EARTH_RADIUS_METERS = 6371000;

const isValidCoordinate = (latitude, longitude) =>
  Number.isFinite(latitude) &&
  Number.isFinite(longitude) &&
  latitude >= -90 &&
  latitude <= 90 &&
  longitude >= -180 &&
  longitude <= 180;

const haversineDistanceMeters = (lat1, lon1, lat2, lon2) => {
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite) ||
      !isValidCoordinate(lat1, lon1) ||
      !isValidCoordinate(lat2, lon2)) {
    throw new TypeError('Latitude and longitude must be finite values within valid ranges.');
  }

  const toRadians = (degrees) => degrees * Math.PI / 180;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return EARTH_RADIUS_METERS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

module.exports = { haversineDistanceMeters, isValidCoordinate };
