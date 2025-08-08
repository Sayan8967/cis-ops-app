# CIS Operations Dashboard & Chat Tools

## Setup
Ensure you have a `.env` in `frontend/` with:
```
REACT_APP_HF_API_KEY=your_hf_api_key
REACT_APP_GOOGLE_CLIENT_ID=your_google_client_id
REACT_APP_BACKEND_URL=http://cis-ops-backend-service:4000
```

### Backend
```bash
cd backend
npm install
# For local development :::
node server.js
# For Kubernetes, build and deploy the backend container as described in k8s/manifests/backend-deployment.yaml
```

### Frontend
```bash
cd frontend
npm install
# For local development:
npm start
# For Kubernetes, build and deploy the frontend container as described in k8s/manifests/frontend-deployment.yaml
```

Test