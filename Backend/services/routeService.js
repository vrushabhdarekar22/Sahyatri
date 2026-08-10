import axios from "axios";

const ORS_BASE_PRIMARY = "https://api.heigit.org/v2/directions";
const ORS_BASE_SECONDARY = "https://api.openrouteservice.org/v2/directions";

/**
 * Fetches alternative routes from OpenRouteService and returns them
 * ALREADY NORMALIZED — every route object guaranteed to have:
 *   { geometry, summary: { distance, duration } }
 */
export async function getRoutesFromORS(start, end, mode = "driving-car") {
  if (!start?.lat || !start?.lng || !end?.lat || !end?.lng) {
    throw new Error("Invalid start/end coordinates passed to getRoutesFromORS");
  }

  // ORS expects [lng, lat] order
  const coordinates = [
    [start.lng, start.lat],
    [end.lng, end.lat],
  ];

  const payload = {
    coordinates,
    alternative_routes: {
      target_count: 2, // main + 2 alternative routes
      weight_factor: 1.6, // alternative routes up to 60% longer
      share_factor: 0.6, // alternate route separation
    },
    instructions: false,
  };

  const headers = {
    Authorization: process.env.ORS_API_KEY,
    "Content-Type": "application/json",
  };

  let response;

  try {
    // Try new HeiGIT endpoint first (as announced by ORS deprecation)
    response = await axios.post(
      `${ORS_BASE_PRIMARY}/${mode}/geojson`,
      payload,
      { headers, timeout: 15000 }
    );
  } catch (primaryErr) {
    // Fallback to legacy endpoint if primary fails
    try {
      response = await axios.post(
        `${ORS_BASE_SECONDARY}/${mode}/geojson`,
        payload,
        { headers, timeout: 15000 }
      );
    } catch (err) {
      if (err.response) {
        console.error("ORS API Error:", err.response.status, err.response.data);
        if (err.response.status === 401 || err.response.status === 403) {
          throw new Error(
            `OpenRouteService API key invalid or unauthorized (HTTP ${err.response.status}). Please check ORS_API_KEY on Render.`
          );
        }
      }
      throw err;
    }
  }

  const features = response.data?.features || [];

  if (features.length === 0) {
    throw new Error("ORS returned no routes for the given coordinates");
  }

  return features.map((feature, idx) => {
    const distance = feature.properties?.summary?.distance ?? 0;
    const duration = feature.properties?.summary?.duration ?? 0;

    return {
      id: idx,
      geometry: feature.geometry,
      summary: { distance, duration },
      distance,
      duration,
    };
  });
}