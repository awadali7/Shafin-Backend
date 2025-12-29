# Course Purchase Flow - Complete Documentation

## Flow Overview

Your flow is correct! Here's the complete implementation:

### Required Steps Before Purchase:
1. ✅ **User Registration/Login**
2. ✅ **KYC Verification** (must be `verified`)
3. ✅ **Terms & Conditions Acceptance** (must be accepted)
4. ✅ **Course Purchase** via Razorpay

---

## Database Tables Needed

### Required Tables:

1. **`users`** ✅ Already exists
   - Added: `terms_accepted_at` column (NEW)

2. **`courses`** ✅ Already exists

3. **`videos`** ✅ Already exists (playlist for courses)

4. **`kyc_verifications`** ✅ Already exists
   - Used to verify user KYC status before purchase

5. **`orders`** ✅ Already exists
   - Used for all purchases (both courses and products)

6. **`course_orders`** ✅ NEW - Required
   - Links orders to courses (separate from shop products)

7. **`course_access`** ✅ Already exists
   - Grants access after payment

8. **`video_progress`** ✅ Already exists
   - Tracks video unlocks

### Optional Tables (NOT needed for purchase flow):

- **`course_requests`** - Only used for admin-granted free access (optional feature)
- **`order_items`** - Only for shop products, NOT for courses

---

## Purchase Flow Steps

### Step 1: User Completes KYC
- User submits KYC form
- Admin verifies KYC (`status = 'verified'`)

### Step 2: User Accepts Terms & Conditions
- Modal appears after KYC submission
- User checks checkbox and clicks "Accept"
- Frontend calls API to save `terms_accepted_at` in `users` table

### Step 3: User Purchases Course
```
Frontend → POST /api/courses/:id/purchase
Backend checks:
  1. Course exists and is active
  2. User KYC is verified
  3. User has accepted terms (terms_accepted_at is set)
  4. User doesn't already have access
  
If all checks pass:
  - Creates order in `orders` table
  - Creates entry in `course_orders` table
  - Returns order_id
```

### Step 4: Payment Processing
```
Frontend → POST /api/payments/razorpay/order (with order_id)
Backend → Returns Razorpay order

User pays via Razorpay gateway
```

### Step 5: Payment Verification
```
Frontend → POST /api/payments/razorpay/verify
Backend:
  1. Verifies payment with Razorpay
  2. Marks order as paid
  3. Checks if order is in `course_orders` table
  4. If yes (course order):
     - Creates/updates `course_access` record
     - Unlocks all videos (creates `video_progress` records)
  5. If no (product order):
     - Grants digital entitlements (existing flow)
```

---

## API Endpoints

### 1. Accept Terms & Conditions
**POST** `/api/users/accept-terms`

**Authentication:** Required

**Request:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "message": "Terms and conditions accepted successfully"
}
```

### 2. Purchase Course
**POST** `/api/courses/:id/purchase`

**Authentication:** Required

**Request:**
- URL param: `id` (course ID)

**Response:**
```json
{
  "success": true,
  "data": {
    "order_id": "uuid"
  }
}
```

**Errors:**
- `403` - KYC not verified
- `403` - Terms not accepted
- `400` - Already has access
- `404` - Course not found

---

## Migration Files to Run

1. **Create `course_orders` table:**
   ```bash
   psql -d your_database -f backend/migrations/add_course_orders_table.sql
   ```

2. **Add `terms_accepted_at` to users table:**
   ```bash
   psql -d your_database -f backend/migrations/add_terms_acceptance_to_users.sql
   ```

Or both are already in `schema.sql` if creating fresh database.

---

## Backend Implementation Status

✅ **Completed:**
- `purchaseCourse()` endpoint checks KYC verification
- `purchaseCourse()` endpoint checks terms acceptance
- Payment verification handles course orders
- Schema updated with `course_orders` table
- Schema updated with `terms_accepted_at` column

⏳ **Still Needed:**
- API endpoint: `POST /api/users/accept-terms` (to save terms acceptance)
- Frontend: Call terms acceptance API after user accepts in modal

---

## Summary

**You only need these tables for course purchase:**
- ✅ `courses` - Course info
- ✅ `videos` - Course playlist
- ✅ `kyc_verifications` - KYC status
- ✅ `users` - User info + `terms_accepted_at`
- ✅ `orders` - Payment orders
- ✅ `course_orders` - Links orders to courses (NEW)
- ✅ `course_access` - Grants access after payment
- ✅ `video_progress` - Video unlocks

**You DON'T need:**
- ❌ `course_requests` - Only for admin grants (optional)
- ❌ `order_items` - Only for shop products

Your flow is correct! 🎯

