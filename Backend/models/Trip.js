import mongoose from "mongoose";

const tripSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // here we have kept lat,lng bcoz all APIs like ORS,Google map works using lattitude & longitude not address
    // and have kept address bcoz it is useful to show on UI instead of co-ordinates.
    start: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
      address: String,
    },

    destination: {
      lat: {
        type: Number,
        required: true,
      },
      lng: {
        type: Number,
        required: true,
      },
      address: String,
    },

    // route is basically complex data having array of co-ordinates,instructions(String) => so it is basically object.
    route: {
      type: Object,
      default: null,
    },

    distanceKm: {
      type: Number,
      default: null,
    },

    durationMin: {
      type: Number,
      default: null,
    },

    safetyScore: {
      type: Number,
      default: 0,
    },

    // SafetyBreakdown stores the individual factors used to calculate the overall safety score
    safetyBreakdown: {
      type: Object,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "planned",
        "active",
        "completed",
        "cancelled",
      ],
      default: "planned",
    },

    startedAt: Date,
    completedAt: Date,
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("Trip", tripSchema);