# Razorpay Webhook Setup Guide

## Required Webhook Events to Activate

When setting up Razorpay webhooks in your Razorpay Dashboard, activate the following events:

### ✅ **Essential Events (Must Activate)**

1. **`payment.captured`** ⭐ **CRITICAL**
   - **Purpose**: Confirms successful payment capture
   - **Action**: Marks order as `paid` and grants digital product entitlements
   - **When**: Payment is successfully captured by Razorpay
   - **Priority**: **HIGHEST** - This is the primary event for successful payments

2. **`payment.failed`** ⭐ **CRITICAL**
   - **Purpose**: Notifies when payment fails
   - **Action**: Updates order status to `failed`
   - **When**: Payment attempt fails (insufficient funds, card declined, etc.)
   - **Priority**: **HIGH** - Important for order status tracking

3. **`order.paid`** ⭐ **RECOMMENDED**
   - **Purpose**: Alternative confirmation that order is paid
   - **Action**: Marks order as `paid` (backup to payment.captured)
   - **When**: Order payment is confirmed
   - **Priority**: **MEDIUM** - Provides redundancy for payment confirmation

### 🔄 **Optional Events (Recommended for Production)**

4. **`refund.created`**
   - **Purpose**: Track when refund is initiated
   - **Action**: Log refund initiation (future implementation)
   - **When**: Refund is created in Razorpay dashboard
   - **Priority**: **MEDIUM** - Useful for refund tracking

5. **`refund.processed`**
   - **Purpose**: Confirm refund completion
   - **Action**: Mark refund as completed (future implementation)
   - **When**: Refund is successfully processed
   - **Priority**: **MEDIUM** - Important for refund completion tracking

### 📋 **Optional Events (For Advanced Features)**

6. **`payment.authorized`**
   - **Purpose**: Payment authorized but not yet captured
   - **Action**: Can be used for pre-authorization tracking
   - **When**: Payment is authorized (before capture)
   - **Priority**: **LOW** - Only needed if using authorization flow

7. **`payment.dispute.created`**
   - **Purpose**: Chargeback/dispute initiated
   - **Action**: Alert admin about disputes
   - **When**: Customer initiates chargeback
   - **Priority**: **LOW** - For dispute management

8. **`payment.dispute.won`**
   - **Purpose**: Dispute resolved in your favor
   - **Action**: Mark dispute as won
   - **Priority**: **LOW** - For dispute tracking

9. **`payment.dispute.lost`**
   - **Purpose**: Dispute resolved against you
   - **Action**: Mark dispute as lost, may need to revoke entitlements
   - **Priority**: **LOW** - For dispute tracking

## Webhook Configuration

### Webhook URL
```
https://your-domain.com/api/payments/razorpay/webhook
```

For local development/testing:
```
https://your-ngrok-url.ngrok.io/api/payments/razorpay/webhook
```

### Webhook Secret
1. After creating the webhook in Razorpay Dashboard, copy the **Webhook Secret**
2. Add it to your backend `.env` file:
   ```env
   RAZORPAY_WEBHOOK_SECRET=your-webhook-secret-here
   ```

### Steps to Setup

1. **Login to Razorpay Dashboard**
   - Go to: https://dashboard.razorpay.com/

2. **Navigate to Webhooks**
   - Settings → Webhooks → Add New Webhook

3. **Configure Webhook**
   - **URL**: Your webhook endpoint URL
   - **Active Events**: Select the events listed above
   - **Secret**: Copy the generated secret (add to `.env`)

4. **Test Webhook**
   - Use Razorpay's webhook testing tool
   - Or create a test payment and verify webhook is received

## Minimum Required Events

For basic functionality, you **MUST** activate at minimum:

1. ✅ `payment.captured` - **REQUIRED**
2. ✅ `payment.failed` - **REQUIRED**

These two events are essential for proper order status management.

## Event Priority Summary

| Event | Priority | Required | Status |
|-------|----------|----------|--------|
| `payment.captured` | HIGHEST | ✅ Yes | Implemented |
| `payment.failed` | HIGH | ✅ Yes | Implemented |
| `order.paid` | MEDIUM | ⚠️ Recommended | Implemented |
| `refund.created` | MEDIUM | ❌ Optional | Placeholder |
| `refund.processed` | MEDIUM | ❌ Optional | Placeholder |
| `payment.authorized` | LOW | ❌ Optional | Not implemented |
| `payment.dispute.*` | LOW | ❌ Optional | Not implemented |

## Testing Webhooks Locally

For local development, use a tool like **ngrok** to expose your local server:

```bash
# Install ngrok
npm install -g ngrok

# Expose local port
ngrok http 5001

# Use the ngrok URL in Razorpay webhook configuration
```

## Security Notes

- ✅ Webhook signature verification is implemented
- ✅ Always verify webhook signatures using `RAZORPAY_WEBHOOK_SECRET`
- ✅ Use HTTPS for webhook URLs in production
- ✅ Never expose webhook secret in client-side code
- ✅ Log webhook events for debugging and audit trails

## Troubleshooting

### Webhook not receiving events
1. Check webhook URL is accessible (use ngrok for local)
2. Verify webhook secret matches in `.env`
3. Check server logs for errors
4. Verify events are activated in Razorpay dashboard

### Invalid signature errors
1. Ensure `RAZORPAY_WEBHOOK_SECRET` is correct
2. Verify webhook secret matches Razorpay dashboard
3. Check that webhook body is received as raw Buffer

### Order not updating
1. Check webhook is receiving events (check logs)
2. Verify order exists with matching `payment_reference`
3. Check database transaction logs
4. Verify event type is handled in webhook handler


