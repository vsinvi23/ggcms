---
title: "dbt Data Quality Tests: Generic, Singular, and Statistical Assertions"
description: "How dbt's generic tests, singular tests, and dbt-expectations statistical checks act as circuit breakers that stop bad data before it reaches production models."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "dbt"
  - "data-quality"
  - "data-testing"
  - "great-expectations"
  - "analytics-engineering"
---

# dbt Data Quality Tests: Generic, Singular, and Statistical Assertions

## The Problem: Silent Data Corruption

In modern ELT (Extract, Load, Transform) architectures, the extraction phase is often handled by automated tools (Fivetran, Airbyte) that blindly dump raw source data into a data warehouse (BigQuery, Snowflake).

Because the warehouse acts as a schema-on-read data lake, raw ingestion lacks the rigid integrity constraints (foreign keys, non-null enforcement) of traditional RDBMS systems. If an upstream API changes, or a source database allows a null value in a critical ID field, the pipeline does not break. Bad data silently propagates through SQL transformations, polluting downstream dashboards, financial reports, and machine learning models.

Silent data corruption is far more dangerous than a pipeline failure: a broken pipeline is noticed immediately, while bad data destroys trust in the data team over months.

## The Mental Model: Defensive Data Modeling

dbt (data build tool) treats SQL data transformation as software engineering. Just as application code requires unit tests, data models require continuous assertions about data quality.

dbt testing lets you declare expectations about the shape, constraints, and statistical properties of your data. These tests compile into SQL queries that run against the warehouse. If a query returns any rows, the test fails, halting the pipeline and alerting the team *before* business users see the corrupt data.

```text
[Raw Data] -> (dbt Transform) -> [Staging Model] -> (dbt Test Gate) -> [Prod Model]
                                                          |
                                                    (Fails & Alerts if Nulls found)
```

## 1. Generic Tests: The First Line of Defense

Generic tests are out-of-the-box assertions declared directly in `schema.yml` files. They require no SQL writing and cover most common data quality issues.

dbt ships with four core generic tests:

- **`unique`** — asserts the column has no duplicate values (vital for primary keys).
- **`not_null`** — asserts the column contains no null values.
- **`accepted_values`** — asserts a categorical column only contains defined values (e.g., `['active', 'pending', 'cancelled']`).
- **`relationships`** — enforces referential integrity: every ID in this column must exist as a primary key in another model.

```yaml
models:
  - name: stg_orders
    columns:
      - name: order_id
        tests:
          - unique
          - not_null
      - name: status
        tests:
          - accepted_values:
              values: ['placed', 'shipped', 'completed', 'returned']
      - name: customer_id
        tests:
          - relationships:
              to: ref('stg_customers')
              field: customer_id
```

## 2. Singular Tests: Custom Business Logic

Generic tests ensure structural integrity, but cannot validate complex business rules. For this, dbt uses **singular tests**: a `.sql` file saved in the `tests/` directory. The rule is simple — **write a query that selects failing records**. If the query returns zero rows, the test passes.

Example: a business rule requires that a shipped order has a shipping date, and the shipping date must be after the order placement date.

```sql
-- tests/assert_valid_shipping_dates.sql
SELECT
    order_id,
    order_date,
    ship_date
FROM {{ ref('stg_orders') }}
WHERE status = 'shipped'
  AND (ship_date IS NULL OR ship_date < order_date)
```

If any order violates this logic, the test query returns that row and the dbt pipeline halts.

## 3. Great Expectations: Statistical Data Profiling

Generic and singular tests are boolean assertions. Sometimes data quality requires statistical boundaries — for instance, asserting that `daily_revenue` does not deviate by more than 3 standard deviations from the historical mean, or that a column's values fall within a specific distribution.

The `dbt-expectations` package brings the Python Great Expectations library into dbt as extended generic tests.

```yaml
models:
  - name: fct_daily_sales
    columns:
      - name: total_revenue
        tests:
          - dbt_expectations.expect_column_values_to_be_between:
              min_value: 0
              max_value: 1000000
          - dbt_expectations.expect_column_quantile_values_to_be_between:
              quantile: 0.95
              min_value: 500
              max_value: 2000
```

## Pipeline Integration

Writing tests is useless unless they act as active circuit breakers. In production, the CI/CD pipeline should run `dbt build`, which executes models and their tests in topological order. If a staging table fails a `not_null` test, dbt immediately aborts the run, preventing downstream production models from being updated with corrupted data. This defensive posture guarantees the data warehouse remains a source of trustworthy truth.
