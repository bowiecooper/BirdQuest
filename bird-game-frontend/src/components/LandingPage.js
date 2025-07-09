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
    // TODO: Implement API call to backend for bird identification
    console.log('Uploading image:', selectedImage);
    
    // Simulate API call
    setTimeout(() => {
      setIsUploading(false);
      alert('Bird identification coming soon!');
    }, 2000);
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