import Alert from "../models/Alert.js";
import GuardianRelationship from "../models/GuardianRelationship.js";

// GET ALERTS FOR AUTHORIZED USER / GUARDIAN
export const getAlerts = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // Find relationships where the logged-in user is acting as a guardian
    const relationships = await GuardianRelationship.find({ guardian: userId });
    const monitoredTravellerIds = relationships.map((r) => r.traveller.toString());

    // Fetch alerts belonging to the user OR their monitored travellers
    const alerts = await Alert.find({
      $or: [
        { userId: userId.toString() },
        { userId: { $in: monitoredTravellerIds } },
      ],
    }).sort({ createdAt: -1 });

    res.json(alerts);
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};

// UPDATE ALERT AUDIO
export const updateAlertAudio = async (req, res) => {
  try {
    const { alertId } = req.params;
    const { audioUrl } = req.body;

    const updatedAlert = await Alert.findByIdAndUpdate(
      alertId,
      { audioUrl },
      { new: true }
    );

    if (!updatedAlert) {
      return res.status(404).json({ message: "Alert not found" });
    }

    res.json({
      success: true,
      alert: updatedAlert,
    });
  } catch (err) {
    res.status(500).json({
      message: err.message,
    });
  }
};