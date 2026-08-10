import { useEffect, useState, useRef } from "react";
import axios from "axios";
import { motion, AnimatePresence } from "framer-motion";
import Navbar from "../components/Navbar";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";

// Leaflet custom marker configuration
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

const SOSIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const ActiveUserIcon = L.icon({
  iconUrl:
    "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// Helper component to center map smoothly
function RecenterMap({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.flyTo(center, zoom, { animate: true, duration: 1.2 });
    }
  }, [center, zoom, map]);
  return null;
}

export default function GuardianDashboard() {
  // ─── STATE MANAGEMENT ─────────────────────────────────────────────
  const [alerts, setAlerts] = useState([]);
  const [monitoredUsers, setMonitoredUsers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activeTrackingUser, setActiveTrackingUser] = useState(null);
  const [mapCenter, setMapCenter] = useState([18.5204, 73.8567]);
  const [mapZoom, setMapZoom] = useState(13);
  const [playingAudioUrl, setPlayingAudioUrl] = useState(null);
  const audioRef = useRef(null);

  // ─── FETCH MONITORED TRAVELLERS & ALERTS ────────────────────────────
  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const headers = { Authorization: `Bearer ${token}` };

      // 1. Fetch travellers for whom current user is a guardian
      const travellersRes = await axios.get(
        "http://localhost:5000/api/guardian/monitored-travellers",
        { headers }
      );

      // 2. Fetch emergency alerts
      const alertsRes = await axios.get("http://localhost:5000/api/alerts", {
        headers,
      });

      const allAlerts = Array.isArray(alertsRes.data) ? alertsRes.data : [];
      const relationships = Array.isArray(travellersRes.data) ? travellersRes.data : [];

      // Extract unique travellers list
      const monitoredList = relationships.map((rel) => {
        const tr = rel.traveller || {};
        const travellerAlert = allAlerts.find(
          (a) => a.userId === tr._id || a.name === tr.name
        );

        const isSOS = !!travellerAlert;
        const loc = travellerAlert?.location?.lat
          ? [travellerAlert.location.lat, travellerAlert.location.lng]
          : [18.5204, 73.8567];

        return {
          id: tr._id || rel._id,
          name: tr.name || "Traveller",
          email: tr.email,
          phone: rel.guardianPhone || tr.phone || (tr.emergencyContacts && tr.emergencyContacts[0]) || "+91 Standard Emergency",
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(tr.name || "Traveller")}`,
          status: isSOS ? "SOS Active" : "Safe",
          destination: null,
          eta: null,
          remainingDistance: null,
          lastLocation: loc,
          locationAddress: travellerAlert?.location?.lat
            ? `${travellerAlert.location.lat.toFixed(4)}, ${travellerAlert.location.lng.toFixed(4)}`
            : "Location available",
          lastUpdated: travellerAlert ? new Date(travellerAlert.createdAt).toLocaleTimeString() : "Just now",
          path: isSOS ? [loc] : [],
        };
      });

      // Filter alerts to show only those belonging to monitored travellers
      const monitoredUserIds = new Set(monitoredList.map((m) => m.id));
      const relevantAlerts = allAlerts.filter((a) => monitoredUserIds.has(a.userId));

      setAlerts(relevantAlerts.length > 0 ? relevantAlerts : allAlerts);
      setMonitoredUsers(monitoredList);

      // Create activity feed
      const activitiesList = relevantAlerts.map((alert) => ({
        id: alert._id || Math.random(),
        type: "sos-triggered",
        title: "SOS Alert",
        description: `🚨 Emergency alert triggered by ${alert.name || "Traveller"}`,
        timestamp: new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        badgeColor: "bg-red-100 text-red-700 border-red-200 font-bold",
        icon: "🚨",
      }));

      setActivities(activitiesList);
    } catch (err) {
      console.error("Error loading guardian dashboard data:", err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  // ─── DERIVED COUNTS ──────────────────────────────────────────────
  const totalMonitoredCount = monitoredUsers.length;
  const activeTripsCount = monitoredUsers.filter(
    (u) => u.status === "Active Trip"
  ).length;
  const activeSOSAlerts = alerts.length;

  // Active Emergency User (if any)
  const sosUser = monitoredUsers.find((u) => u.status === "SOS Active");
  const latestSOSAlert = alerts.length > 0 ? alerts[0] : null;

  // ─── TRACK LIVE HANDLER ──────────────────────────────────────────
  const handleStartTracking = (user) => {
    if (user.status === "Safe") return; // Cannot track idle users
    setActiveTrackingUser(user);
    if (user.lastLocation && user.lastLocation[0]) {
      setMapCenter(user.lastLocation);
      setMapZoom(15);
    }
  };

  // Play audio helper
  const handlePlayAudio = (url) => {
    if (!url) return;
    setPlayingAudioUrl(url);
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.play();
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased selection:bg-red-600 selection:text-white pb-16">
      <Navbar />

      {/* Hidden Global Audio Element for SOS Playback */}
      <audio ref={audioRef} className="hidden" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        
        {/* ── HEADER BANNER ── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200/80 pb-6"
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="h-2.5 w-2.5 rounded-full bg-red-600 animate-ping" />
              <span className="text-xs font-bold uppercase tracking-wider text-red-600">
                Guardian Emergency Center
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
              Live Emergency Monitoring
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Real-time trip tracking and instant response system for your family & wards.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchDashboardData}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-red-600 bg-white border border-slate-200 hover:border-red-200 px-4 py-2.5 rounded-xl shadow-xs transition"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh Feed
            </button>
          </div>
        </motion.div>

        {/* ── SECTION 1: GUARDIAN OVERVIEW ── */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Card 1: People Monitoring */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="bg-white rounded-2xl p-6 border border-slate-200/70 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                People Monitoring
              </p>
              <h3 className="text-3xl font-extrabold text-slate-900 mt-2">
                {totalMonitoredCount}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Registered wards</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/60 flex items-center justify-center text-2xl">
              👥
            </div>
          </motion.div>

          {/* Card 2: Active Trips */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl p-6 border border-slate-200/70 shadow-xs hover:shadow-md transition-shadow flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Active Trips
              </p>
              <h3 className="text-3xl font-extrabold text-blue-600 mt-2">
                {activeTripsCount}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Currently travelling</p>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-2xl">
              🚗
            </div>
          </motion.div>

          {/* Card 3: Active SOS Alerts */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={`rounded-2xl p-6 border transition-all flex items-center justify-between ${
              activeSOSAlerts > 0
                ? "bg-red-50/80 border-red-300 shadow-md animate-pulse"
                : "bg-white border-slate-200/70 shadow-xs"
            }`}
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Active SOS Alerts
              </p>
              <h3 className={`text-3xl font-extrabold mt-2 ${activeSOSAlerts > 0 ? "text-red-600" : "text-slate-900"}`}>
                {activeSOSAlerts}
              </h3>
              <p className="text-xs text-slate-500 mt-1">Requires immediate help</p>
            </div>
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl ${
              activeSOSAlerts > 0 ? "bg-red-600 text-white" : "bg-red-50 border border-red-100 text-red-600"
            }`}>
              🚨
            </div>
          </motion.div>
        </section>

        {/* ── SECTION 5: EMERGENCY ACTIONS (ONLY SHOWN WHEN SOS IS ACTIVE) ── */}
        <AnimatePresence>
          {(activeSOSAlerts > 0 || sosUser) && (
            <motion.section
              initial={{ opacity: 0, height: 0, scale: 0.98 }}
              animate={{ opacity: 1, height: "auto", scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.98 }}
              className="bg-gradient-to-r from-red-600 via-red-700 to-red-800 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2">
                  <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 text-white text-xs font-extrabold uppercase tracking-wider backdrop-blur-md">
                    <span className="h-2 w-2 rounded-full bg-white animate-ping" />
                    EMERGENCY SOS ACTIVE
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                    Emergency Response Required
                  </h2>
                  <p className="text-red-100 text-sm max-w-xl">
                    {sosUser?.name || latestSOSAlert?.name || "A traveller"} has triggered an emergency SOS! Take immediate action using the emergency shortcuts below.
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {/* Call Traveller */}
                  <a
                    href={`tel:${sosUser?.phone || "+91100"}`}
                    className="bg-white text-red-700 hover:bg-red-50 font-bold text-xs sm:text-sm px-4 py-3 rounded-xl shadow-md transition flex items-center gap-2 active:scale-95"
                  >
                    📞 Call Traveller
                  </a>

                  {/* Call Police (112) */}
                  <a
                    href="tel:112"
                    className="bg-red-950/80 hover:bg-black text-white font-bold text-xs sm:text-sm px-4 py-3 rounded-xl border border-red-400/40 shadow-md transition flex items-center gap-2 active:scale-95"
                  >
                    🚔 Call Police (112)
                  </a>

                  {/* Call Ambulance (108) */}
                  <a
                    href="tel:108"
                    className="bg-red-950/80 hover:bg-black text-white font-bold text-xs sm:text-sm px-4 py-3 rounded-xl border border-red-400/40 shadow-md transition flex items-center gap-2 active:scale-95"
                  >
                    🚑 Call Ambulance (108)
                  </a>

                  {/* Open Live Location */}
                  <button
                    onClick={() => {
                      if (sosUser) handleStartTracking(sosUser);
                      else if (latestSOSAlert?.location?.lat) {
                        setMapCenter([latestSOSAlert.location.lat, latestSOSAlert.location.lng]);
                        setMapZoom(16);
                      }
                    }}
                    className="bg-white/20 hover:bg-white/30 text-white font-semibold text-xs sm:text-sm px-4 py-3 rounded-xl backdrop-blur-md transition flex items-center gap-2"
                  >
                    📍 Center Live Location
                  </button>

                  {/* Navigate using Google Maps */}
                  <a
                    href={
                      sosUser?.lastLocation?.[0]
                        ? `https://www.google.com/maps/dir/?api=1&destination=${sosUser.lastLocation[0]},${sosUser.lastLocation[1]}`
                        : latestSOSAlert?.location?.lat
                        ? `https://www.google.com/maps/dir/?api=1&destination=${latestSOSAlert.location.lat},${latestSOSAlert.location.lng}`
                        : "#"
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-white/20 hover:bg-white/30 text-white font-semibold text-xs sm:text-sm px-4 py-3 rounded-xl backdrop-blur-md transition flex items-center gap-2"
                  >
                    🧭 Navigate (Google Maps)
                  </a>

                  {/* Play SOS Recording */}
                  {latestSOSAlert?.audioUrl && (
                    <button
                      onClick={() => handlePlayAudio(latestSOSAlert.audioUrl)}
                      className="bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs sm:text-sm px-4 py-3 rounded-xl shadow-md transition flex items-center gap-2"
                    >
                      🎤 Play SOS Recording
                    </button>
                  )}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── MAIN CONTENT GRID: PEOPLE MONITORED + LIVE TRACKING ── */}
        <section className="grid lg:grid-cols-12 gap-8">
          
          {/* LEFT: SECTION 2 - People I'm Monitoring */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                    People I'm Monitoring
                  </h2>
                  <p className="text-xs text-slate-400">
                    Users who added you as their emergency guardian
                  </p>
                </div>
                <span className="bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                  {monitoredUsers.length} total
                </span>
              </div>

              {monitoredUsers.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <p className="text-2xl mb-2">👥</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    No people currently monitored
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Users who add you as guardian will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {monitoredUsers.map((user) => {
                    const isSOS = user.status === "SOS Active";
                    const isActiveTrip = user.status === "Active Trip";

                    return (
                      <div
                        key={user.id}
                        className={`p-4 rounded-xl border transition-all ${
                          isSOS
                            ? "border-red-300 bg-red-50/60 shadow-sm"
                            : isActiveTrip
                            ? "border-blue-200 bg-blue-50/30 hover:border-blue-300"
                            : "border-slate-100 bg-slate-50/50 hover:border-slate-200"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="relative">
                              <img
                                src={user.avatar}
                                alt={user.name}
                                className="w-12 h-12 rounded-full object-cover border-2 border-white shadow-xs bg-slate-200"
                              />
                              <span
                                className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-white ${
                                  isSOS
                                    ? "bg-red-600 animate-ping"
                                    : isActiveTrip
                                    ? "bg-blue-500"
                                    : "bg-emerald-500"
                                }`}
                              />
                            </div>

                            {/* Name & Details */}
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="font-bold text-slate-900 text-sm">
                                  {user.name}
                                </h3>
                                {/* Status Badge */}
                                {isSOS && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-red-600 text-white animate-pulse">
                                    SOS Active
                                  </span>
                                )}
                                {isActiveTrip && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-blue-100 text-blue-700">
                                    Active Trip
                                  </span>
                                )}
                                {user.status === "Safe" && (
                                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase bg-emerald-100 text-emerald-800">
                                    Safe
                                  </span>
                                )}
                              </div>

                              {/* Additional Trip Information */}
                              {isActiveTrip ? (
                                <div className="mt-1 space-y-0.5 text-xs text-slate-500">
                                  <p>
                                    <strong className="text-slate-700">Destination:</strong>{" "}
                                    {user.destination}
                                  </p>
                                  <p>
                                    <strong className="text-slate-700">ETA:</strong> {user.eta || "Calculating"}
                                  </p>
                                </div>
                              ) : isSOS ? (
                                <p className="mt-1 text-xs text-red-600 font-medium">
                                  Emergency Active • Location broadcasted
                                </p>
                              ) : (
                                <p className="mt-1 text-xs text-slate-400">No Active Trip</p>
                              )}
                            </div>
                          </div>

                          {/* Track Live Button */}
                          <div className="flex-shrink-0">
                            {user.status !== "Safe" ? (
                              <button
                                onClick={() => handleStartTracking(user)}
                                className={`text-xs font-semibold px-3 py-2 rounded-xl transition shadow-xs flex items-center gap-1.5 ${
                                  isSOS
                                    ? "bg-red-600 hover:bg-red-700 text-white"
                                    : "bg-blue-600 hover:bg-blue-700 text-white"
                                }`}
                              >
                                <span>📍</span> Track Live
                              </button>
                            ) : (
                              <button
                                disabled
                                className="text-xs font-medium px-3 py-2 rounded-xl bg-slate-200 text-slate-400 cursor-not-allowed"
                              >
                                Track Live
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SECTION 6 - Recent Activity Timeline */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span>⏱️</span> Recent Activity
                </h3>
                <span className="text-xs text-slate-400">Activity log</span>
              </div>

              {activities.length === 0 ? (
                <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <p className="text-xs text-slate-400 italic">
                    No recent activity recorded yet.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 relative before:absolute before:inset-0 before:left-3.5 before:w-0.5 before:bg-slate-100">
                  {activities.map((item) => (
                    <div key={item.id} className="relative flex items-start gap-3 pl-8">
                      <span className="absolute left-1.5 top-1 -translate-x-1/2 w-4 h-4 rounded-full bg-white border-2 border-slate-300 text-[10px] flex items-center justify-center">
                        {item.icon}
                      </span>
                      <div className="flex-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className={`px-2 py-0.5 rounded-md font-semibold text-[10px] border ${item.badgeColor}`}>
                            {item.title}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {item.timestamp}
                          </span>
                        </div>
                        <p className="text-slate-600 mt-1">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: SECTION 3 - Live Tracking Map & Trip Panel */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-600 animate-pulse" />
                    Live Tracking & Map
                  </h2>
                  <p className="text-xs text-slate-400">
                    Active GPS tracking for ongoing trips and emergency alerts
                  </p>
                </div>

                {activeTrackingUser && (
                  <span className="px-3 py-1 bg-blue-50 border border-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                    Tracking: {activeTrackingUser.name}
                  </span>
                )}
              </div>

              {/* Leaflet Map */}
              <div className="h-[380px] w-full rounded-xl overflow-hidden border border-slate-200 relative">
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  style={{ height: "100%", width: "100%" }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <RecenterMap center={mapCenter} zoom={mapZoom} />

                  {/* Monitored Users Markers */}
                  {monitoredUsers.map((u) => {
                    if (!u.lastLocation || !u.lastLocation[0]) return null;
                    const isSOS = u.status === "SOS Active";
                    return (
                      <div key={u.id}>
                        <Marker
                          position={u.lastLocation}
                          icon={isSOS ? SOSIcon : ActiveUserIcon}
                        >
                          <Popup>
                            <div className="text-xs p-1">
                              <p className="font-bold border-b border-slate-100 pb-1 mb-1">
                                👤 {u.name}
                              </p>
                              <p>
                                <strong>Status:</strong> {u.status}
                              </p>
                              {u.destination && (
                                <p>
                                  <strong>To:</strong> {u.destination}
                                </p>
                              )}
                            </div>
                          </Popup>
                        </Marker>

                        {/* Polyline Path */}
                        {u.path && u.path.length > 0 && (
                          <Polyline
                            positions={u.path}
                            pathOptions={{
                              color: isSOS ? "#dc2626" : "#2563eb",
                              weight: 4,
                              opacity: 0.8,
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </MapContainer>
              </div>

              {/* Trip Live Detail Card */}
              {activeTrackingUser ? (
                activeTrackingUser.status !== "Safe" ? (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Current Location
                      </p>
                      <p className="text-xs font-semibold text-slate-800 mt-1 truncate">
                        {activeTrackingUser.locationAddress || "Updated"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Destination
                      </p>
                      <p className="text-xs font-semibold text-slate-800 mt-1 truncate">
                        {activeTrackingUser.destination || "In Transit"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        ETA
                      </p>
                      <p className="text-xs font-semibold text-blue-600 mt-1">
                        {activeTrackingUser.eta || "Calculating"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">
                        Remaining
                      </p>
                      <p className="text-xs font-semibold text-slate-800 mt-1">
                        {activeTrackingUser.remainingDistance || "N/A"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <p className="text-emerald-800 text-sm font-bold">
                      ✅ Trip Completed
                    </p>
                    <p className="text-emerald-600 text-xs mt-0.5">
                      {activeTrackingUser.name} has safely reached their destination. Live tracking ended.
                    </p>
                  </div>
                )
              ) : (
                <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-4 text-center text-xs text-slate-400">
                  Click <strong>Track Live</strong> on any active user to focus tracking map & trip metrics.
                </div>
              )}
            </div>

            {/* SECTION 4 - Emergency Alerts */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-red-600 animate-ping" />
                    Emergency Alerts
                  </h3>
                  <p className="text-xs text-slate-400 font-normal">Recent SOS broadcasts</p>
                </div>

                <span className="text-xs font-bold text-red-600 bg-red-50 border border-red-100 px-2.5 py-1 rounded-full">
                  {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
                </span>
              </div>

              {alerts.length === 0 ? (
                <div className="text-center py-10 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                  <p className="text-3xl mb-2">🛡️</p>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    No emergency alerts.
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    All monitored individuals are safe.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                  {alerts.map((alert) => (
                    <div
                      key={alert._id || alert.id || Math.random()}
                      className="border border-red-200 bg-red-50/40 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm">
                            {alert.name || "Traveller"}
                          </span>
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-extrabold uppercase bg-red-600 text-white">
                            SOS
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">
                          ⏰ {new Date(alert.createdAt || Date.now()).toLocaleTimeString()}
                        </p>
                        <p className="text-xs text-slate-600">
                          📍 Coordinates:{" "}
                          <span className="font-mono">
                            {alert.location?.lat?.toFixed(4)}, {alert.location?.lng?.toFixed(4)}
                          </span>
                        </p>

                        {/* Styled Audio Recording Box */}
                        {alert.audioUrl && (
                          <div className="mt-3 p-3 rounded-2xl bg-[#F8FAFC] border border-slate-200/60 shadow-2xs space-y-1.5 w-full">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                              <span>🎙️</span>
                              <span>AUDIO RECORDING</span>
                            </div>
                            <audio
                              controls
                              src={alert.audioUrl}
                              className="w-full h-8 outline-none rounded-full"
                            />
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        {/* View Map */}
                        <button
                          onClick={() => {
                            if (alert.location?.lat) {
                              setMapCenter([alert.location.lat, alert.location.lng]);
                              setMapZoom(16);
                            }
                          }}
                          className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:border-red-200 hover:text-red-600 px-3.5 py-2 rounded-xl shadow-xs transition"
                        >
                          View Map 📍
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

        </section>

      </main>
    </div>
  );
}