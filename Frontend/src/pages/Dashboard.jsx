import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import axios from "axios";
import { jsPDF } from "jspdf";
import useAuth from "../hooks/useAuth";
import Navbar from "../components/Navbar";
import SOSButton from "../components/SOSButton";
import { useActiveTrip } from "../context/ActiveTripContext";

export default function Dashboard() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const {
    tripState,
    activeTrip: contextActiveTrip,
    distanceRemaining,
    timeRemaining,
  } = useActiveTrip();

  // Hydration state to prevent race conditions on page refresh
  const [isHydrating, setIsHydrating] = useState(true);

  // Core Database States
  const [alerts, setAlerts] = useState([]);
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  // Guardian Management States (Direct Guardian Relationships)
  const [guardiansList, setGuardiansList] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [modalEmail, setModalEmail] = useState("");
  const [modalPhone, setModalPhone] = useState("");
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [distressPin, setDistressPin] = useState("");

  // Fetch verified SOS log data
  const fetchMySOSHistory = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await axios.get("http://localhost:5000/api/alerts", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const currentUserId = user?._id;
      if (!currentUserId) return;

      const myAlerts = res.data.filter((alert) => alert.userId === currentUserId);
      setAlerts(myAlerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (err) {
      console.error("Failed to load SOS history:", err);
    }
  };

  // Fetch user trips history
  const fetchMyTrips = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await axios.get("http://localhost:5000/api/trips", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setTrips(res.data || []);
    } catch (err) {
      console.error("Failed to load trips:", err);
    }
  };

  // Fetch my guardians list from backend API
  const fetchMyGuardians = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;

      const res = await axios.get("http://localhost:5000/api/guardian/my-guardians", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setGuardiansList(res.data || []);
    } catch (err) {
      console.error("Failed to load guardians:", err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("token");

    if (!token) {
      navigate("/login");
      return;
    }

    if (user) {
      fetchMySOSHistory();
      fetchMyTrips();
      fetchMyGuardians();
      setIsHydrating(false);
    }
  }, [user, navigate, tripState]);

  useEffect(() => {
    const handleSOSCreated = () => {
      fetchMySOSHistory();
    };

    window.addEventListener("sos-created", handleSOSCreated);

    return () => {
      window.removeEventListener("sos-created", handleSOSCreated);
    };
  }, [user?._id]);

  /* ======================================================================
      GUARDIAN MANAGEMENT HANDLERS
  ====================================================================== */
  const handleOpenModal = () => {
    setModalEmail("");
    setModalPhone("");
    setModalError("");
    setModalSuccess("");
    setIsAddModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsAddModalOpen(false);
    setModalError("");
    setModalSuccess("");
  };

  const handleAddGuardianSubmit = async (e) => {
    e.preventDefault();
    setModalError("");
    setModalSuccess("");

    if (!modalEmail.trim() || !modalPhone.trim()) {
      setModalError("Guardian Email and Contact Number are required.");
      return;
    }

    try {
      setModalLoading(true);
      const token = localStorage.getItem("token");

      const res = await axios.post(
        "http://localhost:5000/api/guardian/add",
        {
          email: modalEmail.trim(),
          phone: modalPhone.trim(),
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setModalSuccess(res.data.message || "Guardian added successfully!");
      fetchMyGuardians();
      setTimeout(() => {
        handleCloseModal();
      }, 1500);
    } catch (err) {
      setModalError(
        err.response?.data?.message || "Failed to add guardian. Please check credentials."
      );
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteGuardian = async (guardianId) => {
    if (!window.confirm("Are you sure you want to remove this guardian?")) return;

    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      await axios.delete(`http://localhost:5000/api/guardian/${guardianId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      setSaveMessage("Guardian removed successfully.");
      fetchMyGuardians();
      setTimeout(() => setSaveMessage(""), 4000);
    } catch (err) {
      console.error(err);
      setSaveMessage(err.response?.data?.message || "Failed to remove guardian.");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePin = async (e) => {
    e.preventDefault();
    if (!distressPin.trim()) return;

    try {
      setLoading(true);
      await updateProfile({ distressPin: distressPin.trim() });
      setDistressPin("");
      setSaveMessage("Duress PIN updated successfully!");
      setTimeout(() => setSaveMessage(""), 4000);
    } catch (err) {
      console.error(err);
      setSaveMessage("Failed to update Duress PIN.");
    } finally {
      setLoading(false);
    }
  };

  /* ======================================================================
      METRICS & STATISTICS CALCULATIONS
  ====================================================================== */
  const completedTrips = trips.filter((t) => t.status === "completed");
  const activeTrip = trips.find((t) => t.status === "active");
  const totalDistance = completedTrips.reduce((acc, t) => acc + (t.distanceKm || 0), 0);
  const avgSafetyScore =
    trips.length > 0
      ? Math.round(
          trips.reduce((acc, t) => acc + (t.safetyScore || 0), 0) / trips.length
        )
      : null;

  const stats = [
    { t: "Completed Trips", v: completedTrips.length.toString(), i: "🏁" },
    { t: "Avg Safety Score", v: avgSafetyScore !== null ? `${avgSafetyScore}%` : "N/A", i: "🛡️" },
    { t: "Total Distance", v: `${totalDistance.toFixed(1)} km`, i: "📏" },
    { t: "SOS Triggered", v: alerts.length.toString(), i: "🚨" },
    { t: "Guardians Added", v: guardiansList.length.toString(), i: "👥" },
  ];

  /* ======================================================================
      PDF REPORT GENERATOR
  ====================================================================== */
  const handleExportMetrics = () => {
    if (alerts.length === 0) {
      alert("No historical incident data available to export.");
      return;
    }

    const doc = new jsPDF({
      orientation: "p",
      unit: "pt",
      format: "letter",
    });

    let currentY = 40;
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 40;

    const verifyPageSpace = (neededSpace) => {
      if (currentY + neededSpace >= pageHeight - 40) {
        doc.addPage();
        currentY = 40;
      }
    };

    // --- HEADER DESIGN BLOCK ---
    doc.setFillColor(15, 23, 42);
    doc.rect(marginX, currentY, 532, 65, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.text("SAHYATRI EMERGENCY INCIDENT & DISPATCH REPORT", marginX + 15, currentY + 28);

    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(239, 68, 68);
    doc.text("VERIFIED SAHYATRI TRAVEL SAFETY SYSTEM INCIDENT LOG", marginX + 15, currentY + 48);
    currentY += 90;

    // --- METADATA OVERVIEW ---
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.setFont("Helvetica", "bold");
    doc.text("INCIDENT MANIFEST SUMMARY:", marginX, currentY);
    currentY += 20;

    doc.setFont("Helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(`Generated On  : ${new Date().toLocaleString()}`, marginX + 10, currentY);
    doc.text(`User Name     : ${user?.name || "User"} (ID: ${user?._id || "N/A"})`, marginX + 270, currentY);
    currentY += 18;
    doc.text(`Total Records : ${alerts.length} Incidents Captured`, marginX + 10, currentY);
    currentY += 25;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.line(marginX, currentY, 572, currentY);
    currentY += 30;

    // --- INCIDENT RECORDS ---
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(220, 38, 38);
    doc.text("HISTORICAL EMERGENCY INCIDENT RECORDS", marginX, currentY);
    currentY += 20;

    alerts.forEach((alertItem, index) => {
      verifyPageSpace(110);

      const startTime = new Date(alertItem.createdAt);
      const lat = alertItem.location?.lat;
      const lng = alertItem.location?.lng;
      const geoText = lat && lng ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : "NO COORDINATES";

      doc.setFillColor(248, 250, 252);
      doc.rect(marginX, currentY, 532, 95, "F");
      doc.setDrawColor(241, 245, 249);
      doc.rect(marginX, currentY, 532, 95, "S");

      doc.setFont("Helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(15, 23, 42);
      doc.text(`INCIDENT RECORD #${String(index + 1).padStart(3, "0")}`, marginX + 15, currentY + 18);

      doc.setFont("Helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(`Alert Unique ID  : ${alertItem._id}`, marginX + 15, currentY + 36);
      doc.text(`Dispatch Time    : ${startTime.toLocaleString()}`, marginX + 15, currentY + 52);
      doc.text(`GPS Coordinates  : ${geoText}`, marginX + 15, currentY + 68);
      doc.text(`Audio Recorded   : ${alertItem.audioUrl ? "YES (Attached)" : "NO"}`, marginX + 270, currentY + 68);

      currentY += 110;
    });

    doc.save(`SAHYATRI_INCIDENTS_REPORT_${new Date().toISOString().split("T")[0]}.pdf`);
  };

  const scrollToGuardians = () => {
    document.getElementById("my-guardians")?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollToTrips = () => {
    document.getElementById("recent-trips")?.scrollIntoView({ behavior: "smooth" });
  };

  if (isHydrating && !user) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
            Loading dashboard...
          </p>
        </div>
      </div>
    );
  }

  const scoreColor = (score) =>
    score >= 80
      ? "bg-green-50 text-green-700 border-green-200"
      : score >= 55
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] antialiased selection:bg-red-600 selection:text-white">
      <Navbar />
      <main className="max-w-7xl mx-auto px-6 py-12 space-y-10">

        {/* HERO SECTION */}
        <motion.section
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[2rem] bg-gradient-to-br from-[#FFF5F5] via-[#FFF8F8] to-[#FFFFFF] text-slate-900 p-10 md:p-12 shadow-[0_20px_50px_rgba(220,38,38,0.05)] relative overflow-hidden border border-red-100"
        >
          <div className="absolute -top-40 right-0 w-[35rem] h-[35rem] bg-red-200/20 rounded-full blur-[140px] pointer-events-none" />

          <div className="flex flex-col lg:flex-row justify-between gap-10 items-start lg:items-center relative z-10">
            <div className="space-y-4 max-w-2xl">
              <span className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-red-50 border border-red-200/60 text-[11px] font-bold uppercase tracking-wider text-red-600">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
                Sahyatri Safety Dashboard
              </span>
              <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-slate-950 font-sans">
                Welcome back,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-600 via-red-500 to-slate-900">
                  {user?.name}
                </span>
              </h1>
              <p className="text-slate-500 text-base md:text-lg font-normal leading-relaxed">
                Your personal travel safety companion. Plan routes, monitor journeys, and dispatch emergency alerts instantly.
              </p>
              <div className="pt-4 flex flex-wrap gap-4">
                <Link
                  to="/trip"
                  className="bg-red-600 text-white px-6 py-3.5 rounded-xl font-semibold tracking-tight hover:bg-red-500 active:scale-[0.99] transition shadow-[0_4px_20px_rgba(220,38,38,0.25)] text-sm"
                >
                  Start New Trip
                </Link>
                <button
                  onClick={scrollToGuardians}
                  className="border border-slate-200 bg-white text-slate-700 px-6 py-3.5 rounded-xl font-semibold hover:bg-slate-50 transition text-sm shadow-xs cursor-pointer"
                >
                  My Guardians
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 min-w-[340px] border border-red-100 w-full lg:w-auto shadow-xl">
              <div className="mb-5">
                <h2 className="font-bold text-base text-slate-900 tracking-tight">
                  Instant Emergency SOS
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Trigger immediate emergency alert to notify your guardians.
                </p>
              </div>
              <SOSButton
                tripId={null}
                currentLocation={null}
                recordAudio={true}
              />
            </div>
          </div>
        </motion.section>

        {/* ACTIVE TRIP BANNER (Show if an active trip exists) */}
        {tripState === "active" && (contextActiveTrip || activeTrip) && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl p-6 shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-white animate-ping" />
                <span className="font-bold uppercase tracking-wider text-xs bg-white/20 px-2.5 py-0.5 rounded-full">
                  Trip In Progress
                </span>
              </div>
              <h3 className="text-xl font-bold">
                {(contextActiveTrip || activeTrip)?.start?.address || "Start Point"} ➔ {(contextActiveTrip || activeTrip)?.destination?.address || "Destination"}
              </h3>
              <p className="text-xs text-green-100 font-medium">
                Distance Left: {distanceRemaining || (contextActiveTrip || activeTrip)?.distanceKm || 0} km | ETA: {timeRemaining || (contextActiveTrip || activeTrip)?.durationMin || 0} mins | Safety Score: {(contextActiveTrip || activeTrip)?.safetyScore || 0}%
              </p>
            </div>
            <Link
              to="/trip"
              className="bg-white text-green-700 hover:bg-green-50 px-6 py-3 rounded-xl font-bold text-sm transition shadow-md whitespace-nowrap active:scale-95"
            >
              Resume Tracking ➔
            </Link>
          </div>
        )}

        {/* STATISTICS ROW */}
        <section className="grid sm:grid-cols-2 md:grid-cols-5 gap-4">
          {stats.map((s) => (
            <div
              key={s.t}
              className="bg-white rounded-2xl p-5 border border-slate-100 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05),0_10px_32px_-4px_rgba(0,0,0,0.03)] flex flex-col justify-between group hover:border-red-200 transition-all duration-300"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-xl border border-red-100">
                  {s.i}
                </div>
                <div className="text-2xl md:text-3xl font-bold mt-4 text-slate-900 tracking-tight font-sans">
                  {s.v}
                </div>
              </div>
              <div className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider mt-2">
                {s.t}
              </div>
            </div>
          ))}
        </section>

        {/* QUICK ACTIONS & SOS HISTORY BLOCK */}
        <section className="grid lg:grid-cols-3 gap-8">

          <div className="lg:col-span-2 space-y-8">
            
            {/* Quick Actions */}
            <div className="bg-white rounded-2xl border border-slate-100 p-8 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05),0_10px_32px_-4px_rgba(0,0,0,0.03)] flex flex-col">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight mb-6">
                Quick Actions
              </h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <Link
                  to="/trip"
                  className="rounded-xl border border-slate-100 p-5 hover:bg-[#F8FAFC] transition-all duration-200 group flex items-start gap-4 hover:border-red-100 bg-white"
                >
                  <div className="text-2xl p-2 bg-slate-50 border border-slate-100 rounded-xl transition-transform group-hover:scale-105 duration-200">
                    🗺️
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-800 tracking-tight group-hover:text-red-600 transition-colors">
                      Start New Trip
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-normal">
                      Plan & score your safest route
                    </p>
                  </div>
                </Link>

                <button
                  onClick={scrollToTrips}
                  className="text-left rounded-xl border border-slate-100 p-5 hover:bg-[#F8FAFC] transition-all duration-200 group flex items-start gap-4 hover:border-red-100 bg-white cursor-pointer"
                >
                  <div className="text-2xl p-2 bg-slate-50 border border-slate-100 rounded-xl transition-transform group-hover:scale-105 duration-200">
                    🛣️
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-800 tracking-tight group-hover:text-red-600 transition-colors">
                      Trip History
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-normal">
                      Review past journeys & safety scores
                    </p>
                  </div>
                </button>

                <button
                  onClick={scrollToGuardians}
                  className="text-left rounded-xl border border-slate-100 p-5 hover:bg-[#F8FAFC] transition-all duration-200 group flex items-start gap-4 hover:border-red-100 bg-white cursor-pointer"
                >
                  <div className="text-2xl p-2 bg-slate-50 border border-slate-100 rounded-xl transition-transform group-hover:scale-105 duration-200">
                    👥
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-800 tracking-tight group-hover:text-red-600 transition-colors">
                      My Guardians
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-normal">
                      Manage trusted emergency contacts
                    </p>
                  </div>
                </button>

                <button
                  onClick={handleExportMetrics}
                  className="text-left rounded-xl border border-slate-100 p-5 hover:bg-[#F8FAFC] transition-all duration-200 group flex items-start gap-4 hover:border-red-100 w-full cursor-pointer bg-white"
                >
                  <div className="text-2xl p-2 bg-slate-50 border border-slate-100 rounded-xl transition-transform group-hover:scale-105 duration-200">
                    📜
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-slate-800 tracking-tight group-hover:text-red-600 transition-colors">
                      Export Incident Report
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5 font-normal">
                      Download incident log PDF
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* RECENT TRIPS SECTION */}
            <div id="recent-trips" className="bg-white rounded-2xl border border-slate-100 p-8 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05),0_10px_32px_-4px_rgba(0,0,0,0.03)] space-y-6">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">Recent Trips</h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-normal">Your latest planned and completed journeys</p>
                </div>
                <Link to="/trip" className="text-xs font-semibold text-red-600 hover:text-red-700">
                  + Plan New Trip
                </Link>
              </div>

              {trips.length === 0 ? (
                <div className="text-center py-10 border border-dashed rounded-xl border-slate-200 bg-slate-50/50">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">No travel history recorded yet. Start your first trip!</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {trips.slice(0, 5).map((trip) => (
                    <div
                      key={trip._id}
                      className="border border-slate-100 bg-[#F8FAFC]/40 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition hover:bg-[#F8FAFC] hover:border-red-100"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-slate-800 text-sm tracking-tight line-clamp-1">
                            {trip.start?.address || "Start Point"} ➔ {trip.destination?.address || "Destination"}
                          </p>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${scoreColor(trip.safetyScore || 0)}`}>
                            {trip.safetyScore || 0}%
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-normal">
                          📅 {new Date(trip.createdAt).toLocaleDateString()} | ⏱️ {trip.durationMin || 0} mins | 📏 {trip.distanceKm || 0} km
                        </p>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-center">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                          trip.status === "completed"
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : trip.status === "active"
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : "bg-slate-100 text-slate-600"
                        }`}>
                          {trip.status || "Planning"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* SOS HISTORY (Renamed from Threat Intelligence Stream) */}
            <div className="bg-white rounded-2xl border border-slate-100 p-8 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05),0_10px_32px_-4px_rgba(0,0,0,0.03)] flex flex-col">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 pb-3 border-b border-slate-100 gap-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    SOS History
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5 font-normal">
                    Recent emergency dispatches and alert logs
                  </p>
                </div>

                <button
                  onClick={fetchMySOSHistory}
                  className="inline-flex items-center justify-center gap-2 text-xs font-semibold text-slate-600 hover:text-red-600 bg-white hover:bg-red-50/40 border border-slate-200 hover:border-red-200/60 px-4 py-2.5 rounded-xl transition-all duration-200 shadow-2xs hover:shadow-sm active:scale-[0.97] cursor-pointer w-full sm:w-auto group"
                  title="Force reload all incidents"
                >
                  <svg
                    className="w-3.5 h-3.5 transition-transform duration-500 ease-out group-hover:rotate-180 text-slate-400 group-hover:text-red-500"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                    />
                  </svg>
                  <span>Refresh History</span>
                </button>
              </div>

              <div className="max-h-[340px] overflow-y-auto pr-2 space-y-3 scrollbar-thin scrollbar-thumb-red-100 scrollbar-track-transparent">
                {alerts.length === 0 ? (
                  <div className="text-center py-12 border border-dashed rounded-xl border-slate-200 bg-slate-50/50">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      No emergency incidents found.
                    </p>
                  </div>
                ) : (
                  alerts.slice(0, 10).map((alertItem) => (
                    <div
                      key={alertItem._id}
                      className="border border-slate-100 bg-[#F8FAFC]/40 rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 transition hover:bg-[#F8FAFC] hover:border-red-100"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                          <p className="font-semibold text-slate-800 text-sm tracking-tight">
                            🚨 Emergency Dispatch
                          </p>
                          <span className="px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-600 border border-red-100 animate-pulse">
                            CRITICAL
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-normal">
                          {new Date(alertItem.createdAt).toLocaleString()}
                        </p>
                        {alertItem.audioUrl && (
                          <div className="mt-2.5 p-3 rounded-2xl bg-white border border-slate-200/60 shadow-2xs space-y-1.5 w-full">
                            <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                              <span>🎙️</span>
                              <span>AUDIO RECORDING</span>
                            </div>
                            <audio
                              controls
                              src={alertItem.audioUrl}
                              className="w-full h-8 outline-none rounded-full"
                            />
                          </div>
                        )}
                      </div>
                      <a
                        href={
                          alertItem.location?.lat
                            ? `https://www.google.com/maps?q=${alertItem.location.lat},${alertItem.location.lng}`
                            : "#"
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-600 hover:text-red-600 font-semibold text-xs transition px-3 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs active:scale-95"
                      >
                        View on Map 📍
                      </a>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>

          {/* MY GUARDIANS & SETTINGS RIGHT COLUMN */}
          <div id="my-guardians" className="space-y-6">

            {/* MY GUARDIANS SECTION */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05),0_10px_32px_-4px_rgba(0,0,0,0.03)] space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-base text-slate-900 tracking-tight">
                    My Guardians
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Trusted contacts notified automatically during emergency SOS.
                  </p>
                </div>
                <button
                  onClick={handleOpenModal}
                  className="bg-red-600 hover:bg-red-500 text-white px-3.5 py-2 rounded-xl font-bold text-xs transition shadow-xs whitespace-nowrap active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>+</span> Add Guardian
                </button>
              </div>

              {/* Guardians List */}
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto">
                {guardiansList.length === 0 ? (
                  <div className="text-center py-6 border border-dashed rounded-xl border-slate-200 bg-slate-50/50 space-y-1">
                    <p className="text-xs font-semibold text-slate-500">No guardians added yet.</p>
                    <p className="text-[11px] text-slate-400">Click "+ Add Guardian" above to add registered contacts.</p>
                  </div>
                ) : (
                  guardiansList.map((rel) => {
                    const g = rel.guardian || {};
                    return (
                      <div
                        key={rel._id}
                        className="flex items-center justify-between p-3.5 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white transition"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-8 h-8 rounded-full bg-red-50 border border-red-100 flex items-center justify-center text-red-600 font-bold text-xs">
                            {g.name?.charAt(0)?.toUpperCase() || "G"}
                          </span>
                          <div>
                            <p className="text-xs font-bold text-slate-900">
                              {g.name || "Registered Guardian"}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              📧 {g.email || "N/A"} • 📞 <span className="font-mono">{rel.guardianPhone || g.phone || "N/A"}</span>
                            </p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeleteGuardian(rel._id || g._id)}
                          className="text-[11px] font-semibold text-red-600 hover:text-red-800 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition border border-transparent hover:border-red-100 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {saveMessage && (
                <p className="text-xs text-red-600 font-bold text-center pt-2">
                  {saveMessage}
                </p>
              )}
            </div>

            {/* ADD GUARDIAN MODAL */}
            {isAddModalOpen && (
              <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full border border-slate-200 shadow-2xl space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 tracking-tight">
                        Add New Guardian
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Enter guardian credentials for instant verification.
                      </p>
                    </div>
                    <button
                      onClick={handleCloseModal}
                      className="text-slate-400 hover:text-slate-600 text-lg font-bold p-1 rounded-lg"
                    >
                      ✕
                    </button>
                  </div>

                  {modalError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl font-medium">
                      ⚠️ {modalError}
                    </div>
                  )}

                  {modalSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs p-3 rounded-xl font-medium">
                      ✅ {modalSuccess}
                    </div>
                  )}

                  <form onSubmit={handleAddGuardianSubmit} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                        Guardian Email Address <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        placeholder="e.g. guardian@example.com"
                        value={modalEmail}
                        onChange={(e) => setModalEmail(e.target.value)}
                        className="w-full border border-slate-200 focus:border-red-500 outline-none rounded-xl px-4 py-2.5 text-xs text-slate-800 bg-slate-50 focus:bg-white transition"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                        Guardian Contact Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. +919876543210"
                        value={modalPhone}
                        onChange={(e) => setModalPhone(e.target.value)}
                        className="w-full border border-slate-200 focus:border-red-500 outline-none rounded-xl px-4 py-2.5 text-xs text-slate-800 bg-slate-50 focus:bg-white transition font-mono"
                        required
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Must match the phone number registered under the above guardian email.
                      </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                      <button
                        type="button"
                        onClick={handleCloseModal}
                        className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs py-3 rounded-xl transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={modalLoading}
                        className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold text-xs py-3 rounded-xl transition shadow-md disabled:opacity-50"
                      >
                        {modalLoading ? "Verifying & Adding..." : "Add Guardian"}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}

            {/* DURESS PIN CONFIGURATION */}
            <form
              onSubmit={handleSavePin}
              className="bg-white rounded-2xl border border-slate-100 p-6 shadow-[0_2px_8px_-3px_rgba(0,0,0,0.05),0_10px_32px_-4px_rgba(0,0,0,0.03)] space-y-4"
            >
              <h3 className="font-bold text-sm uppercase tracking-wider text-slate-400">
                Duress PIN Safety Setup
              </h3>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1.5">
                  4-Digit Silent Emergency PIN
                </label>
                <input
                  type="password"
                  maxLength={4}
                  className="w-full border border-slate-200 focus:border-red-500 focus:bg-white outline-none rounded-xl p-3 text-xs font-medium tracking-widest transition-all bg-slate-50/60 text-slate-800"
                  placeholder="••••"
                  value={distressPin}
                  onChange={(e) => setDistressPin(e.target.value)}
                />
                <p className="text-[11px] text-amber-700 font-medium mt-2 leading-relaxed">
                  Entering this PIN at login silently triggers an immediate background emergency dispatch to your guardians.
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-black text-white rounded-xl py-3 font-semibold text-xs uppercase tracking-wider transition shadow-md cursor-pointer disabled:opacity-50 active:scale-[0.99]"
              >
                {loading ? "Saving..." : "Update Duress PIN"}
              </button>
            </form>

          </div>
        </section>
      </main>
    </div>
  );
}