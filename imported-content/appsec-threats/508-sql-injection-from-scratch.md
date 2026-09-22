# SQL Injection from Scratch: Exploitation and Defense

## The Problem: Treating Data as Code
SQL Injection (SQLi) is arguably the oldest and most devastating web vulnerability. It occurs when an application takes user input and concatenates it directly into a database query. The database engine cannot distinguish between the developer's intended command and the attacker's injected command.

## The Vulnerable Code

```javascript
// Node.js / Express vulnerable endpoint
app.get('/users', (req, res) => {
    const username = req.query.username;
    // DANGER: String concatenation
    const query = `SELECT id, email, role FROM users WHERE username = '${username}'`;
    
    db.query(query, (err, results) => {
        res.json(results);
    });
});
```

If the user searches for `alice`, the query is:
`SELECT id, email, role FROM users WHERE username = 'alice'`

## Type 1: Authentication Bypass (The Classic)
The attacker wants to log in as the first user in the database (usually the admin). They input:
`admin' OR '1'='1`

The query becomes:
`SELECT id, email, role FROM users WHERE username = 'admin' OR '1'='1'`

Since `'1'='1'` is always true, the WHERE clause evaluates to true for every row. The application logs the attacker in as the first returned user.

## Type 2: UNION-Based SQLi (Data Exfiltration)
The attacker wants to steal data from another table, for example, the `passwords` table. They use the `UNION` operator to append the results of a second query to the first.

They input:
`' UNION SELECT id, password, 'static' FROM passwords --`

The query becomes:
```sql
SELECT id, email, role FROM users WHERE username = '' 
UNION 
SELECT id, password, 'static' FROM passwords --'
```

*Note:* A UNION attack requires the injected query to have the exact same number of columns and compatible data types as the original query. The attacker uses `'static'` to pad the columns.

## Type 3: Blind SQL Injection
What if the application doesn't return the database output to the screen? What if it just says "User exists" or "User does not exist"?
The attacker can ask the database true/false questions.

Input: `admin' AND substring(version(), 1, 1) = '5' --`
If the page says "User exists", the attacker knows the database version starts with 5. They repeat this to extract the entire database, character by character.

## The Defense: Parameterized Queries
Sanitizing input (escaping quotes) is a flawed defense. The only robust defense is Parameterized Queries (Prepared Statements).

Instead of concatenating strings, you send the query structure and the data separately to the database engine.

```javascript
// Secure Code
app.get('/users', (req, res) => {
    const username = req.query.username;
    
    // The ? is a placeholder. The database treats it STRICTLY as data.
    const query = `SELECT id, email, role FROM users WHERE username = ?`;
    
    db.query(query, [username], (err, results) => {
        res.json(results);
    });
});
```
If the attacker inputs `admin' OR '1'='1`, the database looks for a user whose literal username is the string `"admin' OR '1'='1"`. The attack fails.
