# Deserialization Attacks: How Java Object Streams Lead to Remote Code Execution

## The Problem: Implicit Trust in Object State

Java's native serialization mechanism allows developers to convert in-memory object graphs into a byte stream (typically identified by the magic bytes `AC ED 00 05`) and reconstruct them later via `ObjectInputStream.readObject()`. The fundamental architectural flaw in this design is that the class type and object state are dictated entirely by the byte stream itself, not by the receiving application. 

When an application deserializes untrusted data, the JVM eagerly instantiates the objects specified in the stream and populates their fields before any application-level type checking occurs. If an attacker controls the serialized stream, they can supply objects of *any* class available on the JVM classpath.

## The Mechanics: Gadget Chains and Magic Methods

An attacker cannot simply inject an arbitrary Java class into the stream; the class must already exist on the target's classpath. Instead, they leverage "gadget chains"—sequences of existing classes (e.g., from libraries like Apache Commons Collections, Spring, or the JDK itself) that chain together to achieve Remote Code Execution (RCE).

The execution trigger relies on "magic methods"—methods invoked automatically during the deserialization process, such as:
- `readObject()`
- `hashCode()`
- `equals()`
- `finalize()`

### Architectural Flow of an RCE Payload

```text
[ Attacker ] ---> (Serialized Payload: AC ED 00 05 ...) ---> [ Target JVM ]
                                                                  |
                                                                  v
                                                     ObjectInputStream.readObject()
                                                                  |
                                                                  v
                                              Instantiates: PriorityQueue (Gadget 1)
                                                                  |
                                                                  v
                                                 PriorityQueue.readObject() calls
                                                 PriorityQueue.heapify()
                                                                  |
                                                                  v
                                              Instantiates: TransformingComparator (Gadget 2)
                                                                  |
                                                                  v
                                              InvokerTransformer.transform() (Gadget 3)
                                                                  |
                                                                  v
                                                  java.lang.Runtime.exec("calc.exe")
```

When the target JVM processes the stream, the internal operations of the `PriorityQueue` force the `InvokerTransformer` to execute arbitrary shell commands via reflection. This happens *before* the application casts the returned object to the expected type.

## The Solution: Look-Ahead Deserialization and Data-Centric Formats

The only foolproof defense against native Java deserialization vulnerabilities is to avoid it entirely. Modern applications should use data-centric formats (JSON, Protobuf, gRPC) where structure and data are separated, and execution semantics are not embedded.

If legacy architecture dictates the use of `ObjectInputStream`, you must implement **Look-Ahead Deserialization**. This technique validates the class descriptor *before* the object is instantiated.

### Robust Code: Implementing a Safe ObjectInputStream

Starting in Java 9, JEP 290 introduced serialization filters at the JVM level. However, a custom `ObjectInputStream` provides application-level enforcement.

```java
import java.io.InputStream;
import java.io.ObjectInputStream;
import java.io.ObjectStreamClass;
import java.io.InvalidClassException;
import java.io.IOException;
import java.util.Set;

public class SafeObjectInputStream extends ObjectInputStream {

    // Strictly define the allowlist of permissible classes
    private static final Set<String> ALLOWLIST = Set.of(
        "com.serenya.models.UserSession",
        "java.lang.String",
        "java.util.ArrayList",
        "java.lang.Number"
    );

    public SafeObjectInputStream(InputStream in) throws IOException {
        super(in);
    }

    @Override
    protected Class<?> resolveClass(ObjectStreamClass desc) throws IOException, ClassNotFoundException {
        String className = desc.getName();
        
        // Deny anything not explicitly required
        if (!ALLOWLIST.contains(className)) {
            throw new InvalidClassException("Unauthorized deserialization attempt", className);
        }
        
        return super.resolveClass(desc);
    }
}
```

### JEP 290 Global Filtering

To prevent exploitation across third-party dependencies that might spin up their own `ObjectInputStream`, enforce a JVM-wide filter via command-line arguments:

```bash
java -Djdk.serialFilter="com.serenya.models.*;java.lang.String;!*" -jar app.jar
```

This filter explicitly allows the models package and `String`, while the `!*` operator explicitly rejects everything else.

## Conclusion

Java deserialization attacks turn the JVM's reflection and classloading capabilities against it. Mitigation requires treating serialized objects not as data, but as executable code. Transitioning away from Java serialization to Jackson or Gson (with default typing disabled) eliminates this threat class entirely.
