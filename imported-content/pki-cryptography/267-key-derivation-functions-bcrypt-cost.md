# bcrypt Cost Factors: Adaptive Key Stretching to Outpace Moore's Law

When designing authentication systems, developers must assume their database will eventually be breached. If passwords are plain text, the game is over. If they are hashed with fast algorithms like MD5 or SHA-256, the game is still over, just slightly delayed. Modern GPUs and ASICs can calculate billions of SHA-256 hashes per second, making offline dictionary and brute-force attacks trivial. 

To secure passwords, we need hashes that are intentionally, agonizingly slow. This is achieved through Key Derivation Functions (KDFs). Among the most robust and widely used is **bcrypt**, an algorithm featuring a built-in, tunable "cost factor" designed to adapt and outpace the relentless advance of hardware speeds predicted by Moore's Law.

## The Core Problem: Fast Hashes are a Liability

A general-purpose hash function (SHA-3) is designed for speed and efficiency—ideal for verifying large file downloads or indexing hash tables. 

Password hashing requires the exact opposite. When a user logs in, waiting 200 milliseconds to verify their password is imperceptible to the human, but mathematically catastrophic for an attacker. If a hash takes 0.2 seconds to compute, an attacker can only guess 5 passwords per second per CPU core. A dictionary attack containing 100 million passwords would take roughly 231 days to process for a single hash.

## Mental Model: The Cryptographic Labyrinth

Imagine a fast hash as a straight, 10-meter hallway. Anyone can run down it in seconds. 
Key stretching (like bcrypt) turns that hallway into a massive labyrinth. The user knows the path, but they still have to physically walk the 5 miles of twists and turns to reach the end (taking 200ms). An attacker trying to brute-force the labyrinth has to run those 5 miles for *every single guess*. The cost factor is the dial that dictates how many miles of labyrinth are added to the maze.

## The Mathematics of the bcrypt Cost Factor

Bcrypt is based on the Blowfish cipher. It utilizes an expensive key setup phase called `Eksblowfish` (Expensive Key Schedule Blowfish). 

The cost factor in bcrypt is a logarithmic scale, represented as an integer (usually between 10 and 14 in modern systems). The actual number of key expansion iterations performed by the algorithm is $2^{\text{cost}}$.

*   Cost `10`: $2^{10} = 1,024$ iterations.
*   Cost `11`: $2^{11} = 2,048$ iterations (twice as slow).
*   Cost `12`: $2^{12} = 4,096$ iterations (four times as slow).

Every time you increment the cost factor by 1, the time required to hash a password exactly doubles.

## Memory Hardness

Unlike simple loop iterations (e.g., PBKDF2), bcrypt is slightly *memory-hard*. The Blowfish key schedule constantly modifies a 4KB array of S-boxes and P-boxes in RAM. While 4KB seems negligible today, it is just large enough to prevent attackers from fitting thousands of bcrypt instances into the ultra-fast, tiny L1 caches of ASICs and FPGAs. This forces the attacker's hardware to constantly fetch from slower memory, crippling their parallel cracking throughput.

## Code Demonstration: Tuning and Verifying

When you generate a bcrypt hash, the cost factor is embedded directly into the resulting string, ensuring the verifier knows exactly how many iterations to run.

Format: `$2b$[cost]$[22-character salt][31-character hash]`

```javascript
// Node.js example using the 'bcrypt' library
const bcrypt = require('bcrypt');

const password = "correcthorsebatterystaple";
const costFactor = 12; // 2^12 iterations

// Hashing the password (Asynchronous to not block the event loop!)
bcrypt.hash(password, costFactor, function(err, hash) {
    console.log(hash); 
    // Example Output: 
    // $2b$12$R9h/cIPz0gi.URNNX3rubedAKRoQsIG97vVce.F6uT9N2VjR4bAji
    //  ^  ^  ^salt                   ^hash
    //  |  |
    // alg cost
});
```

## Future-Proofing: Rotating Cost Factors in Live Systems

As hardware gets faster, a cost factor of 12 today might be considered too fast in 2030. You cannot spontaneously re-hash passwords in your database because you do not know the plain text.

To upgrade security, your login endpoint must dynamically re-hash passwords *upon successful login*.

```javascript
// Pseudo-code for seamless cost factor upgrades
const CURRENT_COST = 14;

async function loginUser(email, plainTextPassword) {
    const user = await db.findUser(email);
    
    // 1. Verify against whatever cost factor is in the DB
    const isValid = await bcrypt.compare(plainTextPassword, user.passwordHash);
    
    if (isValid) {
        // 2. Check if the user's hash is using an outdated cost factor
        const userCost = parseInt(user.passwordHash.substring(4, 6), 10);
        
        if (userCost < CURRENT_COST) {
            // 3. User is present! We have the plain text right now. Re-hash it!
            const newHash = await bcrypt.hash(plainTextPassword, CURRENT_COST);
            await db.updateUserPassword(user.id, newHash);
        }
        
        return createSession(user);
    }
    throw new Error("Invalid credentials");
}
```

This passive migration strategy ensures that active users continually upgrade their security posture without requiring forced password resets, effectively allowing your application's security to scale alongside Moore's Law.
