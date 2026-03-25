import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const WatermarkButton = ({ design, onWatermarkAdded, disabled = false }) => {
  const [loading, setLoading] = useState(false);

  const handleAddWatermark = async () => {
    if (design.isWatermarked) {
      toast.error('Design is already watermarked');
      return;
    }

    const confirmed = window.confirm(
      'This will embed an invisible watermark into your design to protect ownership. ' +
      'The watermark contains your designer ID, timestamp, and file hash. Continue?'
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      const response = await api.post(`/designs/${design.id || design._id}/watermark`);

      toast.success('Watermark applied successfully!');
      onWatermarkAdded?.(response.data.data);
    } catch (error) {
      console.error('Watermark error:', error);
      toast.error(error.response?.data?.message || 'Failed to add watermark');
    } finally {
      setLoading(false);
    }
  };

  if (design.isWatermarked) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span>Protected</span>
      </div>
    );
  }

  return (
    <motion.button
      onClick={handleAddWatermark}
      disabled={disabled || loading}
      className="flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30
                 text-purple-400 rounded-lg transition-colors disabled:opacity-50
                 disabled:cursor-not-allowed text-sm font-medium"
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Adding Watermark...</span>
        </>
      ) : (
        <>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <span>Add Watermark</span>
        </>
      )}
    </motion.button>
  );
};

export default WatermarkButton;
