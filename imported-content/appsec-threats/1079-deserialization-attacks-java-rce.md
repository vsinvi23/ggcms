# Deserialization Attacks: How Java Object Streams Lead to Remote Code Execution

## The Problem: Arbitrary Instantiation and Gadget Injection

Distributed enterprise applications frequently serialize Java objects to send them over network boundaries, store session state in databases, or queue tasks. The default serialization mechanism provided by Java (`java.io.Serializable`) transforms in-memory object graphs into a compact, opaque binary representation. 

The security risk surfaces during deserialization when an application processes untrusted binary byte streams. The standard JVM method `ObjectInputStream.readObject()` does not simply reconstruct simple data structures; it instantiates classes, builds complex object graphs, and executes lifecycle callback methods—such as `readObject()`, `readResolve()`, or `validateObject()`—*before* the application executes any type casting or business-logic validation. If an attacker controls the byte stream, they can exploit these implicit callbacks to invoke a chain of utility classes (known as "gadgets") already present on the application's classpath, leading directly to Remote Code Execution (RCE).

## Architectural Flaw

The vulnerability stems from the JVM's design, which automatically resolves and instantiates any serializable class referenced in the input stream, provided it is available in the runtime classpath.

```text
[ Malicious Payload ] ---> [ Base64/Hex Decode ] ---> [ Binary Object Stream ]
                                                             |
                                                             v
                                                   [ ObjectInputStream ]
                                                             |
                                                             v
                                                 +-----------------------+
                                                 | Resolves & loads Class|
                                                 | Invokes readObject()  |
                                                 +-----------------------+
                                                             |
                                                             v
[ Chain of Gadgets (e.g., InvokerTransformer) ] <------------+
            |
            v
[ Runtime.getRuntime().exec() ] ---> [ System-Level Compromise ]
```

Because class-type validation happens *after* instantiation and callback execution, casting the deserialized object to an expected class (e.g., `(UserProfile) ois.readObject()`) does not prevent the attack. The exploit has already succeeded before the `ClassCastException` is thrown.

## The Exploit Mechanics: Gadget Chains and Magic Methods

A gadget chain is a sequence of class-method invocations where the input or behavior of one method is influenced by properties of the preceding object in the stream. By nesting serialized objects, an attacker can craft a chain of nested calls that begins with a standard deserialization entry point (like `readObject()`) and terminates in a dangerous sink (like reflection-based execution of system commands).

Common vulnerable libraries in Java classpaths include older versions of Apache Commons Collections, Spring, Groovy, and Hibernate.

### Vulnerable Implementation Example

The following code illustrates a REST API endpoint that incorrectly trusts user-controlled state passed in a HTTP request header:

```java
package com.serenya.api;

import java.io.ByteArrayInputStream;
import java.io.ObjectInputStream;
import java.util.Base64;
import javax.servlet.http.HttpServletRequest;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SessionController {

    @PostMapping("/api/v1/session/restore")
    public String restoreSession(HttpServletRequest request) {
        String sessionHeader = request.getHeader("X-Serialized-Session");
        if (sessionHeader == null || sessionHeader.isEmpty()) {
            return "Invalid Session";
        }

        try {
            // DANGER: Deserializing raw binary data sent directly by the client
            byte[] rawBytes = Base64.getDecoder().decode(sessionHeader);
            ByteArrayInputStream bais = new ByteArrayInputStream(rawBytes);
            ObjectInputStream ois = new ObjectInputStream(bais);

            // Exploit triggers inside readObject() prior to any cast operation
            UserSession session = (UserSession) ois.readObject();
            ois.close();

            return "Session restored for: " + session.getUsername();
        } catch (Exception e) {
            // Fallback error logging
            return "Failed to restore session: " + e.getMessage();
        }
    }
}
```

An attacker can use tools like `ysoserial` to construct a serialized stream payload containing a gadget chain targeting Commons Collections, base64-encode it, and send it as the `X-Serialized-Session` header to trigger an arbitrary operating system process on the host.

## Defenses and Hardening Strategies

### 1. Migrating to Safe Data Interchange Formats

The ultimate architectural solution is to completely eliminate Java native serialization from external-facing interfaces. Migrate communication protocols and persistence layers to text-based or schematized binary formats:

*   **JSON / XML:** Use structured text formats. If using Jackson, ensure polymorphic type handling (e.g., `enableDefaultTyping()`) is turned off, as misconfigured polymorphic typing creates similar deserialization gadget vulnerabilities.
*   **Protocol Buffers / Avro:** Highly efficient, schema-enforced serialization protocols that transmit only data, not instructions to construct complex behavior or arbitrary classes.

### 2. Look-Ahead Class Filtering (Allowlisting)

If legacy dependencies force the use of native serialization, you must implement look-ahead class validation. This ensures that the class being deserialized is checked *before* its instantiation or bytecode resolution occurs.

```java
package com.serenya.security;

import java.io.IOException;
import java.io.InputStream;
import java.io.ObjectInputStream;
import java.io.ObjectStreamClass;
import java.util.Set;
import java.util.HashSet;
import java.util.Arrays;

public class SecureObjectInputStream extends ObjectInputStream {

    // Define a strict, immutable allowlist of required model classes
    private static final Set<String> ALLOWED_CLASSES = new HashSet<>(Arrays.asList(
        "com.serenya.api.UserSession",
        "java.lang.String",
        "java.lang.Integer",
        "java.util.ArrayList"
    ));

    public SecureObjectInputStream(InputStream inputStream) throws IOException {
        super(inputStream);
    }

    @Override
    protected Class<?> resolveClass(ObjectStreamClass desc) throws IOException, ClassNotFoundException {
        // Intercept and evaluate the class name before JVM resolves it
        if (!ALLOWED_CLASSES.contains(desc.getName())) {
            throw new IOException("Blocked deserialization of unauthorized class: " + desc.getName());
        }
        return super.resolveClass(desc);
    }
}
```

Integrate this secure implementation into the endpoint:

```java
// Replace the standard ObjectInputStream with our look-ahead wrapper
SecureObjectInputStream sois = new SecureObjectInputStream(bais);
UserSession session = (UserSession) sois.readObject();
```

### 3. JEP 290 JVM-Level Filtering

For global defense across all libraries in the application, leverage JEP 290 (introduced in modern Java and backported to Java 8/7) to define runtime-level serialization filters.

Configure this filter in your JVM launch options to block dangerous namespaces and restrict resource usage:

```bash
java -Djdk.serialFilter="!org.apache.commons.collections.**;!com.sun.org.apache.xalan.**;maxdepth=15;maxrefs=500" -jar application.jar
```

Or configure the filter programmatically:

```java
ObjectInputFilter filter = ObjectInputFilter.Config.createFilter(
    "com.serenya.api.UserSession;java.base/*;!*" // Allow specific classes and JDK internals, reject all others
);
ObjectInputStream ois = new ObjectInputStream(bais);
ois.setObjectInputFilter(filter);
```

## Conclusion

Untrusted Java deserialization is a critical architectural vulnerability that allows arbitrary code execution by abusing classpath metadata and implicit callbacks. Mitigating this risk requires migrating away from native serialization toward safe formats like JSON or Protobuf. When native stream recovery is inevitable, developers must enforce look-ahead filtering via custom `ObjectInputStream` overrides or JEP 290 filters to ensure only expected, pre-validated classes are loaded into the runtime.
