import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBooking } from '../context/BookingContext';
import { useLocation } from '../context/LocationContext';
import { useLanguage } from '../context/LanguageContext';

/**
 * NivaaroFix Simplified 3-Step Interactive Booking Request Modal
 *
 * Flow:
 *  01 Describe & Photos -> 02 Review -> 03 Confirm
 *
 * Rules:
 *  - "What needs fixing?" is OPTIONAL (no red asterisk).
 *  - Photo capture / upload is OPTIONAL individually.
 *  - Validation: "Continue to Review" is disabled until AT LEAST ONE of {description, photo} is present.
 *  - Diagnostic questions ("When did it start?", "Is it constant/intermittent?") are behind a collapsed
 *    "Add more details (optional)" toggle with no default pre-selections.
 *  - Proximity Matching: Matches nearby verified pros via server-side expanding radius (1km -> 3km -> 5km -> 10km).
 *  - Design: Ivory #f7f5f1, Navy #1e3a5f, Forest #0f4d3c, Brass #a9793c. No emojis. Calm ease-out motion.
 */

/**
 * High-accuracy GPS convergence fetcher.
 * Uses watchPosition with maximumAge: 0 to acquire true hardware/Wi-Fi positioning,
 * settling immediately when precision is <= 25m or selecting the tightest reading within 3.5s.
 */
