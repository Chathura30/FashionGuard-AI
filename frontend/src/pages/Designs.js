import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import DesignCard from '../components/designs/DesignCard';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import api from '../services/api';

const Designs = () => {
  const { user, isAdmin } = useAuth();
  const [designs, setDesigns]           = useState([]);
  const [sharedDesigns, setSharedDesigns] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [activeTab, setActiveTab]       = useState('my');
  const [category, setCategory]         = useState('');
  const [search, setSearch]             = useState('');
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [total, setTotal]               = useState(0);

  // Debounce search input
  const searchTimerRef = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(e.target.value);
    }, 400);
  };

  // Fetch my designs
  const fetchMyDesigns = async (currentPage, currentCategory, currentSearch) => {
    try {
      const params = { page: currentPage, limit: 12 };
      if (currentCategory) params.category = currentCategory;
      if (currentSearch)   params.search   = currentSearch;

      const response = await api.get('/designs/my', { params });
      const data = response.data.data;
      setDesigns(data.designs);
      setTotalPages(data.pagination.pages);
      setTotal(data.pagination.total);
    } catch (error) {
      console.error('Failed to fetch designs:', error);
      if (error.response?.status !== 401) {
        toast.error('Failed to load designs');
      }
    }
  };

  // Fetch shared designs
  const fetchSharedDesigns = async (currentPage) => {
    try {
      const response = await api.get('/designs/shared', {
        params: { page: currentPage, limit: 12 }
      });
      const data = response.data.data;
      setSharedDesigns(data.designs);
      setTotalPages(data.pagination.pages);
      setTotal(data.pagination.total);
    } catch (error) {
      console.error('Failed to fetch shared designs:', error);
      if (error.response?.status !== 401) {
        toast.error('Failed to load shared designs');
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      if (!cancelled) {
        if (activeTab === 'my') {
          await fetchMyDesigns(page, category, debouncedSearch);
        } else {
          await fetchSharedDesigns(page);
        }
      }
      if (!cancelled) setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, [activeTab, page, category, debouncedSearch]);  // eslint-disable-line

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleCategoryChange = (e) => {
    setCategory(e.target.value);
    setPage(1);
  };

  const handleDownload = async (design) => {
    try {
      toast.loading('Decrypting and downloading...', { id: 'download' });

      const response = await api.get(`/designs/${design.id || design._id}/download`, {
        responseType: 'blob'
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', design.originalName || design.title);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('Download complete!', { id: 'download' });
    } catch (error) {
      console.error('Download failed:', error);
      if (error.response?.status === 403) {
        toast.error('You do not have permission to download this design', { id: 'download' });
      } else {
        toast.error('Failed to download design', { id: 'download' });
      }
    }
  };

  const handleDelete = async (design) => {
    if (!window.confirm(`Delete "${design.title}"? This cannot be undone.`)) return;

    try {
      await api.delete(`/designs/${design.id || design._id}`);
      toast.success('Design deleted');
      // Refetch the currently active tab
      if (activeTab === 'my') {
        fetchMyDesigns(page, category, debouncedSearch);
      } else {
        fetchSharedDesigns(page);
      }
    } catch (error) {
      console.error('Delete failed:', error);
      const msg = error.response?.data?.message || 'Failed to delete design';
      toast.error(msg);
    }
  };

  const handleWatermarkAdded = (designId, watermarkData) => {
    setDesigns(prev =>
      prev.map(d =>
        (d._id || d.id) === designId
          ? { ...d, isWatermarked: true, watermarkId: watermarkData?.watermarkId }
          : d
      )
    );
  };

  const categories = [
    { value: '',          label: 'All Categories' },
    { value: 'sketch',    label: 'Sketch' },
    { value: 'pattern',   label: 'Pattern' },
    { value: 'technical', label: 'Technical' },
    { value: 'rendering', label: 'Rendering' },
    { value: 'other',     label: 'Other' },
  ];

  const currentDesigns = activeTab === 'my' ? designs : sharedDesigns;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">My Designs</h1>
          <p className="text-slate-400 mt-1">
            Securely encrypted fashion designs
          </p>
        </div>

        <Link to="/designs/upload" className="btn-primary inline-flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
          </svg>
          Upload Design
        </Link>
      </div>

      {/* Security Banner */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card-dark p-4 rounded-xl flex items-center gap-4"
      >
        <div className="flex-shrink-0 w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"/>
          </svg>
        </div>
        <div>
          <h3 className="text-white font-medium">AES-256 Encrypted Storage</h3>
          <p className="text-slate-400 text-sm">
            All designs are encrypted at rest with military-grade encryption and served with embedded watermarks.
          </p>
        </div>
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-700">
        <button
          onClick={() => handleTabChange('my')}
          className={`px-4 py-2 font-medium transition-colors relative ${
            activeTab === 'my' ? 'text-indigo-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          My Designs
          {activeTab === 'my' && (
            <motion.div layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"/>
          )}
        </button>
        <button
          onClick={() => handleTabChange('shared')}
          className={`px-4 py-2 font-medium transition-colors relative ${
            activeTab === 'shared' ? 'text-indigo-400' : 'text-slate-400 hover:text-white'
          }`}
        >
          Shared with Me
          {activeTab === 'shared' && (
            <motion.div layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500"/>
          )}
        </button>
      </div>

      {/* Filters (My Designs only) */}
      {activeTab === 'my' && (
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
            </svg>
            <input
              type="text"
              placeholder="Search designs..."
              value={search}
              onChange={handleSearchChange}
              className="input-field pl-10 w-full"
            />
          </div>

          <select
            value={category}
            onChange={handleCategoryChange}
            className="input-field w-full sm:w-48"
          >
            {categories.map((cat) => (
              <option key={cat.value} value={cat.value}>{cat.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : currentDesigns.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-slate-800 flex items-center justify-center">
            <svg className="w-10 h-10 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">
            {activeTab === 'my' ? 'No designs yet' : 'No shared designs'}
          </h3>
          <p className="text-slate-400 mb-6">
            {activeTab === 'my'
              ? 'Upload your first design to get started'
              : 'Designs shared with you will appear here'}
          </p>
          {activeTab === 'my' && (
            <Link to="/designs/upload" className="btn-primary">
              Upload Your First Design
            </Link>
          )}
        </motion.div>
      ) : (
        <>
          {/* Stats bar */}
          <p className="text-slate-500 text-sm">
            {total} design{total !== 1 ? 's' : ''}
            {activeTab === 'my' && debouncedSearch ? ` matching "${debouncedSearch}"` : ''}
          </p>

          {/* Design Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {currentDesigns.map((design, index) => (
              <motion.div
                key={design._id || design.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <DesignCard
                  design={design}
                  onDownload={handleDownload}
                  onDelete={handleDelete}
                  onWatermarkAdded={(data) => handleWatermarkAdded(design._id || design.id, data)}
                />
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 pt-6">
              <button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-50
                           disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-slate-400 text-sm">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page === totalPages}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-50
                           disabled:cursor-not-allowed hover:bg-slate-700 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Designs;
