import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't tried to refresh yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) {
          throw new Error('No refresh token');
        }

        const response = await axios.post(`${API_URL}/auth/refresh-token`, {
          refreshToken,
        });

        const { accessToken } = response.data.data;
        localStorage.setItem('accessToken', accessToken);

        // Retry original request with new token
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh failed, clear tokens and redirect to login
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

// Auth API calls
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: (refreshToken) => api.post('/auth/logout', { refreshToken }),
  verifyMFA: (data) => api.post('/auth/verify-mfa', data),
  setupMFA: () => api.post('/auth/setup-mfa'),
  enableMFA: (code) => api.post('/auth/enable-mfa', { code }),
  disableMFA: (data) => api.post('/auth/disable-mfa', data),
  getMe: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (token, password) => api.post(`/auth/reset-password/${token}`, { password }),
  verifyEmail: (token) => api.get(`/auth/verify-email/${token}`),
  refreshToken: (refreshToken) => api.post('/auth/refresh-token', { refreshToken }),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// User API calls
export const userAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  update: (id, data) => api.put(`/users/${id}`, data),
  updateRole: (id, role) => api.put(`/users/${id}/role`, { role }),
  updateStatus: (id, isActive) => api.put(`/users/${id}/status`, { isActive }),
  delete: (id) => api.delete(`/users/${id}`),
  getActivity: (id, params) => api.get(`/users/${id}/activity`, { params }),
  getPermissions: () => api.get('/users/permissions/me'),
};

// Design API calls
export const designAPI = {
  // Get user's own designs
  getMyDesigns: (params) => api.get('/designs/my', { params }),

  // Get designs shared with user
  getSharedDesigns: (params) => api.get('/designs/shared', { params }),

  // Get single design
  getById: (id) => api.get(`/designs/${id}`),

  // Upload new design (with encryption)
  upload: (formData, onUploadProgress) => api.post('/designs', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress
  }),

  // Download design (decrypted)
  download: (id) => api.get(`/designs/${id}/download`, { responseType: 'blob' }),

  // Update design metadata
  update: (id, data) => api.put(`/designs/${id}`, data),

  // Delete design
  delete: (id) => api.delete(`/designs/${id}`),

  // Share design with user
  share: (id, data) => api.post(`/designs/${id}/share`, data),

  // Remove collaborator
  removeCollaborator: (designId, userId) => api.delete(`/designs/${designId}/collaborators/${userId}`),

  // Watermark operations
  addWatermark: (id) => api.post(`/designs/${id}/watermark`),
  verifyWatermark: (id) => api.post(`/designs/${id}/watermark/verify`),
  getWatermarkInfo: (id) => api.get(`/designs/${id}/watermark`),
  removeWatermark: (id, reason) => api.delete(`/designs/${id}/watermark`, { data: { reason } }),
};

// Watermark API calls (standalone verification)
export const watermarkAPI = {
  // Verify external uploaded image for any FashionGuard watermarks
  verifyImage: (formData) => api.post('/watermarks/verify-image', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),

  // Get all watermarks created by the user
  getMyWatermarks: (params) => api.get('/watermarks/my', { params }),
};

export default api;
