/**
 * NivaaroFix — GPS Live Geolocation & High-Precision Reverse Geocoding Service
 * Obtains accurate hardware GPS/Wi-Fi coordinates via convergence filtering
 * and reverse-geocodes into detailed doorstep residential addresses.
 */

import { indianStatesAndCitiesData } from '../data/indianStatesAndCitiesData.js';

/**
 * Normalizes state name to match canonical indianStatesAndCitiesData key
 */
function normalizeStateName(rawState) {
  if (!rawState) return '';
  const clean = rawState.trim().toLowerCase();
  
  if (clean.includes('delhi')) return 'Delhi NCR';
  if (clean.includes('karnataka')) return 'Karnataka';
  if (clean.includes('tamil nadu') || clean.includes('tamilnadu')) return 'Tamil Nadu';
  if (clean.includes('maharashtra')) return 'Maharashtra';
  if (clean.includes('telangana')) return 'Telangana';
  if (clean.includes('andhra')) return 'Andhra Pradesh';
  if (clean.includes('kerala')) return 'Kerala';
  if (clean.includes('west bengal') || clean.includes('bengal')) return 'West Bengal';
  if (clean.includes('gujarat')) return 'Gujarat';
  if (clean.includes('rajasthan')) return 'Rajasthan';
  if (clean.includes('uttar pradesh')) return 'Uttar Pradesh';
  if (clean.includes('madhya pradesh')) return 'Madhya Pradesh';
  if (clean.includes('bihar')) return 'Bihar';
  if (clean.includes('punjab')) return 'Punjab';
  if (clean.includes('haryana')) return 'Haryana';
  if (clean.includes('odisha') || clean.includes('orissa')) return 'Odisha';
  if (clean.includes('assam')) return 'Assam';
  if (clean.includes('jharkhand')) return 'Jharkhand';
  if (clean.includes('chhattisgarh')) return 'Chhattisgarh';
  if (clean.includes('uttarakhand')) return 'Uttarakhand';
  if (clean.includes('goa')) return 'Goa';
  if (clean.includes('himachal')) return 'Himachal Pradesh';
  if (clean.includes('jammu') || clean.includes('kashmir')) return 'Jammu and Kashmir';
  if (clean.includes('chandigarh')) return 'Chandigarh';
  if (clean.includes('puducherry') || clean.includes('pondicherry')) return 'Puducherry';

  const exactMatch = Object.keys(indianStatesAndCitiesData).find(
    s => s.toLowerCase() === clean || clean.includes(s.toLowerCase())
  );
  return exactMatch || rawState.trim();
}

/**
 * Matches district/city from a list of administrative candidates against the state's official list
 */
export function matchDistrictOrCity(candidates, stateKey) {
  if (!Array.isArray(candidates)) {
    candidates = [candidates];
  }
  const cleanCandidates = candidates.filter(c => Boolean(c && String(c).trim())).map(c => String(c).trim());
  if (!cleanCandidates.length) return '';

  const cities = indianStatesAndCitiesData[stateKey] || [];
  if (!cities.length) return cleanCandidates[0] || '';

  // 1. Exact match (case-insensitive)
  for (const cand of cleanCandidates) {
    const cLower = cand.toLowerCase();
    const found = cities.find(c => c.toLowerCase() === cLower);
    if (found) return found;
  }

  // 2. Parenthesized alias & word-level matching
  // (e.g. 'Tiruchirappalli' or 'Trichy' matches 'Tiruchirappalli (Trichy)', 'Kochi' matches 'Ernakulam (Kochi)')
  for (const cand of cleanCandidates) {
    const cLower = cand.toLowerCase();
    if (cLower.length < 3) continue;

    const found = cities.find(c => {
      const cityLower = c.toLowerCase();
      // Split on delimiters like '(', ')', '/', '-', ','
      const aliases = cityLower.split(/[\(\)\/\,\-]/).map(p => p.trim()).filter(Boolean);
      return aliases.some(alias => alias === cLower || alias.includes(cLower) || cLower.includes(alias));
    });
    if (found) return found;
  }

  // 3. Substring inclusion
  for (const cand of cleanCandidates) {
    const cLower = cand.toLowerCase();
    if (cLower.length < 3) continue;

    const found = cities.find(c => {
      const cityLower = c.toLowerCase();
      return cityLower.includes(cLower) || cLower.includes(cityLower);
    });
    if (found) return found;
  }

  // 4. Fallback to first available candidate
  return cleanCandidates[0] || '';
}

