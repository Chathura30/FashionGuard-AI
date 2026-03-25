import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { userAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  UserCircleIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
  ShieldCheckIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

const Profile = () => {
  const { user, updateUser } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    bio: user?.bio || '',
    company: user?.company || '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const response = await userAPI.update(user.id, formData);
      updateUser(response.data.data.user);
      toast.success('Profile updated successfully');
      setIsEditing(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update profile');
    }
    setIsLoading(false);
  };

  const handleCancel = () => {
    setFormData({
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      bio: user?.bio || '',
      company: user?.company || '',
    });
    setIsEditing(false);
  };

  const getRoleBadgeColor = (role) => {
    const colors = {
      admin: 'bg-error-500/20 text-error-400 border-error-500/30',
      designer: 'bg-primary-500/20 text-primary-400 border-primary-500/30',
      collaborator: 'bg-accent-500/20 text-accent-400 border-accent-500/30',
      reviewer: 'bg-warning-500/20 text-warning-400 border-warning-500/30',
    };
    return colors[role] || 'bg-dark-600 text-dark-300';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className="glass-card-dark p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          {/* Avatar */}
          <div className="relative">
            <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-white text-3xl font-bold shadow-lg shadow-primary-500/20">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <button className="absolute -bottom-2 -right-2 p-2 bg-dark-800 rounded-xl border border-dark-700 hover:border-primary-500 transition-colors">
              <PencilIcon className="w-4 h-4 text-dark-400" />
            </button>
          </div>

          {/* Info */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-white">
                {user?.firstName} {user?.lastName}
              </h1>
              <span className={`inline-flex px-3 py-1 text-sm font-medium rounded-full border capitalize ${getRoleBadgeColor(user?.role)}`}>
                {user?.role}
              </span>
            </div>
            <p className="text-dark-400">{user?.email}</p>
            <div className="flex items-center gap-4 mt-3">
              <span className={`badge ${user?.mfaEnabled ? 'badge-success' : 'badge-warning'}`}>
                <ShieldCheckIcon className="w-4 h-4 mr-1" />
                {user?.mfaEnabled ? 'MFA Enabled' : 'MFA Disabled'}
              </span>
              <span className={`badge ${user?.isEmailVerified ? 'badge-success' : 'badge-warning'}`}>
                <EnvelopeIcon className="w-4 h-4 mr-1" />
                {user?.isEmailVerified ? 'Email Verified' : 'Email Pending'}
              </span>
            </div>
          </div>

          {/* Edit button */}
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="btn-secondary"
            >
              <PencilIcon className="w-4 h-4 mr-2" />
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Profile details */}
      <div className="glass-card-dark p-6 lg:p-8">
        <h2 className="text-lg font-semibold text-white mb-6">Profile Information</h2>

        <div className="space-y-6">
          {/* Name fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="input-label">First Name</label>
              {isEditing ? (
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className="input-field"
                />
              ) : (
                <p className="text-white">{user?.firstName}</p>
              )}
            </div>
            <div>
              <label className="input-label">Last Name</label>
              {isEditing ? (
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="input-field"
                />
              ) : (
                <p className="text-white">{user?.lastName}</p>
              )}
            </div>
          </div>

          {/* Email - read only */}
          <div>
            <label className="input-label">Email Address</label>
            <div className="flex items-center gap-2">
              <EnvelopeIcon className="w-5 h-5 text-dark-400" />
              <p className="text-white">{user?.email}</p>
            </div>
          </div>

          {/* Company */}
          <div>
            <label className="input-label">Company / Organization</label>
            {isEditing ? (
              <input
                type="text"
                name="company"
                value={formData.company}
                onChange={handleChange}
                className="input-field"
                placeholder="Your company name"
              />
            ) : (
              <div className="flex items-center gap-2">
                <BuildingOfficeIcon className="w-5 h-5 text-dark-400" />
                <p className="text-white">{user?.company || 'Not specified'}</p>
              </div>
            )}
          </div>

          {/* Bio */}
          <div>
            <label className="input-label">Bio</label>
            {isEditing ? (
              <textarea
                name="bio"
                value={formData.bio}
                onChange={handleChange}
                rows="4"
                className="input-field resize-none"
                placeholder="Tell us about yourself..."
              />
            ) : (
              <p className="text-white">{user?.bio || 'No bio added yet'}</p>
            )}
          </div>

          {/* Action buttons */}
          {isEditing && (
            <div className="flex items-center gap-3 pt-4">
              <button
                onClick={handleSave}
                disabled={isLoading}
                className="btn-primary"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <div className="spinner" />
                    Saving...
                  </span>
                ) : (
                  <>
                    <CheckIcon className="w-4 h-4 mr-2" />
                    Save Changes
                  </>
                )}
              </button>
              <button
                onClick={handleCancel}
                className="btn-ghost"
              >
                <XMarkIcon className="w-4 h-4 mr-2" />
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Account stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card-dark p-6 text-center">
          <div className="text-3xl font-bold text-white mb-1">
            {user?.designsCount || 0}
          </div>
          <p className="text-dark-400 text-sm">Designs</p>
        </div>
        <div className="glass-card-dark p-6 text-center">
          <div className="text-3xl font-bold text-white mb-1">
            {user?.collaborationsCount || 0}
          </div>
          <p className="text-dark-400 text-sm">Collaborations</p>
        </div>
        <div className="glass-card-dark p-6 text-center">
          <div className="text-3xl font-bold text-white mb-1">
            {Math.round((user?.storageUsed || 0) / (1024 * 1024))} MB
          </div>
          <p className="text-dark-400 text-sm">Storage Used</p>
        </div>
      </div>
    </motion.div>
  );
};

export default Profile;
