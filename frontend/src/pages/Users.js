import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../context/AuthContext';
import { userAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ShieldCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrashIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

const Users = () => {
  const { isAdmin, user: currentUser } = useAuth();
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal]           = useState(0);

  // Confirm delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null); // user object to delete
  const [deleting, setDeleting]         = useState(false);

  const LIMIT = 10;
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const handleSearchChange = (e) => {
    setSearch(e.target.value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(e.target.value);
    }, 400);
  };

  const handleRoleFilterChange = (e) => {
    setRoleFilter(e.target.value);
    setPage(1);
  };

  const fetchUsers = async (currentPage, currentRole, currentSearch) => {
    setLoading(true);
    try {
      const params = {
        page: currentPage,
        limit: LIMIT,
        ...(currentRole   && { role: currentRole }),
        ...(currentSearch && { search: currentSearch }),
      };
      const response = await userAPI.getAll(params);
      const data = response.data.data;
      setUsers(data.users);
      setTotalPages(data.pagination.pages);
      setTotal(data.pagination.total);
    } catch (error) {
      if (error.response?.status !== 401) {
        toast.error(error.response?.data?.message || 'Failed to fetch users');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => { if (!cancelled) await fetchUsers(page, roleFilter, debouncedSearch); };
    load();
    return () => { cancelled = true; };
  }, [page, roleFilter, debouncedSearch]); // eslint-disable-line

  const handleRoleChange = async (userId, newRole) => {
    try {
      await userAPI.updateRole(userId, newRole);
      toast.success('User role updated');
      await fetchUsers(page, roleFilter, debouncedSearch);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update role');
    }
  };

  const handleStatusChange = async (userId, isActive) => {
    try {
      await userAPI.updateStatus(userId, isActive);
      toast.success(`User ${isActive ? 'activated' : 'deactivated'}`);
      await fetchUsers(page, roleFilter, debouncedSearch);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to update status');
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await userAPI.delete(deleteTarget._id);
      toast.success(`${deleteTarget.firstName} ${deleteTarget.lastName} deleted`);
      setDeleteTarget(null);
      // If last item on page, go back one page
      const newTotal = total - 1;
      const newPages = Math.ceil(newTotal / LIMIT);
      const safePage = Math.min(page, Math.max(newPages, 1));
      setPage(safePage);
      await fetchUsers(safePage, roleFilter, debouncedSearch);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const isSelf = (userId) =>
    userId === (currentUser?.id || currentUser?._id);

  const roleBadgeColor = {
    admin:        'bg-red-500/20 text-red-400',
    designer:     'bg-indigo-500/20 text-indigo-400',
    collaborator: 'bg-cyan-500/20 text-cyan-400',
    reviewer:     'bg-yellow-500/20 text-yellow-400',
  };

  if (!isAdmin()) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <ShieldCheckIcon className="w-16 h-16 text-slate-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Access Denied</h2>
          <p className="text-slate-400">Administrator privileges required.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-slate-400 mt-1">Manage user accounts, roles, and access</p>
        </div>

        {/* Filters */}
        <div className="glass-card-dark p-4 rounded-xl">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="Search by name or email..."
                className="input-field pl-10 w-full"
              />
            </div>
            <div className="flex items-center gap-2">
              <FunnelIcon className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <select
                value={roleFilter}
                onChange={handleRoleFilterChange}
                className="input-field w-44"
              >
                <option value="">All Roles</option>
                <option value="admin">Admin</option>
                <option value="designer">Designer</option>
                <option value="collaborator">Collaborator</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="glass-card-dark rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">User</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">Role</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">Status</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">MFA</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">Designs</th>
                  <th className="text-left py-4 px-6 text-sm font-medium text-slate-400">Joined</th>
                  <th className="text-right py-4 px-6 text-sm font-medium text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center">
                      <div className="flex items-center justify-center gap-3 text-slate-400">
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                        </svg>
                        Loading users...
                      </div>
                    </td>
                  </tr>
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-12 text-center text-slate-400">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user._id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">

                      {/* User */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600
                                          flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                            {user.firstName?.[0]}{user.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-white truncate">
                              {user.firstName} {user.lastName}
                              {isSelf(user._id) && (
                                <span className="ml-2 text-xs text-slate-500">(you)</span>
                              )}
                            </p>
                            <p className="text-sm text-slate-400 truncate">{user.email}</p>
                          </div>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="py-4 px-6">
                        <select
                          value={user.role}
                          onChange={(e) => handleRoleChange(user._id, e.target.value)}
                          disabled={isSelf(user._id)}
                          className={`px-3 py-1 rounded-full text-sm font-medium border-0 cursor-pointer
                                      ${roleBadgeColor[user.role] || 'bg-slate-600 text-slate-300'}
                                      ${isSelf(user._id) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <option value="admin">Admin</option>
                          <option value="designer">Designer</option>
                          <option value="collaborator">Collaborator</option>
                          <option value="reviewer">Reviewer</option>
                        </select>
                      </td>

                      {/* Status */}
                      <td className="py-4 px-6">
                        <button
                          onClick={() => handleStatusChange(user._id, !user.isActive)}
                          disabled={isSelf(user._id)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors
                                      ${user.isActive
                                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                        : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}
                                      ${isSelf(user._id) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </button>
                      </td>

                      {/* MFA */}
                      <td className="py-4 px-6">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium
                                          ${user.mfaEnabled
                                            ? 'bg-green-500/20 text-green-400'
                                            : 'bg-yellow-500/20 text-yellow-400'}`}>
                          {user.mfaEnabled ? 'Enabled' : 'Disabled'}
                        </span>
                      </td>

                      {/* Designs */}
                      <td className="py-4 px-6 text-slate-400 text-sm">
                        {user.designsCount ?? 0}
                      </td>

                      {/* Joined */}
                      <td className="py-4 px-6 text-slate-400 text-sm whitespace-nowrap">
                        {new Date(user.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric', month: 'short', day: 'numeric'
                        })}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => setDeleteTarget(user)}
                          disabled={isSelf(user._id)}
                          title={isSelf(user._id) ? 'Cannot delete your own account' : `Delete ${user.firstName}`}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                                      transition-colors
                                      ${isSelf(user._id)
                                        ? 'bg-slate-800/50 text-slate-600 cursor-not-allowed'
                                        : 'bg-red-500/20 hover:bg-red-500/30 text-red-400 cursor-pointer'}`}
                        >
                          <TrashIcon className="w-4 h-4" />
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700">
              <p className="text-sm text-slate-400">
                {Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} of {total} users
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => p - 1)}
                  disabled={page === 1}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700
                             disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>
                <span className="px-3 py-1 text-sm text-white">{page} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700
                             disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── Delete Confirmation Modal ── */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget && !deleting) setDeleteTarget(null); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card-dark rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            >
              {/* Icon */}
              <div className="flex items-center justify-center mb-4">
                <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                  <ExclamationTriangleIcon className="w-7 h-7 text-red-400" />
                </div>
              </div>

              {/* Content */}
              <h3 className="text-white font-bold text-lg text-center mb-2">Delete User</h3>
              <p className="text-slate-400 text-sm text-center mb-1">
                Are you sure you want to delete
              </p>
              <p className="text-white font-semibold text-center mb-4">
                {deleteTarget.firstName} {deleteTarget.lastName}
              </p>

              {/* Warning details */}
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-5 space-y-1">
                <p className="text-red-400 text-xs font-medium">⚠️ This action cannot be undone</p>
                <p className="text-slate-400 text-xs">• User account will be permanently removed</p>
                <p className="text-slate-400 text-xs">• All sessions and tokens will be revoked</p>
                <p className="text-slate-400 text-xs">• Designs owned by this user will remain</p>
              </div>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteTarget(null)}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 text-white
                             rounded-xl transition-colors text-sm font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  className="flex-1 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white
                             rounded-xl transition-colors text-sm font-medium flex items-center
                             justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {deleting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      Deleting...
                    </>
                  ) : (
                    <>
                      <TrashIcon className="w-4 h-4" />
                      Delete User
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Users;
