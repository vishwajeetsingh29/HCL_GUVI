const rawApiBase = import.meta.env.VITE_API_URL || '';
const API_BASE = rawApiBase.replace(/\/+$/, '');

// Retrieve or generate a persistent anonymous voter fingerprint
export function getVoterFingerprint() {
  let fp = localStorage.getItem('voter_fingerprint');
  if (!fp) {
    fp = 'voter_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    localStorage.setItem('voter_fingerprint', fp);
  }
  return fp;
}

// Request helper with automatic JSON handling and Auth headers
async function request(endpoint, options = {}) {
  const token = localStorage.getItem('polling_token');
  const headers = {
    'Content-Type': 'application/json',
    'X-Voter-Fingerprint': getVoterFingerprint(),
    ...options.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const errorMsg = data?.error || `Request failed with status ${response.status}`;
    const error = new Error(errorMsg);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export const api = {
  // Auth endpoints
  signup: (userData) => request('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify(userData),
  }),

  login: (credentials) => request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  }),

  getMe: () => request('/api/auth/me', {
    method: 'GET',
  }),

  // Poll endpoints
  createPoll: (pollData) => request('/api/polls', {
    method: 'POST',
    body: JSON.stringify(pollData),
  }),

  getUserPolls: () => request('/api/polls/user', {
    method: 'GET',
  }),

  getPoll: (id) => request(`/api/polls/${id}`, {
    method: 'GET',
  }),

  castVote: (pollId, optionId) => request(`/api/polls/${pollId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ option_id: optionId }),
  }),

  deletePoll: (id) => request(`/api/polls/${id}`, {
    method: 'DELETE',
  }),
};
