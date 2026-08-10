import mongoose from "mongoose";

const guardianRelationshipSchema = new mongoose.Schema(
  {
    traveller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    guardian: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    guardianPhone: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate traveller-guardian relationships
guardianRelationshipSchema.index({ traveller: 1, guardian: 1 }, { unique: true });

export default mongoose.model("GuardianRelationship", guardianRelationshipSchema);
