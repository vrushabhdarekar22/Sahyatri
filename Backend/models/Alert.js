import mongoose from "mongoose";

const alertSchema = new mongoose.Schema({
  userId: String,

  name: String,

  location: {
    lat: Number,
    lng: Number,
  },

  tripId: String,

  audioUrl: String,

  status: {
    type: String,
    enum: ["active", "resolved"],
    default: "active",
  },

  resolvedAt: Date,

  isOfflineSync: {
    type: Boolean,
    default: false,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

alertSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model("Alert", alertSchema);