/**
 * Normalizes city/district to best match within the state's list
 */
export function normalizeCityName(rawCity, stateKey) {
  if (!rawCity) return '';
  return matchDistrictOrCity([rawCity], stateKey);
}


/**
 * Formats a rich, doorstep-level residential or commercial address
 * combining building/house number, road/street, sub-locality, locality, city, state and PIN.
 */
export function formatDetailedDoorstepAddress(addr, fallbackDisplayName = '') {
  if (!addr && !fallbackDisplayName) return '';
  if (!addr) {
    return fallbackDisplayName.replace(/,\s*India$/i, '').trim();
  }

  const parts = [];

  // 1. Premise / Building / House / Landmark / Amenity
  const houseNum = addr.house_number ? `#${addr.house_number}` : (addr.flat_number ? `Flat ${addr.flat_number}` : '');
  const premiseName = addr.house_name || addr.building || addr.amenity || addr.office || addr.shop || addr.place || addr.commercial || addr.industrial || '';
  let premise = '';
  if (houseNum && premiseName) {
    premise = `${premiseName}, ${houseNum}`;
  } else if (houseNum) {
    premise = houseNum;
  } else if (premiseName) {
    premise = premiseName;
  }

  if (premise && !parts.some(p => p.toLowerCase() === premise.toLowerCase())) {
    parts.push(premise);
  }

  // 2. Street / Road / Lane
  const street = addr.road || addr.street || addr.residential || addr.footway || addr.path || addr.pedestrian || addr.alley || '';
  if (street && !parts.some(p => p.toLowerCase().includes(street.toLowerCase()) || street.toLowerCase().includes(p.toLowerCase()))) {
    parts.push(street);
  }

  // 3. Sub-locality / Neighbourhood / Sector / Colony / Quarter
  const sublocality = addr.neighbourhood || addr.sublocality || addr.sublocality_level_1 || addr.sublocality_level_2 || addr.quarter || addr.block || '';
  if (sublocality && !parts.some(p => p.toLowerCase().includes(sublocality.toLowerCase()) || sublocality.toLowerCase().includes(p.toLowerCase()))) {
    parts.push(sublocality);
  }

  // 4. Locality / Suburb / Ward
  const suburb = addr.suburb || '';
  if (suburb && !parts.some(p => p.toLowerCase().includes(suburb.toLowerCase()) || suburb.toLowerCase().includes(p.toLowerCase()))) {
    parts.push(suburb);
  }

  // 5. City / Town / Village / Taluk
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.city_district || '';
  if (city && !parts.some(p => p.toLowerCase() === city.toLowerCase())) {
    parts.push(city);
  }

  // 6. District (only if distinct and informative)
  const district = addr.county || addr.district || addr.state_district || '';
  if (district && !parts.some(p => p.toLowerCase().includes(district.toLowerCase()) || district.toLowerCase().includes(p.toLowerCase()))) {
    const cityPrefix = city ? city.split(' ')[0].toLowerCase() : '';
    if (!cityPrefix || !district.toLowerCase().includes(cityPrefix)) {
      parts.push(district);
    }
  }

  // 7. State & Postal Code
  const state = addr.state || '';
  const postcode = addr.postcode || '';

  if (state && postcode) {
    parts.push(`${state} ${postcode}`);
  } else if (state) {
    parts.push(state);
  } else if (postcode) {
    parts.push(postcode);
  }

  if (parts.length >= 2) {
    return parts.join(', ');
  }

  if (fallbackDisplayName) {
    return fallbackDisplayName.replace(/,\s*India$/i, '').trim();
  }

  return parts.join(', ');
}

/**
 * Obtains high-accuracy GPS coordinates using convergence filtering.
 * Uses watchPosition with maximumAge: 0 to allow hardware GPS and Wi-Fi triangulation
 * to settle to high precision (< 25m) rather than immediately serving coarse IP/cached fixes.
 */
