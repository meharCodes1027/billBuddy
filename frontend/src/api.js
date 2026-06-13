import axios from 'axios'

// Create axios client pointing to FastAPI local server
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  }
})

// Request Interceptor: Logs out outgoing requests
api.interceptors.request.use(
  (config) => {
    console.log(`[API Request] [${config.method?.toUpperCase()}] -> ${config.url}`, config.data || '')
    return config
  },
  (error) => {
    console.error(`[API Request Error]`, error)
    return Promise.reject(error)
  }
)

// Response Interceptor: Catches errors and formats clear logs
api.interceptors.response.use(
  (response) => {
    console.log(`[API Response] [${response.status}] <- ${response.config.url}`, response.data)
    return response
  },
  (error) => {
    if (error.response) {
      // Server responded with non-2xx status code
      console.error(
        `[API Response Error] [Status: ${error.response.status}] URL: ${error.config?.url}\n`,
        `Response Body:`, error.response.data
      )
    } else if (error.request) {
      // Request was made but no response was received
      console.error(
        `[API Network Error] No response received from server. URL: ${error.config?.url}\n`,
        `Check if FastAPI backend is running on http://localhost:8000`
      )
    } else {
      // Setting up the request triggered an error
      console.error(`[API Setup Error] Error setting up API request:`, error.message)
    }
    return Promise.reject(error)
  }
)

export const getProfile = async (profileId) => {
  const response = await api.get(`/api/profile/${profileId}`)
  return response.data
}

export const updateProfile = async (profileId, data) => {
  const response = await api.post(`/api/profile/${profileId}`, data)
  return response.data
}

export const getBills = async (profileId) => {
  const response = await api.get(`/api/profile/${profileId}/bills`)
  return response.data
}

export const getHistory = async (profileId) => {
  const response = await api.get(`/api/profile/${profileId}/history`)
  return response.data
}

export const triggerAgent = async (profileId) => {
  const response = await api.post(`/api/profile/${profileId}/trigger`)
  return response.data
}

export default api

