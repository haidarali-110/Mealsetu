const AUTH_KEYS = ['token', 'user'];

export const getAuthItem = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

export const setAuthItem = (key, value) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    return;
  }
};

export const removeAuthItem = (key) => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    return;
  }
};

export const clearAuthStorage = () => {
  for (const key of AUTH_KEYS) {
    try {
      sessionStorage.removeItem(key);
    } catch { /* Storage may be unavailable in restricted browser contexts. */ }
    try {
      localStorage.removeItem(key);
    } catch { /* Storage may be unavailable in restricted browser contexts. */ }
  }
};

for (const key of AUTH_KEYS) {
  try {
    localStorage.removeItem(key);
  } catch { /* Storage may be unavailable in restricted browser contexts. */ }
}