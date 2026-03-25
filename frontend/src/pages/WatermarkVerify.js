import React, { useState } from 'react';
import { motion } from 'framer-motion';
import WatermarkVerifier from '../components/watermark/WatermarkVerifier';

const WatermarkVerify = () => {
  const [verificationResult, setVerificationResult] = useState(null);

  const handleVerificationComplete = (result) => {
    setVerificationResult(result);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-2xl mx-auto space-y-8"
    >
      {/* Title Section */}
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">Verify Watermark</h1>
        <p className="text-dark-400">
          Upload any image to check if it contains a FashionGuard invisible watermark.
          This helps verify design ownership and detect unauthorized use.
        </p>
      </div>

      {/* Verification Card */}
      <div className="glass-card-dark p-6 rounded-2xl">
        <WatermarkVerifier onVerificationComplete={handleVerificationComplete} />
      </div>

      {/* Info Cards */}
      <div className="grid md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="glass-card-dark p-5 rounded-xl"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-medium mb-1">How It Works</h3>
              <p className="text-dark-400 text-sm">
                Our DCT-based watermark is embedded in the frequency domain of images,
                making it invisible to the eye but detectable by our system.
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card-dark p-5 rounded-xl"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-success-500/20 flex items-center justify-center flex-shrink-0">
              <svg className="w-5 h-5 text-success-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="text-white font-medium mb-1">Robustness</h3>
              <p className="text-dark-400 text-sm">
                Watermarks survive JPEG compression, resizing up to 50%,
                minor cropping, and format conversions.
              </p>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Use Cases */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card-dark p-6 rounded-xl border border-primary-500/20"
      >
        <h3 className="text-white font-semibold mb-4">Common Use Cases</h3>
        <ul className="space-y-3">
          {[
            'Verify if a design found online belongs to you',
            'Check images received from suppliers for original ownership',
            'Gather evidence of unauthorized design usage',
            'Validate authenticity of designs in legal disputes',
          ].map((text, i) => (
            <li key={i} className="flex items-center gap-3 text-dark-300 text-sm">
              <svg className="w-5 h-5 text-primary-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </motion.div>
    </motion.div>
  );
};

export default WatermarkVerify;
