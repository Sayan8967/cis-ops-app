import axios from 'axios';
import { API_ENDPOINTS } from './config.js';

// Use the centralized API configuration
export const fetchMetrics = () => axios.get(API_ENDPOINTS.METRICS).then(res => res.data);