# Dataform on BigQuery: Declarative SQLX Pipeline Engineering

## The Problem: The SQL Spaghetti Monster
In the early days of a data warehouse, building a pipeline usually means writing a few cron jobs that execute massive, hundreds-of-lines-long SQL scripts. 

As the team grows, this turns into a "SQL Spaghetti Monster." Dependencies become invisible. If the `users` table needs to be updated before the `daily_active_users_report` view is refreshed, you have to manually hardcode that sequence in an orchestrator like Airflow. Testing is non-existent, and documentation lives in a disconnected Confluence page. 

How can we bring software engineering best practices (version control, dependency management, automated testing) to raw SQL transformations?

## The Solution: Declarative SQLX with Dataform
Dataform (now natively integrated into Google Cloud's BigQuery) solves this by introducing `SQLX`, an open-source extension of SQL. 

Instead of writing imperative scripts that tell the database *how* to build tables, you write declarative `.sqlx` files that describe *what* the final table should look like. Dataform parses these files, automatically infers the dependency graph (DAG), and handles the underlying `CREATE TABLE`, `MERGE`, or `DROP` statements in BigQuery.

### Mental Model: The Data Compiler
Think of Dataform as a compiler for your data warehouse. You write source code (SQLX). Dataform compiles it into an executable build plan (the DAG). It then executes that plan against the target environment (BigQuery), ensuring that everything runs in the correct order.

```text
[ user_events.sqlx ]      [ sales_data.sqlx ]
        \                        /
         \  (ref() macro)       /
          v                    v
       [ weekly_reporting.sqlx ]
                  |
             (Dataform)
                  |
        [ BigQuery Execution ]
```

## Deep Dive: The SQLX Anatomy

A standard `.sqlx` file has two parts: a configuration block (written in JavaScript object syntax) and the core SQL statement.

### 1. The Configuration Block
The config block defines metadata, materialization strategy, and data quality assertions.

```sqlx
config {
  type: "table", // Can be 'view', 'table', 'incremental'
  schema: "reporting_dataset",
  name: "daily_revenue",
  description: "Aggregated daily revenue from all completed orders.",
  tags: ["finance", "daily"],
  assertions: {
    uniqueKey: ["date", "region"],
    nonNull: ["total_revenue"]
  }
}
```

### 2. The Ref() Macro: Building the DAG
The true power of SQLX is the `ref()` function. Instead of hardcoding BigQuery table names (e.g., `FROM my_project.raw_data.orders`), you reference the name of another `.sqlx` file.

```sqlx
SELECT
  DATE(order_timestamp) AS date,
  region,
  SUM(amount) AS total_revenue
FROM ${ref("cleaned_orders")} -- Creates a dependency!
WHERE status = 'COMPLETED'
GROUP BY 1, 2
```

When Dataform compiles this project, it sees that `daily_revenue.sqlx` depends on `cleaned_orders.sqlx`. It guarantees that `cleaned_orders` finishes building successfully before it even attempts to start building `daily_revenue`.

## Built-in Data Quality Testing
In the config block above, we added `assertions`. Dataform will automatically compile and run SQL tests alongside the pipeline. 
If the `uniqueKey` test fails (meaning duplicate rows exist), Dataform can halt downstream execution, preventing bad data from reaching the BI dashboards.

Custom assertions can also be written in their own `.sqlx` files:
```sqlx
config { type: "assertion" }

-- This query should return zero rows. If it returns >0, the test fails.
SELECT order_id 
FROM ${ref("cleaned_orders")} 
WHERE amount < 0
```

## Environments and CI/CD
Because Dataform projects are just directories of text files, they live in Git. 
Through `dataform.json` and workspace configurations, you can easily define multiple environments. 
- A developer working on a feature branch compiles their SQLX to a temporary dataset: `dev_alice.daily_revenue`.
- When merged to `main`, the CI/CD pipeline compiles and executes the code against `production.daily_revenue`.

## Conclusion
Dataform transforms data engineering on BigQuery from a chaotic scripting exercise into a disciplined, software-engineering workflow. By adopting declarative SQLX, data teams get automated dependency management, native data quality testing, and seamless CI/CD integration, allowing them to scale their warehouse complexity without scaling their operational headaches.
