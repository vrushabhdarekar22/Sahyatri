import { getNearbySafetyData } from "../services/geoapifyService.js";

const POSITIVE_CATEGORIES = {
  "service.police": { key: "policeStations", weight: 8 },
  "healthcare.hospital": { key: "hospitals", weight: 5 },
  "healthcare.pharmacy": { key: "pharmacies", weight: 2 },
  "service.financial.bank": { key: "banks", weight: 1.5 },
  "service.financial.atm": { key: "atms", weight: 1 },
};

const NEGATIVE_CATEGORIES = {
  "catering.bar": { key: "bars", weight: -3 },
  "catering.pub": { key: "pubs", weight: -2 },
  "adult": { key: "adultVenues", weight: -6 },
  "commercial.smoking": { key: "smokingShops", weight: -1 },
};

/**
 * Route safety score based on nearby positive (police, hospitals,
 * pharmacies, banks/ATMs) and negative (bars, pubs, adult venues,
 * smoking shops) POI presence.
 * route.coordinates expected as [[lat, lng], ...]
 */

export const calculateSafetyScore = async (route) => {
  try {
    const coords = route.coordinates || [];

    if (!coords.length) {
      return {
        totalScore: 50,
        breakdown: { note: "no coordinates" },
      };
    }

    // this is very imp thing we are doing for optimization.
    // as of now we are doing it based on coordinates but we can do it using distance in meter it will be better try it in future!!
    // why we are doing this optimization?? => bcoz if we don`t then we need to call 'getNearbySafetyData' method for each coordinate and that is inefficient
    const step = Math.max(1, Math.floor(coords.length / 10));
    const samplePoints = coords.filter((_, i) => i % step === 0); // '-' means there exists param but i am not using it intentionally 

    const allData = await Promise.all( // we are calling it simultaneously
      samplePoints.map(async ([lat, lng]) => {
        try {
          return await getNearbySafetyData(lat, lng);
        } catch {
          return [];
        }
      })
    );

    const merged = allData.flat();// flat() is a built-in JavaScript array method that creates a new array by flattening nested arrays into a single array.

    const unique = new Map(); // map removes duplicates

    merged.forEach((p) => {
      const key = p.id ?? `${p.lat}_${p.lon}`;
      unique.set(key, p);
    });

    // init counts for every tracked category
    const counts = {};
    Object.values(POSITIVE_CATEGORIES).forEach((c) => (counts[c.key] = 0));
    Object.values(NEGATIVE_CATEGORIES).forEach((c) => (counts[c.key] = 0));

    let rawScore = 0;

    unique.forEach((p) => {
      const cats = p.categories || [];

      cats.forEach((cat) => {
        if (POSITIVE_CATEGORIES[cat]) {
          const { key, weight } = POSITIVE_CATEGORIES[cat];
          counts[key]++;
          rawScore += weight;
        }
        if (NEGATIVE_CATEGORIES[cat]) {
          const { key, weight } = NEGATIVE_CATEGORIES[cat];
          counts[key]++;
          rawScore += weight; // weight is already negative
        }
      });
    });

    // bound to 0–100, centered at neutral 50
    const totalScore = Math.max(0, Math.min(100, Math.round(50 + rawScore)));

    return {
      totalScore,
      breakdown: {
        ...counts,
        totalPOIs: unique.size,
        pointsSampled: samplePoints.length,
        rawScore,
      },
    };
  } catch (err) {
    return {
      totalScore: 50,
      breakdown: { error: err.message, fallback: true },
    };
  }
};