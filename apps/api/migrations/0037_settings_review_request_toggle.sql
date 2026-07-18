-- Kill switch for review-request emails, OFF by default.
-- WS-A ships this toggle so the Paramètres card is self-contained;
-- WS-D (reviews) consumes it in the cron enqueue logic.
INSERT INTO settings (key, value) VALUES
  ('email_review_request_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
