import { createContext, useContext, useState, useEffect, useRef } from "react";
import api from "../utils/api";
import useAuth from "../hooks/useAuth";

const ActiveTripContext = createContext(null);

export const ActiveTripProvider = ({ children }) => {
  const { user } = useAuth();

  /* ───────── Trip / navigation state ───────── */
  const [tripState, setTripState] = useState("planning"); // "planning" | "active"
  const [loading, setLoading] = useState(false);
  const [routes, setRoutes] = useState([]);
  const [bestRoute, setBestRoute] = useState(null);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeTripId, setActiveTripId] = useState(null);

  /* ───────── Address search ───────── */
  const [startQuery, setStartQuery] = useState("");
  const [startCoords, setStartCoords] = useState({ lat: 18.5204, lng: 73.8567 });
  const [destQuery, setDestQuery] = useState("");
  const [destCoords, setDestCoords] = useState({ lat: null, lng: null });
  const [travelMode, setTravelMode] = useState("driving-car");

  /* ───────── Safety settings ───────── */
  const [shareLocation, setShareLocation] = useState(true);
  const [routeDeviation, setRouteDeviation] = useState(true);
  const [deviationThreshold, setDeviationThreshold] = useState(200);
  const [periodicCheck, setPeriodicCheck] = useState(true);
  const [checkInterval, setCheckInterval] = useState(15);
  const [recordAudio, setRecordAudio] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  /* ───────── Active monitoring ───────── */
  const [userLocation, setUserLocation] = useState(null);
  const [distanceRemaining, setDistanceRemaining] = useState(0);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isDeviated, setIsDeviated] = useState(false);
  const [deviationMeters, setDeviationMeters] = useState(0);
  const [showCheckInModal, setShowCheckInModal] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [nearDestination, setNearDestination] = useState(false);

  /* ───────── Refs ───────── */
  const gpsWatchRef = useRef(null);
  const checkInTimerRef = useRef(null);

  /* ───────── Haversine distance ───────── */
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371e3;
    const phi1 = (lat1 * Math.PI) / 180;
    const phi2 = (lat2 * Math.PI) / 180;
    const dPhi = ((lat2 - lat1) * Math.PI) / 180;
    const dLam = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dPhi / 2) ** 2 +
      Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLam / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  /* ───────── Live GPS tracking (Application level) ───────── */
  const startLiveTracking = (tripId, routePoints, totalDist, totalDur, destinationCoordinates) => {
    if (!navigator.geolocation) return;

    if (gpsWatchRef.current) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
    }

    const destLat = destinationCoordinates?.lat || destCoords.lat;
    const destLng = destinationCoordinates?.lng || destCoords.lng;

    gpsWatchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserLocation([lat, lng]);

        if (routePoints && routePoints.length > 0) {
          // Find closest point on route
          let minDist = Infinity;
          let closestIdx = 0;
          routePoints.forEach(([rlng, rlat], idx) => {
            const d = getDistance(lat, lng, rlat, rlng);
            if (d < minDist) {
              minDist = d;
              closestIdx = idx;
            }
          });

          if (routeDeviation && minDist > deviationThreshold) {
            setIsDeviated(true);
            setDeviationMeters(Math.round(minDist));
          } else {
            setIsDeviated(false);
          }

          // Remaining distance calculation
          let remaining = 0;
          for (let i = closestIdx; i < routePoints.length - 1; i++) {
            const [lng1, lat1] = routePoints[i];
            const [lng2, lat2] = routePoints[i + 1];
            remaining += getDistance(lat1, lng1, lat2, lng2);
          }

          const ratio = totalDist > 0 ? remaining / totalDist : 0;
          setDistanceRemaining((remaining / 1000).toFixed(1));
          setTimeRemaining(Math.round((totalDur * ratio) / 60));
        }

        if (destLat && destLng && getDistance(lat, lng, destLat, destLng) < 100) {
          setNearDestination(true);
        }
      },
      (err) => console.error("Watch Position error:", err),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  const stopLiveTracking = () => {
    if (gpsWatchRef.current) {
      navigator.geolocation.clearWatch(gpsWatchRef.current);
      gpsWatchRef.current = null;
    }
  };

  /* ───────── Periodic Safety Check-in Timer ───────── */
  const startCheckInTimer = () => {
    const total = checkInterval * 60;
    setSecondsRemaining(total);
    if (checkInTimerRef.current) clearInterval(checkInTimerRef.current);

    checkInTimerRef.current = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 16) setShowCheckInModal(true);
        if (prev <= 1) {
          clearInterval(checkInTimerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopCheckInTimer = () => {
    if (checkInTimerRef.current) {
      clearInterval(checkInTimerRef.current);
      checkInTimerRef.current = null;
    }
    setShowCheckInModal(false);
  };

  const handleConfirmSafe = () => {
    setShowCheckInModal(false);
    startCheckInTimer();
  };

  /* ───────── Start Trip ───────── */
  const startTrip = async () => {
    if (!bestRoute) return;
    try {
      setLoading(true);

      const res = await api.post("/trips", {
        start: { lat: startCoords.lat, lng: startCoords.lng, address: startQuery },
        destination: { lat: destCoords.lat, lng: destCoords.lng, address: destQuery },
        route: bestRoute,
        safetyScore: bestRoute.score || 0,
      });

      const trip = res.data;
      const startRes = await api.put(`/trips/${trip._id}/start`, {});

      const activeDoc = startRes.data || trip;
      setActiveTrip(activeDoc);
      setActiveTripId(activeDoc._id);
      localStorage.setItem("sahyatri_active_trip_id", activeDoc._id);

      setTripState("active");
      setIsDeviated(false);
      setNearDestination(false);

      const routePoints = bestRoute.geometry?.coordinates || [];
      const distance = bestRoute.summary?.distance || 0;
      const duration = bestRoute.summary?.duration || 0;
      setDistanceRemaining((distance / 1000).toFixed(1));
      setTimeRemaining(Math.round(duration / 60));

      startLiveTracking(activeDoc._id, routePoints, distance, duration, destCoords);
      if (periodicCheck) startCheckInTimer();
    } catch (err) {
      console.error("Start Trip error:", err);
      alert("Failed to register active trip");
    } finally {
      setLoading(false);
    }
  };

  /* ───────── Complete Trip ───────── */
  const completeTrip = async () => {
    try {
      setLoading(true);

      // Step 1: Resolve targetTripId with multi-layer fallback
      let targetTripId = activeTripId || activeTrip?._id || localStorage.getItem("sahyatri_active_trip_id");

      // Step 2: Fallback — query server for active trip if missing in state
      if (!targetTripId) {
        console.log("🔍 Active trip ID missing in state. Querying server for active trip...");
        try {
          const activeRes = await api.get("/trips/active");
          if (activeRes.data?._id) {
            targetTripId = activeRes.data._id;
          }
        } catch (e) {
          console.warn("Failed to query active trip from server:", e.message);
        }
      }

      // Step 3: Secondary fallback — query GET /api/trips list
      if (!targetTripId) {
        try {
          const listRes = await api.get("/trips");
          const found = (listRes.data || []).find((t) => t.status === "active");
          if (found?._id) {
            targetTripId = found._id;
          }
        } catch (e) {
          console.warn("Failed to query trips list from server:", e.message);
        }
      }

      if (!targetTripId) {
        console.warn("⚠️ No active trip found on server to complete.");
        stopCheckInTimer();
        stopLiveTracking();
        localStorage.removeItem("sahyatri_active_trip_id");
        setTripState("planning");
        setActiveTrip(null);
        setActiveTripId(null);
        setBestRoute(null);
        setRoutes([]);
        setUserLocation(null);
        setNearDestination(false);
        setIsDeviated(false);
        setDeviationMeters(0);
        return;
      }

      console.log(`📡 Sending PUT /api/trips/${targetTripId}/complete to server...`);

      const res = await api.put(`/trips/${targetTripId}/complete`, {});

      console.log("Server response for trip completion:", res.data);

      if (res.status === 200) {
        stopCheckInTimer();
        stopLiveTracking();
        localStorage.removeItem("sahyatri_active_trip_id");

        setTripState("planning");
        setActiveTrip(null);
        setActiveTripId(null);
        setBestRoute(null);
        setRoutes([]);
        setUserLocation(null);
        setNearDestination(false);
        setIsDeviated(false);
        setDeviationMeters(0);

        alert("🏁 Trip completed successfully!");
      } else {
        throw new Error("Server returned non-200 status code.");
      }
    } catch (err) {
      console.error("❌ Failed to complete trip on backend:", err.response?.data || err.message);
      alert(`Failed to complete trip on server: ${err.response?.data?.message || err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ───────── Abort / End Trip ───────── */
  const abortTrip = async () => {
    if (!window.confirm("End tracking? Your guardians will be notified.")) return;

    try {
      setLoading(true);

      let targetTripId = activeTripId || activeTrip?._id || localStorage.getItem("sahyatri_active_trip_id");

      if (!targetTripId) {
        try {
          const activeRes = await api.get("/trips/active");
          if (activeRes.data?._id) targetTripId = activeRes.data._id;
        } catch (e) {}
      }

      if (targetTripId) {
        await api.put(`/trips/${targetTripId}/complete`, {});
      }

      stopCheckInTimer();
      stopLiveTracking();
      localStorage.removeItem("sahyatri_active_trip_id");

      setTripState("planning");
      setActiveTrip(null);
      setActiveTripId(null);
      setBestRoute(null);
      setRoutes([]);
      setUserLocation(null);
      setNearDestination(false);
      setIsDeviated(false);
      setDeviationMeters(0);
    } catch (err) {
      console.error("❌ Abort Trip Error:", err.response?.data || err.message);
      alert("Failed to end trip on server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ───────── Restore Active Trip from Backend ───────── */
  const restoreActiveTrip = async () => {
    const token = localStorage.getItem("token");
    if (!token) return;

    try {
      let activeTripDoc = null;
      try {
        const activeRes = await api.get("/trips/active");
        activeTripDoc = activeRes.data;
      } catch (e) {
        const listRes = await api.get("/trips");
        activeTripDoc = (listRes.data || []).find((t) => t.status === "active");
      }

      // Explicitly check that activeTripDoc exists AND status === "active"
      if (activeTripDoc && activeTripDoc.status === "active") {
        console.log("📍 ActiveTripContext: Restoring active trip:", activeTripDoc._id);
        setActiveTrip(activeTripDoc);
        setActiveTripId(activeTripDoc._id);
        localStorage.setItem("sahyatri_active_trip_id", activeTripDoc._id);
        setTripState("active");
        setIsDeviated(false);
        setNearDestination(false);

        if (activeTripDoc.start) {
          setStartCoords({ lat: activeTripDoc.start.lat, lng: activeTripDoc.start.lng });
          setStartQuery(activeTripDoc.start.address || "");
        }
        if (activeTripDoc.destination) {
          setDestCoords({ lat: activeTripDoc.destination.lat, lng: activeTripDoc.destination.lng });
          setDestQuery(activeTripDoc.destination.address || "");
        }

        const routeCoords =
          activeTripDoc.route?.coordinates ||
          activeTripDoc.route?.geometry?.coordinates ||
          [];

        const distKm = activeTripDoc.distanceKm || 0;
        const durMin = activeTripDoc.durationMin || 0;

        const restoredRoute = {
          geometry: { coordinates: routeCoords },
          summary: {
            distance: distKm * 1000,
            duration: durMin * 60,
          },
          score: activeTripDoc.safetyScore || 0,
        };

        setBestRoute(restoredRoute);
        setRoutes([restoredRoute]);
        setDistanceRemaining(distKm.toFixed(1));
        setTimeRemaining(Math.round(durMin));

        startLiveTracking(
          activeTripDoc._id,
          routeCoords,
          distKm * 1000,
          durMin * 60,
          activeTripDoc.destination
        );

        if (periodicCheck) {
          startCheckInTimer();
        }
      } else {
        // No active trip on server -> clear active state
        localStorage.removeItem("sahyatri_active_trip_id");
        setTripState("planning");
        setActiveTrip(null);
        setActiveTripId(null);
      }
    } catch (err) {
      console.error("Failed to restore active trip in context:", err);
    }
  };

  useEffect(() => {
    if (user) {
      restoreActiveTrip();
    }
  }, [user]);

  return (
    <ActiveTripContext.Provider
      value={{
        tripState,
        setTripState,
        loading,
        setLoading,
        routes,
        setRoutes,
        bestRoute,
        setBestRoute,
        selectedRouteIdx,
        setSelectedRouteIdx,
        activeTrip,
        activeTripId,
        startQuery,
        setStartQuery,
        startCoords,
        setStartCoords,
        destQuery,
        setDestQuery,
        destCoords,
        setDestCoords,
        travelMode,
        setTravelMode,
        shareLocation,
        setShareLocation,
        routeDeviation,
        setRouteDeviation,
        deviationThreshold,
        setDeviationThreshold,
        periodicCheck,
        setPeriodicCheck,
        checkInterval,
        setCheckInterval,
        recordAudio,
        setRecordAudio,
        showSettings,
        setShowSettings,
        userLocation,
        distanceRemaining,
        timeRemaining,
        isDeviated,
        deviationMeters,
        showCheckInModal,
        setShowCheckInModal,
        secondsRemaining,
        nearDestination,
        setNearDestination,
        startTrip,
        completeTrip,
        abortTrip,
        restoreActiveTrip,
        handleConfirmSafe,
      }}
    >
      {children}
    </ActiveTripContext.Provider>
  );
};

export const useActiveTrip = () => {
  const context = useContext(ActiveTripContext);
  if (!context) {
    throw new Error("useActiveTrip must be used within an ActiveTripProvider");
  }
  return context;
};

export default ActiveTripContext;
