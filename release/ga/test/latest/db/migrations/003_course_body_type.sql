-- Migration 003: Add body and course_type columns to courses table
-- Run: psql $DATABASE_URL -f migrations/postgres/003_course_body_type.sql

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS body TEXT,
    ADD COLUMN IF NOT EXISTS course_type VARCHAR(30) NOT NULL DEFAULT 'STANDARD';
