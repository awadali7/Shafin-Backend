# KYC Status API Endpoints

## Overview
Added two new API endpoints to check the KYC verification status for the current authenticated user.

## New Endpoints

### 1. Student KYC Status
**Endpoint:** `GET /api/kyc/status`  
**Authentication:** Required  
**Description:** Returns the KYC verification status for the current user (Student KYC)

### 2. Business KYC Status
**Endpoint:** `GET /api/product-kyc/status`  
**Authentication:** Required  
**Description:** Returns the Product KYC verification status for the current user (Business KYC)

---

## API Details

### Request
```http
GET /api/kyc/status
Authorization: Bearer {token}
```

### Response Format

#### Success - KYC Exists
```json
{
  "success": true,
  "data": {
    "status": "verified",
    "verified_at": "2026-02-02T19:00:00.000Z"
  }
}
```

#### Success - No KYC Submitted
```json
{
  "success": true,
  "data": {
    "status": null,
    "verified_at": null,
    "message": "No KYC submission found"
  }
}
```

#### Error - Not Authenticated
```json
{
  "success": false,
  "message": "Authentication required"
}
```

---

## Status Values

The `status` field can have the following values:

| Value | Description | User Can View Details |
|-------|-------------|----------------------|
| `"verified"` | KYC approved by admin | ✅ Yes |
| `"pending"` | KYC submitted, awaiting review | ❌ No |
| `"rejected"` | KYC rejected by admin | ❌ No |
| `null` | No KYC submitted yet | ❌ No |

---

## Implementation Details

### Files Modified

#### 1. Student KYC Controller
**File:** `src/controllers/kycController.js`

**New Function:**
```javascript
const getKYCStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await query(
            `SELECT status, verified_at 
             FROM kyc_verifications 
             WHERE user_id = $1
             ORDER BY created_at DESC 
             LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    status: null,
                    verified_at: null,
                    message: "No KYC submission found"
                }
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        next(error);
    }
};
```

#### 2. Student KYC Routes
**File:** `src/routes/kyc.js`

**New Route:**
```javascript
router.get("/status", authenticate, getKYCStatus);
```

#### 3. Business KYC Controller
**File:** `src/controllers/productKycController.js`

**New Function:**
```javascript
const getProductKYCStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const result = await query(
            `SELECT status, verified_at 
             FROM product_kyc_verifications 
             WHERE user_id = $1
             ORDER BY created_at DESC 
             LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.json({
                success: true,
                data: {
                    status: null,
                    verified_at: null,
                    message: "No Product KYC submission found"
                }
            });
        }

        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        next(error);
    }
};
```

#### 4. Business KYC Routes
**File:** `src/routes/product-kyc.js`

**New Route:**
```javascript
router.get("/status", authenticate, getProductKYCStatus);
```

---

## Frontend Integration

The frontend profile page uses these endpoints:

```typescript
// Fetch Student KYC status
const studentKycResponse = await apiClient.get("/kyc/status");
const studentKycData = studentKycResponse.data;

// Fetch Business KYC status
const businessKycResponse = await apiClient.get("/product-kyc/status");
const businessKycData = businessKycResponse.data;

// Check if verified
if (studentKycData?.status === "verified") {
    // Show "View Student KYC" button
}

if (businessKycData?.status === "verified") {
    // Show "View Business KYC" button
}
```

---

## Use Cases

### 1. Profile Page
- Fetch KYC status on page load
- Show "View KYC Details" button only if status is "verified"
- Hide button for pending/rejected/null status

### 2. Conditional Navigation
- Determine which KYC links to show in sidebar
- Redirect to appropriate KYC form based on status

### 3. Purchase Flow
- Check KYC status before allowing course/product purchase
- Show appropriate error messages

### 4. Admin Dashboard
- Check user's KYC status when viewing user details
- Display verification badges

---

## Security

- ✅ **Authentication required** - User must be logged in
- ✅ **User-specific** - Only returns status for the authenticated user
- ✅ **Read-only** - Cannot modify KYC status via this endpoint
- ✅ **No sensitive data** - Only returns status and verification date
- ✅ **SQL injection safe** - Uses parameterized queries

---

## Testing

### Test Student KYC Status
```bash
# With valid token
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5001/api/kyc/status

# Expected response (if verified)
{
  "success": true,
  "data": {
    "status": "verified",
    "verified_at": "2026-02-02T19:00:00.000Z"
  }
}
```

### Test Business KYC Status
```bash
# With valid token
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:5001/api/product-kyc/status

# Expected response (if not submitted)
{
  "success": true,
  "data": {
    "status": null,
    "verified_at": null,
    "message": "No Product KYC submission found"
  }
}
```

### Test Without Authentication
```bash
curl http://localhost:5001/api/kyc/status

# Expected: 401 Unauthorized
```

---

## Database Queries

### Student KYC Query
```sql
SELECT status, verified_at 
FROM kyc_verifications 
WHERE user_id = $1
ORDER BY created_at DESC 
LIMIT 1
```

### Business KYC Query
```sql
SELECT status, verified_at 
FROM product_kyc_verifications 
WHERE user_id = $1
ORDER BY created_at DESC 
LIMIT 1
```

**Notes:**
- Uses `ORDER BY created_at DESC` to get the latest submission
- `LIMIT 1` ensures only one record is returned
- Returns both `status` and `verified_at` timestamp

---

## Error Handling

### Possible Errors

| Error | Status Code | Response |
|-------|-------------|----------|
| Not authenticated | 401 | `{"success": false, "message": "Authentication required"}` |
| Database error | 500 | `{"success": false, "message": "Database error occurred"}` |
| Invalid token | 401 | `{"success": false, "message": "Invalid token"}` |

### Error Handling in Frontend
```typescript
try {
    const response = await apiClient.get("/kyc/status");
    const status = response.data?.status;
    // Handle status
} catch (error) {
    // Silently fail - user might not have submitted KYC yet
    console.log("KYC status fetch error (expected if not submitted):", error);
}
```

---

## Performance

- **Fast queries** - Single indexed lookup by `user_id`
- **Lightweight response** - Only 2 fields returned
- **No joins** - Direct table query
- **Cached by frontend** - Fetched once per page load

### Indexes Used
```sql
-- Existing indexes used by these queries
CREATE INDEX idx_kyc_verifications_user_id ON kyc_verifications(user_id);
CREATE INDEX idx_product_kyc_verifications_user_id ON product_kyc_verifications(user_id);
```

---

## Related Endpoints

### Student KYC
- `POST /api/kyc` - Submit Student KYC
- `GET /api/kyc/me` - Get full Student KYC details
- `GET /api/kyc/status` - Get Student KYC status (NEW)

### Business KYC
- `POST /api/product-kyc` - Submit Business KYC
- `GET /api/product-kyc/me` - Get full Business KYC details
- `GET /api/product-kyc/status` - Get Business KYC status (NEW)

---

## Deployment Checklist

- [x] Add `getKYCStatus` function to `kycController.js`
- [x] Add route to `src/routes/kyc.js`
- [x] Add `getProductKYCStatus` function to `productKycController.js`
- [x] Add route to `src/routes/product-kyc.js`
- [ ] Commit backend changes
- [ ] Push to server
- [ ] Restart backend: `pm2 restart elearning-backend`
- [ ] Test endpoints with curl
- [ ] Deploy frontend
- [ ] Test in browser

---

**Status**: ✅ Complete  
**Date**: February 2, 2026  
**Backward Compatible**: Yes  
**Breaking Changes**: None

