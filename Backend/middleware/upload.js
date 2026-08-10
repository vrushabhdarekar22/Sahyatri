import multer from "multer";

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Allow audio types and webm/mp4 audio recordings
  if (
    file.mimetype.startsWith("audio/") ||
    file.mimetype === "video/webm" ||
    file.mimetype === "application/octet-stream"
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only audio recording files are allowed!"), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter,
});

export default upload;