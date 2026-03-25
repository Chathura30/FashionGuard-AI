import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  ShieldCheckIcon,
  KeyIcon,
  BellIcon,
  EyeIcon,
  DevicePhoneMobileIcon,
  ExclamationTriangleIcon,
  EyeSlashIcon,
} from '@heroicons/react/24/outline';

const Settings = () => {
  const { user, setupMFA, enableMFA, disableMFA } = useAuth();
  const [activeTab, setActiveTab] = useState('security');

  // MFA setup state
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [isSettingUpMFA, setIsSettingUpMFA] = useState(false);

  // Disable MFA state
  const [showDisableMFA, setShowDisableMFA] = useState(false);
  const [disableMFAData, setDisableMFAData] = useState({ password: '', code: '' });
  const [showDisablePassword, setShowDisablePassword] = useState(false);

  // Change password state
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [passwordErrors, setPasswordErrors] = useState({});

  const [isLoading, setIsLoading] = useState(false);

  const tabs = [
    { id: 'security', name: 'Security', icon: ShieldCheckIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'privacy', name: 'Privacy', icon: EyeIcon },
  ];

  // --- MFA Setup ---
  const handleSetupMFA = async () => {
    setIsLoading(true);
    const result = await setupMFA();
    setIsLoading(false);
    if (result.success) {
      setMfaSetup(result.data);
      setIsSettingUpMFA(true);
    } else {
      toast.error(result.error);
    }
  };

  const handleEnableMFA = async () => {
    if (mfaCode.length !== 6) {
      toast.error('Please enter a 6-digit code');
      return;
    }
    setIsLoading(true);
    const result = await enableMFA(mfaCode);
    setIsLoading(false);
    if (result.success) {
      toast.success('MFA enabled successfully!');
      if (result.data?.backupCodes?.length) {
        toast.success(`Save your backup codes: ${result.data.backupCodes.slice(0, 3).join(', ')}...`);
      }
      setIsSettingUpMFA(false);
      setMfaSetup(null);
      setMfaCode('');
    } else {
      toast.error(result.error);
    }
  };

  // --- Disable MFA ---
  const handleDisableMFA = async (e) => {
    e.preventDefault();
    if (!disableMFAData.password || !disableMFAData.code) {
      toast.error('Please enter your password and MFA code');
      return;
    }
    setIsLoading(true);
    const result = await disableMFA(disableMFAData.password, disableMFAData.code);
    setIsLoading(false);
    if (result.success) {
      toast.success('MFA disabled successfully');
      setShowDisableMFA(false);
      setDisableMFAData({ password: '', code: '' });
    } else {
      toast.error(result.error);
    }
  };

  // --- Change Password ---
  const validatePassword = () => {
    const errors = {};
    if (!passwordData.currentPassword) errors.currentPassword = 'Current password is required';
    if (!passwordData.newPassword) {
      errors.newPassword = 'New password is required';
    } else if (passwordData.newPassword.length < 8) {
      errors.newPassword = 'Password must be at least 8 characters';
    } else if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/.test(passwordData.newPassword)) {
      errors.newPassword = 'Must contain uppercase, lowercase, number and special character';
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    setPasswordErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!validatePassword()) return;
    setIsLoading(true);
    try {
      await authAPI.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      });
      toast.success('Password changed successfully');
      setShowChangePassword(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordErrors({});
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to change password');
    }
    setIsLoading(false);
  };

  const PasswordInput = ({ label, field, value, onChange, error, showKey, onToggle, placeholder }) => (
    <div>
      <label className="input-label">{label}</label>
      <div className="relative">
        <input
          type={showPasswords[showKey] ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder={placeholder || '••••••••'}
          className={`input-field pr-12 ${error ? 'border-error-500' : ''}`}
        />
        <button
          type="button"
          onClick={() => setShowPasswords(p => ({ ...p, [showKey]: !p[showKey] }))}
          className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
        >
          {showPasswords[showKey] ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
        </button>
      </div>
      {error && <p className="error-text mt-1">{error}</p>}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
        <p className="text-dark-400">Manage your account settings and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                : 'text-dark-400 hover:text-white hover:bg-dark-800'
            }`}
          >
            <tab.icon className="w-5 h-5" />
            {tab.name}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {activeTab === 'security' && (
          <>
            {/* MFA Section */}
            <div className="glass-card-dark p-6">
              <div className="flex items-start justify-between mb-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-primary-500/10">
                    <DevicePhoneMobileIcon className="w-6 h-6 text-primary-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Two-Factor Authentication</h3>
                    <p className="text-dark-400 text-sm">Add an extra layer of security to your account</p>
                  </div>
                </div>
                <span className={`badge ${user?.mfaEnabled ? 'badge-success' : 'badge-warning'}`}>
                  {user?.mfaEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>

              {/* Enable MFA flow */}
              {!user?.mfaEnabled && !isSettingUpMFA && (
                <button onClick={handleSetupMFA} disabled={isLoading} className="btn-primary">
                  {isLoading ? 'Setting up...' : 'Enable MFA'}
                </button>
              )}

              {isSettingUpMFA && mfaSetup && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-dark-800/50 border border-dark-700">
                    <p className="text-sm text-dark-300 mb-4">
                      Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.)
                    </p>
                    <div className="flex justify-center mb-4">
                      <img src={mfaSetup.qrCode} alt="MFA QR Code" className="w-48 h-48 rounded-lg" />
                    </div>
                    <p className="text-xs text-dark-500 text-center">
                      Or enter this code manually: <code className="text-primary-400">{mfaSetup.secret}</code>
                    </p>
                  </div>
                  <div>
                    <label className="input-label">Verification Code</label>
                    <input
                      type="text"
                      value={mfaCode}
                      onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="input-field"
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handleEnableMFA} disabled={isLoading || mfaCode.length !== 6} className="btn-primary">
                      {isLoading ? 'Verifying...' : 'Verify & Enable'}
                    </button>
                    <button onClick={() => { setIsSettingUpMFA(false); setMfaSetup(null); setMfaCode(''); }} className="btn-ghost">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Disable MFA */}
              {user?.mfaEnabled && !showDisableMFA && (
                <button
                  onClick={() => setShowDisableMFA(true)}
                  className="btn-secondary text-error-400 border-error-500/30 hover:bg-error-500/10"
                >
                  Disable MFA
                </button>
              )}

              {user?.mfaEnabled && showDisableMFA && (
                <form onSubmit={handleDisableMFA} className="space-y-4 mt-4 p-4 rounded-xl bg-dark-800/50 border border-error-500/20">
                  <p className="text-sm text-dark-300">
                    To disable MFA, confirm your password and enter your current authenticator code.
                  </p>
                  <div>
                    <label className="input-label">Current Password</label>
                    <div className="relative">
                      <input
                        type={showDisablePassword ? 'text' : 'password'}
                        value={disableMFAData.password}
                        onChange={(e) => setDisableMFAData(p => ({ ...p, password: e.target.value }))}
                        className="input-field pr-12"
                        placeholder="Your password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowDisablePassword(p => !p)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-dark-400 hover:text-white"
                      >
                        {showDisablePassword ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="input-label">Authenticator Code</label>
                    <input
                      type="text"
                      value={disableMFAData.code}
                      onChange={(e) => setDisableMFAData(p => ({ ...p, code: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                      className="input-field"
                      placeholder="6-digit code"
                      maxLength={6}
                    />
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={isLoading}
                      className="btn-secondary text-error-400 border-error-500/30 hover:bg-error-500/10"
                    >
                      {isLoading ? 'Disabling...' : 'Confirm Disable'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowDisableMFA(false); setDisableMFAData({ password: '', code: '' }); }}
                      className="btn-ghost"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Change Password Section */}
            <div className="glass-card-dark p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-xl bg-warning-500/10">
                    <KeyIcon className="w-6 h-6 text-warning-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white">Password</h3>
                    <p className="text-dark-400 text-sm">Update your password regularly for better security</p>
                  </div>
                </div>
                {!showChangePassword && (
                  <button onClick={() => setShowChangePassword(true)} className="btn-secondary">
                    Change Password
                  </button>
                )}
              </div>

              {showChangePassword && (
                <form onSubmit={handleChangePassword} className="space-y-4 mt-2">
                  <PasswordInput
                    label="Current Password"
                    showKey="current"
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData(p => ({ ...p, currentPassword: e.target.value }))}
                    error={passwordErrors.currentPassword}
                  />
                  <PasswordInput
                    label="New Password"
                    showKey="new"
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData(p => ({ ...p, newPassword: e.target.value }))}
                    error={passwordErrors.newPassword}
                    placeholder="Min 8 chars, uppercase, number, symbol"
                  />
                  <PasswordInput
                    label="Confirm New Password"
                    showKey="confirm"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData(p => ({ ...p, confirmPassword: e.target.value }))}
                    error={passwordErrors.confirmPassword}
                  />
                  <div className="flex gap-3 pt-2">
                    <button type="submit" disabled={isLoading} className="btn-primary">
                      {isLoading ? 'Saving...' : 'Save New Password'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowChangePassword(false);
                        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                        setPasswordErrors({});
                      }}
                      className="btn-ghost"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Danger Zone */}
            <div className="glass-card-dark p-6 border border-error-500/20">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 rounded-xl bg-error-500/10">
                  <ExclamationTriangleIcon className="w-6 h-6 text-error-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Danger Zone</h3>
                  <p className="text-dark-400 text-sm">Irreversible actions for your account</p>
                </div>
              </div>
              <button
                onClick={() => toast.error('Please contact support to delete your account')}
                className="btn-secondary text-error-400 border-error-500/30 hover:bg-error-500/10"
              >
                Delete Account
              </button>
            </div>
          </>
        )}

        {activeTab === 'notifications' && (
          <div className="glass-card-dark p-6">
            <h3 className="text-lg font-semibold text-white mb-6">Notification Preferences</h3>
            <div className="space-y-4">
              {[
                { name: 'Email notifications', description: 'Receive email updates about your account' },
                { name: 'Security alerts', description: 'Get notified about security events' },
                { name: 'Design activity', description: 'Updates when someone views or comments on your designs' },
                { name: 'Collaboration invites', description: 'Notifications for new collaboration requests' },
              ].map((item, index) => (
                <div key={index} className="flex items-center justify-between p-4 rounded-xl bg-dark-800/50">
                  <div>
                    <p className="font-medium text-white">{item.name}</p>
                    <p className="text-sm text-dark-400">{item.description}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="glass-card-dark p-6">
            <h3 className="text-lg font-semibold text-white mb-6">Privacy Settings</h3>
            <div className="space-y-4">
              {[
                { name: 'Profile visibility', description: 'Make your profile visible to other users' },
                { name: 'Show activity status', description: 'Let others see when you are online' },
                { name: 'Allow design discovery', description: 'Let your public designs appear in search' },
              ].map((item, index) => (
                <div key={index} className="flex items-center justify-between p-4 rounded-xl bg-dark-800/50">
                  <div>
                    <p className="font-medium text-white">{item.name}</p>
                    <p className="text-sm text-dark-400">{item.description}</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" defaultChecked />
                    <div className="w-11 h-6 bg-dark-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
                  </label>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default Settings;
