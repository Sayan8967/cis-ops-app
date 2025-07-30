import axios from 'axios';

// Use relative URL - Ingress will route to backend
export const fetchMetrics = () => axios.get('/api/metrics').then(res => res.data);