export function getHighAccuracyCoordinates(options = {}) {
  const {
    timeoutMs = 15000,
    desiredAccuracyMeters = 25,
    maxWaitAfterFirstFixMs = 3500
  } = options;

  if (typeof window === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Geolocation is not supported by your browser.'));
  }

  return new Promise((resolve, reject) => {
    let watchId = null;
    let bestPosition = null;
    let settled = false;
    let earlyTimer = null;
    let overallTimer = null;

    const cleanup = () => {
      settled = true;
      if (watchId !== null) {
        try {
          navigator.geolocation.clearWatch(watchId);
        } catch (_) {}
        watchId = null;
      }
      if (earlyTimer) clearTimeout(earlyTimer);
      if (overallTimer) clearTimeout(overallTimer);
    };

    const finishWithBest = () => {
      if (settled) return;
      if (bestPosition) {
        const lat = parseFloat(bestPosition.coords.latitude.toFixed(6));
        const lng = parseFloat(bestPosition.coords.longitude.toFixed(6));
        const accuracy = Math.round(bestPosition.coords.accuracy || 10);
        cleanup();
        resolve({ lat, lng, accuracy });
      } else {
        cleanup();
        reject(new Error('Could not acquire accurate GPS coordinates within the timeout window.'));
      }
    };

    // Hard safety timeout
    overallTimer = setTimeout(() => {
      if (!settled) {
        if (bestPosition) {
          finishWithBest();
        } else {
          cleanup();
          reject(new Error('Location request timed out. Please check your device GPS permissions.'));
        }
      }
    }, timeoutMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (settled) return;
          const currentAcc = pos.coords.accuracy || 9999;

          // Track the best (lowest accuracy value in meters) reading
          if (!bestPosition || currentAcc < (bestPosition.coords.accuracy || 9999)) {
            bestPosition = pos;
          }

          // If doorstep precision achieved (<= 25m), resolve immediately!
          if (currentAcc <= desiredAccuracyMeters) {
            finishWithBest();
            return;
          }

          // Once first fix is acquired, give GPS a short convergence window to tighten
          if (!earlyTimer) {
            earlyTimer = setTimeout(() => {
              if (!settled && bestPosition) {
                finishWithBest();
              }
            }, maxWaitAfterFirstFixMs);
          }
        },
        (err) => {
          if (settled) return;
          if (bestPosition) {
            finishWithBest();
            return;
          }

          cleanup();
          // Fallback to single getCurrentPosition attempt
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => {
              const lat = parseFloat(fallbackPos.coords.latitude.toFixed(6));
              const lng = parseFloat(fallbackPos.coords.longitude.toFixed(6));
              const accuracy = Math.round(fallbackPos.coords.accuracy || 15);
              resolve({ lat, lng, accuracy });
            },
            (fallbackErr) => {
              let msg = 'Location access was denied or unavailable.';
              if (fallbackErr.code === 1 || err.code === 1) {
                msg = 'Location permission was denied. Please allow location access in your browser settings.';
              } else if (fallbackErr.code === 2 || err.code === 2) {
                msg = 'Position unavailable. Please check your device GPS or network connection.';
              } else if (fallbackErr.code === 3 || err.code === 3) {
                msg = 'Location request timed out. Please try again.';
              }
              reject(new Error(msg));
            },
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
          );
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
      );
    } catch (e) {
      cleanup();
      reject(e);
    }
  });
}

/**
 * Fetches current browser GPS position with high accuracy convergence
 * and reverse-geocodes into a very detailed doorstep location:
 * { lat, lng, state, city, address, pincode, accuracy, details }
 */
