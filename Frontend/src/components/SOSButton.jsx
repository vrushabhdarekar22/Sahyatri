import { useRef, useState, forwardRef, useImperativeHandle } from "react";
import axios from "axios";
import api from "../utils/api";
import { queueOfflineAlert } from "../utils/offlineQueue";

const SOSButton = forwardRef(function SOSButton(
  { tripId = null, currentLocation = null, recordAudio = true, onSOSStateChange },
  ref
) {
  /* =========================
      STATES
  ========================= */
  const [sosActive, setSOSActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [micError, setMicError] = useState(null);

  /* =========================
      REFS
  ========================= */
  const watchIdRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const streamRef = useRef(null);
  // Ref tracking to circumvent asynchronous state closure lag
  const currentAlertIdRef = useRef(null);

  /* =========================
      LOCATION HELPER
  ========================= */
  const parseProvidedLocation = (loc) => {
    if (!loc) return null;
    if (Array.isArray(loc) && loc.length >= 2 && loc[0] != null && loc[1] != null) {
      return { lat: Number(loc[0]), lng: Number(loc[1]) };
    }
    if (typeof loc === "object" && loc.lat != null && loc.lng != null) {
      return { lat: Number(loc.lat), lng: Number(loc.lng) };
    }
    return null;
  };

  /* =========================
      SMART HIGH-ACCURACY GPS ENGINE
  ========================= */
  const getAccurateLocation = async (maxAttempts = 3, delayMs = 1500) => {
    const fetchSnapshot = () => {
      return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 0,
        });
      });
    };

    let bestPosition = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`📡 GPS Acquisition attempt ${attempt} of ${maxAttempts}...`);
      try {
        const position = await fetchSnapshot();
        const accuracy = position.coords.accuracy;
        console.log(`🎯 Attempt ${attempt} accuracy: ${Math.round(accuracy)} meters.`);

        if (accuracy && accuracy <= 30) {
          return position;
        }

        if (!bestPosition || accuracy < bestPosition.coords.accuracy) {
          bestPosition = position;
        }
      } catch (err) {
        console.warn(`GPS Attempt ${attempt} failed:`, err.message);
      }

      if (attempt < maxAttempts) {
        await new Promise((res) => setTimeout(res, delayMs));
      }
    }

    if (bestPosition) return bestPosition;
    throw new Error("Could not acquire location metrics from hardware layer.");
  };

  /* =========================
      START SOS
  ========================= */
  const startSOS = async () => {
    if (sosActive) return;

    try {
      setLoading(true);
      setMicError(null);

      /* =========================
          MICROPHONE START
      ========================= */
      if (recordAudio && navigator.mediaDevices?.getUserMedia) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
          });
          streamRef.current = stream;

          let mimeType = "";
          if (typeof MediaRecorder !== "undefined") {
            if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
              mimeType = "audio/webm;codecs=opus";
            } else if (MediaRecorder.isTypeSupported("audio/webm")) {
              mimeType = "audio/webm";
            } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
              mimeType = "audio/mp4";
            } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
              mimeType = "audio/ogg";
            }
          }

          const options = mimeType ? { mimeType } : {};
          const mediaRecorder = new MediaRecorder(stream, options);
          mediaRecorderRef.current = mediaRecorder;
          chunksRef.current = [];

          mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              chunksRef.current.push(e.data);
            }
          };

          // Pass timeslice (1000ms) to ensure continuous data events
          mediaRecorder.start(1000);
          console.log("🎤 Audio recording initialized:", mediaRecorder.mimeType || "default");
        } catch (micErr) {
          console.warn("Microphone access failed:", micErr.name, micErr.message);
          setMicError("Microphone permission denied by browser. Click 🔒 icon near address bar to allow mic access.");
          alert(
            "⚠️ Microphone Access Denied!\n\nTo record emergency audio during SOS, please grant microphone permissions:\n1. Click the lock (🔒) icon in your browser URL address bar.\n2. Set Microphone to 'Allow'.\n3. Try triggering SOS again."
          );
        }
      }

      /* =========================
          GET GPS LOCATION
      ========================= */
      let resolvedLocation = parseProvidedLocation(currentLocation);

      if (!resolvedLocation) {
        let position;
        try {
          position = await getAccurateLocation(3, 1500);
        } catch (err) {
          console.log("GPS ERROR:", err);
          alert(
            "Unable to acquire reliable location. Ensure location features are turned on and step outside."
          );

          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          setLoading(false);
          return;
        }

        const accuracy = position.coords.accuracy;
        console.log("✅ Optimal GPS Position resolved:", position.coords);

        const isLocalhost =
          window.location.hostname === "localhost" ||
          window.location.hostname === "127.0.0.1";
        const accuracyHardCap = isLocalhost ? 150000 : 1000;
        const lowAccuracyWarningThreshold = isLocalhost ? 150000 : 60;

        if (!accuracy || accuracy > accuracyHardCap) {
          alert(
            "❌ Location telemetry too inaccurate. Please move to an open area and try again."
          );
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          setLoading(false);
          return;
        }

        if (accuracy > lowAccuracyWarningThreshold) {
          const proceed = window.confirm(
            `⚠️ Low accuracy (${Math.round(
              accuracy
            )}m). Your device is likely using cell-towers instead of GPS satellites. Do you still want to dispatch?`
          );

          if (!proceed) {
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((t) => t.stop());
            }
            setLoading(false);
            return;
          }
        }

        resolvedLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
      } else {
        console.log("📍 Using provided location prop:", resolvedLocation);
      }

      /* =========================
          OFFLINE QUEUE CHECK
      ========================= */
      if (!navigator.onLine) {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.onstop = async () => {
            const mime = mediaRecorderRef.current?.mimeType || "audio/webm";
            const blob = new Blob(chunksRef.current, { type: mime });
            await queueOfflineAlert(resolvedLocation, tripId, blob);
            chunksRef.current = [];
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((t) => t.stop());
            }
            setLoading(false);
            alert("Offline: SOS queued. Will sync when online.");
          };
        } else {
          await queueOfflineAlert(resolvedLocation, tripId, null);
          if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
          }
          setLoading(false);
          alert("Offline: SOS queued.");
        }
        return;
      }

      /* =========================
          TRIGGER SOS API
      ========================= */
      const res = await api.post(
        "/sos/trigger",
        {
          location: resolvedLocation,
          tripId: tripId || null,
          audioUrl: null,
          isOfflineSync: false,
        }
      );

      // Force Custom Event pipeline to sync UI instantly
      window.dispatchEvent(new CustomEvent("sos-created"));

      // Lock current alert ID into the reference container immediately
      currentAlertIdRef.current = res.data.alert._id;
      setSOSActive(true);
      onSOSStateChange?.(true);
      console.log("🚨 SOS CREATED:", res.data);

      /* =========================
          LIVE TRACKING
      ========================= */
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const location = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          console.log("📍 Live Position:", location);
        },
        (err) => {
          console.log("GPS WATCH ERROR:", err);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 20000,
        }
      );

      alert("🚨 SOS ACTIVATED");
    } catch (err) {
      console.error(err);
      alert("Failed to start SOS");
      setSOSActive(false);
      onSOSStateChange?.(false);
    } finally {
      setLoading(false);
    }
  };

  /* =========================
      STOP SOS
  ========================= */
  const stopSOS = async () => {
    try {
      setSOSActive(false);
      onSOSStateChange?.(false);
      const activeAlertId = currentAlertIdRef.current;

      /* STOP GPS */
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }

      /* STOP RECORDING & UPLOAD */
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        const recorder = mediaRecorderRef.current;
        const actualMimeType = recorder.mimeType || "audio/webm";

        recorder.onstop = async () => {
          try {
            // Stop mic stream tracks AFTER recorder finishes processing
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((t) => t.stop());
              streamRef.current = null;
            }

            if (chunksRef.current.length === 0) {
              console.warn("⚠️ No audio chunks recorded.");
              return;
            }

            const blob = new Blob(chunksRef.current, { type: actualMimeType });
            console.log(`🎤 Recording stopped. Blob size: ${blob.size} bytes`);

            if (blob.size === 0) {
              console.warn("⚠️ Audio blob size is 0 bytes.");
              return;
            }

            const ext = actualMimeType.includes("mp4") ? "mp4" : actualMimeType.includes("ogg") ? "ogg" : "webm";
            const formData = new FormData();
            formData.append("audio", blob, `recording.${ext}`);

            console.log("🚀 Uploading emergency recording to Cloudinary...");
            const uploadRes = await api.post(
              "/recordings/upload",
              formData,
              {
                headers: {
                  "Content-Type": "multipart/form-data",
                },
              }
            );

            const audioUrl = uploadRes.data?.audioUrl;
            console.log("✅ Uploaded audio URL:", audioUrl);

            // Wait briefly for alert ID if resolution was delayed
            let alertIdToBind = activeAlertId || currentAlertIdRef.current;
            if (!alertIdToBind) {
              for (let i = 0; i < 10; i++) {
                await new Promise((res) => setTimeout(res, 300));
                if (currentAlertIdRef.current) {
                  alertIdToBind = currentAlertIdRef.current;
                  break;
                }
              }
            }

            if (audioUrl && alertIdToBind) {
              await api.put(
                `/alerts/${alertIdToBind}/audio`,
                { audioUrl }
              );
              console.log("🎤 Audio successfully bound to alert ID:", alertIdToBind);
              window.dispatchEvent(new CustomEvent("sos-created"));
            }
            chunksRef.current = [];
          } catch (err) {
            console.error("UPLOAD/LINK AUDIO ERROR:", err.response?.data || err.message);
          }
        };

        recorder.stop();
      } else {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
      }

      currentAlertIdRef.current = null;
      alert("✅ SOS STOPPED");
    } catch (err) {
      console.error(err);
      alert("Failed to stop SOS");
    }
  };

  /* =========================
      EXPOSE IMPERATIVE HANDLE
  ========================= */
  useImperativeHandle(ref, () => ({
    startSOS,
    stopSOS,
    isSOSActive: () => sosActive,
  }));

  /* =========================
      UI
  ========================= */
  return (
    <div className="space-y-3">
      {!sosActive ? (
        <button
          onClick={startSOS}
          disabled={loading}
          className="bg-red-600 hover:bg-red-700 text-white px-10 py-5 rounded-3xl text-2xl font-bold w-full transition-transform active:scale-[0.99] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
        >
          {loading ? "Acquiring Precision GPS..." : "🚨 START SOS"}
        </button>
      ) : (
        <div className="space-y-3">
          <button
            onClick={stopSOS}
            className="bg-green-600 hover:bg-green-700 text-white px-10 py-5 rounded-3xl text-2xl font-bold w-full transition-transform active:scale-[0.99] cursor-pointer shadow-md"
          >
            ✅ STOP SOS
          </button>
          {!micError ? (
            <div className="flex items-center justify-center gap-2 text-xs font-semibold text-red-600 animate-pulse pt-1">
              <span className="h-2 w-2 rounded-full bg-red-600" />
              <span>🎙️ Recording emergency audio...</span>
            </div>
          ) : null}
        </div>
      )}

      {micError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-3 rounded-xl text-xs font-medium space-y-1">
          <p className="font-bold flex items-center gap-1">
            <span>🔒 Microphone Access Required</span>
          </p>
          <p className="text-[11px] leading-relaxed">
            Your browser blocked microphone permissions. Click the 🔒 lock icon in your address bar, set Microphone to <b>Allow</b>, and trigger SOS again to attach emergency audio.
          </p>
        </div>
      )}
    </div>
  );
});

export default SOSButton;