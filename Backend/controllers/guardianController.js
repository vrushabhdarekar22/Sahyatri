import GuardianRelationship from "../models/GuardianRelationship.js";
import User from "../models/User.js";

// Helper function to normalize phone numbers for accurate comparison
const normalizePhone = (p) => (p ? p.trim().replace(/[^\d+]/g, "") : "");

/**
 * @route   POST /api/guardian/add
 * @desc    Directly add a guardian by validating email & phone belong to the same user
 * @access  Private (Traveller)
 */
export const addGuardian = async (req, res) => {
  try {
    const { email, phone } = req.body;
    const travellerId = req.user?.id || req.user?._id;

    if (!email || !phone) {
      return res.status(400).json({
        message: "Guardian email and contact number are required",
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const targetPhoneClean = normalizePhone(phone);

    // 1. Find user by email
    const guardianUser = await User.findOne({ email: cleanEmail });

    if (!guardianUser) {
      return res.status(404).json({
        message: "No registered user found with this guardian email",
      });
    }

    // 2. Validate phone number belongs to the SAME registered user
    const userPhoneClean = normalizePhone(guardianUser.phone);
    const userEmergencyContactsClean = (guardianUser.emergencyContacts || []).map(normalizePhone);

    const matchesPhone =
      (userPhoneClean && userPhoneClean === targetPhoneClean) ||
      userEmergencyContactsClean.includes(targetPhoneClean);

    if (!matchesPhone) {
      return res.status(400).json({
        message: "Email and phone number do not belong to the same registered user",
      });
    }

    // 3. Prevent traveller from adding themselves as a guardian
    if (guardianUser._id.toString() === travellerId.toString()) {
      return res.status(400).json({
        message: "You cannot add yourself as a guardian",
      });
    }

    // 4. Prevent duplicate relationships
    const existingRelationship = await GuardianRelationship.findOne({
      traveller: travellerId,
      guardian: guardianUser._id,
    });

    if (existingRelationship) {
      return res.status(400).json({
        message: "This guardian is already in your guardians list",
      });
    }

    // 5. Create Guardian Relationship immediately
    const relationship = await GuardianRelationship.create({
      traveller: travellerId,
      guardian: guardianUser._id,
      guardianPhone: phone.trim(),
    });

    const populatedRelationship = await GuardianRelationship.findById(relationship._id)
      .populate("guardian", "name email phone emergencyContacts");

    return res.status(201).json({
      message: "Guardian added successfully",
      relationship: populatedRelationship,
    });
  } catch (err) {
    console.error("addGuardian error:", err);
    return res.status(500).json({
      message: `Failed to add guardian: ${err.message}`,
    });
  }
};

/**
 * @route   GET /api/guardian/my-guardians
 * @desc    Fetch all guardians added by the logged-in traveller
 * @access  Private (Traveller)
 */
export const getMyGuardians = async (req, res) => {
  try {
    const travellerId = req.user?.id || req.user?._id;

    const guardians = await GuardianRelationship.find({ traveller: travellerId })
      .populate("guardian", "name email phone emergencyContacts")
      .sort({ createdAt: -1 });

    return res.status(200).json(guardians);
  } catch (err) {
    console.error("getMyGuardians error:", err);
    return res.status(500).json({
      message: "Failed to fetch guardians list",
    });
  }
};

/**
 * @route   DELETE /api/guardian/:guardianId
 * @desc    Remove a guardian relationship
 * @access  Private (Traveller)
 */
export const removeGuardian = async (req, res) => {
  try {
    const travellerId = req.user?.id || req.user?._id;
    const { guardianId } = req.params;

    const deleted = await GuardianRelationship.findOneAndDelete({
      traveller: travellerId,
      $or: [{ _id: guardianId }, { guardian: guardianId }],
    });

    if (!deleted) {
      return res.status(404).json({
        message: "Guardian relationship not found",
      });
    }

    return res.status(200).json({
      message: "Guardian removed successfully",
    });
  } catch (err) {
    console.error("removeGuardian error:", err);
    return res.status(500).json({
      message: "Failed to remove guardian",
    });
  }
};

/**
 * @route   GET /api/guardian/monitored-travellers
 * @desc    Fetch all travellers who added the logged-in user as a guardian
 * @access  Private (Guardian)
 */
export const getMonitoredTravellers = async (req, res) => {
  try {
    const guardianId = req.user?.id || req.user?._id;

    const relationships = await GuardianRelationship.find({ guardian: guardianId })
      .populate("traveller", "name email phone emergencyContacts")
      .sort({ createdAt: -1 });

    return res.status(200).json(relationships);
  } catch (err) {
    console.error("getMonitoredTravellers error:", err);
    return res.status(500).json({
      message: "Failed to fetch monitored travellers",
    });
  }
};
