-- Operator-configurable review-request timing.
-- review_reminder_delay_days = 0 disables reminders.
-- review_suppression_months  = 0 disables per-guest suppression.
INSERT INTO settings (key, value) VALUES
  ('review_request_delay_days',  '0'),
  ('review_reminder_delay_days', '7'),
  ('review_suppression_months',  '6')
ON CONFLICT (key) DO NOTHING;
