# NivaaroFix PostgreSQL Database Schema

Database Name: `nivaarofix_db`  
PostgreSQL Version: `18.6`  
Primary Extensions: `cube`, `earthdistance`

---

## 1. Entity Relationship Overview

```
       +--------------------+               +--------------------+
       |     user_login     |               |    agent_login     |
       +--------------------+               +--------------------+
       | id (PK)            |               | id (PK)            |
       | email (UNIQUE)     |               | partner_id (UNIQUE)|
       | phone              |               | email (UNIQUE)     |
       | name               |               | trade (elec/plumb) |
       | dob, state, city   |               | experience_years   |
       +---------+----------+               | rating, kyc_status |
                 |                          | lat, lng, h3_res_8 |
                 | 1                        +---------+----------+
                 |                                    | 1
                 v N                                  |
       +--------------------+                         |
       |  service_requests  |                         |
       +--------------------+                         |
       | id (PK)            |                         |
       | user_id (FK)       |                         |
       | category, problem  |                         |
       | lat, lng, address  |                         |
       | status             |                         |
       +---------+----------+                         |
                 | 1                                  |
                 |                                    |
                 v N                                  v N
       +--------------------+               +--------------------+
       |       quotes       |               |      bookings      |
       +--------------------+               +--------------------+
       | id (PK)            |               | id (PK)            |
       | request_id (FK)    |               | user_id (FK)       |
       | partner_id (FK)    |-------------->| partner_id (FK)    |
       | base_price, status |               | status (4 stages)  |
       +--------------------+               | door_otp (4-digit) |
                                            | warranty_until     |
                                            +--------------------+
```

---

## 2. Table Specifications

### 2.1 `user_login` (Homeowners & Customers)
| Column | Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | `PRIMARY KEY` | Unique customer identity |
| `name` | `VARCHAR(150)` | `NOT NULL` | Customer full name |
| `email` | `VARCHAR(150)` | `UNIQUE, NOT NULL` | Login email address |
| `phone` | `VARCHAR(50)` | `NULLABLE` | Verified Indian mobile (+91) |
| `dob` | `VARCHAR(50)` | `NULLABLE` | Date of birth |
| `state` | `VARCHAR(100)` | `NULLABLE` | Indian state |
| `city` | `VARCHAR(100)` | `NULLABLE` | Operational city |
| `address` | `TEXT` | `NULLABLE` | Primary home address |
| `password` | `VARCHAR(255)` | `NULLABLE` | Hashed/secure credential |
| `auth_provider` | `VARCHAR(50)` | `'email' CHECK ('email','phone_otp','google')` | Auth mechanism |
| `avatar_url` | `TEXT` | `NULLABLE` | Profile avatar URL |
| `last_login_at` | `TIMESTAMPTZ` | `CURRENT_TIMESTAMP` | Last active login |

### 2.2 `agent_login` (Master Electricians & Plumbers)
| Column | Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | `PRIMARY KEY` | System agent identifier |
| `partner_id` | `VARCHAR(50)` | `UNIQUE, NOT NULL` | Public Partner ID (e.g. `FIX-PRO-7436`) |
| `name` | `VARCHAR(150)` | `NOT NULL` | Professional full name |
| `email` | `VARCHAR(150)` | `UNIQUE, NOT NULL` | Verified work email |
| `phone` | `VARCHAR(50)` | `NULLABLE` | Verified phone number |
| `trade` | `VARCHAR(100)` | `CHECK ('electrician', 'plumber')` | Trade specialization |
| `experience_years`| `INT` | `DEFAULT 0, CHECK (>= 0)` | Verified trade experience |
| `kyc_status` | `VARCHAR(50)` | `DEFAULT 'Pending'` | Document verification status |
| `rating` | `NUMERIC(3,2)` | `DEFAULT NULL, CHECK (1.00 - 5.00)` | Authentic review average |
| `completed_jobs` | `INT` | `DEFAULT 0, CHECK (>= 0)` | Finished service visits |
| `wallet_balance` | `NUMERIC(10,2)`| `DEFAULT 0.00, CHECK (>= 0.00)` | Settled ledger balance |
| `is_online` | `BOOLEAN` | `DEFAULT true` | Ready to receive dispatches |
| `lat` / `lng` | `DOUBLE PRECISION`| `NULLABLE` | High-precision GPS coordinates |
| `h3_res_8` | `VARCHAR(20)` | `NULLABLE` | Uber H3 Hexagonal Cell Index |

### 2.3 `bookings` (Confirmed Service Visits)
| Column | Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `id` | `SERIAL` | `PRIMARY KEY` | Booking identifier |
| `booking_code` | `VARCHAR(50)` | `UNIQUE` | Customer-facing reference (`FIX-2026-XXXX`) |
| `user_id` | `INT REFERENCES user_login(id)` | Foreign key to customer |
| `agent_id` | `INT REFERENCES agent_login(id)` | Foreign key to technician |
| `status` | `VARCHAR(50)` | `CHECK ('confirmed','assigned','en_route','in_progress','completed','cancelled')` | Visit stage |
| `door_otp` | `VARCHAR(10)` | 4-digit safety check code |
| `warranty_until` | `TIMESTAMPTZ` | Active 30 days after completion |
| `total_amount` | `NUMERIC(10,2)` | Billed service charges |

---

## 3. Automated Triggers & Extensions

- **Auto-Timestamp Trigger**: `update_timestamp_column()` automatically updates `updated_at = CURRENT_TIMESTAMP` across any table row update.
- **Geospatial Extensions**: `cube` and `earthdistance` enable sub-meter geodesic distance queries:
  ```sql
  SELECT * FROM agent_login
  WHERE is_online = true
    AND earth_box(ll_to_earth($1, $2), $3) @> ll_to_earth(lat, lng)
    AND earth_distance(ll_to_earth($1, $2), ll_to_earth(lat, lng)) <= $3
  ORDER BY earth_distance(ll_to_earth($1, $2), ll_to_earth(lat, lng)) ASC;
  ```
