-- Migration 004: Add description column to sections table
ALTER TABLE sections
    ADD COLUMN IF NOT EXISTS description TEXT;
