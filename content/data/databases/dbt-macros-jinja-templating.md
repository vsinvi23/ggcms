---
title: "dbt Jinja Templating: Writing Reusable SQL Macros"
description: "How dbt's Jinja compilation model turns SQL into a templated language, enabling reusable macros, for-loops for dynamic pivoting, and environment-aware logic."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "dbt"
  - "jinja"
  - "sql-macros"
  - "data-engineering"
  - "analytics-engineering"
---

# dbt Jinja Templating: Writing Reusable SQL Macros

## The Problem: The WET Code Crisis in Data Engineering

SQL is a powerful, declarative language for querying and transforming data. But it lacks the standard programming constructs needed for software engineering best practices — specifically, abstraction and reuse.

In traditional data warehouses, analysts write "WET" (Write Everything Twice) code. If "Net Revenue" is calculated by subtracting taxes, discounts, and refunds from gross sales, that exact arithmetic block might be copy-pasted across fifty different views. When finance changes the definition of Net Revenue, an engineer must hunt down and manually update all fifty scripts — massive technical debt and silent data quality risk.

dbt (data build tool) solves this by treating SQL not as static code, but as a dynamic template. By injecting the **Jinja** templating engine into SQL, dbt enables programmatic logic, loops, and reusable functions known as **macros**.

## The Mental Model: The Compiler Before the Database

```text
[ dbt Project (Jinja + SQL) ]
          │
      (Step 1: dbt compiles the Jinja)
          ▼
[ Pure SQL String ]
          │
      (Step 2: dbt executes SQL against Warehouse)
          ▼
[ Snowflake / BigQuery / Redshift ]
```

When you run `dbt run`, the data warehouse never sees the Jinja code. dbt's compiler processes all `{% if %}`, `{% for %}`, and `{{ macro() }}` blocks locally, rendering them into a single valid SQL string. That compiled string is what gets executed.

## Building Your First Macro

A macro in dbt is analogous to a function in Python. Define it once in the `macros/` directory and call it anywhere in your models.

### Problem: Currency Conversion

Multiple tables store values in USD and need converting to EUR at a static exchange rate, rounded to two decimal places.

**Macro definition (`macros/cents_to_dollars.sql`)**

```jinja
{% macro convert_currency(column_name, exchange_rate) %}
    ROUND( ({{ column_name }} * {{ exchange_rate }}), 2)
{% endmacro %}
```

**Model usage (`models/sales.sql`)**

```sql
SELECT
    order_id,
    customer_id,
    {{ convert_currency('gross_revenue', 0.85) }} AS revenue_eur,
    {{ convert_currency('tax_amount', 0.85) }} AS tax_eur
FROM {{ ref('stg_orders') }}
```

During compilation, dbt evaluates the macro and outputs raw SQL:

```sql
SELECT
    order_id, customer_id,
    ROUND( (gross_revenue * 0.85), 2) AS revenue_eur,
    ROUND( (tax_amount * 0.85), 2) AS tax_eur
FROM my_db.staging.stg_orders
```

## Advanced Control Structures

Jinja's power shines when automating repetitive SQL tasks, such as generating pivot tables or dynamically building `UNION ALL` statements.

### Dynamic Pivoting with For Loops

SQL pivoting traditionally requires typing out every `CASE WHEN` statement by hand. Jinja can automate this.

```jinja
{% set payment_methods = ['credit_card', 'bank_transfer', 'paypal', 'gift_card'] %}

SELECT
    order_date,
    {% for method in payment_methods %}
    SUM(CASE WHEN payment_method = '{{ method }}' THEN amount ELSE 0 END) AS {{ method }}_amount
    {% if not loop.last %},{% endif %}
    {% endfor %}
FROM {{ ref('stg_payments') }}
GROUP BY 1
```

The `loop` context variable (`loop.last`) lets Jinja track iteration state, so commas are appended only when necessary — preventing trailing-comma SQL syntax errors.

## Context Objects: `target` and `run_query()`

Macros can do more than generate strings; they can interact with the environment and the database itself.

- **`target.name`** — alter logic based on the deployment environment. For example, `{% if target.name == 'dev' %} LIMIT 100 {% endif %}` keeps development runs fast and cheap by processing only a subset of data.
- **`run_query()`** — execute SQL during the compilation phase to fetch data *before* writing the final query. Instead of hardcoding `payment_methods` in the pivot example above, `run_query('SELECT DISTINCT payment_method FROM...')` dynamically fetches the columns from the database, producing a pivot table that adapts as new payment methods appear.

## Conclusion

By bridging functional programming and declarative SQL, dbt's Jinja templating fundamentally changes data engineering workflows. Macros eliminate WET code, enforce DRY principles, and let teams build centralized, tested libraries of business logic — the defining step in moving from writing analyst scripts to building resilient data software.
