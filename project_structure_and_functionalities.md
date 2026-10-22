# MealSetu Project Structure and Functionalities

## Overview
MealSetu is a meal subscription and delivery platform comprising:
- `backend/`: Express + MongoDB API server handling user subscriptions, orders, deliveries, invoices, wallet, and notifications (Socket.IO + FCM).
- `frontend/`: React + Vite web dashboard for vendors and admins (Delivery Management, Menu Planning, Cash Payments, etc.).
- `mealsetu_app/`: Flutter mobile application for customers and delivery partners/riders.

---

## Testing Delivery Locally

### 1. Geofence Configuration for Local Testing
- The rider delivery verification enforces GPS geofencing via `DELIVERY_GEOFENCE_METERS`.
- In production, deliveries require the rider to be within the delivery range (e.g., 50 meters).
- For local dev/testing environments, set `DELIVERY_GEOFENCE_METERS` in `backend/.env` to a large value (for example `100000` for 100km) and restart the backend.
- **Important:** The delivery controller reads `DELIVERY_GEOFENCE_METERS` at module load time. Never set this in production.

### 2. Date and Slot Semantics
- Orders placed after the daily slot cutoff (e.g. past dinner cutoff) have their `startDate` automatically computed for the next day via `computeSubscriptionDates` (`backend/utils/mealTimingUtils.js`).
- If an order begins tomorrow, it will not appear in today's batch or unbatched list.
- In the Vendor Portal **Delivery Management → Batches** tab, select the date corresponding to the order's start date (e.g., tomorrow's date) or click the **"Go to <date> →"** button in the explanation banner to switch to that date.
- Queued subscription plans (starting after an active trial ends) have status `pending` until their activation date, when the activation cron flips them to `active`.

### 3. Step-by-Step Manual Test Workflow
1. **Prepare Orders (Local Dev Only):**
   ```bash
   # Dry-run inspection:
   node scripts/devPrepareDeliveryTest.js --phone=9157759250
   # Apply test dates for today:
   node scripts/devPrepareDeliveryTest.js --phone=9157759250 --apply --date=YYYY-MM-DD
   ```
2. **Batching & Balanced Auto-Assignment:**
   - In Vendor Portal → Delivery Management → Batches tab, select the target Date and Slot (e.g. Dinner).
   - The **Unbatched Orders** panel displays eligible orders and indicates GPS status.
   - Click **Auto-Create Batches** with "Auto (Balanced)". The least-loaded rider (e.g., Rehan if Mujju already has orders) will be assigned.
3. **Per-Order Reassignment:**
   - In the expanded batch card, use the **"Move stop to…"** dropdown to move any individual uncompleted stop between riders.
   - Alternatively, select orders in the **Unbatched Orders** table and use bulk assignment.
4. **Rider App & Cash Collection Flow:**
   - In the rider app, refresh or receive the assigned batch.
   - Complete delivery with cash collection: the checkbox records rider confirmation, updates the Vendor Cash Payments tab in real-time, and unlocks invoice download for the customer.
