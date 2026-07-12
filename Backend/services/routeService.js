import axios from "axios";
// axios is an HTTP client.
// It allows your backend to make requests to another server(ORS ).

const ORS_BASE = "https://api.openrouteservice.org/v2/directions";

/**
 * Fetches alternative routes from OpenRouteService and returns them
 * ALREADY NORMALIZED — every route object guaranteed to have:
 *   { geometry, summary: { distance, duration } }
 *
 * This is the root fix for the "NaN km · NaN min" bug: previously the
 * raw ORS GeoJSON features were passed straight through, where distance
 * and duration live at `feature.properties.summary`, not at the top
 * level the frontend (and calculateSafetyScore) expected.
 *
 * @param {{lat:number,lng:number}} start
 * @param {{lat:number,lng:number}} end
 * @param {string} mode  driving-car | foot-walking | cycling-regular
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

  const url = `${ORS_BASE}/${mode}/geojson`;

  // we make req. to ORS API using axios
  const response = await axios.post(
    url,
    {
      coordinates,
      alternative_routes: {
        target_count: 2, // main + 2 alternative routes
        weight_factor: 1.6, // means alternative routes can be 60% longer than main route
        share_factor: 0.6, //alternate route should not overlap with main route
      },
      instructions: false, // ORS return instu like 'Turn Left','Turn Right' we don`t need so we kept it false to reduce res size
    },
    {
      headers: {
        Authorization: process.env.ORS_API_KEY, // we need authorized to make req. to ORS
        "Content-Type": "application/json",
      },
      timeout: 15000, // wait 15 sec else cancle req.
    }
  );

  const features = response.data?.features || [];

  if (features.length === 0) {
    throw new Error("ORS returned no routes for the given coordinates");
  }

  //  Normalize every feature into a flat, predictable shape
  return features.map((feature, idx) => {
    const distance = feature.properties?.summary?.distance ?? 0;
    const duration = feature.properties?.summary?.duration ?? 0;

    return {
      id: idx,
      geometry: feature.geometry,           // { type: "LineString", coordinates: [[lng,lat],...] }
      summary: { distance, duration },      // ALWAYS present, in meters / seconds
      distance,                             // also flat, for any code that reads it directly
      duration,
    };
  });
}