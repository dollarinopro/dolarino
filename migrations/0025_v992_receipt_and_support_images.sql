-- Dollarino v9.9.2: Support chat image attachments & subscription payment receipt photos

ALTER TABLE support_messages ADD COLUMN image_data_url TEXT;
ALTER TABLE user_subscriptions ADD COLUMN receipt_image_url TEXT;
