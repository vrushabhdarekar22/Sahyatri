import User from "../models/User.js";
import Alert from "../models/Alert.js";


import { sendWhatsApp } from "../utils/sendWhatsApp.js";

export const triggerSOS = async (req, res) => {

  try {

   

    const userId = req.user.id;

    const {
      location,
      tripId,
      audioUrl,
      isOfflineSync
    } = req.body;

    if (!location || !location.lat || !location.lng) {
      return res.status(400).json({
        success: false,
        message: "Location is required"
      });
    }


    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }


    const emergency = {

      userId,

      name: user.name,

      location: {
        lat: location.lat,
        lng: location.lng
      },

      tripId: tripId || null,

      audioUrl: audioUrl || null,

      isOfflineSync:
        isOfflineSync || false,

      createdAt: new Date()
    };

    const savedAlert =
      await Alert.create(emergency);

   
    // GOOGLE MAP LINK
    const mapLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;

    
    // guardian dash link
    const dashboardLink = "http://localhost:5173/guardian";

    /* =========================
       WHATSAPP MESSAGE
    ========================= */

    const message = `
        🚨 SAHYATRI SOS ALERT 🚨

        ${user.name} may be in danger.

        📍 Live Location:
        ${mapLink}

        🕒 Time:
        ${new Date().toLocaleString()}

        🚕 Trip ID:
        ${tripId || "N/A"}

        🛰️ Guardian Dashboard:
        ${dashboardLink}

        ⚠️ Immediate attention required.
        `;

   
    // send what`s app msg
    await sendWhatsApp(
      user.emergencyContacts,
      message
    );




    res.status(200).json({
      success: true,
      message:
        "SOS triggered successfully",

      alert: savedAlert
    });

  } catch (err) {

    console.log("SOS ERROR:", err);

    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};