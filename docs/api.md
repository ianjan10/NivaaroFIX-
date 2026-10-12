# REST & WebSocket API Specification

## Base URLs

- **HTTP API**: `http://localhost:5000/api`
- **WebSocket Telemetry**: `ws://localhost:5000/ws/tracking`

All responses are formatted in strict JSON. HTML is never returned, even for 404 or 500 status codes.

---

## 1. Authentication (`/api/auth`)

### Register Professional
- **POST** `/api/auth/agent-register`
- **Request Body**:
  ```json
  {
    "email": "technician@example.com",
    "name": "Ramesh Kumar",
    "phone": "+91 9876543210",
    "password": "Password@123",
    "trade": "electrician"
  }
  ```
- **Response** (201 Created):
  ```json
  {
    "success": true,
    "message": "Professional registered successfully.",
    "user": { "id": 1, "email": "technician@example.com", "role": "professional" }
  }
  ```

### Login
- **POST** `/api/auth/login`
- **Request Body**:
  ```json
  {
    "email": "technician@example.com",
    "password": "Password@123"
  }
  ```
- **Response** (200 OK):
  ```json
  {
    "success": true,
    "token": "jwt_token_string",
    "user": { "id": 1, "name": "Ramesh Kumar", "role": "professional" }
  }
  ```

---

## 2. Service Requests & Marketplace (`/api/dispatch`)

### Create Service Request
- **POST** `/api/dispatch/request`
- **Request Body**:
  ```json
  {
    "userEmail": "customer@example.com",
    "userName": "Anita Sharma",
    "userPhone": "+91 9999888822",
    "userAddress": "Flat 402, Indiranagar, Bengaluru",
    "lat": 12.9783,
    "lng": 77.6408,
    "serviceTitle": "Switches & Sockets",
    "category": "electrician",
    "issueType": "Sparks from socket",
    "problemDescription": "Socket sparks when iron is connected."
  }
  ```
- **Response** (201 Created):
  ```json
  {
    "success": true,
    "request": {
      "requestRef": "2026000001",
      "status": "open",
      "otpCode": "1930"
    }
  }
  ```
- **Errors**:
  - `403 CUSTOMER_LOCKED`: Customer currently has an unfinished work order.

### List Nearby Requests (Professional Feed)
- **GET** `/api/dispatch/nearby-requests?email=technician@example.com&lat=12.9609&lng=77.6387`
- **Response** (200 OK):
  ```json
  {
    "success": true,
    "requests": [
      {
        "id": 1,
        "requestRef": "2026000001",
        "serviceTitle": "Switches & Sockets",
        "category": "electrician",
        "area": "Indiranagar, Bengaluru",
        "distanceKm": 1.95,
        "formattedDistance": "~1.9 km away",
        "status": "open"
      }
    ]
  }
  ```

### Submit Quote
- **POST** `/api/dispatch/quote`
- **Request Body**:
  ```json
  {
    "requestRef": "2026000001",
    "agentEmail": "technician@example.com",
    "amount": 480.00,
    "estimatedDuration": 25,
    "message": "Arriving with standard modular switches."
  }
  ```
- **Response** (201 Created):
  ```json
  {
    "success": true,
    "quote": { "id": 1, "amount": 480.00, "status": "pending" }
  }
  ```
- **Errors**:
  - `400 Bad Request`: Quote amount is zero or negative.
  - `409 PROVIDER_BUSY`: Professional currently has an active work order.

### Accept Quote
- **POST** `/api/dispatch/quote/:quoteId/accept`
- **Response** (200 OK):
  ```json
  {
    "success": true,
    "message": "Quote accepted. Work order confirmed.",
    "requestRef": "2026000001"
  }
  ```

---

## 3. Workflow Progression (`/api/dispatch`)

### Mark En Route / On the Way
- **POST** `/api/dispatch/request/:ref/en-route`
- **Request Body**: `{ "agentEmail": "technician@example.com" }`
- **Response** (200 OK):
  ```json
  {
    "success": true,
    "request": { "requestRef": "2026000001", "status": "on_the_way" }
  }
  ```

### Mark Arrived
- **POST** `/api/dispatch/request/:ref/arrived`
- **Request Body**:
  ```json
  {
    "agentEmail": "technician@example.com",
    "lat": 12.9785,
    "lng": 77.6410
  }
  ```
- **Response** (200 OK):
  ```json
  {
    "success": true,
    "message": "Status updated to Arrived.",
    "request": {
      "requestRef": "2026000001",
      "status": "arrived",
      "otpCode": "1930"
    }
  }
  ```
- **Errors**:
  - `400 TOO_FAR_FROM_DESTINATION`: If distance between professional coordinates and doorstep exceeds 200m (e.g. `"You're about 1.9 km from the customer's location"`).

### Verify Door OTP
- **POST** `/api/dispatch/request/:ref/verify-otp`
- **Request Body**: `{ "otp": "1930" }`
- **Response** (200 OK):
  ```json
  {
    "success": true,
    "request": { "requestRef": "2026000001", "status": "in_progress" }
  }
  ```
- **Errors**:
  - `400 Bad Request`: Invalid OTP.
  - `429 Too Many Requests`: Maximum 5 attempts exceeded. Locked for 15 minutes.

### Complete Work Order
- **POST** `/api/dispatch/request/:ref/complete`
- **Request Body**:
  ```json
  {
    "agentEmail": "technician@example.com",
    "photos": ["https://storage.example.com/photo1.jpg"],
    "remarks": "Replaced burnt 16A modular socket and tested load."
  }
  ```
- **Response** (200 OK):
  ```json
  {
    "success": true,
    "request": { "requestRef": "2026000001", "status": "completed" }
  }
  ```
- **Errors**:
  - `400 Bad Request`: At least one completion photo is mandatory.

### Rate Service
- **POST** `/api/dispatch/request/:ref/rate`
- **Request Body**:
  ```json
  {
    "rating": 5,
    "feedback": "Prompt and professional.",
    "tags": ["On-time", "Polite"]
  }
  ```
- **Response** (200 OK): `{ "success": true, "rating": 5 }`

---

## 4. WebSocket Telemetry (`/ws/tracking`)

- **URL**: `ws://localhost:5000/ws/tracking?jobRef=2026000001&role=customer`
- **Professional Publish Message**:
  ```json
  {
    "type": "publish_location",
    "jobRef": "2026000001",
    "email": "technician@example.com",
    "lat": 12.9650,
    "lng": 77.6390,
    "accuracy": 8,
    "heading": 90,
    "speed": 10.2
  }
  ```
- **Customer Broadcast Message**:
  ```json
  {
    "type": "location_update",
    "jobRef": "2026000001",
    "lat": 12.9650,
    "lng": 77.6390,
    "heading": 90,
    "route": [[12.9650, 77.6390], [12.9783, 77.6408]],
    "etaMinutes": 8,
    "distanceKm": 1.8,
    "etaText": "8 min · 1.8 km"
  }
  ```
