import axios from 'axios';
export const fetchMetrics = () => axios.get('http://localhost:4000/api/metrics').then(res => res.data);