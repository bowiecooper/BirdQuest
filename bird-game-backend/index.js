const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { mockBirdIdentification, identifyBirdWithiNaturalist, identifyBirdWithGoogleVision } = require('./services/birdIdentification');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Bird identification server is running' });
});

// Add middleware to log all requests
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Bird identification endpoint
app.post('/api/identify', upload.single('image'), async (req, res) => {
  console.log('=== IDENTIFY ENDPOINT HIT ===');
  console.log('Request headers:', req.headers);
  
  try {
    if (!req.file) {
      console.log('No file received');
      return res.status(400).json({ error: 'No image file provided' });
    }

    console.log('File received successfully:', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });

    // Skip all API calls and return mock data immediately
    console.log('Generating mock response...');
    const identificationResult = mockBirdIdentification(req.file.buffer);
    
    console.log('About to send response:', identificationResult);
    res.json(identificationResult);
    console.log('Response sent successfully');
    
  } catch (error) {
    console.error('Error processing image:', error);
    res.status(500).json({ 
      error: 'Failed to process image',
      message: error.message 
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }
  
  res.status(500).json({ error: 'Something went wrong!', message: error.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bird identification server running on http://0.0.0.0:${PORT}`);
  console.log(`Also accessible at http://localhost:${PORT}`);
  console.log(`Also accessible at http://127.0.0.1:${PORT}`);
});