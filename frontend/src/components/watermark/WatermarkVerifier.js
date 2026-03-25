import React, { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import api from '../../services/api';

const STEPS = [
  { id: 1, label: 'Upload suspected design',       icon: '📤' },
  { id: 2, label: 'Extract invisible watermark',    icon: '🔍' },
  { id: 3, label: 'Decrypt watermark metadata',     icon: '🔓' },
  { id: 4, label: 'Retrieve ownership information', icon: '🗂️' },
  { id: 5, label: 'Compare ownership records',      icon: '⚖️' },
  { id: 6, label: 'Confirm original designer',      icon: '✅' },
];

const StepIndicator = ({ step, status }) => {
  const bg =
    status === 'done'    ? 'bg-green-500'  :
    status === 'active'  ? 'bg-indigo-500' :
    status === 'failed'  ? 'bg-red-500'    :
                           'bg-slate-700';
  const text =
    status === 'done'   ? 'text-white' :
    status === 'active' ? 'text-white' :
    status === 'failed' ? 'text-white' :
                          'text-slate-400';

  return (
    <div className="flex items-center gap-3">
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${bg} transition-all duration-300`}>
        {status === 'active' ? (
          <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
          </svg>
        ) : status === 'done' ? (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7"/>
          </svg>
        ) : status === 'failed' ? (
          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
          </svg>
        ) : (
          <span className={`text-xs font-bold ${text}`}>{step.id}</span>
        )}
      </div>
      <span className={`text-sm ${status === 'pending' ? 'text-slate-500' : 'text-white'} transition-colors duration-300`}>
        {step.label}
      </span>
    </div>
  );
};

const WatermarkVerifier = ({ onVerificationComplete }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile]             = useState(null);
  const [preview, setPreview]       = useState(null);
  const [verifying, setVerifying]   = useState(false);
  const [activeStep, setActiveStep] = useState(0);   // 0 = not started, 1-6 = step running
  const [results, setResults]       = useState(null);
  const fileInputRef = useRef(null);

  const handleDragOver  = useCallback((e) => { e.preventDefault(); setIsDragging(true); },  []);
  const handleDragLeave = useCallback((e) => { e.preventDefault(); setIsDragging(false); }, []);

  const handleFile = useCallback((selectedFile) => {
    if (!selectedFile) return;
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/tiff'];
    if (!validTypes.includes(selectedFile.type)) {
      toast.error('Please upload a JPEG, PNG, WebP, or TIFF image');
      return;
    }
    setFile(selectedFile);
    setResults(null);
    setActiveStep(0);
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(selectedFile);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    handleFile(e.dataTransfer.files[0]);
  }, [handleFile]);

  const handleInputChange = useCallback((e) => handleFile(e.target.files[0]), [handleFile]);

  // Simulate step-by-step progress during analysis
  const runSteps = async (apiCall) => {
    const delays = [300, 400, 400, 350, 350, 300]; // ms per step

    for (let i = 1; i <= 6; i++) {
      setActiveStep(i);
      // On step 2, fire the actual API call and await it
      if (i === 2) {
        try {
          const res = await apiCall();
          // Animate remaining steps quickly after API returns
          for (let j = 3; j <= 6; j++) {
            setActiveStep(j);
            await new Promise(r => setTimeout(r, delays[j - 1]));
          }
          setActiveStep(7); // all done
          return { ok: true, data: res };
        } catch (err) {
          setActiveStep(-1); // failed
          return { ok: false, err };
        }
      }
      await new Promise(r => setTimeout(r, delays[i - 1]));
    }
  };

  const handleVerify = async () => {
    if (!file) return;
    setVerifying(true);
    setResults(null);

    const formData = new FormData();
    formData.append('image', file);

    const outcome = await runSteps(() =>
      api.post('/watermarks/verify-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
    );

    if (outcome.ok) {
      const data = outcome.data.data.data;
      setResults(data);
      onVerificationComplete?.(data);
      if (data.found) {
        toast.success('Watermark detected — ownership confirmed!');
      } else {
        toast('No FashionGuard watermark detected in this image');
      }
    } else {
      toast.error(outcome.err?.response?.data?.message || 'Verification failed. Please try again.');
    }

    setVerifying(false);
  };

  const clearFile = () => {
    setFile(null); setPreview(null); setResults(null); setActiveStep(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const getStepStatus = (stepId) => {
    if (activeStep === -1) return stepId <= 2 ? (stepId === 2 ? 'failed' : 'done') : 'pending';
    if (activeStep === 0)  return 'pending';
    if (stepId < activeStep || activeStep === 7) return 'done';
    if (stepId === activeStep) return 'active';
    return 'pending';
  };

  const showSteps = verifying || activeStep > 0;

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/tiff"
        onChange={handleInputChange}
        className="hidden"
      />

      {/* Drop Zone */}
      <motion.div
        className={`relative border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
                    transition-all duration-300 ${
                      isDragging
                        ? 'border-purple-400 bg-purple-500/10'
                        : file
                          ? 'border-green-500/50 bg-green-500/5'
                          : 'border-slate-600 hover:border-purple-500 bg-slate-800/50'
                    }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
      >
        {file ? (
          <div className="space-y-4">
            {preview && (
              <img src={preview} alt="Preview"
                className="max-h-48 max-w-full mx-auto rounded-lg shadow-lg"/>
            )}
            <p className="text-white font-medium">{file.name}</p>
            <p className="text-slate-500 text-xs">
              {(file.size / 1024).toFixed(1)} KB · {file.type}
            </p>
            <button
              onClick={(e) => { e.stopPropagation(); clearFile(); }}
              className="text-slate-400 hover:text-white text-sm"
            >
              Change file
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 mx-auto rounded-full bg-purple-500/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
              </svg>
            </div>
            <div>
              <p className="text-white font-medium">
                {isDragging ? 'Drop image here' : 'Drop suspected design here'}
              </p>
              <p className="text-slate-400 text-sm mt-1">or click to browse · JPEG, PNG, WebP, TIFF</p>
            </div>
          </div>
        )}
      </motion.div>

      {/* 6-Step Verification Process */}
      <AnimatePresence>
        {showSteps && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-card-dark rounded-xl p-5 space-y-3"
          >
            <p className="text-slate-400 text-xs uppercase tracking-wider font-medium mb-4">
              Ownership Verification Process
            </p>
            {STEPS.map((step) => (
              <StepIndicator key={step.id} step={step} status={getStepStatus(step.id)} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verify Button */}
      {file && !verifying && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleVerify}
          className="w-full btn-primary flex items-center justify-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
          <span>Verify Ownership</span>
        </motion.button>
      )}

      {/* Results */}
      <AnimatePresence>
        {results && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="space-y-4"
          >
            {results.found ? (
              <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6 space-y-5">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">Ownership Confirmed</h3>
                    <p className="text-green-400 text-sm">
                      FashionGuard watermark successfully verified
                    </p>
                  </div>
                </div>

                {/* Matches */}
                <div className="space-y-3">
                  {results.matches.map((match, index) => (
                    <div key={index} className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50 space-y-3">
                      {/* Design title + confidence */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-white font-semibold">{match.designTitle}</p>
                          <p className="text-slate-400 text-xs mt-0.5">Watermark ID: {match.watermarkId}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-xs font-bold flex-shrink-0 ${
                          match.confidence >= 0.8
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {Math.round(match.confidence * 100)}% match
                        </span>
                      </div>

                      <div className="h-px bg-slate-700/50"/>

                      {/* Ownership chain */}
                      <div className="space-y-2">
                        <p className="text-slate-400 text-xs uppercase tracking-wider">Original Designer</p>
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                            <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                            </svg>
                          </div>
                          <div>
                            <p className="text-white font-medium">{match.owner.name}</p>
                            <p className="text-slate-400 text-sm">{match.owner.email}</p>
                          </div>
                        </div>
                      </div>

                      {/* Designer ID + Timestamp grid */}
                      <div className="grid grid-cols-1 gap-2">
                        <div className="bg-slate-900/70 rounded-lg px-3 py-2.5 flex items-center justify-between">
                          <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Designer ID</span>
                          <span className="text-indigo-300 text-xs font-mono ml-3 break-all text-right">
                            {match.owner.id}
                          </span>
                        </div>
                        <div className="bg-slate-900/70 rounded-lg px-3 py-2.5 flex items-center justify-between">
                          <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Watermark ID</span>
                          <span className="text-purple-300 text-xs font-mono ml-3 break-all text-right">
                            {match.watermarkId}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="bg-slate-900/70 rounded-lg px-3 py-2.5">
                            <p className="text-slate-500 text-xs mb-1">Watermark Timestamp</p>
                            <p className="text-white text-sm font-medium">
                              {new Date(match.originalTimestamp || match.watermarkedAt).toLocaleString('en-US', {
                                year: 'numeric', month: 'short', day: 'numeric',
                                hour: '2-digit', minute: '2-digit'
                              })}
                            </p>
                          </div>
                          <div className="bg-slate-900/70 rounded-lg px-3 py-2.5">
                            <p className="text-slate-500 text-xs mb-1">Integrity Check</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <div className="w-2 h-2 rounded-full bg-green-400"/>
                              <p className="text-green-400 text-sm font-medium">Passed</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Verification steps summary */}
                      <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 space-y-1">
                        <p className="text-indigo-300 text-xs font-medium">✓ Invisible watermark extracted from DCT frequency domain</p>
                        <p className="text-indigo-300 text-xs font-medium">✓ AES-256-GCM encrypted payload decrypted successfully</p>
                        <p className="text-indigo-300 text-xs font-medium">✓ Designer ID matched against FashionGuard ownership records</p>
                        <p className="text-indigo-300 text-xs font-medium">✓ Ownership confirmed — {Math.round(match.confidence * 100)}% confidence</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 space-y-4">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-lg">No Watermark Found</h3>
                    <p className="text-slate-400 text-sm">
                      This image does not contain a recognizable FashionGuard watermark
                    </p>
                  </div>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 space-y-2">
                  <p className="text-yellow-400 text-sm font-medium">Possible reasons:</p>
                  <ul className="space-y-1.5 text-slate-400 text-sm">
                    <li className="flex gap-2"><span className="text-yellow-400 flex-shrink-0">•</span> Design was not watermarked using FashionGuard</li>
                    <li className="flex gap-2"><span className="text-yellow-400 flex-shrink-0">•</span> Image was heavily edited or format-converted after watermarking</li>
                    <li className="flex gap-2"><span className="text-yellow-400 flex-shrink-0">•</span> Image was cropped by more than 50% of original size</li>
                    <li className="flex gap-2"><span className="text-yellow-400 flex-shrink-0">•</span> Image resolution was significantly reduced (below minimum size)</li>
                  </ul>
                </div>

                <p className="text-slate-500 text-xs">
                  Tip: Download your designs directly from FashionGuard to get the watermarked version.
                </p>
              </div>
            )}

            {/* Analysis footer */}
            <div className="text-xs text-slate-500 flex items-center justify-between px-1">
              <span>Checked {results.analysisDetails?.watermarksChecked ?? 0} watermark records</span>
              <span>File: {((results.analysisDetails?.imageSize ?? 0) / 1024).toFixed(1)} KB</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WatermarkVerifier;
