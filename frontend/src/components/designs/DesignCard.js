import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import WatermarkButton from '../watermark/WatermarkButton';
import api from '../../services/api';

const DesignCard = ({ design, onDownload, onDelete, onWatermarkAdded, showActions = true }) => {
  const { user: authUser } = useAuth();
  const isAdminUser = authUser?.role === 'admin';

  const [showShareModal, setShowShareModal]     = useState(false);
  const [shareEmail, setShareEmail]             = useState('');
  const [sharePermission, setSharePermission]   = useState('view');
  const [sharing, setSharing]                   = useState(false);

  /* ── helpers ──────────────────────────────────────────── */
  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024, s = ['B','KB','MB','GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${s[i]}`;
  };

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-US', { year:'numeric', month:'short', day:'numeric' }) : '';

  const categoryColor = {
    sketch:    'bg-blue-500/20 text-blue-400',
    pattern:   'bg-purple-500/20 text-purple-400',
    technical: 'bg-green-500/20 text-green-400',
    rendering: 'bg-orange-500/20 text-orange-400',
    other:     'bg-slate-500/20 text-slate-400',
  };

  const getFileIcon = (mime) => {
    if (mime?.startsWith('image/'))
      return (
        <svg className="w-full h-full text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
        </svg>
      );
    if (mime === 'application/pdf')
      return (
        <svg className="w-full h-full text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
        </svg>
      );
    return (
      <svg className="w-full h-full text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
      </svg>
    );
  };

  /* ── access resolution ────────────────────────────────── */
  const currentUserId = authUser?.id || authUser?._id;
  const ownerId = (design.owner?._id || design.owner || '').toString();
  const isOwner = currentUserId && ownerId && ownerId === currentUserId.toString();

  // For shared designs, find the collaborator entry for the current user
  const collaboratorEntry = !isOwner && design.collaborators?.find(
    c => (c.user?._id || c.user || '').toString() === currentUserId?.toString()
  );
  const collaboratorPermission = collaboratorEntry?.permission; // 'view' | 'download' | 'edit'

  // Admin can do everything; owner and edit/download collaborators can download
  const canDownload  = isAdminUser || isOwner || collaboratorPermission === 'download' || collaboratorPermission === 'edit';
  const canWatermark = isAdminUser || isOwner || collaboratorPermission === 'edit';
  const canShare     = isAdminUser || isOwner;
  const canDelete    = onDelete && (isAdminUser || isOwner);

  /* ── share handler ────────────────────────────────────── */
  const handleShare = async (e) => {
    e.preventDefault();
    if (!shareEmail.trim()) { toast.error('Please enter an email address'); return; }
    setSharing(true);
    try {
      await api.post(`/designs/${design._id || design.id}/share`, {
        email: shareEmail.trim(),
        permission: sharePermission,
      });
      toast.success(`Design shared with ${shareEmail}`);
      setShareEmail('');
      setSharePermission('view');
      setShowShareModal(false);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to share design');
    } finally {
      setSharing(false);
    }
  };

  /* ── permission badge for shared tab ─────────────────── */
  const permBadgeColor = { view: 'bg-blue-500/20 text-blue-400', download: 'bg-cyan-500/20 text-cyan-400', edit: 'bg-green-500/20 text-green-400' };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -4 }}
        className="glass-card-dark rounded-xl overflow-hidden group"
      >
        {/* ── thumbnail area ── */}
        <div className="relative h-40 bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
          <div className="w-16 h-16 opacity-50 group-hover:opacity-75 transition-opacity">
            {getFileIcon(design.mimeType)}
          </div>

          {/* Encrypted */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-green-500/20 rounded-full">
            <svg className="w-3 h-3 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
            </svg>
            <span className="text-xs text-green-400 font-medium">Encrypted</span>
          </div>

          {/* Category */}
          <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium ${categoryColor[design.category] || categoryColor.other}`}>
            {design.category}
          </div>

          {/* Watermarked */}
          {design.isWatermarked && (
            <div className="absolute bottom-3 left-3 flex items-center gap-1.5 px-2 py-1 bg-purple-500/20 rounded-full">
              <svg className="w-3 h-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
              </svg>
              <span className="text-xs text-purple-400 font-medium">Protected</span>
            </div>
          )}

          {/* Admin badge */}
          {isAdminUser && !isOwner && (
            <div className="absolute bottom-3 right-3 px-2 py-1 bg-red-500/20 rounded-full">
              <span className="text-xs text-red-400 font-medium">Admin</span>
            </div>
          )}

          {/* Collaborator permission badge */}
          {!isOwner && !isAdminUser && collaboratorPermission && (
            <div className={`absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 rounded-full ${permBadgeColor[collaboratorPermission] || permBadgeColor.view}`}>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
              <span className="text-xs font-medium capitalize">{collaboratorPermission}</span>
            </div>
          )}
        </div>

        {/* ── card body ── */}
        <div className="p-4 space-y-3">
          {/* Title */}
          <h3 className="text-white font-semibold truncate">{design.title}</h3>

          {/* Owner info (only on shared / admin view) */}
          {(!isOwner || isAdminUser) && design.owner?.firstName && (
            <p className="text-slate-500 text-xs">
              By {design.owner.firstName} {design.owner.lastName}
            </p>
          )}

          {/* Size + date */}
          <div className="flex items-center justify-between text-sm text-slate-400">
            <span>{formatFileSize(design.fileSize)}</span>
            <span>{formatDate(design.createdAt)}</span>
          </div>

          {/* Tags */}
          {design.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {design.tags.slice(0, 3).map((tag, i) => (
                <span key={i} className="px-2 py-0.5 bg-slate-700/50 text-slate-400 text-xs rounded-full">{tag}</span>
              ))}
              {design.tags.length > 3 && (
                <span className="px-2 py-0.5 text-slate-500 text-xs">+{design.tags.length - 3}</span>
              )}
            </div>
          )}

          {/* ── actions ── */}
          {showActions && (
            <div className="space-y-2 pt-2 border-t border-slate-700/50">
              <div className="flex items-center gap-2">

                {/* Download — visible to owner, download/edit collaborators, and admins */}
                {canDownload ? (
                  <button
                    onClick={() => onDownload?.(design)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2
                               bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400
                               rounded-lg transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                    </svg>
                    Download
                  </button>
                ) : (
                  /* View-only collaborator */
                  <div title="You have view-only access — download not permitted"
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2
                               bg-slate-800/50 text-slate-500 rounded-lg text-sm cursor-not-allowed">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                    </svg>
                    View only
                  </div>
                )}

                {/* Share — owner and admin only */}
                {canShare && (
                  <button
                    onClick={() => setShowShareModal(true)}
                    title="Share this design"
                    className="flex items-center justify-center px-3 py-2
                               bg-blue-500/20 hover:bg-blue-500/30 text-blue-400
                               rounded-lg transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                    </svg>
                  </button>
                )}

                {/* Delete — owner and admin only */}
                {canDelete && (
                  <button
                    onClick={() => onDelete?.(design)}
                    title="Delete design"
                    className="flex items-center justify-center px-3 py-2
                               bg-red-500/20 hover:bg-red-500/30 text-red-400
                               rounded-lg transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                    </svg>
                  </button>
                )}
              </div>

              {/* Watermark — owner, edit collaborators, admin */}
              {canWatermark && (
                <WatermarkButton design={design} onWatermarkAdded={onWatermarkAdded} />
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Share Modal ── */}
      <AnimatePresence>
        {showShareModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowShareModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card-dark rounded-2xl p-6 w-full max-w-md shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-white font-bold">Share Design</h3>
                    <p className="text-slate-400 text-sm truncate max-w-[200px]">{design.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowShareModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              <form onSubmit={handleShare} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-1.5">
                    Collaborator Email
                  </label>
                  <input
                    type="email"
                    value={shareEmail}
                    onChange={(e) => setShareEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className="input-field w-full"
                    required
                    autoFocus
                  />
                </div>

                {/* Permission selector */}
                <div>
                  <label className="block text-slate-300 text-sm font-medium mb-2">
                    Permission Level
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: 'view',     label: 'View',     desc: 'View metadata only',      icon: '👁️' },
                      { value: 'download', label: 'Download', desc: 'View and download file',  icon: '⬇️' },
                      { value: 'edit',     label: 'Edit',     desc: 'Download + add watermark', icon: '✏️' },
                    ].map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setSharePermission(p.value)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          sharePermission === p.value
                            ? 'border-indigo-500 bg-indigo-500/20'
                            : 'border-slate-700 bg-slate-800/50 hover:border-slate-600'
                        }`}
                      >
                        <div className="text-lg mb-1">{p.icon}</div>
                        <p className={`text-sm font-medium ${sharePermission === p.value ? 'text-indigo-300' : 'text-white'}`}>
                          {p.label}
                        </p>
                        <p className="text-slate-500 text-xs mt-0.5">{p.desc}</p>
                      </button>
                    ))}
                  </div>

                  {/* Permission description */}
                  <div className="mt-2 p-2.5 bg-slate-800/50 rounded-lg text-xs text-slate-400">
                    {sharePermission === 'view'     && '👁️ Can view design title, category, and metadata only. Cannot download or modify.'}
                    {sharePermission === 'download' && '⬇️ Can view all metadata and download the design file (including watermark if applied).'}
                    {sharePermission === 'edit'     && '✏️ Full access: download, add/verify watermarks. Cannot delete or re-share.'}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowShareModal(false)}
                    className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl transition-colors text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={sharing || !shareEmail.trim()}
                    className="flex-1 btn-primary flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {sharing ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Sharing...
                      </>
                    ) : 'Share Design'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default DesignCard;