function getAccurateBrowserCoordinates(options = {}) {
  const { timeoutMs = 15000, desiredAccuracyMeters = 25, maxWaitAfterFirstFixMs = 3500 } = options;

  if (typeof window === 'undefined' || !navigator.geolocation) {
    return Promise.reject(new Error('Geolocation is not supported by your browser.'));
  }

  return new Promise((resolve, reject) => {
    let watchId = null;
    let bestPos = null;
    let settled = false;
    let earlyTimer = null;
    let overallTimer = null;

    const cleanup = () => {
      settled = true;
      if (watchId !== null) {
        try { navigator.geolocation.clearWatch(watchId); } catch (_) {}
        watchId = null;
      }
      if (earlyTimer) clearTimeout(earlyTimer);
      if (overallTimer) clearTimeout(overallTimer);
    };

    const finishWithBest = () => {
      if (settled) return;
      if (bestPos) {
        const lat = parseFloat(bestPos.coords.latitude.toFixed(6));
        const lng = parseFloat(bestPos.coords.longitude.toFixed(6));
        const accuracy_m = Math.round(bestPos.coords.accuracy || 10);
        cleanup();
        resolve({ lat, lng, accuracy_m });
      } else {
        cleanup();
        reject(new Error('Could not acquire accurate GPS coordinates.'));
      }
    };

    overallTimer = setTimeout(() => {
      if (!settled) {
        if (bestPos) finishWithBest();
        else {
          cleanup();
          reject(new Error('Location request timed out. Please check device GPS permissions.'));
        }
      }
    }, timeoutMs);

    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          if (settled) return;
          const acc = pos.coords.accuracy || 9999;
          if (!bestPos || acc < (bestPos.coords.accuracy || 9999)) {
            bestPos = pos;
          }
          if (acc <= desiredAccuracyMeters) {
            finishWithBest();
            return;
          }
          if (!earlyTimer) {
            earlyTimer = setTimeout(() => {
              if (!settled && bestPos) finishWithBest();
            }, maxWaitAfterFirstFixMs);
          }
        },
        (err) => {
          if (settled) return;
          if (bestPos) {
            finishWithBest();
            return;
          }
          cleanup();
          navigator.geolocation.getCurrentPosition(
            (fallbackPos) => {
              const lat = parseFloat(fallbackPos.coords.latitude.toFixed(6));
              const lng = parseFloat(fallbackPos.coords.longitude.toFixed(6));
              const accuracy_m = Math.round(fallbackPos.coords.accuracy || 15);
              resolve({ lat, lng, accuracy_m });
            },
            (fallbackErr) => {
              let msg = 'Location access was denied or unavailable.';
              if (fallbackErr.code === 1 || err.code === 1) msg = 'Location permission was denied. Please allow location access.';
              else if (fallbackErr.code === 2 || err.code === 2) msg = 'Position unavailable. Please check your GPS.';
              else if (fallbackErr.code === 3 || err.code === 3) msg = 'Location request timed out.';
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
 * Reverse-geocode coordinates into a human-readable doorstep service address.
 * Primary: OpenStreetMap Nominatim with zoom=18 & addressdetails=1 for building/street granularity.
 * Fallback: BigDataCloud client API with deep administrative & informative landmark parsing.
 */
async function fetchAddressFromCoords(latitude, longitude) {
  if (!latitude || !longitude) return null;

  // 1. Try OpenStreetMap Nominatim with zoom=18 for doorstep detail
  try {
    const osmRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
      { headers: { 'Accept-Language': 'en' } }
    );
    if (osmRes.ok) {
      const data = await osmRes.json();
      if (data?.address) {
        const addr = data.address;
        const parts = [];

        // 1. Premise / Building / House / Landmark / Amenity
        const houseNum = addr.house_number ? `#${addr.house_number}` : '';
        const premiseName = addr.house_name || addr.building || addr.amenity || addr.office || addr.shop || addr.place || '';
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

        // 2. Street / Road
        const street = addr.road || addr.street || addr.residential || addr.footway || addr.path || addr.pedestrian || '';
        if (street && !parts.some(p => p.toLowerCase().includes(street.toLowerCase()) || street.toLowerCase().includes(p.toLowerCase()))) {
          parts.push(street);
        }

        // 3. Sub-locality / Neighbourhood
        const sublocality = addr.neighbourhood || addr.sublocality || addr.sublocality_level_1 || addr.sublocality_level_2 || addr.quarter || addr.block || '';
        if (sublocality && !parts.some(p => p.toLowerCase().includes(sublocality.toLowerCase()) || sublocality.toLowerCase().includes(p.toLowerCase()))) {
          parts.push(sublocality);
        }

        // 4. Locality / Suburb
        const suburb = addr.suburb || '';
        if (suburb && !parts.some(p => p.toLowerCase().includes(suburb.toLowerCase()) || suburb.toLowerCase().includes(p.toLowerCase()))) {
          parts.push(suburb);
        }

        // 5. City / Town
        const city = addr.city || addr.town || addr.village || addr.municipality || addr.city_district || '';
        if (city && !parts.some(p => p.toLowerCase() === city.toLowerCase())) {
          parts.push(city);
        }

        // 6. District (if distinct)
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
      }
      if (data?.display_name) {
        return data.display_name.replace(/,\s*India$/i, '').trim();
      }
    }
  } catch (err) {
    console.warn('Nominatim reverse geocode note:', err.message);
  }

  // 2. Try BigDataCloud Client Reverse Geocode
  try {
    const bdcRes = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    );
    if (bdcRes.ok) {
      const data = await bdcRes.json();
      const city = data.city || data.locality || '';
      const state = data.principalSubdivision || '';
      const postcode = data.postcode || '';
      const area = data.localityInfo?.administrative?.[3]?.name || data.locality || '';
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
      if (state && postcode) {
        parts.push(`${state} ${postcode}`);
      } else if (state) {
        parts.push(state);
      }

      if (parts.length > 0) {
        return parts.join(', ');
      }
    }
  } catch (err) {
    console.warn('BigDataCloud reverse geocode note:', err.message);
  }

  return null;
}

export default function InteractiveBookingModal({ currentUser, onOpenAuth }) {
  const {
    isBookingModalOpen,
    activeServiceForBooking,
    initialIssueForBooking,
    closeBookingModal,
    createServiceRequest,
    loadMyRequests,
    addNewBooking,
    loadUserBookings,
    hasActiveCustomerRequest,
    activeCustomerRequest
  } = useBooking();
  const { selectedCity } = useLocation();
  const { t, activeLanguage } = useLanguage();

  // Wizard Steps: 1: Describe & Photos, 2: Review & Address, 3: Confirm & Proximity Match
  const [step, setStep] = useState(1);

  // Step 1: Problem Description & Photos
  const [problemDescription, setProblemDescription] = useState('');
  const [photos, setPhotos] = useState([]); // [{ id, filename, originalFilename, mimeType, fileSize, url, previewUrl, base64Data }]
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraSnapshot, setCameraSnapshot] = useState(null);
  const [cameraError, setCameraError] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Collapsed Optional Diagnostic Details
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [problemTiming, setProblemTiming] = useState(''); // No default pre-selected option
  const [problemFrequency, setProblemFrequency] = useState(''); // No default pre-selected option

  // Step 2: Address & Location
  const [addressLine, setAddressLine] = useState('');
  const [coords, setCoords] = useState({ lat: null, lng: null });
  const [isLocating, setIsLocating] = useState(false);
  const [stepError, setStepError] = useState('');

  // Step 3: Submission & Server-Side Proximity Matching State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState(null);
  const [matchSummary, setMatchSummary] = useState(null);

  // Auto-minimize confirmation drawer state (15s inactivity timer)
  const [isMinimized, setIsMinimized] = useState(false);
  const autoMinimizeTimerRef = useRef(null);

  // Real-time progressive quotations state
  const [liveQuotes, setLiveQuotes] = useState([]);
  const [isAcceptingQuote, setIsAcceptingQuote] = useState(false);
  const [acceptedQuote, setAcceptedQuote] = useState(null);
  const [dispatchWaveInfo, setDispatchWaveInfo] = useState(null);

  const resetAutoMinimizeTimer = useCallback(() => {
    if (autoMinimizeTimerRef.current) {
      clearTimeout(autoMinimizeTimerRef.current);
      autoMinimizeTimerRef.current = null;
    }
    // Only auto-minimize once a pro quote has been accepted
    if (step === 3 && acceptedQuote && !isSubmitting) {
      autoMinimizeTimerRef.current = setTimeout(() => {
        setIsMinimized(true);
      }, 15000);
    }
  }, [step, acceptedQuote, isSubmitting]);

  // Handle auto-minimize timer on step 3
  useEffect(() => {
    if (step === 3 && acceptedQuote && !isSubmitting && !isMinimized) {
      resetAutoMinimizeTimer();
    }
    return () => {
      if (autoMinimizeTimerRef.current) {
        clearTimeout(autoMinimizeTimerRef.current);
      }
    };
  }, [step, acceptedQuote, isSubmitting, isMinimized, resetAutoMinimizeTimer]);

  // Connect SSE for real-time incoming quotations
  useEffect(() => {
    const ref = confirmedBooking?.requestRef || confirmedBooking?.bookingRef || confirmedBooking?.bookingId;
    if (step !== 3 || !ref) return;

    // Fetch initial quotes from REST API
    const fetchInitialQuotes = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/requests/${encodeURIComponent(ref)}/quotes`);
        const data = await res.json();
        if (data.success && Array.isArray(data.quotes)) {
          setLiveQuotes(data.quotes);
        }
      } catch (err) {
        console.warn('Initial quotes fetch notice:', err.message);
      }
    };
    fetchInitialQuotes();

    // Subscribe to Server-Sent Events (SSE)
    let sse;
    try {
      sse = new EventSource(`http://localhost:5000/api/realtime/request/${encodeURIComponent(ref)}`);
      sse.addEventListener('quote.created', (event) => {
        try {
          const payload = JSON.parse(event.data);
          setLiveQuotes((prev) => {
            const exists = prev.some((q) => (q.quoteId || q.id) === (payload.quoteId || payload.id));
            if (exists) return prev;
            return [payload, ...prev];
          });
        } catch (parseErr) {}
      });
      sse.addEventListener('quote.accepted', (event) => {
        try {
          const payload = JSON.parse(event.data);
          setAcceptedQuote(payload.assignedProvider || payload);
        } catch (parseErr) {}
      });
      sse.addEventListener('dispatch.wave_progress', (event) => {
        try {
          const payload = JSON.parse(event.data);
          setDispatchWaveInfo(payload);
        } catch (parseErr) {}
      });
    } catch (sseErr) {
      console.warn('SSE subscription notice:', sseErr.message);
    }

    return () => {
      if (sse) sse.close();
    };
  }, [step, confirmedBooking]);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Step 1 validation: Enabled if AT LEAST ONE of {description, photos} is present
  const hasDescription = problemDescription.trim().length > 0;
  const hasPhotos = photos.length > 0;
  const canContinueStep1 = hasDescription || hasPhotos;

  // Initialize form state when modal opens
  useEffect(() => {
    if (isBookingModalOpen && activeServiceForBooking) {
      setStep(1);
      setStepError('');
      setPhotoError('');
      setCameraError('');
      setIsCameraActive(false);
      setCameraSnapshot(null);
      setConfirmedBooking(null);
      setMatchSummary(null);
      setIsDetailsExpanded(false);
      setIsMinimized(false);
      if (autoMinimizeTimerRef.current) {
        clearTimeout(autoMinimizeTimerRef.current);
        autoMinimizeTimerRef.current = null;
      }
      setProblemTiming('');
      setProblemFrequency('');

      // Pre-fill initial issue if passed from a service card
      if (initialIssueForBooking && typeof initialIssueForBooking === 'string') {
        setProblemDescription(initialIssueForBooking);
      } else if (initialIssueForBooking && initialIssueForBooking.name) {
        setProblemDescription(initialIssueForBooking.name);
      } else {
        setProblemDescription('');
      }

      // Pre-populate address from user profile or saved localStorage session
      let initialAddr = currentUser?.address || '';
      if (!initialAddr && typeof window !== 'undefined') {
        try {
          const storedUser = JSON.parse(localStorage.getItem('nivaaro-user') || '{}');
          if (storedUser?.address) initialAddr = storedUser.address;
        } catch {}
      }
      setAddressLine(initialAddr);

      // Auto-detect GPS coordinates for spatial dispatch matching and pre-fetch address
      if (typeof window !== 'undefined' && navigator.geolocation) {
        setIsLocating(true);
        getAccurateBrowserCoordinates({ timeoutMs: 12000, desiredAccuracyMeters: 25, maxWaitAfterFirstFixMs: 3000 })
          .then(async (pos) => {
            const { lat, lng, accuracy_m } = pos;
            setCoords({ lat, lng, accuracy_m });
            setIsLocating(false);
            if (!initialAddr || initialAddr.startsWith('Near GPS')) {
              const autoAddr = await fetchAddressFromCoords(lat, lng);
              if (autoAddr) {
                setAddressLine((curr) => (!curr || !curr.trim() || curr.startsWith('Near GPS') ? autoAddr : curr));
              }
            }
          })
          .catch(() => {
            setIsLocating(false);
            if (currentUser?.city || selectedCity?.name) {
              const cityName = (currentUser?.city || selectedCity?.name || '').toLowerCase();
              if (cityName.includes('mumbai')) setCoords({ lat: 19.0760, lng: 72.8777 });
              else if (cityName.includes('delhi')) setCoords({ lat: 28.7041, lng: 77.1025 });
              else setCoords({ lat: 12.9716, lng: 77.5946 });
            }
          });
      }
    }
  }, [isBookingModalOpen, activeServiceForBooking, initialIssueForBooking, currentUser, selectedCity]);

  // Clean up camera stream
  const stopCameraStream = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
    setCameraSnapshot(null);
  };

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  // Attach camera stream to video element
  useEffect(() => {
    if (isCameraActive && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch((err) => {
        console.warn('Video play notice:', err.message);
      });
    }
  }, [isCameraActive, cameraStream]);

  if (!isBookingModalOpen || !activeServiceForBooking) return null;

  const isPlumber = (activeServiceForBooking.categoryId || '').toLowerCase().includes('plumb') ||
                    (activeServiceForBooking.title || '').toLowerCase().includes('plumb');

  const categoryLabel = isPlumber ? 'PLUMBING SERVICE' : 'ELECTRICAL SERVICE';
  const serviceActionTitle = isPlumber ? 'Book a Plumber' : 'Book an Electrician';

  // Common problem suggestion chips
  const suggestionChips = isPlumber
    ? [
        'Tap leaking',
        'Pipe leaking',
        'Drain blocked',
        'Flush problem',
        'Water connection issue'
      ]
    : [
        'MCB keeps tripping',
        'Switchboard issue',
        'Power outage in one area',
        'Wiring problem',
        'Fan / fixture issue'
      ];

  const timingOptions = ['Today', 'Within a few days', 'More than a week ago', 'Not sure'];
  const frequencyOptions = ['Constant', 'Intermittent', 'Getting worse', 'Not sure'];

  const handleChipClick = (chipText) => {
    setStepError('');
    if (!problemDescription) {
      setProblemDescription(chipText);
    } else if (!problemDescription.includes(chipText)) {
      setProblemDescription((prev) => `${prev.trim()}. ${chipText}`);
    }
  };

  // =========================================================================
  // Photo Upload & Camera Handlers
  // =========================================================================
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setPhotoError('');
    if (photos.length + files.length > 5) {
      setPhotoError('You can attach up to 5 photos per booking.');
      return;
    }

    setIsUploadingPhoto(true);

    for (const file of files) {
      const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
      if (!validTypes.includes(file.type.toLowerCase())) {
        setPhotoError(`"${file.name}" is not a supported format. Please upload JPEG, PNG, or WEBP.`);
        setIsUploadingPhoto(false);
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setPhotoError(`"${file.name}" exceeds the 10MB limit.`);
        setIsUploadingPhoto(false);
        return;
      }

      try {
        const base64Data = await readFileAsBase64(file);
        const res = await fetch('http://localhost:5000/api/bookings/upload-photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64Data,
            filename: file.name,
            mimeType: file.type
          })
        });
        const data = await res.json();

        if (res.ok && data.success && data.photo) {
          setPhotos((prev) => [
            ...prev,
            {
              ...data.photo,
              previewUrl: URL.createObjectURL(file)
            }
          ]);
        } else {
          setPhotos((prev) => [
            ...prev,
            {
              id: `local-${Date.now()}-${Math.random()}`,
              originalFilename: file.name,
              mimeType: file.type,
              fileSize: file.size,
              previewUrl: URL.createObjectURL(file),
              base64Data
            }
          ]);
        }
      } catch (err) {
        console.warn('Backend photo upload fallback:', err.message);
        setPhotos((prev) => [
          ...prev,
          {
            id: `local-${Date.now()}-${Math.random()}`,
            originalFilename: file.name,
            mimeType: file.type,
            fileSize: file.size,
            previewUrl: URL.createObjectURL(file)
          }
        ]);
      }
    }

    setIsUploadingPhoto(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const readFileAsBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  const handleRemovePhoto = (indexToRemove) => {
    setPhotos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
    setPhotoError('');
  };

  const handleStartCamera = async () => {
    setCameraError('');
    setPhotoError('');

    if (photos.length >= 5) {
      setPhotoError('You can attach up to 5 photos.');
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraError('Camera access is not supported by your browser. Please use the upload photo option.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      setCameraStream(stream);
      setIsCameraActive(true);
      setCameraSnapshot(null);
    } catch (err) {
      console.warn('Camera permission notice:', err.message);
      setCameraError('Unable to access device camera. Please check camera permissions or upload a photo.');
    }
  };

  const handleCaptureSnapshot = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCameraSnapshot(dataUrl);
  };

  const handleUseCapturedPhoto = async () => {
    if (!cameraSnapshot) return;

    try {
      setIsUploadingPhoto(true);
      const res = await fetch('http://localhost:5000/api/bookings/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64Data: cameraSnapshot,
          filename: `camera-capture-${Date.now()}.jpg`,
          mimeType: 'image/jpeg'
        })
      });
      const data = await res.json();

      if (res.ok && data.success && data.photo) {
        setPhotos((prev) => [
          ...prev,
          {
            ...data.photo,
            previewUrl: cameraSnapshot
          }
        ]);
      } else {
        setPhotos((prev) => [
          ...prev,
          {
            id: `cam-${Date.now()}`,
            originalFilename: `camera-capture-${Date.now()}.jpg`,
            mimeType: 'image/jpeg',
            fileSize: cameraSnapshot.length,
            previewUrl: cameraSnapshot,
            base64Data: cameraSnapshot
          }
        ]);
      }
    } catch (err) {
      console.warn('Photo upload fallback:', err.message);
      setPhotos((prev) => [
        ...prev,
        {
          id: `cam-${Date.now()}`,
          originalFilename: `camera-capture-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
          previewUrl: cameraSnapshot
        }
      ]);
    } finally {
      setIsUploadingPhoto(false);
      stopCameraStream();
    }
  };

  // =========================================================================
  // Geolocation Assist & Auto-Detection on Click
  // =========================================================================
  const handleUseCurrentLocation = async (isAuto = false) => {
    if (isLocating) return;

    // Fast path: If coordinates are already present, resolve detailed doorstep address immediately!
    if (coords.lat && coords.lng && (!addressLine || !addressLine.trim() || addressLine.startsWith('Near GPS') || addressLine.length < 10)) {
      setIsLocating(true);
      if (!isAuto) setStepError('');
      try {
        const resolvedAddress = await fetchAddressFromCoords(coords.lat, coords.lng);
        if (resolvedAddress) {
          setAddressLine(resolvedAddress);
          setIsLocating(false);
          return;
        }
      } catch (err) {}
      setIsLocating(false);
    }

    if (!navigator.geolocation) {
      if (!isAuto) setStepError('Location services are not supported by your browser.');
      return;
    }
    setIsLocating(true);
    if (!isAuto) setStepError('');

    try {
      const position = await getAccurateBrowserCoordinates({
        timeoutMs: 15000,
        desiredAccuracyMeters: 25,
        maxWaitAfterFirstFixMs: 3500
      });
      const lat = position.lat;
      const lng = position.lng;
      const accuracy_m = position.accuracy_m || 10;

      if (accuracy_m > 100 && !isAuto) {
        setStepError(`GPS accuracy is approx ~${accuracy_m}m. Please verify your detailed doorstep address below.`);
      }

      setCoords({ lat, lng, accuracy_m });

      const resolvedAddress = await fetchAddressFromCoords(lat, lng);
      setIsLocating(false);
      if (resolvedAddress) {
        setAddressLine(resolvedAddress);
        return;
      }

      setAddressLine((prev) => (prev && prev.length > 5 ? prev : `Near GPS: ${lat}, ${lng} (Auto-detected)`));
    } catch (error) {
      setIsLocating(false);
      console.warn('Geolocation notice:', error.message);
      if (!isAuto) {
        if (currentUser?.address) {
          setAddressLine(currentUser.address);
        } else {
          setStepError(error.message || 'Location permission was denied. Please enter your address manually.');
        }
      }
    }
  };

  // Auto-fetch address when user clicks into the address section
  const handleAddressFieldClick = () => {
    if (isLocating) return;
    if (!addressLine || !addressLine.trim() || addressLine.startsWith('Near GPS') || addressLine.length < 10) {
      handleUseCurrentLocation(false);
    }
  };

  // =========================================================================
  // Navigation & Step Transitions
  // =========================================================================
  const handleProceedToReview = (e) => {
    if (e) e.preventDefault();
    if (!canContinueStep1) {
      return;
    }
    setStepError('');
    setStep(2);
    if (!addressLine || !addressLine.trim() || addressLine.startsWith('Near GPS') || addressLine.length < 10) {
      if (coords.lat && coords.lng) {
        setIsLocating(true);
        fetchAddressFromCoords(coords.lat, coords.lng)
          .then((addr) => {
            setIsLocating(false);
            if (addr) setAddressLine(addr);
          })
          .catch(() => setIsLocating(false));
      } else if (typeof window !== 'undefined' && navigator.geolocation) {
        handleUseCurrentLocation(true);
      }
    }
  };

  // =========================================================================
  // Server-Side Proximity Matching & Submission
  // =========================================================================
  const handleConfirmBooking = async (e) => {
    if (e) e.preventDefault();

    if (!currentUser || !currentUser.isLoggedIn) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    if (!addressLine.trim() || addressLine.trim().length < 6) {
      setStepError('Please enter a complete residential service address where repair is needed.');
      return;
    }

    if (hasActiveCustomerRequest) {
      setStepError(
        `Active Request in Progress (${activeCustomerRequest?.requestRef}): You already have an active request in progress (${activeCustomerRequest?.status}). You cannot create another booking until your ongoing service is completed or cancelled.`
      );
      return;
    }

    setIsSubmitting(true);
    setStepError('');
    setStep(3); // Move to confirm/matching screen with loading state

    try {
      const cleanUserPhone = (currentUser.phone || '').replace(/\D/g, '');
      const isGarbage = cleanUserPhone === '9876543210' || cleanUserPhone === '9876543220' || cleanUserPhone === '9876543211' || cleanUserPhone === '9840123456';
      const finalPhone = !isGarbage && cleanUserPhone && cleanUserPhone.length >= 10
        ? (currentUser.phone.startsWith('+91') ? currentUser.phone : `+91 ${cleanUserPhone}`)
        : (isGarbage ? '' : (currentUser.phone || ''));

      const requestPayload = {
        userId: currentUser.id || null,
        userEmail: currentUser.email || null,
        userName: currentUser.name || 'Customer',
        phone: finalPhone,
        address: addressLine.trim(),
        userAddress: addressLine.trim(),
        lat: coords.lat || (currentUser.lat ? parseFloat(currentUser.lat) : null),
        lng: coords.lng || (currentUser.lng ? parseFloat(currentUser.lng) : null),
        serviceId: activeServiceForBooking.id || 'service',
        serviceTitle: activeServiceForBooking.title || serviceActionTitle,
        category: activeServiceForBooking.categoryId || (isPlumber ? 'plumber' : 'electrician'),
        issueType: problemDescription.slice(0, 50) || (photos.length > 0 ? 'Photo Inspection' : 'Service Request'),
        problemDescription: problemDescription.trim() || (photos.length > 0 ? 'Photo attached for professional inspection.' : 'Standard inspection and repair'),
        problemTiming: problemTiming || 'Not specified',
        problemFrequency: problemFrequency || 'Not specified',
        photos: photos.map((p) => ({
          filename: p.filename || p.originalFilename,
          originalFilename: p.originalFilename,
          mimeType: p.mimeType,
          fileSize: p.fileSize || 0,
          url: p.url || p.previewUrl
        }))
      };

      /**
       * Server-side Expanding-Radius Matching Trigger:
       * The backend executes `findNearbyProvidersExpandingRadius(lat, lng, category, [1, 3, 5, 10])`
       * and returns genuine matched candidate count or transparent notification if none available.
       */
      if (createServiceRequest) {
        const result = await createServiceRequest(requestPayload, currentUser);
        if (result && result.request) {
          setConfirmedBooking(result.request);
          setMatchSummary(result.matchSummary || result.request.matchSummary || null);
          if (currentUser && loadMyRequests) {
            loadMyRequests(currentUser);
          }
        }
      } else {
        const result = await addNewBooking(
          { ...requestPayload, scheduledTime: 'Today, Express 30 Mins', totalAmount: 0 },
          currentUser
        );
        if (result && result.booking) {
          setConfirmedBooking(result.booking);
          setMatchSummary(result.matchSummary || null);
          if (currentUser && loadUserBookings) {
            loadUserBookings(currentUser);
          }
        }
      }
    } catch (err) {
      console.error('Booking submission error:', err);
      setStepError(err.message || 'Your service request could not be processed. Please try again.');
      setStep(2); // Return to review step on error so user can retry
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAcceptQuotation = async (quoteId) => {
    setIsAcceptingQuote(true);
    try {
      const res = await fetch(`http://localhost:5000/api/quotes/${quoteId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userEmail: currentUser?.email,
          userId: currentUser?.id
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAcceptedQuote(data.assignedProvider);
        if (data.otpCode) {
          setConfirmedBooking((prev) => ({ ...prev, otpCode: data.otpCode, status: 'Accepted' }));
        }
        if (currentUser && loadMyRequests) {
          loadMyRequests(currentUser);
        }
        if (currentUser && loadUserBookings) {
          loadUserBookings(currentUser);
        }
      } else {
        alert(data.error || 'Unable to accept quote. Please try again.');
      }
    } catch (err) {
      alert(err.message || 'Failed to accept quotation.');
    } finally {
      setIsAcceptingQuote(false);
    }
  };

  if (!isBookingModalOpen && !isMinimized) {
    return null;
  }

  if (isMinimized && confirmedBooking) {
    return (
      <div
        className="booking-docked-indicator"
        onClick={() => {
          setIsMinimized(false);
          resetAutoMinimizeTimer();
        }}
        role="status"
        aria-live="polite"
        aria-label="Service Request Broadcasted - Click to expand details"
      >
        <span className="docked-dot" />
        <span className="docked-ref-text">
          {confirmedBooking.requestRef || confirmedBooking.bookingId || confirmedBooking.bookingRef || 'NV-SR-Request'}
        </span>
        <span className="docked-status-text">
          • {confirmedBooking.status === 'Open' ? 'Broadcasted' : (confirmedBooking.status || 'Active')}
        </span>
        <span className="docked-expand-icon">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="18 15 12 9 6 15"></polyline>
          </svg>
        </span>
        <button
          type="button"
          className="docked-close-btn"
          onClick={(e) => {
            e.stopPropagation();
            closeBookingModal();
          }}
          title="Dismiss status"
          aria-label="Dismiss status notification"
        >
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    );
  }

  if (!activeServiceForBooking) {
    return null;
  }

  return (
    <div className="booking-modal-backdrop open" onClick={closeBookingModal}>
      <div
        className="booking-modal-card real-booking-drawer"
        onClick={(e) => {
          e.stopPropagation();
          resetAutoMinimizeTimer();
        }}
        onMouseMove={resetAutoMinimizeTimer}
        onTouchStart={resetAutoMinimizeTimer}
        onScroll={resetAutoMinimizeTimer}
        onKeyDown={resetAutoMinimizeTimer}
      >
        {/* Close Drawer Button */}
        <button
          type="button"
          className="btn-close-drawer"
          onClick={closeBookingModal}
          aria-label="Close Booking Modal"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {/* Modal Header */}
        <div className="booking-flow-header">
          <span className="booking-category-kicker">{categoryLabel}</span>
          <h2 className="booking-service-title">{serviceActionTitle}</h2>
          <p className="booking-service-subtitle">
            Tell us what is happening if you can — a description or a photo helps, but neither is required.
          </p>
        </div>

        {/* 3-Step Progress Indicator: 01 Describe & Photos -> 02 Review -> 03 Confirm */}
        <div className="modal-step-indicator real-progress-indicator">
          <div className={`step-pill-item ${step >= 1 ? 'active' : ''} ${step === 1 ? 'current' : ''}`}>
            <span className="step-num">01</span>
            <span className="step-label">Describe & Photos</span>
          </div>
          <span className="step-divider">→</span>
          <div className={`step-pill-item ${step >= 2 ? 'active' : ''} ${step === 2 ? 'current' : ''}`}>
            <span className="step-num">02</span>
            <span className="step-label">Review</span>
          </div>
          <span className="step-divider">→</span>
          <div className={`step-pill-item ${step >= 3 ? 'active' : ''} ${step === 3 ? 'current' : ''}`}>
            <span className="step-num">03</span>
            <span className="step-label">Confirm</span>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* STEP 1: COMBINED DESCRIBE & PHOTOS (OPTIONAL INDIVIDUALLY) */}
        {/* ========================================================================= */}
        {step === 1 && (
          <div className="booking-step-content">
            {/* Optional Description Text Area (No Red Asterisk) */}
            <div className="form-group-block">
              <label className="booking-section-heading" htmlFor="problem-description-input">
                What needs fixing?
              </label>
              <p className="booking-field-helper">
                Tell us what you noticed or leave a brief note for the technician.
              </p>

              <textarea
                id="problem-description-input"
                className="booking-problem-textarea"
                rows={3}
                value={problemDescription}
                onChange={(e) => {
                  setProblemDescription(e.target.value);
                  if (stepError) setStepError('');
                }}
                placeholder={
                  isPlumber
                    ? 'Example: The kitchen sink drain is blocked and water is draining slowly.'
                    : 'Example: The MCB trips whenever I switch on the kitchen appliances.'
                }
                autoFocus
              />
            </div>

            {/* Service-Specific Guidance Chips */}
            <div className="form-group-block" style={{ marginTop: '-0.25rem', marginBottom: '1.25rem' }}>
              <span className="suggestion-chips-label">Common problem suggestions:</span>
              <div className="booking-suggestion-chips">
                {suggestionChips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className={`booking-chip ${problemDescription.includes(chip) ? 'selected' : ''}`}
                    onClick={() => handleChipClick(chip)}
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Photo Capture & Upload (Directly Below Description Field) */}
            <div className="form-group-block photo-capture-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '0.35rem' }}>
                <label className="booking-section-heading" style={{ fontSize: '0.95rem' }}>
                  Attach Photos (Optional)
                </label>
                {photos.length > 0 && (
                  <span className="photo-count-badge">
                    {photos.length} / 5 photos attached
                  </span>
                )}
              </div>

              {photoError && <div className="booking-field-error-message">{photoError}</div>}

              {/* Photo Action Buttons: Upload a Photo and Take a Photo */}
              <div className="photo-action-buttons" style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem' }}>
                {/* Upload Button */}
                <button
                  type="button"
                  className="btn-photo-action"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  disabled={photos.length >= 5 || isUploadingPhoto}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                  </svg>
                  <span>{isUploadingPhoto ? 'Uploading...' : 'Upload a photo'}</span>
                </button>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  style={{ display: 'none' }}
                  onChange={handleFileUpload}
                />

                {/* Camera Capture Button */}
                <button
                  type="button"
                  className="btn-photo-action"
                  onClick={handleStartCamera}
                  disabled={photos.length >= 5 || isUploadingPhoto}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                  <span>Take a photo</span>
                </button>
              </div>

              {/* Camera Viewfinder Overlay */}
              {isCameraActive && (
                <div className="camera-viewfinder-box">
                  <div className="viewfinder-header">
                    <span className="viewfinder-title">Device Camera Viewfinder</span>
                    <button type="button" className="btn-close-viewfinder" onClick={stopCameraStream} aria-label="Close Viewfinder">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                      </svg>
                    </button>
                  </div>

                  {cameraError ? (
                    <div className="camera-error-notice">{cameraError}</div>
                  ) : (
                    <div>
                      {!cameraSnapshot ? (
                        <div className="video-container">
                          <video ref={videoRef} autoPlay playsInline muted className="camera-live-video" />
                          <div className="viewfinder-crosshair"></div>
                          <div className="camera-toolbar">
                            <button
                              type="button"
                              className="btn-capture-snap"
                              onClick={handleCaptureSnapshot}
                            >
                              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                              </svg>
                              <span>Capture Photo</span>
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="snapshot-preview-container">
                          <img src={cameraSnapshot} alt="Snapshot Preview" className="snapshot-preview-img" />
                          <div className="snapshot-toolbar">
                            <button
                              type="button"
                              className="category-tab-btn"
                              onClick={() => setCameraSnapshot(null)}
                            >
                              <span>Retake</span>
                            </button>
                            <button
                              type="button"
                              className="btn-book-service-primary"
                              onClick={handleUseCapturedPhoto}
                              disabled={isUploadingPhoto}
                            >
                              <span>{isUploadingPhoto ? 'Saving...' : 'Use this photo'}</span>
                            </button>
                          </div>
                        </div>
                      )}
                      <canvas ref={canvasRef} style={{ display: 'none' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Photo Previews Grid */}
              {photos.length > 0 && (
                <div className="photo-preview-grid">
                  {photos.map((photo, index) => (
                    <div key={photo.id || index} className="photo-preview-card">
                      <img
                        src={photo.url ? `http://localhost:5000${photo.url}` : photo.previewUrl}
                        alt={`Problem attachment ${index + 1}`}
                        className="photo-preview-thumbnail"
                      />
                      <div className="photo-preview-details">
                        <span className="photo-name-truncate">{photo.originalFilename || `Photo ${index + 1}`}</span>
                        <button
                          type="button"
                          className="btn-remove-photo-item"
                          onClick={() => handleRemovePhoto(index)}
                          title="Remove photo"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          <span>Remove</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Collapsed Optional Diagnostic Details */}
            <div className="optional-diagnostic-section" style={{ marginTop: '1.25rem', marginBottom: '1.5rem' }}>
              <button
                type="button"
                className="btn-toggle-optional-details"
                onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  background: 'transparent',
                  border: 'none',
                  padding: '0.45rem 0',
                  color: '#1e3a5f',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{
                    transform: isDetailsExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                  }}
                >
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
                <span>Add more details (optional)</span>
              </button>

              {isDetailsExpanded && (
                <div
                  className="structured-details-grid"
                  style={{
                    marginTop: '0.75rem',
                    padding: '1rem',
                    background: 'rgba(247, 245, 241, 0.65)',
                    borderRadius: '12px',
                    border: '1px solid #e2e8f0',
                    animation: 'fadeIn 0.25s ease-out'
                  }}
                >
                  <div className="detail-column">
                    <label className="structured-label" style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.45rem' }}>
                      When did the problem start?
                    </label>
                    <div className="pill-options-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {timingOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`pill-option-btn ${problemTiming === opt ? 'active' : ''}`}
                          onClick={() => setProblemTiming(problemTiming === opt ? '' : opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="detail-column">
                    <label className="structured-label" style={{ fontSize: '0.82rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '0.45rem' }}>
                      Is the issue:
                    </label>
                    <div className="pill-options-group" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                      {frequencyOptions.map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          className={`pill-option-btn ${problemFrequency === opt ? 'active' : ''}`}
                          onClick={() => setProblemFrequency(problemFrequency === opt ? '' : opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Step 1 Actions */}
            <div className="booking-footer-actions" style={{ marginTop: '1.5rem' }}>
              <button
                type="button"
                className="btn-book-service-primary"
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  cursor: canContinueStep1 ? 'pointer' : 'not-allowed',
                  opacity: canContinueStep1 ? 1 : 0.6
                }}
                disabled={!canContinueStep1}
                onClick={handleProceedToReview}
              >
                <span>Continue to Review →</span>
              </button>
              {!canContinueStep1 && (
                <p className="validation-helper-text" style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', marginTop: '0.45rem' }}>
                  Add a short description or a photo to continue
                </p>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 2: ADDRESS & REVIEW */}
        {/* ========================================================================= */}
        {step === 2 && (
          <div className="booking-step-content">
            {/* Service Address Input */}
            <div className="form-group-block">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label className="booking-section-heading" htmlFor="booking-address-input">
                  Service Address <span className="required-indicator" style={{ color: '#b91c1c' }}>*</span>
                </label>
                <button
                  type="button"
                  className="btn-location-assist"
                  onClick={() => handleUseCurrentLocation(false)}
                  disabled={isLocating}
                >
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
                  </svg>
                  <span>{isLocating ? 'Locating...' : 'Use current location'}</span>
                </button>
              </div>

              {coords.lat && (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: '#065f46',
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                    borderRadius: '8px',
                    padding: '0.35rem 0.65rem',
                    marginBottom: '0.65rem'
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                  <span>GPS Location Attached ({coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}) — Proximity Search Ready</span>
                </div>
              )}

              <textarea
                id="booking-address-input"
                className="booking-problem-textarea"
                rows={2}
                value={addressLine}
                onClick={handleAddressFieldClick}
                onFocus={handleAddressFieldClick}
                onChange={(e) => {
                  setAddressLine(e.target.value);
                  if (stepError) setStepError('');
                }}
                placeholder={isLocating ? 'Detecting your doorstep address via GPS...' : 'House / Flat No., Street, Area, City, PIN code'}
                required
              />

              {stepError && (
                <div className="booking-field-error-message" style={{ marginTop: '0.45rem' }}>
                  {stepError}
                </div>
              )}
            </div>

            {/* Review Summary Card */}
            <div className="booking-review-card">
              <span className="review-card-header">REQUEST SUMMARY</span>

              <div className="review-item-row">
                <span className="review-item-label">Service</span>
                <span className="review-item-value">{activeServiceForBooking.title || serviceActionTitle}</span>
              </div>

              <div className="review-item-row">
                <span className="review-item-label">Problem</span>
                <span className="review-item-value problem-text-highlight">
                  {problemDescription.trim() ? `"${problemDescription}"` : 'Photo inspection provided'}
                </span>
              </div>

              {(problemTiming || problemFrequency) && (
                <div className="review-item-row">
                  <span className="review-item-label">Timing & Frequency</span>
                  <span className="review-item-value">
                    {[problemTiming, problemFrequency].filter(Boolean).join(' • ')}
                  </span>
                </div>
              )}

              <div className="review-item-row">
                <span className="review-item-label">Photos</span>
                <span className="review-item-value">
                  {photos.length > 0 ? `${photos.length} photo${photos.length > 1 ? 's' : ''} attached` : 'No photos attached'}
                </span>
              </div>

              <div className="review-item-row">
                <span className="review-item-label">Customer</span>
                <span className="review-item-value">
                  {currentUser?.name || 'Authenticated Customer'} ({currentUser?.phone || currentUser?.email || 'Verified Account'})
                </span>
              </div>
            </div>

            {/* Step 2 Actions */}
            <div className="booking-footer-actions dual">
              <button
                type="button"
                className="btn-booking-back"
                onClick={() => setStep(1)}
                disabled={isSubmitting}
              >
                ← Back
              </button>
              <button
                type="button"
                className="btn-book-service-primary"
                style={{ flex: 1, justifyContent: 'center' }}
                onClick={handleConfirmBooking}
                disabled={isSubmitting}
              >
                <span>Submit Service Request →</span>
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 3: CONFIRMATION & SERVER-SIDE PROXIMITY MATCHING */}
        {/* ========================================================================= */}
        {step === 3 && (
          <div className="booking-step-content booking-confirmed-view">
            {isSubmitting ? (
              /* Loading State during server-side proximity matching */
              <div
                className="proximity-matching-loading"
                style={{
                  textAlign: 'center',
                  padding: '3rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '1.25rem'
                }}
              >
                <div
                  className="matching-spinner"
                  style={{
                    width: '52px',
                    height: '52px',
                    border: '3px solid rgba(15, 77, 60, 0.15)',
                    borderTopColor: '#0f4d3c',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite'
                  }}
                />
                <div>
                  <h3
                    style={{
                      fontFamily: "'Fraunces', serif",
                      fontSize: '1.35rem',
                      color: '#1e3a5f',
                      marginBottom: '0.45rem'
                    }}
                  >
                    Finding a certified pro near you...
                  </h3>
                  <p
                    style={{
                      fontSize: '0.88rem',
                      color: '#64748b',
                      maxWidth: '380px',
                      margin: '0 auto',
                      lineHeight: 1.5
                    }}
                  >
                    Searching expanding radius (1 km → 3 km → 5 km → 10 km) for verified, available professionals.
                  </p>
                </div>
              </div>
            ) : confirmedBooking ? (
              /* Confirmed Outcome */
              <div>
                {acceptedQuote ? (
                  /* Quotation Accepted & Confirmed Pro Banner */
                  <div className="confirmed-status-badge" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
                    <span className="confirmed-check-icon" style={{ background: '#059669', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                    <div>
                      <h3 className="confirmed-main-title" style={{ color: '#065f46' }}>YOUR PROFESSIONAL IS CONFIRMED</h3>
                      <p className="confirmed-sub-title" style={{ color: '#047857' }}>
                        {acceptedQuote.name || 'Your professional'} is assigned. Agreed amount: ₹{acceptedQuote.agreedAmount || acceptedQuote.amount || 0}.
                      </p>
                    </div>
                  </div>
                ) : matchSummary && !matchSummary.matched ? (
                  /* Honest No-Pro Available State */
                  <div
                    className="no-pros-notice-card"
                    style={{
                      background: '#fffbeb',
                      border: '1px solid #fef3c7',
                      borderRadius: '14px',
                      padding: '1.25rem',
                      marginBottom: '1.25rem'
                    }}
                  >
                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#d97706" strokeWidth="2" style={{ flexShrink: 0, marginTop: '2px' }}>
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#92400e' }}>
                          Searching Progressive Radius
                        </h4>
                        <p style={{ margin: '0.35rem 0 0 0', fontSize: '0.86rem', color: '#b45309', lineHeight: 1.5 }}>
                          Expanding radius starting at 50m to find nearby certified professionals.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Standard Dispatched / Broadcasted Confirmation */
                  <div className="confirmed-status-badge">
                    <span className="confirmed-check-icon" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </span>
                    <div>
                      <h3 className="confirmed-main-title">SERVICE REQUEST BROADCASTED</h3>
                      <p className="confirmed-sub-title">
                        {matchSummary?.message || 'Nearby verified professionals receive your request and submit transparent quotations.'}
                      </p>
                    </div>
                  </div>
                )}

                {/* Real-time Quotation Comparison Section */}
                {!acceptedQuote && (
                  <div className="live-quotations-container" style={{ margin: '1.25rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#1e3a5f', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span>Quotations</span>
                        <span style={{ fontSize: '0.75rem', background: liveQuotes.length > 0 ? '#059669' : '#d97706', color: '#fff', padding: '0.15rem 0.55rem', borderRadius: '12px' }}>
                          {liveQuotes.length} Received
                        </span>
                      </h4>
                      {liveQuotes.length === 0 && (
                        <span style={{ fontSize: '0.76rem', color: '#64748b' }}>
                          Listening in real-time...
                        </span>
                      )}
                    </div>

                    {liveQuotes.length === 0 ? (
                      <div style={{ background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: '12px', padding: '1.5rem', textAlign: 'center' }}>
                        <div className="matching-spinner" style={{ width: '28px', height: '28px', border: '2px solid rgba(15, 77, 60, 0.2)', borderTopColor: '#0f4d3c', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 0.75rem' }} />
                        <p style={{ margin: 0, fontWeight: 700, fontSize: '0.88rem', color: '#334155' }}>Nearby professionals are assessing your request</p>
                        <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#64748b' }}>
                          Quotations will arrive here live without refreshing. You choose who you prefer.
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                        {liveQuotes.map((q) => {
                          const qId = q.quoteId || q.id;
                          const prov = q.provider || {
                            name: q.agent_name || q.agentName || 'Verified Professional',
                            rating: q.agent_rating || q.agentRating || null,
                            completedJobs: q.agent_completed_jobs || q.agentCompletedJobs || 0
                          };
                          return (
                            <div
                              key={qId}
                              style={{
                                border: '1.5px solid #e2e8f0',
                                borderRadius: '12px',
                                padding: '1rem',
                                background: '#ffffff',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.65rem'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                  <div style={{ fontWeight: 800, fontSize: '0.98rem', color: '#1e3a5f' }}>
                                    {prov.name}
                                  </div>
                                  <div style={{ fontSize: '0.78rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.15rem' }}>
                                    <span style={{ color: prov.rating ? '#f59e0b' : '#64748b', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                      {prov.rating ? (
                                        <>
                                          <svg viewBox="0 0 24 24" width="12" height="12" fill="#f59e0b" stroke="#f59e0b" aria-hidden="true">
                                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                          </svg>
                                          <span>{Number(prov.rating).toFixed(1)}</span>
                                        </>
                                      ) : 'New Pro'}
                                    </span>
                                    <span>•</span>
                                    <span>{prov.completedJobs || 0} jobs</span>
                                    {q.warrantyDays && (
                                      <>
                                        <span>•</span>
                                        <span style={{ color: '#059669', fontWeight: 600 }}>{q.warrantyDays}-day warranty</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                  <div style={{ fontSize: '1.35rem', fontWeight: 900, color: '#059669', fontFamily: 'var(--font-mono)' }}>
                                    ₹{q.amount}
                                  </div>
                                  <div style={{ fontSize: '0.74rem', color: '#64748b' }}>
                                    ETA: {q.etaMinutes || 30} mins
                                  </div>
                                </div>
                              </div>

                              {(q.providerNote || q.message) && (
                                <div style={{ background: '#f8fafc', padding: '0.45rem 0.65rem', borderRadius: '6px', fontSize: '0.82rem', color: '#475569', fontStyle: 'italic' }}>
                                  "{q.providerNote || q.message}"
                                </div>
                              )}

                              <button
                                type="button"
                                className="btn-book-service-primary"
                                style={{ width: '100%', justifyContent: 'center', padding: '0.65rem', fontSize: '0.88rem' }}
                                onClick={() => handleAcceptQuotation(qId)}
                                disabled={isAcceptingQuote}
                              >
                                {isAcceptingQuote ? 'Confirming...' : 'Accept Quotation →'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <div className="confirmed-details-card">
                  <div className="confirmed-row">
                    <span className="confirmed-label">Request Reference</span>
                    <span className="confirmed-value-mono">
                      {confirmedBooking.requestRef || confirmedBooking.bookingId || confirmedBooking.bookingRef}
                    </span>
                  </div>

                  <div className="confirmed-row">
                    <span className="confirmed-label">Marketplace Status</span>
                    <span className="confirmed-status-tag" style={{ background: '#ecfdf5', color: '#065f46', borderColor: '#a7f3d0' }}>
                      ● {confirmedBooking.status === 'Open' ? 'Broadcasted (Awaiting Quotes)' : (confirmedBooking.status || 'Request Received')}
                    </span>
                  </div>

                  <div className="confirmed-row">
                    <span className="confirmed-label">Service</span>
                    <span className="confirmed-value">{confirmedBooking.serviceTitle}</span>
                  </div>

                  <div className="confirmed-row">
                    <span className="confirmed-label">Problem Details</span>
                    <span className="confirmed-value">
                      "{confirmedBooking.problemDescription || 'Photo inspection provided'}"
                    </span>
                  </div>

                  <div className="confirmed-row">
                    <span className="confirmed-label">Attached Photos</span>
                    <span className="confirmed-value">
                      {confirmedBooking.photos && confirmedBooking.photos.length > 0
                        ? `${confirmedBooking.photos.length} photo${confirmedBooking.photos.length > 1 ? 's' : ''}`
                        : 'None'}
                    </span>
                  </div>

                  <div className="confirmed-row">
                    <span className="confirmed-label">Service Address</span>
                    <span className="confirmed-value">{confirmedBooking.userAddress || confirmedBooking.address}</span>
                  </div>

                  {confirmedBooking.otpCode && (
                    <div className="confirmed-row door-otp-row">
                      <span className="confirmed-label">Door Verification OTP</span>
                      <span className="door-otp-pill">{confirmedBooking.otpCode}</span>
                    </div>
                  )}
                </div>

                <div className="truthful-matching-notice" style={{ marginTop: '1rem', marginBottom: '1.25rem' }}>
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="16" x2="12" y2="12"></line>
                    <line x1="12" y1="8" x2="12.01" y2="8"></line>
                  </svg>
                  <span>
                    Nearby certified professionals will review your request and submit transparent quotes. You can compare quotes and accept your preferred pro.
                  </span>
                </div>

                <div className="booking-footer-actions" style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                  <button
                    type="button"
                    className="btn-book-service-primary"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={() => {
                      closeBookingModal();
                      window.location.hash = '#/bookings';
                    }}
                  >
                    Track in My Bookings →
                  </button>
                  <button
                    type="button"
                    className="btn-booking-done-ghost"
                    style={{ width: '100%', justifyContent: 'center' }}
                    onClick={closeBookingModal}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
