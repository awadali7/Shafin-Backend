# KYC (Know Your Customer) Implementation

## Overview

The KYC system has been integrated into the course purchase approval process. Users must complete KYC verification before they can request access to courses.

## Database Changes

### New Table: `kyc_verifications`

Stores KYC information for each user with the following fields:
- Personal information: first_name, last_name, address
- Contact information: contact_number, whatsapp_number
- Documents: id_proof_url, profile_photo_url
- Status tracking: status (pending/verified/rejected), rejection_reason
- Verification tracking: verified_by, verified_at

### Updated Table: `notifications`

Added new notification types:
- `kyc_verified` - When KYC is approved
- `kyc_rejected` - When KYC is rejected

## API Endpoints

### User Endpoints (Authenticated)

#### POST `/api/kyc`
Submit or update KYC information.

**Request:**
- Method: POST
- Content-Type: multipart/form-data
- Body:
  - `first_name` (string, required)
  - `last_name` (string, required)
  - `address` (string, required)
  - `contact_number` (string, required)
  - `whatsapp_number` (string, required)
  - `id_proof` (file, required) - Image or PDF, max 10MB
  - `profile_photo` (file, required) - Image, max 10MB

**Response:**
```json
{
  "success": true,
  "message": "KYC information submitted successfully",
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "first_name": "John",
    "last_name": "Doe",
    "status": "pending",
    ...
  }
}
```

#### GET `/api/kyc/me`
Get current user's KYC status.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "status": "verified",
    "first_name": "John",
    ...
  }
}
```

### Admin Endpoints

#### GET `/api/kyc`
Get all KYC verifications (paginated).

**Query Parameters:**
- `status` (optional) - Filter by status: pending, verified, rejected
- `page` (optional, default: 1)
- `limit` (optional, default: 10)

#### GET `/api/kyc/:id`
Get specific KYC verification details.

#### PUT `/api/kyc/:id/verify`
Verify or reject KYC.

**Request:**
```json
{
  "status": "verified" | "rejected",
  "rejection_reason": "Reason text" // Required if status is "rejected"
}
```

## Course Request Flow

The course request process has been updated:

1. **User requests course access** → `POST /api/course-requests`
2. **System checks KYC status:**
   - If no KYC exists → Returns error: "KYC verification is required"
   - If KYC status is not "verified" → Returns error with current status
   - If KYC is verified → Request is created successfully

3. **Admin reviews request** → Can approve/reject as before
4. **User receives access** → If approved

## File Uploads

KYC documents are stored in:
- Directory: `backend/uploads/kyc/`
- Files are renamed with UUID to prevent conflicts
- Supported formats:
  - ID Proof: JPEG, PNG, WebP, PDF
  - Profile Photo: JPEG, PNG, WebP
- Maximum file size: 10MB per file

## Migration

To add KYC functionality to an existing database, run:

```bash
psql -U your_user -d elearning_db -f migrations/add_kyc_table.sql
```

Or use the migration script:
```bash
npm run db:migrate
```

## Business Logic

1. **One KYC per user**: Each user can have only one KYC record (enforced by UNIQUE constraint)
2. **Status flow**: pending → verified/rejected
3. **Resubmission**: Users can resubmit KYC if rejected or update pending KYC
4. **Verified KYC required**: Course requests are blocked until KYC is verified
5. **Notifications**: Users receive notifications when KYC is verified or rejected

## Frontend Integration Notes

When implementing the frontend:

1. **Check KYC status** before showing course request button:
   - Call `GET /api/kyc/me` to check status
   - If no KYC or status is not "verified", show KYC form instead

2. **KYC Form** should include:
   - Text fields: first_name, last_name, address, contact_number, whatsapp_number
   - File uploads: id_proof, profile_photo
   - Use `multipart/form-data` for submission

3. **Error handling**:
   - If course request fails with `requires_kyc: true`, redirect to KYC page
   - Show appropriate messages based on KYC status

4. **Admin panel**:
   - Show list of pending KYC verifications
   - Allow viewing documents and verifying/rejecting KYC

## Security Considerations

- File uploads are validated for type and size
- Files are stored outside web root (served via static middleware)
- Only authenticated users can submit KYC
- Only admins can verify/reject KYC
- User can only view their own KYC data

