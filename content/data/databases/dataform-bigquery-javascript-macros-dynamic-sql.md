---
title: "Dataform on BigQuery: Dynamic SQL Generation with JavaScript Macros"
description: "How Dataform's compile-time JavaScript blocks, includes/ helper files, and the ref() DAG integration eliminate repetitive SQL boilerplate without breaking lineage."
type: "ARTICLE"
categorySlug: "databases"
articleType: "GUIDE"
tags:
  - "dataform"
  - "bigquery"
  - "javascript-macros"
  - "sqlx"
  - "data-engineering"
---

# Dataform on BigQuery: Dynamic SQL Generation with JavaScript Macros

## The Repetitive SQL Boilerplate Problem

Enterprise data warehouses frequently manage repetitive SQL transformation patterns. A global retail business might need distinct, aggregated sales-reporting tables across fifty different country codes; a SaaS company might need identical anonymization masks applied across hundreds of customer tables.

Writing separate, static SQL queries for each variation leads to severe code duplication. A simple schema adjustment requires updating dozens of near-identical files, inviting human error and configuration drift.

Standard BigQuery SQL has no native dynamic loops or general-purpose programming constructs to generate tables programmatically at compile time. Data engineers are often forced into external bash or Python scripts to template and execute these queries — which breaks dependency tracking and lineage.

## Mental Model: Compile-Time JavaScript Metaprogramming

Dataform extends SQL with SQLX, which allows JavaScript to be embedded directly inside SQL files.

```text
+------------------------------------+
|  SQLX Source (SQL + JS Loop Block) |
+------------------------------------+
                  |
                  v (Dataform Compiler Executes JavaScript)
+------------------------------------+
| Dynamic SQL Compilation (AST)      |
+------------------------------------+
                  |
                  v (Generated Declarative SQL Queries)
+------------------------------------+
|  BigQuery (Executes Vanilla SQL)   |
+------------------------------------+
```

The Dataform compiler runs the JavaScript blocks first, compiling the logic into standard, static SQL Abstract Syntax Trees that BigQuery then executes. This gives full program control over SQL generation while preserving data lineage and execution safety.

## Compilation Internals

A Dataform compilation pipeline runs in two distinct phases:

1. **Compilation phase.** Dataform executes the project's JavaScript on a Node.js runtime: it reads configurations, resolves cross-table dependencies, executes loops, and generates the raw SQL. It never touches BigQuery or reads actual table data.
2. **Execution phase.** The generated SQL queries are packaged into transactions and sent to BigQuery for execution.

### Dynamic Generation with `includes/`

To scale dynamic logic across the warehouse, Dataform supports global helper files under `includes/`. Any function defined in `includes/helpers.js` is automatically importable across all SQLX files in the project — a natural place to centralize shared business rules and loop iterations.

### Compile-Time Graph Integration and Lineage

A key benefit of Dataform's compiler-driven model is dependency resolution. In naive templating approaches, dynamically generated tables often get orphaned from the execution tree. In Dataform, the `ref()` function registers dynamically referenced tables directly into the compilation AST. When the compiler evaluates:

```javascript
FROM ${ref("raw_sales_" + country.toLowerCase())}
```

it registers an explicit dependency edge in the project's DAG — ensuring BigQuery executes the upstream, per-country raw tables before the consolidated reporting table, avoiding race conditions.

### Dynamic Assertion Generation

Validation logic can also be injected programmatically. Instead of writing separate quality tests for every country-specific table, assertions can be declared directly inside JavaScript loops — injecting row-count and primary-key checks for every dynamically compiled partition, so data quality checks scale alongside the transformations.

## SQLX Implementation and Macro Generation

### 1. Global Helper (`includes/countries.js`)

```javascript
// Define a reusable array of countries to iterate over
const activeCountries = ["US", "GB", "DE", "FR", "JP"];
module.exports = { activeCountries };
```

### 2. Compiled SQLX Model (`definitions/country_sales_summary.sqlx`)

```sql
config {
  type: "table",
  description: "Consolidated sales performance aggregated across active countries",
  tags: ["sales", "daily"]
}

js {
  // Import the country list from our global includes helper
  const { activeCountries } = countries;
}

-- Generate a dynamically union-ed query at compile-time
${activeCountries.map(country => `
SELECT
  '${country}' as country_code,
  DATE(sale_timestamp) as sale_date,
  COUNT(transaction_id) as total_transactions,
  SUM(order_value_usd) as gross_revenue
FROM ${ref("raw_sales_" + country.toLowerCase())}
GROUP BY 1, 2
`).join("\nUNION ALL\n")}
```

When Dataform compiles this `.sqlx` file, it iterates over the `activeCountries` array and generates five independent, fully qualified `SELECT` statements joined by `UNION ALL`. Adding a country to `countries.js` scales the pipeline automatically, with no change required to the core transformation logic.

## Conclusion

JavaScript macros in Dataform turn repetitive SQL generation into a metaprogramming problem solved at compile time, not runtime. Because the compiler runs entirely before BigQuery ever sees a query, and because `ref()` still registers every dynamically generated table into the DAG, teams get the flexibility of a general-purpose language without sacrificing dependency tracking, lineage, or the safety of static, reviewable SQL execution.
