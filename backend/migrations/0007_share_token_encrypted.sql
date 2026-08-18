-- 0007_share_token_encrypted.sql

ALTER TABLE shares
    ADD COLUMN token_encrypted TEXT;