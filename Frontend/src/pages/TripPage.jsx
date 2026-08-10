import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import useAuth from "../hooks/useAuth";
import Navbar from "../components/Navbar";
import LiveMap from "../components/LiveMap";
import SafetyCheckModal from "../components/SafetyCheckModal";
import SOSButton from "../components/SOSButton";
import { useActiveTrip } from "../context/ActiveTripContext";

const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_API_KEY;

export default function TripPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const {
    tripState,
    loading,
    setLoading,
    routes,
    setRoutes,
    bestRoute,
    setBestRoute,
    selectedRouteIdx,
    setSelectedRouteIdx,
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
    handleConfirmSafe,
  } = useActiveTrip();

  /* ───────── UI Suggestion States ───────── */
  const [startSuggestions, setStartSuggestions] = useState([]);
  const [destSuggestions, setDestSuggestions] = useState([]);

  /* ───────── Refs ───────── */
  const sosRef = useRef(null);
  const startDebounceRef = useRef(null);
  const destDebounceRef = useRef(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [user, authLoading, navigate]);

  /* ───────────────────────────────────────────────────
     GEOAPIFY AUTOCOMPLETE
   ─────────────────────────────────────────────────── */
  const fetchGeoapifySuggestions = async (query, type) => {
    if (!query || query.length < 3) {
      type === "start" ? setStartSuggestions([]) : setDestSuggestions([]);
      return;
    }

    try {
      const res = await axios.get(
        "https://api.geoapify.com/v1/geocode/autocomplete",
        {
          params: {
            text: query,
            limit: 5,
            apiKey: GEOAPIFY_KEY,
            bias: "countrycode:in",
          },
        }
      );

      const suggestions = (res.data?.features || []).map((f) => ({
        label: f.properties.formatted,
        lat: f.properties.lat,
        lon: f.properties.lon,
      }));

      type === "start"
        ? setStartSuggestions(suggestions)
        : setDestSuggestions(suggestions);
    } catch (err) {
      console.error("Geoapify autocomplete error:", err.message);
    }
  };

  const handleStartInput = (value) => {
    setStartQuery(value);
    clearTimeout(startDebounceRef.current);
    startDebounceRef.current = setTimeout(
      () => fetchGeoapifySuggestions(value, "start"),
      300
    );
  };

  const handleDestInput = (value) => {
    setDestQuery(value);
    clearTimeout(destDebounceRef.current);
    destDebounceRef.current = setTimeout(
      () => fetchGeoapifySuggestions(value, "dest"),
      300
    );
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setStartCoords(coords);
        setStartQuery(`${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}`);
        setStartSuggestions([]);
        setLoading(false);
      },
      (err) => {
        console.error("GPS Error:", err);
        alert("Failed to access your location.");
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  };

  /* ───────────────────────────────────────────────────
     FETCH SAFE ROUTES
   ─────────────────────────────────────────────────── */
  const fetchSafeRoutes = async () => {
    if (
      !startCoords.lat ||
      !startCoords.lng ||
      !destCoords.lat ||
      !destCoords.lng
    ) {
      alert("Please select both a valid start and destination point.");
      return;
    }
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const res = await axios.post(
        "http://localhost:5000/api/routes/safe",
        { start: startCoords, end: destCoords, mode: travelMode },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const all = res.data.allRoutes || [];
      const best = res.data.safest || all[0] || null;

      setRoutes(all);
      setBestRoute(best);
      setSelectedRouteIdx(0);

      if (all.length === 0) alert("No routes found between selected coordinates.");
    } catch (err) {
      console.error("Routing Error:", err);
      alert("Failed to compute safe routes");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRoute = (idx) => {
    setSelectedRouteIdx(idx);
    setBestRoute(routes[idx]);
  };

  const handleConfirmArrival = (safe) => {
    setNearDestination(false);
    if (safe) completeTrip();
    else sosRef.current?.startSOS();
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const scoreColor = (score) =>
    score >= 80
      ? "bg-green-50 text-green-700 border-green-200"
      : score >= 55
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";

  const scoreLabel = (score) =>
    score >= 80 ? "Safe" : score >= 55 ? "Moderate" : "Risky";

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased selection:bg-red-600 selection:text-white">
      <Navbar />

      <SafetyCheckModal
        isOpen={showCheckInModal}
        onConfirmSafe={handleConfirmSafe}
        onTriggerSOS={() => {
          setShowCheckInModal(false);
          sosRef.current?.startSOS();
        }}
        countdownSeconds={15}
      />

      {/* ── Active trip status banner ── */}
      {tripState === "active" && (
        <div
          className={`px-6 py-3.5 flex items-center justify-between font-semibold text-sm ${
            isDeviated
              ? "bg-red-50 text-red-700 border-b border-red-100"
              : "bg-green-50 text-green-700 border-b border-green-100"
          }`}
        >
          <span className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full animate-pulse ${
                isDeviated ? "bg-red-500" : "bg-green-500"
              }`}
            />
            {isDeviated
              ? `⚠️ Route deviation — ${deviationMeters}m off path`
              : "Trip in progress. Stay safe!"}
          </span>
          <button
            onClick={abortTrip}
            className="text-xs bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg font-semibold transition cursor-pointer"
          >
            End Trip
          </button>
        </div>
      )}

      {/* ── Near destination banner ── */}
      {tripState === "active" && nearDestination && (
        <div className="px-6 py-3.5 flex items-center justify-between bg-blue-50 border-b border-blue-100 text-sm">
          <span className="text-blue-700 font-semibold">
            🎯 You're near your destination — arrived safely?
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleConfirmArrival(true)}
              className="text-xs bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg font-bold transition cursor-pointer"
            >
              Yes, I'm Safe
            </button>
            <button
              onClick={() => handleConfirmArrival(false)}
              className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg font-bold transition cursor-pointer"
            >
              No, SOS
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* ── Hero (planning only) ── */}
        {tripState === "planning" && (
          <motion.section
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[2rem] bg-gradient-to-br from-[#FFF5F5] via-[#FFF8F8] to-white p-10 shadow-[0_20px_50px_rgba(220,38,38,0.05)] relative overflow-hidden border border-red-100 mb-8"
          >
            <div className="absolute -top-40 right-0 w-[35rem] h-[35rem] bg-red-200/20 rounded-full blur-[140px] pointer-events-none" />
            <div className="relative z-10 max-w-2xl space-y-3">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-red-50 border border-red-200/60 text-[11px] font-bold uppercase tracking-wider text-red-600">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Sahyatri Trip Monitor
              </span>
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-950">
                Plan Your{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-red-500 to-slate-900">
                  Safest Route
                </span>
              </h1>
              <p className="text-slate-500 text-base leading-relaxed">
                AI-powered safety scoring selects the best route based on
                police presence, hospitals, and risk zones along your path.
              </p>
            </div>
          </motion.section>
        )}

        <div className="flex flex-col md:flex-row gap-6">
          {/* ── Map ── */}
          <div className="flex-1 bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-sm relative min-h-[500px]">
            <LiveMap
              routes={routes}
              bestRoute={bestRoute}
              startCoords={startCoords.lat ? [startCoords.lat, startCoords.lng] : null}
              destCoords={destCoords.lat ? [destCoords.lat, destCoords.lng] : null}
              userLocation={tripState === "active" ? userLocation : null}
            />
          </div>

          {/* ── Right panel ── */}
          <div className="w-full md:w-96 flex flex-col gap-6">
            {tripState === "planning" ? (
              <div className="bg-white border border-slate-100 p-6 rounded-2xl space-y-5 shadow-sm">
                {/* ── Start input ── */}
                <div className="relative">
                  <label className="block mb-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Starting Point
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={startQuery}
                      onChange={(e) => handleStartInput(e.target.value)}
                      placeholder="Search start address..."
                      className="flex-1 bg-slate-50 border border-slate-200 focus:border-red-400 focus:bg-white rounded-xl px-3.5 py-2.5 outline-none text-xs text-slate-800 placeholder:text-slate-400 transition"
                    />
                    <button
                      onClick={useCurrentLocation}
                      className="bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-2 rounded-xl text-base transition cursor-pointer"
                      title="Use my location"
                    >
                      📍
                    </button>
                  </div>
                  {startSuggestions.length > 0 && (
                    <ul className="absolute z-30 w-full bg-white border border-slate-200 mt-1 rounded-xl shadow-xl text-xs overflow-hidden max-h-48 overflow-y-auto">
                      {startSuggestions.map((s, i) => (
                        <li
                          key={i}
                          onClick={() => {
                            setStartCoords({ lat: s.lat, lng: s.lon });
                            setStartQuery(s.label);
                            setStartSuggestions([]);
                          }}
                          className="px-3.5 py-2.5 hover:bg-red-50 cursor-pointer border-b border-slate-50 last:border-0 text-slate-600 flex items-start gap-2"
                        >
                          <span className="mt-0.5 text-slate-400">📍</span>
                          <span className="line-clamp-2">{s.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* ── Destination input ── */}
                <div className="relative">
                  <label className="block mb-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Destination
                  </label>
                  <input
                    type="text"
                    value={destQuery}
                    onChange={(e) => handleDestInput(e.target.value)}
                    placeholder="Search destination..."
                    className="w-full bg-slate-50 border border-slate-200 focus:border-red-400 focus:bg-white rounded-xl px-3.5 py-2.5 outline-none text-xs text-slate-800 placeholder:text-slate-400 transition"
                  />
                  {destSuggestions.length > 0 && (
                    <ul className="absolute z-30 w-full bg-white border border-slate-200 mt-1 rounded-xl shadow-xl text-xs overflow-hidden max-h-48 overflow-y-auto">
                      {destSuggestions.map((s, i) => (
                        <li
                          key={i}
                          onClick={() => {
                            setDestCoords({ lat: s.lat, lng: s.lon });
                            setDestQuery(s.label);
                            setDestSuggestions([]);
                          }}
                          className="px-3.5 py-2.5 hover:bg-red-50 cursor-pointer border-b border-slate-50 last:border-0 text-slate-600 flex items-start gap-2"
                        >
                          <span className="mt-0.5 text-slate-400">🏁</span>
                          <span className="line-clamp-2">{s.label}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* ── Travel mode ── */}
                <div>
                  <label className="block mb-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Travel Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "driving-car", icon: "🚗", label: "Driving" },
                      { id: "foot-walking", icon: "🚶", label: "Walking" },
                      { id: "cycling-regular", icon: "🚲", label: "Cycling" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        onClick={() => setTravelMode(m.id)}
                        className={`flex flex-col items-center justify-center py-2.5 rounded-xl border text-xs font-medium transition cursor-pointer ${
                          travelMode === m.id
                            ? "bg-red-50 border-red-300 text-red-600"
                            : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                        }`}
                      >
                        <span className="text-lg mb-0.5">{m.icon}</span>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={fetchSafeRoutes}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm shadow-[0_4px_20px_rgba(220,38,38,0.25)] cursor-pointer"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      Scoring routes...
                    </span>
                  ) : (
                    "📍 Find Safest Route"
                  )}
                </button>

                {/* ── Route options ── */}
                {routes.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Route Options ({routes.length} found)
                    </p>
                    {routes.map((r, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSelectRoute(idx)}
                        className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                          selectedRouteIdx === idx
                            ? "border-red-300 bg-red-50 shadow-sm"
                            : "border-slate-100 bg-slate-50 hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex justify-between items-center mb-1.5">
                          <div className="flex items-center gap-1.5">
                            {idx === 0 && (
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-1.5 py-0.5 rounded-full">
                                ✓ Recommended
                              </span>
                            )}
                            <span className="text-xs font-semibold text-slate-600">
                              {idx > 0 && `Route ${idx + 1}`}
                            </span>
                          </div>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${scoreColor(
                              r.score
                            )}`}
                          >
                            {r.score}% · {scoreLabel(r.score)}
                          </span>
                        </div>
                        <div className="flex gap-3 text-[11px] text-slate-400">
                          <span>
                            📏 {(r.summary?.distance / 1000).toFixed(1)} km
                          </span>
                          <span>
                            ⏱ {Math.round(r.summary?.duration / 60)} min
                          </span>
                          {r.breakdown?.policeStations > 0 && (
                            <span>🚓 {r.breakdown.policeStations}</span>
                          )}
                          {r.breakdown?.hospitals > 0 && (
                            <span>🏥 {r.breakdown.hospitals}</span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* ── Selected route summary + start button ── */}
                {bestRoute && (
                  <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-slate-600">
                        Selected Route Safety
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${scoreColor(
                          bestRoute.score
                        )}`}
                      >
                        {bestRoute.score}%
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-500 border-t border-slate-200 pt-3">
                      <div>
                        📏 {(bestRoute.summary?.distance / 1000).toFixed(1)} km
                      </div>
                      <div>
                        ⏱️ {Math.round(bestRoute.summary?.duration / 60)} mins
                      </div>
                      {bestRoute.breakdown && (
                        <>
                          <div>
                            🚓 {bestRoute.breakdown.policeStations ?? 0} police
                          </div>
                          <div>
                            🏥 {bestRoute.breakdown.hospitals ?? 0} hospitals
                          </div>
                          {bestRoute.breakdown.bars > 0 && (
                            <div className="text-red-500">
                              🍺 {bestRoute.breakdown.bars} bars nearby
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    <button
                      onClick={startTrip}
                      disabled={loading}
                      className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition text-sm shadow-[0_4px_20px_rgba(22,163,74,0.2)] cursor-pointer"
                    >
                      🚀 Start Trip
                    </button>
                  </div>
                )}

                {/* ── Safety settings ── */}
                <div className="border-t border-slate-100 pt-4">
                  <button
                    onClick={() => setShowSettings((p) => !p)}
                    className="w-full flex justify-between items-center text-[11px] font-semibold uppercase tracking-wider text-slate-500 cursor-pointer"
                  >
                    Safety Settings
                    <span className="text-slate-400">
                      {showSettings ? "▲" : "▼"}
                    </span>
                  </button>
                  {showSettings && (
                    <div className="space-y-4 mt-4">
                      <ToggleRow
                        label="Share live location with contacts"
                        checked={shareLocation}
                        onChange={setShareLocation}
                      />
                      <ToggleRow
                        label="Alert contacts on route deviation"
                        checked={routeDeviation}
                        onChange={setRouteDeviation}
                      />
                      {routeDeviation && (
                        <div className="space-y-1">
                          <div className="flex justify-between text-[10px] text-slate-400">
                            <span>Deviation threshold</span>
                            <span>{deviationThreshold}m</span>
                          </div>
                          <input
                            type="range"
                            min={100}
                            max={500}
                            step={50}
                            value={deviationThreshold}
                            onChange={(e) =>
                              setDeviationThreshold(Number(e.target.value))
                            }
                            className="w-full accent-red-500 cursor-pointer"
                          />
                        </div>
                      )}
                      <ToggleRow
                        label="Periodic safety check-ins"
                        checked={periodicCheck}
                        onChange={setPeriodicCheck}
                      />
                      {periodicCheck && (
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Check-in interval</span>
                          <select
                            value={checkInterval}
                            onChange={(e) =>
                              setCheckInterval(Number(e.target.value))
                            }
                            className="bg-slate-50 border border-slate-200 rounded-lg p-1.5 text-[11px] text-slate-700"
                          >
                            <option value={1}>1 Min (Demo)</option>
                            <option value={5}>5 Minutes</option>
                            <option value={10}>10 Minutes</option>
                            <option value={15}>15 Minutes</option>
                          </select>
                        </div>
                      )}
                      <ToggleRow
                        label="Auto-record emergency audio"
                        checked={recordAudio}
                        onChange={setRecordAudio}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* ── ACTIVE TRIP MONITOR ── */
              <div className="bg-white border border-slate-100 p-6 rounded-2xl space-y-5 shadow-sm">
                <div className="border-b border-slate-100 pb-4">
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                    Active Trip Monitor
                  </h2>
                  <p className="text-xs text-green-600 mt-1 font-medium">
                    Live guardian monitoring enabled
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-4">
                  <div>
                    <h3 className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                      Destination
                    </h3>
                    <p className="text-sm font-semibold text-slate-800 line-clamp-2">
                      {destQuery}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-4 border-t border-slate-200 pt-3">
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
                        Distance Left
                      </p>
                      <p className="text-2xl font-extrabold text-slate-900">
                        {distanceRemaining}{" "}
                        <span className="text-sm font-medium">km</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">
                        ETA
                      </p>
                      <p className="text-2xl font-extrabold text-slate-900">
                        {timeRemaining}{" "}
                        <span className="text-sm font-medium">min</span>
                      </p>
                    </div>
                  </div>
                </div>

                {periodicCheck && (
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-500">
                      <span>Next check-in</span>
                      <span className="font-bold text-slate-900 font-mono">
                        {formatTime(secondsRemaining)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-green-500 h-full transition-all duration-1000 ease-linear"
                        style={{
                          width: `${
                            (secondsRemaining / (checkInterval * 60)) * 100
                          }%`,
                        }}
                      />
                    </div>
                    <button
                      onClick={handleConfirmSafe}
                      className="w-full bg-green-50 hover:bg-green-100 border border-green-200 text-green-700 font-semibold py-2 rounded-xl transition text-xs cursor-pointer"
                    >
                      ✓ Confirm I'm Safe
                    </button>
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl space-y-2">
                  <h4 className="font-semibold text-slate-700 text-xs">
                    Guardians Notified
                  </h4>
                  {user?.emergencyContacts?.length > 0 ? (
                    <ul className="space-y-1.5 text-xs text-slate-500">
                      {user.emergencyContacts.map((num, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <span className="h-1 w-1 rounded-full bg-green-400" />
                          {num}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-amber-600 text-xs">
                      No guardians set. Update your profile.
                    </p>
                  )}
                </div>

                <div className="bg-red-50 border border-red-100 p-5 rounded-xl space-y-3">
                  <SOSButton
                    tripId={activeTripId}
                    currentLocation={
                      userLocation
                        ? { lat: userLocation[0], lng: userLocation[1] }
                        : startCoords.lat
                        ? { lat: startCoords.lat, lng: startCoords.lng }
                        : null
                    }
                    recordAudio={recordAudio}
                    ref={sosRef}
                  />
                </div>

                <button
                  onClick={completeTrip}
                  className="w-full bg-slate-900 hover:bg-black text-white py-3 rounded-xl transition text-sm font-semibold cursor-pointer"
                >
                  🏁 Finish Trip Successfully
                </button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-600">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer ${
          checked ? "bg-red-600" : "bg-slate-200"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 bg-white rounded-full shadow transition-all ${
            checked ? "left-5" : "left-1"
          }`}
        />
      </button>
    </div>
  );
}