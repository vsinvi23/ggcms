# Dataform on BigQuery: Injecting Dynamic Logic and Loops via Javascript Blocks

## The Repetitive SQL Boilerplate Problem
Enterprise data warehouses frequently manage repetitive SQL transformation patterns. For example, a global retail business might need to generate distinct, aggregated sales reporting tables across fifty different country codes, or a SaaS company might need to apply identical anonymization masks across hundreds of customer tables.

Writing separate, static SQL queries for each of these variations leads to severe code duplication. A simple schema adjustment requires updating dozens of identical files, introducing human-error and configuration drift. 

Standard BigQuery SQL lacks native dynamic loops or general-purpose programming constructs to generate tables programmatically at compile time. Data engineers are often forced to write complex, unmaintainable external bash or Python scripts to template and execute these queries, which breaks dependency tracking and lineage.

## Mental Model: Compile-Time JavaScript Metaprogramming
Dataform, a serverless data transformation tool integrated into Google Cloud's BigQuery, solves this by extending SQL with SQLX. SQLX allows developers to embed JavaScript directly inside SQL files. 

```
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

The Dataform compiler runs the JavaScript blocks first, compiling the logic into standard, static SQL Abstract Syntax Trees (AST) that BigQuery then executes. This provides full program control over SQL generation while preserving data lineage and execution safety.

## Deep Compilation Internals
A Dataform compilation pipeline executes in two distinct environments:

1. **The Compilation Phase**: Dataform executes the project's JavaScript code on a Node.js runtime. This step reads the configurations, resolves cross-table dependencies, executes loops, and generates the raw SQL files. It does not touch BigQuery or read actual table data.
2. **The Execution Phase**: The generated SQL queries are packaged into transactions and sent to BigQuery for execution.

### Dynamic Generation with the includes/ Directory
To scale dynamic logic across your warehouse, Dataform supports global helper files in the `includes/` folder. Any JavaScript function defined in `includes/helpers.js` is automatically imported and accessible across all SQLX files in the project. This allows you to centralize key business rules and loop iterations.

### Compile-Time Graph Integration and Lineage
A key benefit of Dataform's compiler-driven model is dependency resolution. In standard templating languages, generating tables dynamically often orphans them from the execution tree. In Dataform, the `ref()` function registers dynamically referenced tables directly into the compilation AST. When the compiler evaluates:
`FROM ${ref("raw_sales_" + country.toLowerCase())}`
it registers an explicit dependency edge in the project's Directed Acyclic Graph (DAG). This ensures that BigQuery executes the upstream raw country tables before attempting to run the consolidated reporting table, avoiding race conditions.

### Dynamic Assertion Generation
Furthermore, you can inject validation logic programmatically. Instead of writing separate quality tests for every country-specific table, Dataform allows developers to declare assertions directly within JavaScript loops. This injects automated row-count and primary key checks for every dynamically compiled partition, ensuring data quality checks scale seamlessly alongside your transformations.

## SQLX Implementation and Macro Generation
Below is a complete SQLX script that uses a JavaScript block and a loop to dynamically generate a reporting table:

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

When Dataform compiles this `.sqlx` file, it iterates over the `activeCountries` array and generates five independent, fully qualified `SELECT` statements joined by `UNION ALL`. If you add a country to `countries.js`, Dataform automatically scales the pipeline without changing a single line of your core transformation code.
