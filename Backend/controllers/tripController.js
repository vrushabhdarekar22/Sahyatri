import Trip from "../models/Trip.js";
import { getRoutesFromORS } from "../services/routeService.js";
import { calculateSafetyScore } from "../utils/calculateScore.js";

export const createTrip = async (req, res) => {
  try {
    const { start, destination, route } = req.body;

    if (!start || !destination) {
      return res.status(400).json({
        message: "start and destination are required",
      });
    }

    let distanceKm = null;
    let durationMin = null;
    let routeGeometry = null; // stores actual path
    let safetyResult = { totalScore: 50, breakdown: { note: "no route available" } };

    /** sample route.geometry
   {
      "summary": {
        "distance": 8200,
        "duration": 1200
      },

      "geometry": {
        "coordinates": [
          [73.8508, 18.4575],
          [73.8521, 18.4602],
          [73.8560, 18.4650],
          ...
        ]
      }
    }
     */

    if (route && route.geometry?.coordinates?.length) {
      
      routeGeometry = route.geometry;

      // ?? => Nullish Operator means try this if not try this.
      const dist = route.summary?.distance ?? route.distance ?? null;
      const dur = route.summary?.duration ?? route.duration ?? null;

      // ORS sends dist in meter we want it in KM and dur in sec we want it in min
      distanceKm = dist != null ? +(dist / 1000).toFixed(2) : null;
      durationMin = dur != null ? +(dur / 60).toFixed(1) : null;

      // Recompute the safety score server-side instead of trusting
      // whatever number the client sends — a tampered client could
      // otherwise fake a "100% safe" score on a dangerous route.

      const coordinates = route.geometry.coordinates.map(
        ([lng, lat]) => [lat, lng]
      );

      safetyResult = await calculateSafetyScore({ coordinates });
      /**{safetyResult structure
           totalScore:82,

          breakdown:{
            lighting:20,

            traffic:15,

            hospitals:18,

            police:29
          }
          }
      */
    } else {
      // Fallback: no route provided — compute one server-side.
      try {
        const routes = await getRoutesFromORS(start, destination, "driving-car");
        const primaryRoute = routes[0];

        if (primaryRoute) {
          routeGeometry = primaryRoute.geometry;
          distanceKm = +(primaryRoute.distance / 1000).toFixed(2);
          durationMin = +(primaryRoute.duration / 60).toFixed(1);

          const coordinates = primaryRoute.geometry.coordinates.map(
            ([lng, lat]) => [lat, lng]
          );

          safetyResult = await calculateSafetyScore({ coordinates });
        }
      } catch (routeErr) {
        console.log("createTrip fallback route fetch error:", routeErr.message);
      }
    }

    const trip = await Trip.create({
      userId: req.user.id,
      start,
      destination,
      route: routeGeometry,
      distanceKm,
      durationMin,
      safetyScore: safetyResult.totalScore,
      safetyBreakdown: safetyResult.breakdown,
    });

    res.status(201).json(trip);
  } catch (err) {
    console.error("createTrip error:", err.message);
    res.status(500).json({
      message: "Failed to create trip",
    });
  }
};

export const getMyTrips = async (req, res) => {
  try {
    const trips = await Trip.find({
      userId: req.user.id,
    }).sort({ createdAt: -1 });

    res.json(trips);
  } catch (err) {
    res.status(500).json({
      message: "Failed to fetch trips",
    });
  }
};

export const startTrip = async (req, res) => {
  try {
    const trip = await Trip.findByIdAndUpdate(
      req.params.id,
      { status: "active", startedAt: new Date() },
      { new: true }
    );

    if (!trip) return res.status(404).json({ message: "Trip not found" });

    res.json(trip);
  } catch (err) {
    res.status(500).json({ message: "Failed to start trip" });
  }
};

export const completeTrip = async (req, res) => {
  try {
    const trip = await Trip.findByIdAndUpdate(
      req.params.id,
      { status: "completed", completedAt: new Date() },
      { new: true }
    );

    if (!trip) return res.status(404).json({ message: "Trip not found" });

    res.json(trip);
  } catch (err) {
    res.status(500).json({ message: "Failed to complete trip" });
  }
};
