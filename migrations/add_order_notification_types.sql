-- Add order notification types to notifications table
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
    CHECK (type IN (
        'course_access_granted',
        'multiple_device_login',
        'announcement',
        'course_request_approved',
        'course_request_rejected',
        'system_update',
        'kyc_verified',
        'kyc_rejected',
        'product_kyc_verified',
        'product_kyc_rejected',
        'order_paid',
        'order_shipped',
        'order_dispatched',
        'order_delivered',
        'order_cancelled',
        'order_refunded',
        'order_status_updated'
    ));
