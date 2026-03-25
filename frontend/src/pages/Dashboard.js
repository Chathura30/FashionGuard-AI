import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { designAPI } from '../services/api';
import api from '../services/api';
import {
  FolderIcon,
  ShieldCheckIcon,
  UsersIcon,
  SparklesIcon,
  ClockIcon,
  EyeIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';

const Dashboard = () => {
  const { user, isAdmin } = useAuth();
  const [recentDesigns, setRecentDesigns] = useState([]);
  const [statsLoading, setStatsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalDesigns: 0,
    protectedDesigns: 0,
    collaborations: 0,
    storageUsedMB: 0,
  });
  const [securityStats, setSecurityStats] = useState({
    failedLogins: 0,
    suspicious: 0,
  });

  useEffect(() => {
    const fetchDashboardData = async () => {
      setStatsLoading(true);
      try {
        // Fetch recent designs
        const designsRes = await designAPI.getMyDesigns({ page: 1, limit: 5 });
        const designs = designsRes.data.data.designs || [];
        setRecentDesigns(designs);

        const total = designsRes.data.data.pagination?.total || designs.length;
        const protected_ = designs.filter(d => d.isWatermarked).length;

        // Fetch shared designs count
        const sharedRes = await designAPI.getSharedDesigns({ page: 1, limit: 1 });
        const collabs = sharedRes.data.data.pagination?.total || 0;

        setStats({
          totalDesigns: total,
          protectedDesigns: protected_,
          collaborations: collabs,
          storageUsedMB: Math.round((user?.storageUsed || 0) / (1024 * 1024)),
        });

        // Fetch security stats for admins
        if (isAdmin()) {
          try {
            const secRes = await api.get('/admin/monitoring');
            const s = secRes.data.data;
            setSecurityStats({
              failedLogins: s.recentFailedLogins || 0,
              suspicious: s.suspiciousActivities || 0,
            });
          } catch {
            // admin endpoint may not be available
          }
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      }
      setStatsLoading(false);
    };

    fetchDashboardData();
  }, [isAdmin, user?.storageUsed]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  const statCards = [
    {
      name: 'Total Designs',
      value: statsLoading ? '...' : stats.totalDesigns,
      icon: FolderIcon,
      color: 'from-primary-500 to-primary-600',
      bgColor: 'bg-primary-500/10',
      iconColor: 'text-primary-400',
    },
    {
      name: 'Protected Assets',
      value: statsLoading ? '...' : stats.protectedDesigns,
      icon: ShieldCheckIcon,
      color: 'from-success-500 to-success-600',
      bgColor: 'bg-success-500/10',
      iconColor: 'text-success-400',
    },
    {
      name: 'Collaborations',
      value: statsLoading ? '...' : stats.collaborations,
      icon: UsersIcon,
      color: 'from-accent-500 to-accent-600',
      bgColor: 'bg-accent-500/10',
      iconColor: 'text-accent-400',
    },
    {
      name: 'Storage Used',
      value: statsLoading ? '...' : `${stats.storageUsedMB} MB`,
      icon: SparklesIcon,
      color: 'from-secondary-500 to-secondary-600',
      bgColor: 'bg-secondary-500/10',
      iconColor: 'text-secondary-400',
    },
  ];

  const quickActions = [
    {
      name: 'Upload Design',
      description: 'Add a new design to your library',
      icon: ArrowUpTrayIcon,
      color: 'bg-primary-500',
      href: '/designs/upload',
    },
    {
      name: 'Verify Watermark',
      description: 'Check any image for a FashionGuard watermark',
      icon: ShieldCheckIcon,
      color: 'bg-success-500',
      href: '/watermark/verify',
    },
    {
      name: 'My Designs',
      description: 'View and manage your design library',
      icon: FolderIcon,
      color: 'bg-accent-500',
      href: '/designs',
    },
    {
      name: 'Profile',
      description: 'Update your profile information',
      icon: UsersIcon,
      color: 'bg-secondary-500',
      href: '/profile',
    },
  ];

  const getCategoryColor = (category) => {
    const colors = {
      sketch: 'text-blue-400',
      pattern: 'text-purple-400',
      technical: 'text-green-400',
      rendering: 'text-orange-400',
      other: 'text-dark-400',
    };
    return colors[category] || colors.other;
  };

  const formatDate = (d) =>
    new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Welcome section */}
      <motion.div variants={itemVariants}>
        <div className="glass-card-dark p-6 lg:p-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-white mb-2">
                Welcome back, {user?.firstName}!
              </h1>
              <p className="text-dark-400">
                Here's what's happening with your designs today.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`badge ${user?.mfaEnabled ? 'badge-success' : 'badge-warning'}`}>
                {user?.mfaEnabled ? 'MFA Enabled' : 'MFA Disabled'}
              </span>
              <span className="badge badge-primary capitalize">{user?.role}</span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Stats grid */}
      <motion.div variants={itemVariants}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
          {statCards.map((stat) => (
            <motion.div
              key={stat.name}
              variants={itemVariants}
              whileHover={{ scale: 1.02 }}
              className="glass-card-dark p-6 card-hover"
            >
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                  <stat.icon className={`w-6 h-6 ${stat.iconColor}`} />
                </div>
              </div>
              <h3 className="text-3xl font-bold text-white mb-1">{stat.value}</h3>
              <p className="text-dark-400 text-sm">{stat.name}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick actions */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <div className="glass-card-dark p-6">
            <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {quickActions.map((action) => (
                <motion.div key={action.name} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  <Link
                    to={action.href}
                    className="flex items-start gap-4 p-4 rounded-xl bg-dark-800/50 hover:bg-dark-800 border border-dark-700/50 hover:border-dark-600 transition-all duration-300 block"
                  >
                    <div className={`p-3 rounded-xl ${action.color}/20`}>
                      <action.icon className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white mb-1">{action.name}</h3>
                      <p className="text-sm text-dark-400">{action.description}</p>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Recent designs */}
        <motion.div variants={itemVariants}>
          <div className="glass-card-dark p-6 h-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Recent Designs</h2>
              <Link to="/designs" className="text-sm text-primary-400 hover:text-primary-300">
                View all
              </Link>
            </div>

            {statsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 rounded-xl bg-dark-800/50 animate-pulse" />
                ))}
              </div>
            ) : recentDesigns.length === 0 ? (
              <div className="text-center py-8">
                <FolderIcon className="w-10 h-10 text-dark-600 mx-auto mb-3" />
                <p className="text-dark-400 text-sm">No designs yet</p>
                <Link to="/designs/upload" className="text-primary-400 text-sm hover:text-primary-300 mt-2 inline-block">
                  Upload your first design
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {recentDesigns.map((design) => (
                  <div
                    key={design._id}
                    className="flex items-center gap-3 p-3 rounded-xl hover:bg-dark-800/50 transition-colors"
                  >
                    <div className="p-2 rounded-lg bg-dark-700/50 flex-shrink-0">
                      <FolderIcon className={`w-4 h-4 ${getCategoryColor(design.category)}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{design.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-dark-500">{formatDate(design.createdAt)}</span>
                        {design.isWatermarked && (
                          <span className="text-xs text-success-400 flex items-center gap-1">
                            <ShieldCheckIcon className="w-3 h-3" /> Protected
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Security status - for admins */}
      {isAdmin() && (
        <motion.div variants={itemVariants}>
          <div className="glass-card-dark p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold text-white">Security Overview</h2>
              <span className={`badge ${securityStats.suspicious > 0 ? 'badge-warning' : 'badge-success'}`}>
                {securityStats.suspicious > 0 ? 'Attention Required' : 'All Systems Normal'}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="text-center p-4 rounded-xl bg-dark-800/50">
                <div className={`text-3xl font-bold mb-1 ${securityStats.failedLogins > 0 ? 'text-warning-400' : 'text-white'}`}>
                  {securityStats.failedLogins}
                </div>
                <p className="text-sm text-dark-400">Failed Login Attempts</p>
                <p className="text-xs text-dark-500 mt-1">Last 24 hours</p>
              </div>
              <div className="text-center p-4 rounded-xl bg-dark-800/50">
                <div className={`text-3xl font-bold mb-1 ${securityStats.suspicious > 0 ? 'text-error-400' : 'text-white'}`}>
                  {securityStats.suspicious}
                </div>
                <p className="text-sm text-dark-400">Suspicious Activities</p>
                <p className={`text-xs mt-1 ${securityStats.suspicious > 0 ? 'text-error-400' : 'text-success-400'}`}>
                  {securityStats.suspicious > 0 ? 'Review recommended' : 'No threats detected'}
                </p>
              </div>
              <div className="text-center p-4 rounded-xl bg-dark-800/50">
                <div className="text-3xl font-bold text-white mb-1">
                  {stats.protectedDesigns}/{stats.totalDesigns}
                </div>
                <p className="text-sm text-dark-400">Watermark Coverage</p>
                <p className="text-xs text-primary-400 mt-1">Designs protected</p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
};

export default Dashboard;
