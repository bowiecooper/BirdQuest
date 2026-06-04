const axios = require('axios');
const FormData = require('form-data');

// iNaturalist API integration (temporarily disabled - API endpoint changed)
async function identifyBirdWithiNaturalist(imageBuffer, filename) {
  console.log('iNaturalist API temporarily disabled - endpoint requires authentication');
  return {
    success: false,
    error: 'iNaturalist API temporarily unavailable'
  };
}

// Mock bird identification (for testing without API keys)
function mockBirdIdentification(imageBuffer) {
  const mockBirds = [
    {
      commonName: 'American Robin',
      scientificName: 'Turdus migratorius',
      confidence: 0.92,
      description: 'A medium-sized songbird with a distinctive orange-red breast and dark head.',
      habitat: 'Gardens, parks, and wooded areas',
      diet: 'Insects, worms, and berries'
    },
    {
      commonName: 'Northern Cardinal',
      scientificName: 'Cardinalis cardinalis',
      confidence: 0.88,
      description: 'Bright red songbird with a distinctive crest and black face mask.',
      habitat: 'Woodlands, gardens, and shrublands',
      diet: 'Seeds, insects, and fruits'
    },
    {
      commonName: 'Blue Jay',
      scientificName: 'Cyanocitta cristata',
      confidence: 0.85,
      description: 'Intelligent blue bird with white underparts and black necklace.',
      habitat: 'Forests, parks, and residential areas',
      diet: 'Nuts, seeds, insects, and small animals'
    }
  ];
  
  // Return a random bird for demo purposes
  const randomBird = mockBirds[Math.floor(Math.random() * mockBirds.length)];
  
  return {
    success: true,
    bird: randomBird,
    location: {
      suggested: 'North America',
      seasonal: 'Year-round in most areas'
    }
  };
}

// Google Vision API integration (requires API key)
async function identifyBirdWithGoogleVision(imageBuffer) {
  try {
    if (!process.env.GOOGLE_CLOUD_API_KEY) {
      throw new Error('Google Cloud API key not configured');
    }
    
    const base64Image = imageBuffer.toString('base64');
    
    const response = await axios.post(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_CLOUD_API_KEY}`,
      {
        requests: [
          {
            image: {
              content: base64Image
            },
            features: [
              {
                type: 'LABEL_DETECTION',
                maxResults: 10
              }
            ]
          }
        ]
      },
      {
        timeout: 10000 // 10 second timeout
      }
    );
    
    if (response.data && response.data.responses && response.data.responses[0].labelAnnotations) {
      const labels = response.data.responses[0].labelAnnotations;
      
      // Look for bird-related labels
      const birdLabels = labels.filter(label => 
        label.description.toLowerCase().includes('bird') || 
        label.description.toLowerCase().includes('cardinal') ||
        label.description.toLowerCase().includes('robin') ||
        label.description.toLowerCase().includes('eagle') ||
        label.description.toLowerCase().includes('hawk')
      );
      
      if (birdLabels.length > 0) {
        const topLabel = birdLabels[0];
        return {
          success: true,
          source: 'Google Vision',
          bird: {
            commonName: topLabel.description,
            scientificName: 'Species identification requires specialized service',
            confidence: topLabel.score,
            description: `${topLabel.description} - identified via Google Vision API`,
            habitat: 'General bird habitat',
            diet: 'Varies by species'
          },
          location: {
            suggested: 'Worldwide distribution varies by species',
            seasonal: 'Varies by species and location'
          }
        };
      }
    }
    
    return {
      success: false,
      error: 'No bird detected in image'
    };
  } catch (error) {
    console.error('Google Vision API error:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = {
  identifyBirdWithiNaturalist,
  identifyBirdWithGoogleVision,
  mockBirdIdentification
};