export async function detectCurrentGpsLocation() {
  // 1. Get high-accuracy browser GPS coordinates (< 20m precision)
  const coords = await getHighAccuracyCoordinates({
    timeoutMs: 15000,
    desiredAccuracyMeters: 20,
    maxWaitAfterFirstFixMs: 3500
  });

  // Helper to extract state, district and doorstep address from Nominatim addr
  const parseNominatimAddress = (addr, displayName) => {
    const rawState = addr.state || '';
    const state = normalizeStateName(rawState);
    const candidateCities = [
      addr.state_district,
      addr.district,
      addr.county,
      addr.city,
      addr.town,
      addr.municipality,
      addr.village,
      addr.suburb,
      addr.city_district
    ].filter(Boolean);

    const city = matchDistrictOrCity(candidateCities, state);
    const pincode = addr.postcode || '';
    const formattedAddress = formatDetailedDoorstepAddress(addr, displayName);

    return {
      lat: coords.lat,
      lng: coords.lng,
      state,
      city,
      address: formattedAddress,
      pincode,
      accuracy: coords.accuracy,
      details: {
        premise: addr.house_number ? (addr.amenity ? `${addr.amenity}, #${addr.house_number}` : `#${addr.house_number}`) : (addr.amenity || addr.building || addr.commercial || addr.industrial || ''),
        road: addr.road || addr.street || '',
        neighbourhood: addr.neighbourhood || addr.sublocality || '',
        suburb: addr.suburb || '',
        city,
        state,
        pincode
      }
    };
  };

  // 2. Primary: Backend Reverse Geocoding Proxy (reliable, bypasses browser CORS/rate-limits)
  try {
    const backendRes = await fetch(
      `http://localhost:5000/api/geo/reverse?lat=${coords.lat}&lng=${coords.lng}`
    );
    if (backendRes.ok) {
      const data = await backendRes.json();
      if (data.success && data.address) {
        const parsed = parseNominatimAddress(data.address, data.displayName);
        if (parsed.address && parsed.address.length > 5) {
          return parsed;
        }
      }
    }
  } catch (err) {
    // Backend proxy notice, proceed to client fallback
  }

  // 3. Fallback: Direct OpenStreetMap Nominatim Reverse Geocoding
  try {
    const osmRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${coords.lat}&lon=${coords.lng}&zoom=18&addressdetails=1&extratags=1&namedetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (osmRes.ok) {
      const data = await osmRes.json();
      const addr = data.address || {};
      const parsed = parseNominatimAddress(addr, data.display_name);
      if (parsed.address && parsed.address.length > 5) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Nominatim reverse geocode notice:', err.message);
  }

  // 4. Fallback: BigDataCloud client API (deep locality info parsing)
  try {
    const bdcRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${coords.lat}&longitude=${coords.lng}&localityLanguage=en`
    );
    if (bdcRes.ok) {
      const data = await bdcRes.json();
      const rawState = data.principalSubdivision || '';
      const state = normalizeStateName(rawState);

      const adminNames = (data.localityInfo?.administrative || [])
        .map(a => a.name.replace(/\s+(District|Taluk|Tehsil|Division|State)$/i, '').trim())
        .filter(Boolean);

      const candidateCities = [
        ...adminNames,
        data.city,
        data.locality
      ].filter(Boolean);

      const city = matchDistrictOrCity(candidateCities, state);
      const pincode = data.postcode || '';

      const area = data.locality || data.localityInfo?.administrative?.[3]?.name || '';
      const informativeLandmarks = (data.localityInfo?.informative || [])
        .filter(item => item.order >= 6 && item.order <= 14 && item.name && item.name !== city && item.name !== state)
        .map(item => item.name);

      const parts = [];
      if (informativeLandmarks.length > 0) {
        parts.push(informativeLandmarks[0]);
      }
      if (area && area !== city && !parts.includes(area)) {
        parts.push(area);
      }
      if (city && !parts.includes(city)) {
        parts.push(city);
      }
      if (state && pincode) {
        parts.push(`${state} ${pincode}`);
      } else if (state) {
        parts.push(state);
      }

      const formattedAddress = parts.join(', ');

      return {
        lat: coords.lat,
        lng: coords.lng,
        state,
        city,
        address: formattedAddress || `Lat: ${coords.lat}, Lng: ${coords.lng}`,
        pincode,
        accuracy: coords.accuracy,
        details: {
          road: informativeLandmarks[0] || '',
          suburb: area || '',
          city,
          state,
          pincode
        }
      };
    }
  } catch (err) {
    console.warn('BigDataCloud reverse geocode notice:', err.message);
  }

  // 5. Coordinates fallback if all reverse-geocoders fail
  return {
    lat: coords.lat,
    lng: coords.lng,
    state: '',
    city: '',
    address: `Lat: ${coords.lat}, Lng: ${coords.lng}`,
    pincode: '',
    accuracy: coords.accuracy,
    details: {}
  };
}

