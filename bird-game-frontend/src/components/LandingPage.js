import { useState } from 'react';
import './LandingPage.css';

const LandingPage = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedImage(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  const handleUpload = async () => {
    if (!selectedImage) return;
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('image', selectedImage);
      
      console.log('Attempting to upload to backend...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch('http://192.168.155.82:3001/api/identify', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
        mode: 'cors'
      });
      
      clearTimeout(timeoutId);
      
      console.log('Response received:', response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Backend error:', errorText);
        throw new Error(`Backend error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log('Backend response:', result);
      
      if (result.success) {
        alert(`Bird identified: ${result.bird.commonName} (${result.bird.scientificName})\nConfidence: ${(result.bird.confidence * 100).toFixed(1)}%\n\nDescription: ${result.bird.description}`);
      } else {
        alert('Failed to identify bird. Please try again.');
      }
    } catch (error) {
      console.error('Error uploading image:', error);
      if (error.name === 'AbortError') {
        alert('Request timed out - backend may be unresponsive');
      } else {
        alert(`Error: ${error.message}`);
      }
    } finally {
      setIsUploading(false);
    }
  };

  const resetImage = () => {
    setSelectedImage(null);
    setPreviewUrl(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  };

  return (
    <div className="landing-page">
      <div className="header">
        <h1>🐦 Bird Identifier</h1>
        <p>Upload a photo of a bird and discover what species it is!</p>
      </div>

      <div className="upload-section">
        {!selectedImage ? (
          <div
            className="upload-area"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <div className="upload-content">
              <div className="upload-icon">📸</div>
              <h3>Drop your bird photo here</h3>
              <p>or</p>
              <label htmlFor="file-input" className="upload-button">
                Choose File
              </label>
              <input
                id="file-input"
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              <p className="upload-hint">
                Supports JPG, PNG, GIF up to 10MB
              </p>
            </div>
          </div>
        ) : (
          <div className="preview-section">
            <div className="image-preview">
              <img src={previewUrl} alt="Selected bird" />
            </div>
            <div className="preview-actions">
              <button
                onClick={handleUpload}
                disabled={isUploading}
                className="identify-button"
              >
                {isUploading ? 'Identifying...' : 'Identify Bird'}
              </button>
              <button onClick={resetImage} className="reset-button">
                Choose Different Image
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="features">
        <div className="feature">
          <h3>🎯 Accurate Identification</h3>
          <p>Our AI can identify hundreds of bird species</p>
        </div>
        <div className="feature">
          <h3>🏆 Collect & Track</h3>
          <p>Build your personal bird collection</p>
        </div>
        <div className="feature">
          <h3>📍 Location Aware</h3>
          <p>Track where you spotted each bird</p>
        </div>
      </div>
    </div>
  );
};

export default LandingPage;