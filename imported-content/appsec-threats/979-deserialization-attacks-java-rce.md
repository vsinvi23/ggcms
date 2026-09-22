# Deserialization Attacks: How Java Object Streams Lead to Remote Code Execution

## The Problem: Trusting Opaque Binary Blobs

In distributed systems, moving objects across network boundaries or persisting them to disk requires transforming in-memory state into a byte stream—a process known as serialization. The reverse process, deserialization, reconstructs the object. 

The security crisis arises when applications deserialize untrusted data without validation. In Java, the `ObjectInputStream.readObject()` method is notoriously dangerous. It instantiates objects and executes their `readObject`, `readResolve`, and constructor methods *before* any type casting or business-logic validation occurs. If an attacker controls the serialized stream, they can supply a chain of gadget classes—classes available in the application's classpath (e.g., from libraries like Commons Collections, Spring, or Groovy)—to achieve Remote Code Execution (RCE).

## Architectural Flaw

When untrusted input is deserialized, the JVM reconstructs the object graph based on the class metadata embedded in the stream. 

```text
[ Attacker payload ] ---> (Base64 Decode) ---> [ Serialized Byte Stream ]
                                                      |
                                                      v
                                            [ ObjectInputStream ]
                                                      |
                                                      v
                                        +---------------------------+
                                        |  JVM Instantiates Classes |
                                        |  Invokes readObject()     |
                                        +---------------------------+
                                                      |
                                                      v
[ Magic Gadget Chain (e.g., InvokerTransformer) ] <---+
            |
            v
[ Runtime.exec("calc.exe") ] ---> RCE
```

Because the JVM resolves classes based on the stream's instructions, an attacker isn't limited to the expected class type. They can inject any class present in the classpath that implements `java.io.Serializable`.

## The Exploit Mechanics: Gadget Chains

A "gadget" is a class with a magic method (like `readObject`) that performs an unsafe operation (like reflection, file I/O, or executing a command) using data provided in the serialized stream. Attackers chain these gadgets together so that the output of one feeds into the input of another, ultimately leading to RCE.

A classic example involves `AnnotationInvocationHandler` and `InvokerTransformer` from older versions of Apache Commons Collections. 

### Vulnerable Code Example

```java
import java.io.ByteArrayInputStream;
import java.io.ObjectInputStream;
import java.util.Base64;
import javax.servlet.http.HttpServletRequest;
import javax.ws.rs.POST;
import javax.ws.rs.Path;

@Path("/api")
public class UserEndpoint {

    @POST
    @Path("/updateProfile")
    public String updateProfile(HttpServletRequest request) {
        try {
            // DANGER: Reading untrusted base64 string from header
            String payload = request.getHeader("X-Profile-State");
            byte[] data = Base64.getDecoder().decode(payload);
            
            ByteArrayInputStream bais = new ByteArrayInputStream(data);
            ObjectInputStream ois = new ObjectInputStream(bais);
            
            // The vulnerability triggers HERE, before the cast
            UserProfile profile = (UserProfile) ois.readObject(); 
            
            return "Profile updated for: " + profile.getName();
        } catch (Exception e) {
            return "Error";
        }
    }
}
```

In the code above, casting to `UserProfile` provides zero protection. The JVM executes the gadget chain during the `readObject()` call, and RCE occurs before a `ClassCastException` can be thrown.

## Defenses and Hardening Strategies

Mitigating deserialization vulnerabilities requires defense-in-depth, prioritizing architectural changes over patch-and-pray methodologies.

### 1. Architectural Shift: Abandon Native Serialization

The most robust defense is to stop using Java's native serialization entirely. Migrate to data-centric formats like JSON, XML, or Protocol Buffers. 

*   **JSON (Jackson/Gson):** Safe by default, provided polymorphic type handling (e.g., `@JsonTypeInfo` or `enableDefaultTyping()`) is explicitly restricted or disabled.
*   **Protocol Buffers (protobuf):** Inherently safer as they enforce strict schemas and do not serialize behavior or arbitrary types.

### 2. Look-Ahead Object Input Streams (Allowlisting)

If migrating away from native serialization is impossible, you must implement a custom `ObjectInputStream` that enforces a strict allowlist of permitted classes. Do not use blocklists; they are inherently incomplete and easily bypassed as new gadgets are discovered.

```java
import java.io.IOException;
import java.io.InputStream;
import java.io.ObjectInputStream;
import java.io.ObjectStreamClass;
import java.util.Set;
import java.util.HashSet;
import java.util.Arrays;

public class SecureObjectInputStream extends ObjectInputStream {
    
    // Strict allowlist of expected classes
    private static final Set<String> ALLOWLIST = new HashSet<>(Arrays.asList(
        "com.serenya.models.UserProfile",
        "java.lang.String",
        "java.util.ArrayList",
        "java.lang.Number"
    ));

    public SecureObjectInputStream(InputStream in) throws IOException {
        super(in);
    }

    @Override
    protected Class<?> resolveClass(ObjectStreamClass desc) throws IOException, ClassNotFoundException {
        if (!ALLOWLIST.contains(desc.getName())) {
            // Fail fast and loudly
            throw new java.io.InvalidClassException("Unauthorized deserialization attempt of class: " + desc.getName());
        }
        return super.resolveClass(desc);
    }
}
```

Usage replaces the standard `ObjectInputStream`:

```java
// ... inside the handler
ByteArrayInputStream bais = new ByteArrayInputStream(data);
// Use the custom stream
SecureObjectInputStream sois = new SecureObjectInputStream(bais); 
UserProfile profile = (UserProfile) sois.readObject(); 
```

### 3. JEP 290: JDK-Level Filtering

Starting with Java 9 (and backported to 8u121, 7u131, 6u141), JEP 290 introduced a standard mechanism to filter incoming object streams globally or contextually.

You can set a global filter via JVM properties to block known malicious namespaces:

```bash
java -Djdk.serialFilter="!org.apache.commons.collections.functors.**;!com.sun.org.apache.xalan.internal.xsltc.trax.**;maxdepth=100" -jar app.jar
```

Or programmatically in newer Java versions (Java 17+ pattern):

```java
ObjectInputFilter filter = ObjectInputFilter.Config.createFilter(
    "com.serenya.models.*;java.base/*;!*" // Allow specific, reject all else
);
ObjectInputStream ois = new ObjectInputStream(bais);
ois.setObjectInputFilter(filter);
UserProfile profile = (UserProfile) ois.readObject();
```

## Conclusion

Java deserialization remains a high-severity threat because it subverts application logic by manipulating the runtime environment's instantiation mechanisms. Relying on class casting is a common fallacy. Security engineers must enforce structural data formats (JSON/Protobuf) or implement rigorous, allowlist-based look-ahead filtering to neutralize deserialization RCE vectors.
