# NivaaroFix REST API Documentation

Base URL: `http://localhost:5000/api`

---

## 1. Authentication & Profile Endpoints (`/api/auth`)

### 1.1 Customer Registration
- **Endpoint**: `POST /api/auth/customer-register`
- **Request Body**:
  ```json
  {
    "name": "Ananya Sharma",
    "email": "ananya.sharma@example.com",
    "phone": "+91 9876543210",
    "dob": { "day": "14", "month": "05", "year": "1994" },
    "state": "Karnataka",
    "city": "Bengaluru",
    "address": "Indiranagar 100ft Road",
    "password": "StrongPassword@2026"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "message": "Customer registered successfully in database",
    "user": { "id": 1, "name": "Ananya Sharma", "email": "ananya.sharma@example.com", ... }
  }
  ```

### 1.2 Customer Login
- **Endpoint**: `POST /api/auth/customer-login`
- **Request Body** (Email or Phone):
  ```json
  { "email": "ananya.sharma@example.com", "password": "StrongPassword@2026" }
  ```
- **Response** (`200 OK`):
  ```json
  { "success": true, "user": { "id": 1, "name": "Ananya Sharma", ... } }
  ```

### 1.3 Partner Registration
- **Endpoint**: `POST /api/auth/agent-register`
- **Request Body**:
  ```json
  {
    "name": "Karthik Rajan",
    "email": "karthik.rajan@example.com",
    "phone": "+91 9845012345",
    "trade": "electrician",
    "experienceYears": 4,
    "dob": { "day": "22", "month": "11", "year": "1991" },
    "state": "Karnataka",
    "city": "Bengaluru",
    "address": "BTM Layout 2nd Stage",
    "password": "ProPassword@2026"
  }
  ```
- **Response** (`201 Created`):
  ```json
  {
    "success": true,
    "agent": {
      "id": 1,
      "partnerId": "FIX-PRO-4821",
      "name": "Karthik Rajan",
      "rating": null,
      "completedJobs": 0,
      "kycStatus": "Pending"
    }
  }
  ```

### 1.4 Partner Login
- **Endpoint**: `POST /api/auth/agent-login`
- **Request Body**:
  ```json
  { "agentIdOrEmail": "FIX-PRO-4821", "password": "ProPassword@2026" }
  ```

### 1.5 Unified Google Identity Services OAuth 2.0
- **Endpoint**: `POST /api/auth/google`
- **Request Body**:
  ```json
  {
    "credential": "<Google_ID_JWT_Token>",
    "role": "customer"
  }
  ```

---

## 2. Service Requests & GPS Dispatch (`/api/dispatch`)

### 2.1 Create Service Request
- **Endpoint**: `POST /api/dispatch/requests`
- **Request Body**:
  ```json
  {
    "userId": 1,
    "serviceCategory": "electrician",
    "subService": "Circuit Breaker Tripping",
    "problemDescription": "Main MCB switches off repeatedly when AC turns on.",
    "serviceAddress": "Flat 302, Green Glen Layout, Bellandur, Bengaluru",
    "lat": 12.9260,
    "lng": 77.6762
  }
  ```

### 2.2 Progressive Provider Discovery
- **Endpoint**: `GET /api/dispatch/requests/:requestId/discover-candidates`
- **Description**: Evaluates concentric radii (50m, 100m, 500m, 1km, 5km, 10km) using PostgreSQL earth distance and H3 spatial indexes.

### 2.3 Submit Technician Quotation
- **Endpoint**: `POST /api/dispatch/quotes`
- **Request Body**:
  ```json
  {
    "requestId": 101,
    "partnerId": "FIX-PRO-4821",
    "basePrice": 399,
    "materialCostEstimate": 150,
    "estimatedDurationMinutes": 45,
    "notes": "Will inspect MCB load rating and test earthing continuity."
  }
  ```

### 2.4 Accept Quote & Confirm Booking
- **Endpoint**: `POST /api/dispatch/quotes/:quoteId/accept`
- **Generates**: Door safety OTP and initializes confirmed booking state.

---

## 3. Bookings & Lifecycle Management (`/api/bookings`)

### 3.1 Fetch User Bookings
- **Endpoint**: `GET /api/bookings?userId=:userId`

### 3.2 Verify Door Safety OTP
- **Endpoint**: `POST /api/bookings/:bookingId/verify-otp`
- **Request Body**:
  ```json
  { "otp": "4819" }
  ```

### 3.3 Complete Visit & Initiate Warranty
- **Endpoint**: `POST /api/bookings/:bookingId/complete`
- **Description**: Sets visit status to `completed` and activates the 30-day dynamic repair warranty.

---

## 4. System Health Check
- **Endpoint**: `GET /api/health`
- **Response**:
  ```json
  {
    "status": "online",
    "service": "NivaaroFix PostgreSQL REST & OAuth API",
    "database": "PostgreSQL 18.6 (nivaarofix_db)",
    "timestamp": "2026-09-29T20:00:00.000Z"
  }
  ```
