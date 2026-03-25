import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import {
  ShieldCheckIcon,
  DevicePhoneMobileIcon,
} from '@heroicons/react/24/outline';

const MFAVerification = () => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRefs = useRef([]);

  const { verifyMFA } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const { mfaToken, userId } = location.state || {};

  useEffect(() => {
    // Redirect if no MFA data
    if (!mfaToken || !userId) {
      navigate('/login', { replace: true });
    }

    // Focus first input
    inputRefs.current[0]?.focus();
  }, [mfaToken, userId, navigate]);

  const handleChange = (index, value) => {
    // Only allow numbers
    if (value && !/^\d+$/.test(value)) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when complete
    if (value && index === 5) {
      const fullCode = newCode.join('');
      if (fullCode.length === 6) {
        handleSubmit(fullCode);
      }
    }
  };

  const handleKeyDown = (index, e) => {
    // Handle backspace
    if (e.key === 'Backspace') {
      if (!code[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }

    // Handle arrow keys
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);

    if (pastedData) {
      const newCode = pastedData.split('');
      while (newCode.length < 6) newCode.push('');
      setCode(newCode);

      // Focus the next empty input or last input
      const nextEmptyIndex = newCode.findIndex((c) => !c);
      if (nextEmptyIndex !== -1) {
        inputRefs.current[nextEmptyIndex]?.focus();
      } else {
        inputRefs.current[5]?.focus();
        // Auto-submit if complete
        handleSubmit(pastedData);
      }
    }
  };

  const handleSubmit = async (fullCode) => {
    const codeToSubmit = fullCode || code.join('');

    if (codeToSubmit.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }

    setIsLoading(true);
    const result = await verifyMFA({
      userId,
      mfaToken,
      code: codeToSubmit,
    });
    setIsLoading(false);

    if (result.success) {
      toast.success('Verification successful!');
      navigate('/dashboard', { replace: true });
    } else {
      setError(result.error);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950 p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
      >
        {/* Card */}
        <div className="glass-card-dark p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-primary-500/20 to-secondary-500/20 rounded-2xl flex items-center justify-center">
              <DevicePhoneMobileIcon className="w-10 h-10 text-primary-400" />
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">
              Two-Factor Authentication
            </h2>
            <p className="text-dark-400">
              Enter the 6-digit code from your authenticator app
            </p>
          </div>

          {/* Code inputs */}
          <div className="flex justify-center gap-3 mb-6">
            {code.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                inputMode="numeric"
                maxLength="1"
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                onPaste={handlePaste}
                className={`w-12 h-14 text-center text-xl font-bold rounded-xl
                  bg-dark-800/50 border-2 text-white
                  focus:outline-none transition-all duration-200
                  ${error
                    ? 'border-error-500 focus:border-error-400'
                    : digit
                    ? 'border-primary-500 focus:border-primary-400'
                    : 'border-dark-600 focus:border-primary-500'
                  }
                `}
                disabled={isLoading}
              />
            ))}
          </div>

          {/* Error message */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center text-error-400 text-sm mb-6"
            >
              {error}
            </motion.p>
          )}

          {/* Submit button */}
          <button
            onClick={() => handleSubmit()}
            disabled={isLoading || code.some((d) => !d)}
            className="btn-primary w-full mb-6"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="spinner" />
                Verifying...
              </span>
            ) : (
              'Verify Code'
            )}
          </button>

          {/* Help text */}
          <div className="text-center space-y-4">
            <p className="text-sm text-dark-400">
              Lost access to your authenticator?
            </p>
            <button
              type="button"
              onClick={() => {
                toast.success('Enter a backup code instead');
              }}
              className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              Use a backup code
            </button>
          </div>
        </div>

        {/* Back to login */}
        <p className="text-center mt-6 text-dark-400">
          <button
            onClick={() => navigate('/login')}
            className="text-primary-400 hover:text-primary-300 transition-colors"
          >
            ← Back to login
          </button>
        </p>
      </motion.div>
    </div>
  );
};

export default MFAVerification;
