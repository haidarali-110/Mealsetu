const multer = require('multer');
const path = require('path');

// Check file type
const checkFileType = (file, cb) => {
  const filetypes = /jpeg|jpg|png|pdf/;
  const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = filetypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb('Error: Images and PDFs only!');
  }
};

// Default storage — saves to ./uploads/
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, `${file.fieldname}-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5000000 },
  fileFilter: (req, file, cb) => { checkFileType(file, cb); }
});

// Commission proof storage — saves to ./uploads/commission-proofs/
const commissionProofStorage = multer.diskStorage({
  destination: './uploads/commission-proofs/',
  filename: (req, file, cb) => {
    cb(null, `proof-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const commissionProofUpload = multer({
  storage: commissionProofStorage,
  limits: { fileSize: 5000000 },
  fileFilter: (req, file, cb) => { checkFileType(file, cb); }
});

// Delivery proof photo — ./uploads/delivery-proofs/
const deliveryProofStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = './uploads/delivery-proofs/';
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, `delivery-${Date.now()}${path.extname(file.originalname)}`);
  }
});

const deliveryProofUpload = multer({
  storage: deliveryProofStorage,
  limits: { fileSize: 5000000 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png/.test(path.extname(file.originalname).toLowerCase()) &&
               /jpeg|jpg|png/.test(file.mimetype);
    ok ? cb(null, true) : cb('Error: Images only for delivery proof');
  }
});

module.exports = upload;
module.exports.commissionProofUpload = commissionProofUpload;
module.exports.deliveryProofUpload   = deliveryProofUpload;